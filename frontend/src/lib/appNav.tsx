"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
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
 * Client-side path state for instant screen switching.
 * URL bar is synced in an effect — never inside a setState updater
 * (pushState notifies Next's Router; doing that during render throws).
 */
export function AppNavProvider({
  children,
  initialPath = "/dashboard",
}: {
  children: ReactNode;
  /** SSR-safe starting path from usePathname — do not read window here. */
  initialPath?: string;
}) {
  const [path, setPath] = useState(() => normalizePath(initialPath));
  const skipPush = useRef(true); // skip push on mount (URL already correct)

  const navigate = useCallback((href: string) => {
    const next = normalizePath(href);
    skipPush.current = false;
    setPath((current) => (current === next ? current : next));
  }, []);

  // Sync the address bar after React commits — safe for Next's Router
  useEffect(() => {
    if (skipPush.current) {
      skipPush.current = false;
      return;
    }
    if (normalizePath(window.location.pathname) === path) return;
    window.history.pushState({ appNav: true }, "", path);
  }, [path]);

  useEffect(() => {
    const onPop = () => {
      skipPush.current = true; // location already matches; don't push again
      setPath(normalizePath(window.location.pathname));
    };
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
