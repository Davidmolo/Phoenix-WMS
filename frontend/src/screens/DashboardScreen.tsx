"use client";

import {
  LayoutDashboard,
  Package,
  Inbox,
  FileText,
  Users,
  MapPin,
  Maximize2,
} from "lucide-react";
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
    <>
        <PageHeader
          title="Dashboard"
          icon={<LayoutDashboard className="h-5 w-5" />}
          description={
            user?.role === "customer"
              ? "Your inventory and request overview"
              : "Operations overview — Phoenix Cross Dock"
          }
        />

        <Alert>{error}</Alert>

        <KpiGrid>
          <KpiCard
            label="Active pallets"
            value={kpis?.activePallets}
            loading={loading}
            icon={<Package className="h-4 w-4" />}
          />
          <KpiCard
            label="Pending requests"
            value={kpis?.pendingRequests}
            loading={loading}
            icon={<Inbox className="h-4 w-4" />}
          />
          <KpiCard
            label="Draft invoices"
            value={kpis?.draftInvoices}
            loading={loading}
            icon={<FileText className="h-4 w-4" />}
          />
          {user?.role !== "customer" ? (
            <>
              <KpiCard
                label="Customers"
                value={kpis?.customers}
                loading={loading}
                icon={<Users className="h-4 w-4" />}
              />
              <KpiCard
                label="Open charges"
                value={kpis?.openCharges}
                loading={loading}
                icon={<FileText className="h-4 w-4" />}
              />
              <KpiCard
                label="Open slots"
                value={kpis?.locationsAvailable}
                loading={loading}
                icon={<MapPin className="h-4 w-4" />}
              />
              <KpiCard
                label="Available SF"
                value={kpis?.availableSqft?.toLocaleString()}
                loading={loading}
                icon={<Maximize2 className="h-4 w-4" />}
                hint={
                  kpis?.capacitySqft != null
                    ? `${kpis.occupiedSqft?.toLocaleString() ?? 0} / ${kpis.capacitySqft.toLocaleString()} SF used`
                    : undefined
                }
              />
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
              loading={loading}
              emptyTitle="No shipments yet"
              emptyDescription="Use Receive / Ship to post the first inbound load."
            />
          </div>
        ) : null}
    </>
  );
}
