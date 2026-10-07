"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useAppNav } from "@/lib/appNav";
import { ScreenActiveProvider } from "@/lib/screenActive";
import DashboardScreen from "@/screens/DashboardScreen";
import OperationsScreen from "@/screens/OperationsScreen";
import ShipmentsScreen from "@/screens/ShipmentsScreen";
import ExpectedScreen from "@/screens/ExpectedScreen";
import CustomersScreen from "@/screens/CustomersScreen";
import CustomerDetailScreen from "@/screens/CustomerDetailScreen";
import FeeScheduleScreen from "@/screens/FeeScheduleScreen";
import InventoryScreen from "@/screens/InventoryScreen";
import LpnsScreen from "@/screens/LpnsScreen";
import WarehouseScreen from "@/screens/WarehouseScreen";
import RequestsScreen from "@/screens/RequestsScreen";
import BillingScreen from "@/screens/BillingScreen";
import BookingsScreen from "@/screens/BookingsScreen";
import PortalBookingsScreen from "@/screens/PortalBookingsScreen";
import PortalProfileScreen from "@/screens/PortalProfileScreen";
import { useAuth } from "@/lib/auth";

function screenKey(path: string) {
  if (path.startsWith("/customers/") && path !== "/customers") return "customer-detail";
  if (path === "/" || path === "/dashboard") return "dashboard";
  return path.replace(/^\//, "") || "dashboard";
}

function ScreenPane({
  active,
  children,
}: {
  active: boolean;
  children: ReactNode;
}) {
  return (
    <div hidden={!active} aria-hidden={!active} style={{ display: active ? "block" : "none" }}>
      <ScreenActiveProvider active={active}>{children}</ScreenActiveProvider>
    </div>
  );
}

/**
 * Keep-alive screen host: first visit mounts a screen; later visits just toggle visibility.
 * Navigation feels instant; API loaders only appear on first fetch / refresh.
 */
export function ScreenRouter() {
  const { path } = useAppNav();
  const { user } = useAuth();
  const isPortal = user?.role === "customer";
  const active = screenKey(path);
  const [mounted, setMounted] = useState<Set<string>>(() => new Set([active]));
  const [detailIds, setDetailIds] = useState<Set<string>>(() => new Set());

  const customerId = useMemo(() => {
    if (!path.startsWith("/customers/") || path === "/customers") return null;
    return path.split("/")[2] || null;
  }, [path]);

  useEffect(() => {
    setMounted((prev) => {
      if (prev.has(active)) return prev;
      const next = new Set(prev);
      next.add(active);
      return next;
    });
  }, [active]);

  useEffect(() => {
    if (!customerId) return;
    setDetailIds((prev) => {
      if (prev.has(customerId)) return prev;
      const next = new Set(prev);
      next.add(customerId);
      return next;
    });
  }, [customerId]);

  return (
    <>
      {mounted.has("dashboard") ? (
        <ScreenPane active={active === "dashboard"}>
          <DashboardScreen />
        </ScreenPane>
      ) : null}
      {mounted.has("operations") ? (
        <ScreenPane active={active === "operations"}>
          <OperationsScreen />
        </ScreenPane>
      ) : null}
      {mounted.has("shipments") ? (
        <ScreenPane active={active === "shipments"}>
          <ShipmentsScreen />
        </ScreenPane>
      ) : null}
      {mounted.has("expected") ? (
        <ScreenPane active={active === "expected"}>
          <ExpectedScreen />
        </ScreenPane>
      ) : null}
      {mounted.has("customers") ? (
        <ScreenPane active={active === "customers"}>
          <CustomersScreen />
        </ScreenPane>
      ) : null}
      {[...detailIds].map((id) => (
        <ScreenPane key={id} active={active === "customer-detail" && customerId === id}>
          <CustomerDetailScreen customerId={id} />
        </ScreenPane>
      ))}
      {mounted.has("fee-schedule") ? (
        <ScreenPane active={active === "fee-schedule"}>
          <FeeScheduleScreen />
        </ScreenPane>
      ) : null}
      {mounted.has("inventory") ? (
        <ScreenPane active={active === "inventory"}>
          <InventoryScreen />
        </ScreenPane>
      ) : null}
      {mounted.has("lpns") ? (
        <ScreenPane active={active === "lpns"}>
          <LpnsScreen />
        </ScreenPane>
      ) : null}
      {mounted.has("warehouse") ? (
        <ScreenPane active={active === "warehouse"}>
          <WarehouseScreen />
        </ScreenPane>
      ) : null}
      {mounted.has("requests") ? (
        <ScreenPane active={active === "requests"}>
          <RequestsScreen />
        </ScreenPane>
      ) : null}
      {mounted.has("bookings") ? (
        <ScreenPane active={active === "bookings"}>
          {isPortal ? <PortalBookingsScreen /> : <BookingsScreen />}
        </ScreenPane>
      ) : null}
      {mounted.has("profile") && isPortal ? (
        <ScreenPane active={active === "profile"}>
          <PortalProfileScreen />
        </ScreenPane>
      ) : null}
      {mounted.has("billing") ? (
        <ScreenPane active={active === "billing"}>
          <BillingScreen />
        </ScreenPane>
      ) : null}
    </>
  );
}
