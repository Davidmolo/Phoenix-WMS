"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import {
  LayoutDashboard,
  ArrowLeftRight,
  Truck,
  CalendarClock,
  CalendarDays,
  Users,
  Receipt,
  Package,
  ScanBarcode,
  Warehouse,
  Inbox,
  FileText,
  LogOut,
  Menu,
  X,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { SkeletonShell } from "@/components/ui/Skeleton";
import { cn } from "@/lib/cn";
import { useAuth } from "@/lib/auth";
import { useAppNav } from "@/lib/appNav";

type NavItem = { href: string; label: string; icon: LucideIcon };

const STAFF_NAV: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/operations", label: "Receive / Ship", icon: ArrowLeftRight },
  { href: "/shipments", label: "Shipments", icon: Truck },
  { href: "/expected", label: "Expected", icon: CalendarClock },
  { href: "/bookings", label: "Bookings", icon: CalendarDays },
  { href: "/customers", label: "Customers", icon: Users },
  { href: "/fee-schedule", label: "Fee Schedule", icon: Receipt },
  { href: "/inventory", label: "Inventory", icon: Package },
  { href: "/lpns", label: "LPNs", icon: ScanBarcode },
  { href: "/warehouse", label: "Warehouse", icon: Warehouse },
  { href: "/requests", label: "Requests", icon: Inbox },
  { href: "/billing", label: "Billing", icon: FileText },
];

const PORTAL_NAV: NavItem[] = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { href: "/inventory", label: "My pallets", icon: Package },
  { href: "/bookings", label: "Book dock", icon: CalendarDays },
  { href: "/requests", label: "Requests", icon: Inbox },
  { href: "/profile", label: "Profile", icon: UserRound },
];

function shellVariant(pathname: string): "dashboard" | "table" | "form" | "split" {
  if (pathname.startsWith("/operations") || pathname.startsWith("/lpns") || pathname.startsWith("/expected")) {
    return "form";
  }
  if (pathname.startsWith("/requests")) return "split";
  if (
    pathname.startsWith("/shipments") ||
    pathname.startsWith("/customers") ||
    pathname.startsWith("/inventory") ||
    pathname.startsWith("/billing") ||
    pathname.startsWith("/fee-schedule") ||
    pathname.startsWith("/warehouse") ||
    pathname.startsWith("/bookings") ||
    pathname.startsWith("/profile")
  ) {
    return "table";
  }
  return "dashboard";
}

export function AppShell({ children }: { children: ReactNode }) {
  const { user, loading, logout, token } = useAuth();
  const router = useRouter();
  const { path, navigate } = useAppNav();
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (user && token) return;
    // Session missing/expired (e.g. after reseed) — leave the app shell entirely
    window.location.replace("/");
  }, [loading, user, token]);

  useEffect(() => {
    setMobileOpen(false);
  }, [path]);

  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobileOpen(false);
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKey);
    };
  }, [mobileOpen]);

  if (loading && !user) {
    return <SkeletonShell variant={shellVariant(path)} />;
  }

  if (!user || !token) {
    return (
      <div className="grid min-h-screen place-items-center bg-bg px-4 text-center">
        <div>
          <p className="m-0 font-display text-sm font-semibold tracking-wide text-navy uppercase">
            Session ended
          </p>
          <p className="mt-2 mb-0 text-sm text-muted">Redirecting to sign in…</p>
        </div>
      </div>
    );
  }

  const nav = user.role === "customer" ? PORTAL_NAV : STAFF_NAV;

  function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
    return (
      <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-2.5 py-3 sm:px-3" aria-label="Main">
        {nav.map((item) => {
          const active =
            path === item.href ||
            (item.href !== "/dashboard" && path.startsWith(`${item.href}/`));
          const Icon = item.icon;
          return (
            <button
              key={item.href}
              type="button"
              onClick={() => {
                onNavigate?.();
                navigate(item.href);
              }}
              className={cn(
                "sidebar-link flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[13.5px] font-semibold transition-all duration-200",
                active && "sidebar-link-active",
                !active && "hover:translate-x-0.5"
              )}
            >
              <Icon
                className={cn("sidebar-icon h-[18px] w-[18px] shrink-0", active && "sidebar-accent")}
                strokeWidth={2.25}
              />
              <span className="truncate">{item.label}</span>
              {active ? (
                <span
                  className="ml-auto h-1.5 w-1.5 shrink-0 rounded-full"
                  style={{ background: "var(--accent)" }}
                />
              ) : null}
            </button>
          );
        })}
      </nav>
    );
  }

  return (
    <div className="flex min-h-screen bg-bg">
      <aside
        className="sidebar-shell sticky top-0 hidden h-dvh w-[var(--sidebar-width)] shrink-0 flex-col lg:flex"
        style={{ background: "var(--sidebar)" }}
      >
        <div className="border-b border-[rgba(255,255,255,0.14)]">
          <div className="h-1 bg-[linear-gradient(90deg,var(--accent),transparent_70%)]" />
          <button
            type="button"
            onClick={() => navigate("/dashboard")}
            className="flex min-w-0 items-center gap-2.5 px-3 py-4 text-left sm:gap-3 sm:px-4 sm:py-5"
            aria-label="Phoenix Cross Dock home"
          >
            <Image
              src="/logo.png"
              alt=""
              width={44}
              height={44}
              priority
              className="h-10 w-10 object-contain sm:h-11 sm:w-11"
            />
            <div className="min-w-0 leading-tight">
              <div className="font-display text-[13px] font-semibold tracking-[0.05em] uppercase sm:text-[14px]">
                <span>Phoenix </span>
                <span className="sidebar-accent">Cross Dock</span>
              </div>
              <div className="sidebar-muted text-[10px] font-semibold tracking-[0.1em] uppercase">WMS</div>
            </div>
          </button>
        </div>
        <NavLinks />
        <div className="mt-auto border-t border-[rgba(255,255,255,0.14)] p-3 sm:p-4">
          <div className="mb-3 px-1">
            <div className="truncate text-[13px] font-semibold">{user.name}</div>
            <div className="sidebar-muted text-[11px] capitalize">{user.role}</div>
          </div>
          <button
            type="button"
            onClick={() => {
              logout();
              router.replace("/");
            }}
            className="flex w-full items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-[13px] font-semibold transition-colors"
            style={{
              border: "1px solid rgba(255,255,255,0.22)",
              background: "rgba(255,255,255,0.1)",
            }}
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </button>
        </div>
      </aside>

      {mobileOpen ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-navy-deep/55 backdrop-blur-sm"
            aria-label="Close menu"
            onClick={() => setMobileOpen(false)}
          />
          <aside
            className="sidebar-shell absolute top-0 left-0 flex h-dvh w-[min(300px,88vw)] flex-col shadow-[var(--shadow-card)]"
            style={{ background: "var(--sidebar)" }}
          >
            <div className="flex items-center justify-between border-b border-[rgba(255,255,255,0.14)] pr-2">
              <button
                type="button"
                onClick={() => {
                  setMobileOpen(false);
                  navigate("/dashboard");
                }}
                className="flex min-w-0 items-center gap-2.5 px-3 py-4 text-left"
              >
                <Image src="/logo.png" alt="" width={44} height={44} className="h-10 w-10 object-contain" />
                <div className="min-w-0 leading-tight">
                  <div className="font-display text-[13px] font-semibold tracking-[0.05em] uppercase">
                    <span>Phoenix </span>
                    <span className="sidebar-accent">Cross Dock</span>
                  </div>
                </div>
              </button>
              <button
                type="button"
                className="mr-2 rounded-lg p-2 hover:bg-[rgba(255,255,255,0.1)]"
                onClick={() => setMobileOpen(false)}
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <NavLinks onNavigate={() => setMobileOpen(false)} />
          </aside>
        </div>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex items-center gap-2 border-b border-border bg-white/95 px-3 py-2.5 backdrop-blur-md sm:gap-3 sm:px-4 sm:py-3 lg:hidden">
          <button
            type="button"
            className="rounded-xl border border-border bg-surface-2 p-2 text-navy"
            onClick={() => setMobileOpen(true)}
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="min-w-0 flex-1">
            <div className="font-display truncate text-sm font-semibold tracking-wide text-navy uppercase">
              Phoenix <span className="text-accent">WMS</span>
            </div>
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              logout();
              router.replace("/");
            }}
          >
            Sign out
          </Button>
        </header>

        <main className="app-canvas mx-auto w-full max-w-[1680px] flex-1 px-3 py-4 sm:px-5 sm:py-6 lg:px-8 lg:py-7 xl:px-10">
          {children}
        </main>

        <footer className="border-t border-border px-3 py-3 text-center text-[11px] text-muted sm:px-4 sm:py-4 sm:text-xs">
          Phoenix Cross Dock · Suite 5 ·{" "}
          <a
            href="https://phoenixcrossdocks.com"
            target="_blank"
            rel="noreferrer"
            className="font-semibold text-navy hover:text-[var(--accent-text)]"
          >
            phoenixcrossdocks.com
          </a>
        </footer>
      </div>
    </div>
  );
}
