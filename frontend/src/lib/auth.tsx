"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { api, type AuthUser } from "./api";

type AuthState = {
  user: AuthUser | null;
  token: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
};

const AuthContext = createContext<AuthState | null>(null);
const STORAGE_KEY = "phoenix_wms_auth";

function mapMeUser(raw: {
  _id: string;
  email: string;
  name: string;
  role: AuthUser["role"];
  companyId: string;
  customerId?: string | null;
}): AuthUser {
  return {
    id: String(raw._id),
    email: raw.email,
    name: raw.name,
    role: raw.role,
    companyId: String(raw.companyId),
    customerId: raw.customerId ? String(raw.customerId) : null,
  };
}

function readStoredAuth(): { token: string; user: AuthUser } | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { token?: string; user?: AuthUser };
    if (!parsed?.token || !parsed?.user?.id) return null;
    return { token: parsed.token, user: parsed.user };
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  // Only true when we have no cached session to show yet
  const [loading, setLoading] = useState(true);

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const stored = readStoredAuth();

    // Paint the app immediately from cache — don't wait on /auth/me
    if (stored) {
      setToken(stored.token);
      setUser(stored.user);
      setLoading(false);
    } else {
      setLoading(false);
      return;
    }

    (async () => {
      try {
        const me = await api<{ user: Parameters<typeof mapMeUser>[0] }>("/auth/me", {
          token: stored.token,
        });
        if (cancelled) return;
        const fresh = mapMeUser(me.user);
        setToken(stored.token);
        setUser(fresh);
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ token: stored.token, user: fresh }));
      } catch {
        if (cancelled) return;
        localStorage.removeItem(STORAGE_KEY);
        setToken(null);
        setUser(null);
        // Reseed / expired JWT — force a clean login instead of a stuck app skeleton
        if (typeof window !== "undefined" && window.location.pathname !== "/") {
          window.location.replace("/");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const data = await api<{ token: string; user: AuthUser }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    const userPayload = {
      ...data.user,
      id: String(data.user.id),
      companyId: String(data.user.companyId),
      customerId: data.user.customerId ? String(data.user.customerId) : null,
    };
    setToken(data.token);
    setUser(userPayload);
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ token: data.token, user: userPayload }));
  }, []);

  const value = useMemo(
    () => ({ user, token, loading, login, logout }),
    [user, token, loading, login, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
