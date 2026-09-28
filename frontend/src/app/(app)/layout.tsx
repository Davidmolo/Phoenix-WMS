"use client";

import type { ReactNode } from "react";
import { AppShell } from "@/components/AppShell";
import { AppNavProvider } from "@/lib/appNav";

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <AppNavProvider>
      <AppShell>{children}</AppShell>
    </AppNavProvider>
  );
}
