"use client";

import { ScreenRouter } from "@/components/ScreenRouter";

/** Single authenticated entry — ScreenRouter swaps views instantly from the shared bundle. */
export default function AppCatchAllPage() {
  return <ScreenRouter />;
}
