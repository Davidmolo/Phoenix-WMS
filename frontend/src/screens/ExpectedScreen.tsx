"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { CalendarClock, X } from "lucide-react";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  CardTitle,
  DataTable,
  Field,
  FormGrid,
  FormSection,
  Input,
  NumberInput,
  PageHeader,
  SearchableSelect,
  Select,
  statusLabel,
  statusTone,
  type Column,
} from "@/components/ui";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useApiQuery, invalidateApiCache } from "@/hooks/useApiQuery";
import { dateTimeLabel, toDatetimeLocalValue } from "@/lib/format";
import { listQuery, paginationFrom, type PaginationMeta } from "@/lib/pagination";
import type { Customer, Shipment, Warehouse } from "@/types";

type ShipmentsResponse = { shipments: Shipment[] } & PaginationMeta;

const SERVICE_TYPE_OPTIONS = [
  { value: "drop_and_store", label: "Drop & Store" },
  { value: "crossdock", label: "Cross-dock" },
  { value: "trailer_rework", label: "Trailer Rework" },
  { value: "pickup", label: "Pick-up" },
] as const;

function poJobLabel(s: Shipment) {
  const direct = (s.jobName || s.poNumber || "").trim();
  if (direct) return direct;
  const fromNotes = (s.notes || "").match(/PO\/Job:\s*([^·]+)/i);
  return fromNotes?.[1]?.trim() || "—";
}

/** Staff edit — carrier, PO/job, notes, scheduled date/time, service type. Reschedule / cancel
 * (Cesar modify) hit the same `PATCH /shipments/:id` the backend already supports. */
function EditShipmentModal({
  shipment,
  token,
  onClose,
  onSaved,
}: {
  shipment: Shipment;
  token: string | null;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const [carrier, setCarrier] = useState(shipment.carrier || "");
  const [trailerNumber, setTrailerNumber] = useState(shipment.trailerNumber || "");
  const [weightLbs, setWeightLbs] = useState(
    shipment.weightLbs != null ? String(shipment.weightLbs) : ""
  );
  const [poOrJob, setPoOrJob] = useState(shipment.jobName || shipment.poNumber || "");
  const [serviceType, setServiceType] = useState(shipment.serviceType || "drop_and_store");
  const [scheduledAt, setScheduledAt] = useState(toDatetimeLocalValue(shipment.scheduledAt));
  const [notes, setNotes] = useState(shipment.notes || "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function onSave(e: FormEvent) {
    e.preventDefault();
    if (!token) return;
    setBusy(true);
    setErr("");
    try {
      await api(`/shipments/${shipment._id}`, {
        method: "PATCH",
        token,
        body: JSON.stringify({
          carrier,
          trailerNumber,
          weightLbs: weightLbs === "" ? null : Number(weightLbs),
          jobName: poOrJob,
          serviceType,
          scheduledAt: scheduledAt || null,
          notes,
        }),
      });
      invalidateApiCache();
      onSaved(
        `${shipment.direction === "inbound" ? "Inbound" : "Outbound"} appointment updated`
      );
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "Could not update appointment");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-navy-deep/50 p-4 backdrop-blur-sm"
      role="dialog"
      aria-label="Edit expected appointment"
    >
      <Card className="w-full max-w-lg" lift={false}>
        <CardBody>
          <div className="flex items-start justify-between gap-2">
            <CardTitle icon={<CalendarClock className="h-4 w-4" />}>
              Edit {shipment.direction} appointment
            </CardTitle>
            <button
              type="button"
              className="rounded-lg border border-border p-1.5 text-muted hover:bg-surface-2 hover:text-navy"
              onClick={onClose}
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <Alert>{err}</Alert>
          <form onSubmit={onSave} className="mt-2 space-y-4">
            <FormGrid>
              <Field label="Carrier">
                <Input value={carrier} onChange={(e) => setCarrier(e.target.value)} placeholder="Optional" />
              </Field>
              <Field label="Trailer #">
                <Input
                  value={trailerNumber}
                  onChange={(e) => setTrailerNumber(e.target.value)}
                  placeholder="Optional"
                />
              </Field>
              <Field label="Total weight (lbs)" hint="Flows into Receive / Ship when linked.">
                <NumberInput value={weightLbs} onValueChange={setWeightLbs} placeholder="Optional" />
              </Field>
              <Field label="PO / Job">
                <Input
                  value={poOrJob}
                  onChange={(e) => setPoOrJob(e.target.value)}
                  placeholder="e.g. PO-12345 or site job name"
                />
              </Field>
              <Field label="Service type">
                <Select value={serviceType} onChange={(e) => setServiceType(e.target.value)}>
                  {SERVICE_TYPE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Scheduled">
                <Input
                  type="datetime-local"
                  value={scheduledAt}
                  onChange={(e) => setScheduledAt(e.target.value)}
                />
              </Field>
            </FormGrid>
            <Field label="Notes" hint="Also use this to note a change in expected pallet count.">
              <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" />
            </Field>
            <div className="flex gap-2">
              <Button type="submit" loading={busy}>
                Save changes
              </Button>
              <Button type="button" variant="secondary" onClick={onClose} disabled={busy}>
                Close
              </Button>
            </div>
          </form>
        </CardBody>
      </Card>
    </div>
  );
}

export default function ExpectedPage() {
  const { token } = useAuth();
  const { data: custData } = useApiQuery<{ customers: Customer[] }>("/customers?portal=all");
  const { data: whData } = useApiQuery<{ warehouses: Warehouse[] }>("/warehouses");
  const [inPage, setInPage] = useState(1);
  const [outPage, setOutPage] = useState(1);

  const inPath = useMemo(
    () =>
      listQuery("/shipments", {
        page: inPage,
        params: { status: "expected", direction: "inbound" },
      }),
    [inPage]
  );
  const outPath = useMemo(
    () =>
      listQuery("/shipments", {
        page: outPage,
        params: { status: "expected", direction: "outbound" },
      }),
    [outPage]
  );

  const { data: inData, reload: reloadIn } = useApiQuery<ShipmentsResponse>(inPath);
  const { data: outData, reload: reloadOut } = useApiQuery<ShipmentsResponse>(outPath);

  const warehouse = whData?.warehouses?.[0];
  const customers = custData?.customers ?? [];
  const [customerId, setCustomerId] = useState("");
  const [direction, setDirection] = useState<"inbound" | "outbound">("inbound");
  const [serviceType, setServiceType] = useState<string>("drop_and_store");
  const [palletCountStr, setPalletCountStr] = useState("1");
  const [carrier, setCarrier] = useState("");
  const [trailerNumber, setTrailerNumber] = useState("");
  const [weightLbs, setWeightLbs] = useState("");
  const [poOrJob, setPoOrJob] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  const [editing, setEditing] = useState<Shipment | null>(null);
  const [cancelId, setCancelId] = useState<string | null>(null);

  useEffect(() => {
    if (!customerId && customers[0]) setCustomerId(customers[0]._id);
  }, [customers, customerId]);

  // Pick-up appointments are always outbound (matches backend's serviceType rule)
  useEffect(() => {
    if (serviceType === "pickup") setDirection("outbound");
  }, [serviceType]);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    if (!token || !warehouse || !customerId) return;
    setBusy(true);
    setErr("");
    setMsg("");
    try {
      await api("/shipments/expected", {
        method: "POST",
        token,
        body: JSON.stringify({
          warehouseId: warehouse._id,
          customerId,
          direction,
          serviceType,
          palletCount: Math.max(1, Number(palletCountStr) || 1),
          carrier,
          trailerNumber,
          weightLbs: weightLbs === "" ? undefined : Number(weightLbs),
          poOrJob,
          scheduledAt: scheduledAt || undefined,
          notes,
        }),
      });
      setMsg(`Expected ${direction} appointment created`);
      setNotes("");
      setPoOrJob("");
      setTrailerNumber("");
      setWeightLbs("");
      if (direction === "inbound") setInPage(1);
      else setOutPage(1);
      invalidateApiCache();
      await Promise.all([reloadIn(), reloadOut()]);
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  async function onCancel(s: Shipment) {
    if (!token) return;
    if (
      !window.confirm(
        `Cancel this ${s.direction} appointment${s.carrier ? ` (${s.carrier})` : ""}?`
      )
    ) {
      return;
    }
    setCancelId(s._id);
    setErr("");
    setMsg("");
    try {
      await api(`/shipments/${s._id}`, {
        method: "PATCH",
        token,
        body: JSON.stringify({ status: "cancelled" }),
      });
      setMsg("Appointment cancelled");
      invalidateApiCache();
      await Promise.all([reloadIn(), reloadOut()]);
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "Could not cancel appointment");
    } finally {
      setCancelId(null);
    }
  }

  function onSavedEdit(message: string) {
    setEditing(null);
    setMsg(message);
    void Promise.all([reloadIn(), reloadOut()]);
  }

  const columns: Column<Shipment>[] = [
    {
      key: "status",
      header: "Status",
      render: (s) => <Badge tone={statusTone(s.status)}>{s.status}</Badge>,
    },
    {
      key: "service",
      header: "Service type",
      render: (s) => <Badge tone="accent">{statusLabel(s.serviceType) || "—"}</Badge>,
    },
    {
      key: "ref",
      header: "PO / Job",
      render: (s) => poJobLabel(s),
    },
    { key: "carrier", header: "Carrier", render: (s) => s.carrier || "—" },
    { key: "notes", header: "Notes", render: (s) => s.notes || "—" },
    {
      key: "sched",
      header: "Scheduled",
      render: (s) => dateTimeLabel(s.scheduledAt as string | undefined),
    },
    {
      key: "actions",
      header: "",
      render: (s) => (
        <div className="flex flex-wrap gap-1.5">
          <Button type="button" size="sm" variant="secondary" onClick={() => setEditing(s)}>
            Edit
          </Button>
          {s.status === "expected" ? (
            <Button
              type="button"
              size="sm"
              variant="danger"
              loading={cancelId === s._id}
              onClick={() => void onCancel(s)}
            >
              Cancel
            </Button>
          ) : null}
        </div>
      ),
    },
  ];

  return (
    <>
        <PageHeader
          title="Expected inbound / outbound"
          icon={<CalendarClock className="h-5 w-5" />}
          description="Appointments before freight hits the dock — matches prototype Expected In/Out"
        />
        <Alert>{err}</Alert>
        {msg ? <Alert tone="info">{msg}</Alert> : null}

        <FormSection
          title="Schedule expected load"
          description="Book a bay before freight arrives."
          icon={<CalendarClock className="h-4 w-4" />}
          className="mb-6"
        >
          <form onSubmit={onCreate} className="space-y-4">
            <FormGrid>
              <Field label="Customer" required>
                <SearchableSelect
                  value={customerId}
                  onChange={setCustomerId}
                  options={customers.map((c) => ({
                    value: c._id,
                    label: c.name,
                    keywords: c.email,
                  }))}
                  required
                  placeholder="Search customer…"
                  searchPlaceholder="Search by name or email…"
                />
              </Field>
              <Field label="Service type">
                <Select value={serviceType} onChange={(e) => setServiceType(e.target.value)}>
                  {SERVICE_TYPE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Direction" hint={serviceType === "pickup" ? "Pick-up is always outbound." : undefined}>
                <Select
                  value={direction}
                  disabled={serviceType === "pickup"}
                  onChange={(e) => setDirection(e.target.value as "inbound" | "outbound")}
                >
                  <option value="inbound">Inbound</option>
                  <option value="outbound">Outbound</option>
                </Select>
              </Field>
              <Field label="Pallet count (est.)">
                <NumberInput
                  decimal={false}
                  value={palletCountStr}
                  onValueChange={setPalletCountStr}
                />
              </Field>
              <Field label="Carrier">
                <Input value={carrier} onChange={(e) => setCarrier(e.target.value)} />
              </Field>
              <Field label="Trailer #">
                <Input
                  value={trailerNumber}
                  onChange={(e) => setTrailerNumber(e.target.value)}
                  placeholder="Optional — pre-fills Ship"
                />
              </Field>
              <Field
                label="Total weight (lbs)"
                hint="Optional — Receive splits across pallet count; Ship can use as default."
              >
                <NumberInput value={weightLbs} onValueChange={setWeightLbs} placeholder="Optional" />
              </Field>
              <Field label="PO / Job">
                <Input
                  value={poOrJob}
                  onChange={(e) => setPoOrJob(e.target.value)}
                  placeholder="e.g. PO-12345 or site job name"
                />
              </Field>
              <Field label="Scheduled date">
                <Input
                  type="date"
                  value={scheduledAt}
                  onChange={(e) => setScheduledAt(e.target.value)}
                />
              </Field>
              <Field label="Notes">
                <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
              </Field>
            </FormGrid>
            <Button type="submit" loading={busy}>
              Create expected appointment
            </Button>
          </form>
        </FormSection>

        <div className="mb-6">
          <PageHeader title="Expected inbound" className="mb-4" />
          <DataTable
            columns={columns}
            rows={inData?.shipments ?? []}
            rowKey={(s) => s._id}
            emptyTitle="No expected inbound"
            pagination={paginationFrom(inData)}
            onPageChange={setInPage}
          />
        </div>

        <div>
          <PageHeader title="Expected outbound" className="mb-4" />
          <DataTable
            columns={columns}
            rows={outData?.shipments ?? []}
            rowKey={(s) => s._id}
            emptyTitle="No expected outbound"
            pagination={paginationFrom(outData)}
            onPageChange={setOutPage}
          />
        </div>

        {editing ? (
          <EditShipmentModal
            shipment={editing}
            token={token}
            onClose={() => setEditing(null)}
            onSaved={onSavedEdit}
          />
        ) : null}
    </>
  );
}
