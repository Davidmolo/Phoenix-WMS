"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { AppNavProvider } from "@/lib/appNav";

export default function AppLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  return (
    <AppNavProvider initialPath={pathname || "/dashboard"}>
      <AppShell>{children}</AppShell>
    </AppNavProvider>
  );
}
