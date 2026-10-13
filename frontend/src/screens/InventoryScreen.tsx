"use client";

import { FormEvent, useEffect, useMemo, useState, type ReactNode } from "react";
import { Package, Pencil, Printer, Save, Trash2 } from "lucide-react";
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
  Modal,
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
    sec && typeof sec === "object" ? (sec as PalletLocation).code || "—" : "";
  if (!primary && !secondary) return "—";
  return secondary && secondary !== "—" ? `${primary || "—"} + ${secondary}` : primary || "—";
}

function needsDualBarcode(p: Pallet): boolean {
  return (
    Number(p.dimLength) > 48 ||
    Number(p.dimWidth) > 48 ||
    Boolean(p.secondaryLocationId || p.secondaryLocationCode)
  );
}

type PalletsResponse = { pallets: Pallet[] } & PaginationMeta;

export default function InventoryPage() {
  const { user, token } = useAuth();
  const isStaff = user?.role === "admin" || user?.role === "staff";
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("all");
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [printPallets, setPrintPallets] = useState<Pallet[] | null>(null);
  const [editOpen, setEditOpen] = useState(false);

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
    setEditOpen(false);
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

  useEffect(() => {
    if (!selected) {
      setEditOpen(false);
      return;
    }
    setDescription(selected.description || "");
    setPoNumber(selected.poNumber || "");
    setJobName(selected.jobName || "");
    setWeightLbs(selected.weightLbs != null ? String(selected.weightLbs) : "");
    setNotes(selected.notes || "");
  }, [selected]);

  function openEdit() {
    if (!selected) return;
    setErr("");
    setMsg("");
    setEditOpen(true);
  }

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
      setEditOpen(false);
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
      setEditOpen(false);
      setSelectedId(null);
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
      render: (p) => <span className="font-mono font-semibold text-navy">{p.externalId}</span>,
    },
    {
      key: "status",
      header: "Status",
      render: (p) => <Badge tone={statusTone(p.status)}>{statusLabel(p.status)}</Badge>,
    },
    {
      key: "loc",
      header: "Location",
      render: (p) => <span className="font-mono text-[13px]">{locationCode(p)}</span>,
    },
    {
      key: "ref",
      header: "PO / Job",
      render: (p) => p.jobName || p.poNumber || "—",
    },
    {
      key: "sqft",
      header: "Sq ft",
      className: "tabular-nums",
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
        description="Filter by status · click a row for detail · edit opens in a modal"
        actions={
          isStaff && rows.length > 0 ? (
            <Button
              type="button"
              size="sm"
              variant="secondary"
              icon={<Printer className="h-3.5 w-3.5" />}
              onClick={() => setPrintPallets(rows)}
            >
              Print page ({rows.length})
            </Button>
          ) : undefined
        }
      />
      <Alert>{error || err}</Alert>
      {msg ? <Alert tone="success">{msg}</Alert> : null}

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
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

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(280px,360px)] xl:grid-cols-[minmax(0,1fr)_minmax(300px,380px)]">
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

        <Card className="h-fit lg:sticky lg:top-4" lift={false}>
          <CardBody className="space-y-0">
            <div className="mb-3 flex items-start justify-between gap-2">
              <CardTitle>Pallet detail</CardTitle>
              {selected && isStaff ? (
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  icon={<Pencil className="h-3.5 w-3.5" />}
                  onClick={openEdit}
                >
                  Edit
                </Button>
              ) : null}
            </div>

            {!selected ? (
              <p className="m-0 rounded-[var(--radius)] border border-dashed border-border bg-surface-2/40 px-3 py-8 text-center text-sm text-muted">
                Select a pallet in the table to see location, footprint, and labels.
              </p>
            ) : (
              <div className="space-y-4">
                <div className="rounded-[var(--radius)] border border-border bg-surface-2/40 px-3 py-2.5">
                  <div className="font-mono text-base font-semibold text-navy">
                    {selected.externalId}
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-2">
                    <Badge tone={statusTone(selected.status)}>
                      {statusLabel(selected.status)}
                    </Badge>
                    <span className="font-mono text-xs text-muted">{locationCode(selected)}</span>
                  </div>
                </div>

                <dl className="m-0 grid gap-0">
                  <DetailRow
                    label="Barcodes"
                    value={
                      needsDualBarcode(selected)
                        ? `${selected.externalId} · ${selected.externalId}-B`
                        : selected.externalId
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

                <Button
                  className="w-full"
                  variant="secondary"
                  icon={<Printer className="h-3.5 w-3.5" />}
                  onClick={() => setPrintPallets([selected])}
                >
                  {needsDualBarcode(selected)
                    ? "Print both barcodes (A + B)"
                    : "Print barcode label"}
                </Button>
              </div>
            )}
          </CardBody>
        </Card>
      </div>

      <Modal
        open={editOpen && Boolean(selected) && isStaff}
        onClose={() => {
          if (!busy) setEditOpen(false);
        }}
        title={selected ? `Edit ${selected.externalId}` : "Edit pallet"}
        description="Update description, PO/job, weight, and notes. Void frees the storage slot."
        size="md"
        footer={
          <div className="flex flex-wrap items-center justify-between gap-2">
            {selected && selected.status !== "void" && selected.status !== "shipped" ? (
              <Button
                type="button"
                variant="danger"
                disabled={busy}
                icon={<Trash2 className="h-3.5 w-3.5" />}
                onClick={() => void onVoid()}
              >
                Void pallet
              </Button>
            ) : (
              <span />
            )}
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="secondary" disabled={busy} onClick={() => setEditOpen(false)}>
                Cancel
              </Button>
              <Button
                type="submit"
                form="inventory-edit-pallet"
                loading={busy}
                icon={<Save className="h-3.5 w-3.5" />}
              >
                Save changes
              </Button>
            </div>
          </div>
        }
      >
        <form id="inventory-edit-pallet" onSubmit={onSave} className="space-y-3">
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
            <NumberInput value={weightLbs} onValueChange={setWeightLbs} placeholder="Optional" />
          </Field>
          <Field label="Notes">
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" />
          </Field>
        </form>
      </Modal>

      {printPallets ? (
        <PalletLabelPreview pallets={printPallets} onClose={() => setPrintPallets(null)} />
      ) : null}
    </>
  );
}

function DetailRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="grid grid-cols-[7.5rem_minmax(0,1fr)] items-start gap-x-3 border-b border-border/70 py-2.5 last:border-b-0">
      <dt className="pt-0.5 text-[10px] font-bold tracking-[0.08em] text-muted uppercase">
        {label}
      </dt>
      <dd className="m-0 min-w-0 break-words text-sm font-medium leading-snug text-text">
        {value}
      </dd>
    </div>
  );
}
