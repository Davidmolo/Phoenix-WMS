"use client";

import { Truck } from "lucide-react";
import { Alert, Badge, DataTable, PageHeader, statusTone, type Column } from "@/components/ui";
import { useApiQuery } from "@/hooks/useApiQuery";
import { dateLabel } from "@/lib/format";
import type { Shipment } from "@/types";

export default function ShipmentsPage() {
  const { data, error, loading } = useApiQuery<{ shipments: Shipment[] }>("/shipments");

  const columns: Column<Shipment>[] = [
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
      key: "carrier",
      header: "Carrier",
      render: (s) => s.carrier || "—",
    },
    {
      key: "trailer",
      header: "Trailer",
      render: (s) => s.trailerNumber || "—",
    },
    {
      key: "pallets",
      header: "Pallets",
      render: (s) => s.palletIds?.length ?? 0,
    },
    {
      key: "ftl",
      header: "FTL",
      render: (s) => (s.billAsFtl ? "Yes" : "—"),
    },
    {
      key: "when",
      header: "Completed / created",
      render: (s) => dateLabel(s.completedAt || s.createdAt),
    },
  ];

  return (
    <>
        <PageHeader
          title="Shipments"
          icon={<Truck className="h-5 w-5" />}
          description="Completed and in-progress inbound/outbound movements"
        />
        <Alert>{error}</Alert>
        <DataTable
          columns={columns}
          rows={data?.shipments ?? []}
          rowKey={(s) => s._id}
          loading={loading}
          emptyTitle="No shipments yet"
        />
    </>
  );
}
