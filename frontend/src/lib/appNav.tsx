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

type AppNavState = {
  path: string;
  navigate: (href: string) => void;
};

const AppNavContext = createContext<AppNavState | null>(null);

function normalizePath(path: string) {
  if (!path || path === "/") return "/dashboard";
  const clean = path.split("?")[0].split("#")[0];
  return clean.endsWith("/") && clean.length > 1 ? clean.slice(0, -1) : clean;
}

/**
 * In-app navigation that updates React state + the URL bar immediately.
 * Does NOT call next/navigation router.push — that was causing 1–2s RSC delays.
 */
export function AppNavProvider({
  children,
  initialPath,
}: {
  children: ReactNode;
  initialPath?: string;
}) {
  const [path, setPath] = useState(() =>
    normalizePath(initialPath || (typeof window !== "undefined" ? window.location.pathname : "/dashboard"))
  );

  const navigate = useCallback((href: string) => {
    const next = normalizePath(href);
    setPath((current) => {
      if (current === next) return current;
      if (typeof window !== "undefined") {
        window.history.pushState({ appNav: true }, "", next);
      }
      return next;
    });
  }, []);

  useEffect(() => {
    const onPop = () => setPath(normalizePath(window.location.pathname));
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const value = useMemo(() => ({ path, navigate }), [path, navigate]);

  return <AppNavContext.Provider value={value}>{children}</AppNavContext.Provider>;
}

export function useAppNav() {
  const ctx = useContext(AppNavContext);
  if (!ctx) throw new Error("useAppNav must be used within AppNavProvider");
  return ctx;
}
