"use client";

import { useMemo, useState, type ReactNode } from "react";
import { AppShell } from "@/components/AppShell";
import {
  Alert,
  Badge,
  Card,
  CardBody,
  CardTitle,
  DataTable,
  PageHeader,
  statusTone,
  type Column,
} from "@/components/ui";
import { useApiQuery } from "@/hooks/useApiQuery";
import { useAuth } from "@/lib/auth";
import { dateLabel } from "@/lib/format";
import type { Pallet, PalletLocation } from "@/types";

const FILTERS = ["all", "stored", "staged", "received", "shipped"] as const;

function locationCode(p: Pallet): string {
  const loc = p.locationId;
  if (!loc || typeof loc === "string") return "—";
  return (loc as PalletLocation).code || "—";
}

export default function InventoryPage() {
  const { user } = useAuth();
  const { data, error, loading } = useApiQuery<{ pallets: Pallet[] }>("/pallets");
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const rows = useMemo(() => {
    const list = data?.pallets ?? [];
    if (filter === "all") return list;
    return list.filter((p) => p.status === filter);
  }, [data, filter]);

  const selected = useMemo(
    () => rows.find((p) => p._id === selectedId) ?? null,
    [rows, selectedId]
  );

  const columns: Column<Pallet>[] = [
    {
      key: "id",
      header: "Pallet ID",
      render: (p) => <span className="font-semibold">{p.externalId}</span>,
    },
    {
      key: "status",
      header: "Status",
      render: (p) => <Badge tone={statusTone(p.status)}>{p.status}</Badge>,
    },
    {
      key: "loc",
      header: "Location",
      render: (p) => locationCode(p),
    },
    {
      key: "job",
      header: "Job",
      render: (p) => p.jobName || "—",
    },
    {
      key: "po",
      header: "PO",
      render: (p) => p.poNumber || "—",
    },
    {
      key: "ref",
      header: "Ref",
      render: (p) => p.ref || "—",
    },
    {
      key: "recv",
      header: "Received",
      render: (p) => dateLabel(p.receivedAt),
    },
  ];

  return (
    <AppShell>
      <PageHeader
        title={user?.role === "customer" ? "My pallets" : "Inventory"}
        description="Pallets tracked in Suite 5 — filter by status, click a row for detail"
      />
      <Alert>{error}</Alert>

      <div className="mb-4 flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold capitalize ${
              filter === f
                ? "bg-accent-bg text-accent-dark"
                : "bg-surface text-muted border border-border hover:bg-surface-2"
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(p) => p._id}
          loading={loading}
          emptyTitle="No pallets in this filter"
          emptyDescription="Receive inbound freight to populate inventory."
          onRowClick={(p) => setSelectedId(p._id)}
          selectedKey={selectedId}
        />

        <Card className="h-fit lg:sticky lg:top-20">
          <CardBody>
            <CardTitle>Pallet detail</CardTitle>
            {!selected ? (
              <p className="mt-2 text-sm text-muted">Select a pallet row to view full detail.</p>
            ) : (
              <dl className="mt-3 space-y-2.5 text-sm">
                <DetailRow label="ID" value={selected.externalId} />
                <DetailRow
                  label="Status"
                  value={<Badge tone={statusTone(selected.status)}>{selected.status}</Badge>}
                />
                <DetailRow label="Location" value={locationCode(selected)} />
                <DetailRow label="Job" value={selected.jobName || "—"} />
                <DetailRow label="PO" value={selected.poNumber || "—"} />
                <DetailRow label="Ref" value={selected.ref || "—"} />
                <DetailRow
                  label="Weight"
                  value={selected.weightLbs != null ? `${selected.weightLbs} lbs` : "—"}
                />
                <DetailRow label="Received" value={dateLabel(selected.receivedAt)} />
                <DetailRow label="Shipped" value={dateLabel(selected.shippedAt)} />
                <DetailRow label="Description" value={selected.description || "—"} />
                <DetailRow label="Notes" value={selected.notes || "—"} />
              </dl>
            )}
          </CardBody>
        </Card>
      </div>
    </AppShell>
  );
}

function DetailRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="grid grid-cols-[100px_1fr] gap-2 border-b border-border/60 pb-2 last:border-0">
      <dt className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</dt>
      <dd className="font-medium text-text">{value}</dd>
    </div>
  );
}
