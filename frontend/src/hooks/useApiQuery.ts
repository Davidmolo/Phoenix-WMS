"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useScreenActive } from "@/lib/screenActive";

type Options = {
  enabled?: boolean;
};

type CacheEntry = {
  data: unknown;
  error: string;
  at: number;
  /** Bumped on every invalidate — entry is trusted only when this matches. */
  gen: number;
};

const cache = new Map<string, CacheEntry>();
let cacheGen = 0;
const listeners = new Set<() => void>();

function cacheKey(token: string, path: string) {
  return `${token}::${path}`;
}

function isTrusted(entry: CacheEntry | undefined): entry is CacheEntry {
  return Boolean(entry && entry.gen === cacheGen && entry.data != null);
}

function notifyInvalidated() {
  listeners.forEach((fn) => fn());
}

/**
 * Drop cached API payloads so they are never shown again as truth.
 * Call after every successful write, then reload() on the active screen.
 */
export function invalidateApiCache(pathPrefix?: string) {
  if (!pathPrefix) {
    cacheGen += 1;
    cache.clear();
  } else {
    for (const key of [...cache.keys()]) {
      if (key.includes(`::${pathPrefix}`)) cache.delete(key);
    }
  }
  notifyInvalidated();
}

/**
 * Cache is used only while data is still trusted:
 * - Instant paint from cache after a successful fetch
 * - Cache is discarded on invalidate (writes) — never shown again
 * - Active screens clear immediately when the cache is invalidated
 * - Every time a screen becomes visible it revalidates against the API
 */
export function useApiQuery<T>(path: string | null, options: Options = {}) {
  const { token } = useAuth();
  const screenActive = useScreenActive();
  const enabled =
    options.enabled !== false && Boolean(path) && Boolean(token) && screenActive;

  const key = token && path ? cacheKey(token, path) : null;
  const cached = key ? cache.get(key) : undefined;
  const trusted = isTrusted(cached);

  const [data, setData] = useState<T | null>(() =>
    trusted ? (cached.data as T) : null
  );
  const [error, setError] = useState(() => (trusted ? cached.error : ""));
  const [loading, setLoading] = useState(() => enabled && !trusted);
  const [refreshing, setRefreshing] = useState(false);
  const fetchId = useRef(0);

  const reload = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!token || !path) return;
      const k = cacheKey(token, path);
      const id = ++fetchId.current;
      const hasTrusted = isTrusted(cache.get(k));

      if (opts?.silent && hasTrusted) setRefreshing(true);
      else if (hasTrusted) setRefreshing(true);
      else {
        setLoading(true);
        setData(null);
      }

      setError("");

      try {
        const result = await api<T>(path, { token });
        if (id !== fetchId.current) return;
        cache.set(k, {
          data: result,
          error: "",
          at: Date.now(),
          gen: cacheGen,
        });
        setData(result);
        setError("");
      } catch (err) {
        if (id !== fetchId.current) return;
        const message = err instanceof Error ? err.message : "Request failed";
        const prev = cache.get(k);
        if (!isTrusted(prev)) {
          cache.set(k, {
            data: null,
            error: message,
            at: Date.now(),
            gen: cacheGen,
          });
          setData(null);
        }
        setError(message);
      } finally {
        if (id === fetchId.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [token, path]
  );

  // Drop untrusted React state the moment writes invalidate the cache
  useEffect(() => {
    const onInvalidate = () => {
      if (!key) return;
      if (isTrusted(cache.get(key))) return;
      setData(null);
      setError("");
      if (enabled) {
        setLoading(true);
        void reload({ silent: false });
      } else {
        setLoading(false);
        setRefreshing(false);
      }
    };
    listeners.add(onInvalidate);
    return () => {
      listeners.delete(onInvalidate);
    };
  }, [key, enabled, reload]);

  useEffect(() => {
    if (!enabled || !path || !token) {
      setLoading(false);
      setRefreshing(false);
      return;
    }

    const k = cacheKey(token, path);
    const hit = cache.get(k);
    if (isTrusted(hit)) {
      setData(hit.data as T);
      setError(hit.error);
      setLoading(false);
      // Trusted cache → instant paint, then confirm with API
      void reload({ silent: true });
    } else {
      setData(null);
      setError("");
      setLoading(true);
      void reload({ silent: false });
    }
  }, [enabled, path, token, screenActive, reload]);

  return {
    data,
    error,
    loading,
    refreshing,
    reload: () => reload({ silent: false }),
  };
}
