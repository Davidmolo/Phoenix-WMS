"use client";

import { useMemo, useState, type ReactNode } from "react";
import { Package } from "lucide-react";
import { PalletLabelPreview } from "@/components/PalletLabelPreview";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  CardTitle,
  ChipGroup,
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
  const [printPallet, setPrintPallet] = useState<Pallet | null>(null);

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
      key: "ref",
      header: "PO / Job",
      render: (p) => p.jobName || p.poNumber || "—",
    },
    {
      key: "sqft",
      header: "Sq ft",
      render: (p) => (p.sqft != null ? p.sqft : "—"),
    },
    {
      key: "recv",
      header: "Received",
      render: (p) => dateLabel(p.receivedAt),
    },
  ];

  return (
    <>
        <PageHeader
          title={user?.role === "customer" ? "My pallets" : "Inventory"}
          icon={<Package className="h-5 w-5" />}
          description="Filter by status · select a row for detail and barcode label"
        />
        <Alert>{error}</Alert>

        <div className="mb-4">
          <ChipGroup
            label="Status"
            size="sm"
            options={FILTERS.map((f) => ({
              id: f,
              label: f === "all" ? "All" : f.charAt(0).toUpperCase() + f.slice(1),
            }))}
            value={filter}
            onChange={setFilter}
          />
        </div>

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px] xl:grid-cols-[minmax(0,1fr)_400px]">
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
                <>
                  <dl className="mt-3 space-y-2.5 text-sm">
                    <DetailRow label="ID" value={selected.externalId} />
                    <DetailRow
                      label="Status"
                      value={<Badge tone={statusTone(selected.status)}>{selected.status}</Badge>}
                    />
                    <DetailRow label="Location" value={locationCode(selected)} />
                    <DetailRow
                      label="PO / Job"
                      value={selected.jobName || selected.poNumber || "—"}
                    />
                    <DetailRow
                      label="Footprint"
                      value={
                        selected.dimLength && selected.dimWidth
                          ? `${selected.dimLength}" × ${selected.dimWidth}"`
                          : "—"
                      }
                    />
                    <DetailRow
                      label="Sq ft"
                      value={selected.sqft != null ? `${selected.sqft} SF` : "—"}
                    />
                    <DetailRow
                      label="Weight"
                      value={selected.weightLbs != null ? `${selected.weightLbs} lbs` : "—"}
                    />
                    <DetailRow label="Received" value={dateLabel(selected.receivedAt)} />
                    <DetailRow label="Shipped" value={dateLabel(selected.shippedAt)} />
                    <DetailRow label="Description" value={selected.description || "—"} />
                  </dl>
                  <Button className="mt-4 w-full" onClick={() => setPrintPallet(selected)}>
                    Print barcode label
                  </Button>
                </>
              )}
            </CardBody>
          </Card>
        </div>

        {printPallet ? (
          <PalletLabelPreview pallet={printPallet} onClose={() => setPrintPallet(null)} />
        ) : null}
    </>
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
