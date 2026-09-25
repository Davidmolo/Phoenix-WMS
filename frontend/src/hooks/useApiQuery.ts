"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";

type Options = {
  /** Skip fetch when false/null */
  enabled?: boolean;
};

export function useApiQuery<T>(path: string | null, options: Options = {}) {
  const { token } = useAuth();
  const enabled = options.enabled !== false && Boolean(path) && Boolean(token);
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(enabled);

  const reload = useCallback(async () => {
    if (!token || !path || options.enabled === false) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const result = await api<T>(path, { token });
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [token, path, options.enabled]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { data, error, loading, reload };
}
