"use client";

import { AppShell } from "@/components/AppShell";
import { Alert, Badge, DataTable, PageHeader, statusTone, type Column } from "@/components/ui";
import { useApiQuery } from "@/hooks/useApiQuery";
import type { Lpn } from "@/types";

export default function LpnsPage() {
  const { data, error, loading } = useApiQuery<{ lpns: Lpn[] }>("/lpns");

  const columns: Column<Lpn>[] = [
    {
      key: "code",
      header: "LPN",
      render: (l) => <span className="font-semibold">{l.code}</span>,
    },
    {
      key: "status",
      header: "Status",
      render: (l) => <Badge tone={statusTone(l.status)}>{l.status}</Badge>,
    },
    {
      key: "qty",
      header: "Qty",
      render: (l) => l.qty,
    },
    {
      key: "description",
      header: "Description",
      render: (l) => l.description || "—",
    },
  ];

  return (
    <AppShell>
      <PageHeader title="LPNs" description="License plate numbers linked to pallets" />
      <Alert>{error}</Alert>
      <DataTable
        columns={columns}
        rows={data?.lpns ?? []}
        rowKey={(l) => l._id}
        loading={loading}
        emptyTitle="No LPNs yet"
        emptyDescription="LPNs are created automatically when you receive pallets."
      />
    </AppShell>
  );
}
