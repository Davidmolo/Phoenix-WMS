"use client";

import { AppShell } from "@/components/AppShell";
import {
  Alert,
  Badge,
  DataTable,
  KpiCard,
  KpiGrid,
  PageHeader,
  statusTone,
  type Column,
} from "@/components/ui";
import { useApiQuery } from "@/hooks/useApiQuery";
import { useAuth } from "@/lib/auth";
import { dateLabel } from "@/lib/format";
import type { DashboardKpis, Shipment } from "@/types";

export default function DashboardPage() {
  const { user } = useAuth();
  const { data, error, loading } = useApiQuery<{
    kpis: DashboardKpis;
    recentShipments: Shipment[];
  }>("/dashboard");
  const kpis = data?.kpis;

  const shipColumns: Column<Shipment>[] = [
    {
      key: "dir",
      header: "Direction",
      render: (s) => <Badge tone="accent">{s.direction}</Badge>,
    },
    {
      key: "status",
      header: "Status",
      render: (s) => <Badge tone={statusTone(s.status)}>{s.status}</Badge>,
    },
    {
      key: "pallets",
      header: "Pallets",
      render: (s) => s.palletIds?.length ?? 0,
    },
    {
      key: "when",
      header: "When",
      render: (s) => dateLabel(s.completedAt || s.createdAt),
    },
  ];

  return (
    <AppShell>
      <PageHeader
        title="Dashboard"
        description={
          user?.role === "customer"
            ? "Your inventory and request overview"
            : "Operations overview — Phoenix Cross Dock"
        }
      />

      <Alert>{error}</Alert>

      <KpiGrid>
        <KpiCard label="Active pallets" value={loading ? "…" : kpis?.activePallets} />
        <KpiCard label="Pending requests" value={loading ? "…" : kpis?.pendingRequests} />
        <KpiCard label="Draft invoices" value={loading ? "…" : kpis?.draftInvoices} />
        {user?.role !== "customer" ? (
          <>
            <KpiCard label="Customers" value={loading ? "…" : kpis?.customers} />
            <KpiCard label="Open charges" value={loading ? "…" : kpis?.openCharges} />
            <KpiCard label="Open slots" value={loading ? "…" : kpis?.locationsAvailable} />
          </>
        ) : null}
      </KpiGrid>

      {user?.role !== "customer" ? (
        <div className="mb-5">
          <PageHeader title="Recent shipments" className="mb-4" />
          <DataTable
            columns={shipColumns}
            rows={data?.recentShipments ?? []}
            rowKey={(s) => s._id}
            emptyTitle="No shipments yet"
            emptyDescription="Use Receive / Ship to post the first inbound load."
          />
        </div>
      ) : null}
    </AppShell>
  );
}
