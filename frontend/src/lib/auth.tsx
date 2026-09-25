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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return;
        const parsed = JSON.parse(raw) as { token: string; user: AuthUser };
        // Validate session against DB (catches stale JWT after reseed)
        const me = await api<{ user: Parameters<typeof mapMeUser>[0] }>("/auth/me", {
          token: parsed.token,
        });
        if (cancelled) return;
        const fresh = mapMeUser(me.user);
        setToken(parsed.token);
        setUser(fresh);
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ token: parsed.token, user: fresh }));
      } catch {
        localStorage.removeItem(STORAGE_KEY);
        if (!cancelled) {
          setToken(null);
          setUser(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
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
