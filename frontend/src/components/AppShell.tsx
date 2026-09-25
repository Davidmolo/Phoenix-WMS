"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { Button, CenteredState, Spinner } from "@/components/ui";
import { cn } from "@/lib/cn";
import { useAuth } from "@/lib/auth";

const STAFF_NAV = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/operations", label: "Receive / Ship" },
  { href: "/shipments", label: "Shipments" },
  { href: "/expected", label: "Expected" },
  { href: "/customers", label: "Customers" },
  { href: "/fee-schedule", label: "Fee Schedule" },
  { href: "/inventory", label: "Inventory" },
  { href: "/lpns", label: "LPNs" },
  { href: "/warehouse", label: "Warehouse" },
  { href: "/requests", label: "Requests" },
  { href: "/billing", label: "Billing" },
] as const;

const PORTAL_NAV = [
  { href: "/dashboard", label: "Overview" },
  { href: "/inventory", label: "My pallets" },
  { href: "/requests", label: "Requests" },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const { user, loading, logout, token } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!loading && (!user || !token)) router.replace("/");
  }, [loading, user, token, router]);

  if (loading || !user) {
    return (
      <CenteredState>
        <Spinner className="h-6 w-6" />
      </CenteredState>
    );
  }

  const nav = user.role === "customer" ? PORTAL_NAV : STAFF_NAV;

  return (
    <div className="flex min-h-screen flex-col bg-bg">
      <header className="sticky top-0 z-20 border-b border-border bg-surface/95 backdrop-blur-sm">
        <div className="mx-auto flex max-w-[1320px] items-center gap-3 px-4 py-2.5 sm:gap-4 sm:px-5">
          {/* Logo already includes wordmark — no duplicate brand text */}
          <Link
            href="/dashboard"
            className="flex shrink-0 items-center rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            aria-label="Phoenix Cross Dock home"
          >
            <Image
              src="/logo.png"
              alt="Phoenix Cross Dock"
              width={72}
              height={72}
              priority
              className="h-11 w-11 object-contain sm:h-12 sm:w-12"
            />
          </Link>

          <nav
            className="-mx-1 flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto px-1 py-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            aria-label="Main"
          >
            {nav.map((item) => {
              const active =
                pathname === item.href ||
                (item.href !== "/dashboard" && pathname.startsWith(`${item.href}/`));
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "shrink-0 rounded-lg px-2.5 py-1.5 text-[12.5px] font-semibold whitespace-nowrap transition-colors sm:px-3 sm:text-[13px]",
                    active
                      ? "bg-accent-bg text-accent-dark"
                      : "text-muted hover:bg-surface-2 hover:text-text"
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="flex shrink-0 items-center gap-2.5 border-l border-border pl-3">
            <div className="hidden text-right sm:block">
              <div className="text-[13px] leading-tight font-semibold text-text">{user.name}</div>
              <div className="text-[11px] leading-tight text-muted capitalize">{user.role}</div>
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
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1320px] flex-1 px-4 py-6 sm:px-5 sm:py-7">{children}</main>

      <footer className="border-t border-border bg-surface px-4 py-3 text-center text-xs text-muted">
        Phoenix Cross Dock WMS · Suite 5 · 3550 W Clarendon Ave
      </footer>
    </div>
  );
}
