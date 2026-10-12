"use client";

import { FormEvent, useEffect, useMemo, useState, type ReactNode } from "react";
import { Package, Printer, Save, Trash2 } from "lucide-react";
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
  Field,
  FormGrid,
  Input,
  NumberInput,
  PageHeader,
  statusLabel,
  statusTone,
  type Column,
} from "@/components/ui";
import { api } from "@/lib/api";
import { useApiQuery, invalidateApiCache } from "@/hooks/useApiQuery";
import { useAuth } from "@/lib/auth";
import { dateLabel } from "@/lib/format";
import { listQuery, paginationFrom, type PaginationMeta } from "@/lib/pagination";
import type { Pallet, PalletLocation } from "@/types";

const FILTERS = ["all", "staged_for_store", "stored", "staged", "received", "shipped"] as const;

function locationCode(p: Pallet): string {
  if (p.locationCode) {
    return p.secondaryLocationCode
      ? `${p.locationCode} + ${p.secondaryLocationCode}`
      : p.locationCode;
  }
  const loc = p.locationId;
  const primary =
    loc && typeof loc === "object" ? (loc as PalletLocation).code || "" : "";
  const sec = p.secondaryLocationId;
  const secondary =
    sec && typeof sec === "object" ? (sec as PalletLocation).code || "" : "";
  if (!primary && !secondary) return "—";
  return secondary ? `${primary || "—"} + ${secondary}` : primary || "—";
}

type PalletsResponse = { pallets: Pallet[] } & PaginationMeta;

export default function InventoryPage() {
  const { user, token } = useAuth();
  const isStaff = user?.role === "admin" || user?.role === "staff";
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("all");
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [printPallets, setPrintPallets] = useState<Pallet[] | null>(null);

  // Edit form state (staff only)
  const [description, setDescription] = useState("");
  const [poNumber, setPoNumber] = useState("");
  const [jobName, setJobName] = useState("");
  const [weightLbs, setWeightLbs] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => {
    setPage(1);
    setSelectedId(null);
  }, [filter]);

  const path = useMemo(
    () =>
      listQuery("/pallets", {
        page,
        params: { status: filter === "all" ? undefined : filter },
      }),
    [page, filter]
  );

  const { data, error, loading, reload } = useApiQuery<PalletsResponse>(path);
  const rows = data?.pallets ?? [];
  const pagination = paginationFrom(data);

  const selected = useMemo(
    () => rows.find((p) => p._id === selectedId) ?? null,
    [rows, selectedId]
  );

  // Sync the edit form whenever the selected pallet changes (new selection or fresh data)
  useEffect(() => {
    if (!selected) return;
    setDescription(selected.description || "");
    setPoNumber(selected.poNumber || "");
    setJobName(selected.jobName || "");
    setWeightLbs(selected.weightLbs != null ? String(selected.weightLbs) : "");
    setNotes(selected.notes || "");
    setMsg("");
    setErr("");
  }, [selected]);

  async function onSave(e: FormEvent) {
    e.preventDefault();
    if (!token || !selected) return;
    setBusy(true);
    setErr("");
    setMsg("");
    try {
      await api(`/pallets/${selected._id}`, {
        method: "PATCH",
        token,
        body: JSON.stringify({
          description,
          poNumber,
          jobName,
          notes,
          weightLbs: weightLbs === "" ? null : Number(weightLbs),
        }),
      });
      setMsg(`${selected.externalId} updated`);
      invalidateApiCache();
      await reload();
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "Could not update pallet");
    } finally {
      setBusy(false);
    }
  }

  async function onVoid() {
    if (!token || !selected) return;
    if (
      !window.confirm(
        `Void pallet ${selected.externalId}? This frees its storage location(s) and retires the barcode.`
      )
    ) {
      return;
    }
    setBusy(true);
    setErr("");
    setMsg("");
    try {
      await api(`/pallets/${selected._id}`, {
        method: "PATCH",
        token,
        body: JSON.stringify({ status: "void" }),
      });
      setMsg(`${selected.externalId} voided — location freed`);
      invalidateApiCache();
      await reload();
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "Could not void pallet");
    } finally {
      setBusy(false);
    }
  }

  const columns: Column<Pallet>[] = [
    {
      key: "id",
      header: "Pallet ID",
      render: (p) => <span className="font-semibold">{p.externalId}</span>,
    },
    {
      key: "status",
      header: "Status",
      render: (p) => (
        <Badge tone={statusTone(p.status)}>{statusLabel(p.status)}</Badge>
      ),
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
          actions={
            isStaff && rows.length > 0 ? (
              <Button
                type="button"
                size="sm"
                variant="secondary"
                icon={<Printer className="h-3.5 w-3.5" />}
                onClick={() => setPrintPallets(rows)}
              >
                Print labels for this page ({rows.length})
              </Button>
            ) : undefined
          }
        />
        <Alert>{error || err}</Alert>
        {msg ? <Alert tone="success">{msg}</Alert> : null}

        <div className="mb-4">
          <ChipGroup
            label="Status"
            size="sm"
            options={FILTERS.map((f) => ({
              id: f,
              label: f === "all" ? "All" : statusLabel(f),
            }))}
            value={filter}
            onChange={setFilter}
          />
        </div>

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px] xl:grid-cols-[minmax(0,1fr)_420px]">
          <DataTable
            columns={columns}
            rows={rows}
            rowKey={(p) => p._id}
            loading={loading}
            emptyTitle="No pallets in this filter"
            emptyDescription="Receive inbound freight to populate inventory."
            onRowClick={(p) => setSelectedId(p._id)}
            selectedKey={selectedId}
            pagination={pagination}
            onPageChange={setPage}
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
                      label="Barcodes"
                      value={
                        Number(selected.dimLength) > 48 ||
                        Number(selected.dimWidth) > 48 ||
                        selected.secondaryLocationId ||
                        selected.secondaryLocationCode
                          ? `${selected.externalId} · ${selected.externalId}-B (2nd slot)`
                          : selected.externalId
                      }
                    />
                    <DetailRow
                      label="Status"
                      value={
                        <Badge tone={statusTone(selected.status)}>
                          {statusLabel(selected.status)}
                        </Badge>
                      }
                    />
                    <DetailRow
                      label={selected.status === "shipped" ? "Last location" : "Location"}
                      value={
                        locationCode(selected) === "—" && selected.status === "shipped"
                          ? "Released on ship (slot freed)"
                          : locationCode(selected)
                      }
                    />
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

                  {isStaff ? (
                    <form onSubmit={onSave} className="mt-4 space-y-3 border-t border-border pt-4">
                      <div className="text-[11px] font-bold tracking-wide text-muted uppercase">
                        Edit pallet
                      </div>
                      <Field label="Description">
                        <Input
                          value={description}
                          onChange={(e) => setDescription(e.target.value)}
                          placeholder="Optional"
                        />
                      </Field>
                      <FormGrid cols={2}>
                        <Field label="PO number">
                          <Input
                            value={poNumber}
                            onChange={(e) => setPoNumber(e.target.value)}
                            placeholder="Optional"
                          />
                        </Field>
                        <Field label="Job name">
                          <Input
                            value={jobName}
                            onChange={(e) => setJobName(e.target.value)}
                            placeholder="Optional"
                          />
                        </Field>
                      </FormGrid>
                      <Field label="Weight (lbs)">
                        <NumberInput
                          value={weightLbs}
                          onValueChange={setWeightLbs}
                          placeholder="Optional"
                        />
                      </Field>
                      <Field label="Notes">
                        <Input
                          value={notes}
                          onChange={(e) => setNotes(e.target.value)}
                          placeholder="Optional"
                        />
                      </Field>
                      <div className="flex flex-wrap gap-2">
                        <Button type="submit" loading={busy} icon={<Save className="h-3.5 w-3.5" />}>
                          Save changes
                        </Button>
                        {selected.status !== "void" && selected.status !== "shipped" ? (
                          <Button
                            type="button"
                            variant="danger"
                            disabled={busy}
                            icon={<Trash2 className="h-3.5 w-3.5" />}
                            onClick={onVoid}
                          >
                            Void pallet
                          </Button>
                        ) : null}
                      </div>
                    </form>
                  ) : null}

                  <Button
                    className="mt-4 w-full"
                    icon={<Printer className="h-3.5 w-3.5" />}
                    onClick={() => setPrintPallets([selected])}
                  >
                    {Number(selected.dimLength) > 48 ||
                    Number(selected.dimWidth) > 48 ||
                    selected.secondaryLocationId ||
                    selected.secondaryLocationCode
                      ? "Print both barcodes (A + B)"
                      : "Print barcode label"}
                  </Button>
                </>
              )}
            </CardBody>
          </Card>
        </div>

        {printPallets ? (
          <PalletLabelPreview pallets={printPallets} onClose={() => setPrintPallets(null)} />
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
