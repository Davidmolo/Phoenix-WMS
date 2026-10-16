"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { Forklift, X } from "lucide-react";
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
  Modal,
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
import { dateTimeLabel, money } from "@/lib/format";
import { listQuery, paginationFrom, type PaginationMeta } from "@/lib/pagination";
import { customerIdOfShipment, expectedPalletCountOf } from "@/lib/expectedPrefill";
import type { Customer, Shipment, Warehouse } from "@/types";

type YardJob = {
  _id: string;
  type: "crossdock" | "trailer_rework";
  status: string;
  truckNumberIn?: string;
  truckNumberOut?: string;
  startedAt?: string | null;
  endedAt?: string | null;
  palletCount?: number;
  notes?: string;
  chargeAmount?: number | null;
  customerId?: string | { _id: string; name?: string };
  expectedShipmentId?: string | { _id: string; notes?: string; carrier?: string } | null;
  createdAt?: string;
};

/** Edit truck in/out, notes, pallet count — Cesar modify. `PATCH /yard-jobs/:id` already accepts these. */
function EditYardJobModal({
  job,
  token,
  onClose,
  onSaved,
}: {
  job: YardJob;
  token: string | null;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const [truckNumberIn, setTruckNumberIn] = useState(job.truckNumberIn || "");
  const [truckNumberOut, setTruckNumberOut] = useState(job.truckNumberOut || "");
  const [palletCountStr, setPalletCountStr] = useState(String(job.palletCount ?? 0));
  const [notes, setNotes] = useState(job.notes || "");
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
      await api(`/yard-jobs/${job._id}`, {
        method: "PATCH",
        token,
        body: JSON.stringify({
          truckNumberIn,
          truckNumberOut,
          palletCount: Number(palletCountStr) || 0,
          notes,
        }),
      });
      invalidateApiCache();
      onSaved("Job updated");
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "Could not update job");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-navy-deep/50 p-4 backdrop-blur-sm"
      role="dialog"
      aria-label="Edit yard job"
    >
      <Card className="w-full max-w-lg" lift={false}>
        <CardBody>
          <div className="flex items-start justify-between gap-2">
            <CardTitle icon={<Forklift className="h-4 w-4" />}>
              Edit {statusLabel(job.type)} job
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
            <FormGrid cols={job.type === "crossdock" ? 2 : 1}>
              <Field label={job.type === "crossdock" ? "Incoming truck #" : "Truck #"}>
                <Input value={truckNumberIn} onChange={(e) => setTruckNumberIn(e.target.value)} />
              </Field>
              {job.type === "crossdock" ? (
                <Field label="Outgoing truck #">
                  <Input value={truckNumberOut} onChange={(e) => setTruckNumberOut(e.target.value)} />
                </Field>
              ) : null}
            </FormGrid>
            <Field label="Pallet count" hint="Used for crossdock fee math.">
              <NumberInput
                decimal={false}
                value={palletCountStr}
                onValueChange={setPalletCountStr}
              />
            </Field>
            <Field label="Notes">
              <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
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

export default function YardJobsPage() {
  const { token } = useAuth();
  const [page, setPage] = useState(1);
  const { data: custData } = useApiQuery<{ customers: Customer[] }>("/customers?portal=all");
  const { data: whData } = useApiQuery<{ warehouses: Warehouse[] }>("/warehouses");
  const expectedPath = useMemo(
    () => listQuery("/shipments", { limit: 50, params: { status: "expected", direction: "inbound" } }),
    []
  );
  const { data: expectedData } = useApiQuery<{ shipments: Shipment[] } & PaginationMeta>(expectedPath);
  const jobsPath = useMemo(() => listQuery("/yard-jobs", { page }), [page]);
  const { data, reload, loading, error } = useApiQuery<{ jobs: YardJob[] } & PaginationMeta>(jobsPath);

  const warehouse = whData?.warehouses?.[0];
  const customers = custData?.customers ?? [];

  const [type, setType] = useState<"crossdock" | "trailer_rework">("crossdock");
  const [customerId, setCustomerId] = useState("");
  const [expectedShipmentId, setExpectedShipmentId] = useState("");
  const [truckNumberIn, setTruckNumberIn] = useState("");
  const [truckNumberOut, setTruckNumberOut] = useState("");
  const [palletCountStr, setPalletCountStr] = useState("0");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [actionId, setActionId] = useState<string | null>(null);
  const [editingJob, setEditingJob] = useState<YardJob | null>(null);
  const [cancelTarget, setCancelTarget] = useState<YardJob | null>(null);

  useEffect(() => {
    if (!customerId && customers[0]) setCustomerId(customers[0]._id);
  }, [customers, customerId]);

  // Cesar audit: Expected → Crossdock/Rework must pre-fill pallet count, trucks, notes
  useEffect(() => {
    if (!expectedShipmentId) return;
    const exp = (expectedData?.shipments ?? []).find((s) => s._id === expectedShipmentId);
    if (!exp) return;
    const cid = customerIdOfShipment(exp);
    if (cid) setCustomerId(cid);
    if (exp.trailerNumber) setTruckNumberIn(exp.trailerNumber);
    if (exp.carrier && !exp.trailerNumber) setTruckNumberIn(exp.carrier);
    const planned = expectedPalletCountOf(exp);
    if (planned != null) setPalletCountStr(String(planned));
    if (exp.notes) setNotes(exp.notes);
  }, [expectedShipmentId, expectedData]);

  const filteredExpected = useMemo(() => {
    const all = expectedData?.shipments ?? [];
    // Prefer matching service type; still allow empty serviceType records
    return all.filter((s) => {
      const st = String(s.serviceType || "");
      if (!st) return true;
      if (type === "crossdock") return st === "crossdock";
      if (type === "trailer_rework") return st === "trailer_rework";
      return true;
    });
  }, [expectedData, type]);

  async function onStart(e: FormEvent) {
    e.preventDefault();
    if (!token || !warehouse || !customerId) return;
    setBusy(true);
    setErr("");
    setMsg("");
    try {
      await api("/yard-jobs", {
        method: "POST",
        token,
        body: JSON.stringify({
          warehouseId: warehouse._id,
          customerId,
          type,
          expectedShipmentId: expectedShipmentId || undefined,
          truckNumberIn,
          truckNumberOut: type === "crossdock" ? truckNumberOut : "",
          palletCount: Number(palletCountStr) || 0,
          notes,
          startNow: true,
        }),
      });
      setMsg(
        type === "crossdock"
          ? "Crossdock started — end the job when finished to post the fee-schedule charge."
          : "Trailer rework started — end the job when finished to post the hourly charge."
      );
      setTruckNumberIn("");
      setTruckNumberOut("");
      setPalletCountStr("0");
      setNotes("");
      setExpectedShipmentId("");
      invalidateApiCache();
      await reload();
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "Could not start job");
    } finally {
      setBusy(false);
    }
  }

  async function endJob(jobId: string) {
    if (!token) return;
    setBusy(true);
    setErr("");
    try {
      const result = await api<{ job: YardJob }>(`/yard-jobs/${jobId}`, {
        method: "PATCH",
        token,
        body: JSON.stringify({ complete: true }),
      });
      setMsg(
        `Job completed${
          result.job.chargeAmount != null ? ` · charged ${money(result.job.chargeAmount)}` : ""
        }`
      );
      invalidateApiCache();
      await reload();
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "Could not complete job");
    } finally {
      setBusy(false);
    }
  }

  async function confirmCancel() {
    if (!token || !cancelTarget) return;
    const job = cancelTarget;
    setActionId(job._id);
    setErr("");
    setMsg("");
    try {
      await api(`/yard-jobs/${job._id}`, {
        method: "PATCH",
        token,
        body: JSON.stringify({ status: "cancelled" }),
      });
      setMsg("Job cancelled");
      setCancelTarget(null);
      invalidateApiCache();
      await reload();
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "Could not cancel job");
    } finally {
      setActionId(null);
    }
  }

  function onSavedEdit(message: string) {
    setEditingJob(null);
    setMsg(message);
    void reload();
  }

  const columns: Column<YardJob>[] = [
    {
      key: "type",
      header: "Job",
      render: (j) => <Badge tone="accent">{statusLabel(j.type)}</Badge>,
    },
    {
      key: "customer",
      header: "Customer",
      render: (j) =>
        typeof j.customerId === "object" ? j.customerId?.name || "—" : "—",
    },
    {
      key: "trucks",
      header: "Truck(s)",
      render: (j) =>
        j.type === "crossdock"
          ? `In ${j.truckNumberIn || "—"} · Out ${j.truckNumberOut || "—"}`
          : j.truckNumberIn || "—",
    },
    {
      key: "time",
      header: "Start → End",
      render: (j) =>
        `${j.startedAt ? dateTimeLabel(j.startedAt) : "—"} → ${
          j.endedAt ? dateTimeLabel(j.endedAt) : "…"
        }`,
    },
    {
      key: "status",
      header: "Status",
      render: (j) => <Badge tone={statusTone(j.status)}>{statusLabel(j.status)}</Badge>,
    },
    {
      key: "charge",
      header: "Charge",
      render: (j) => (j.chargeAmount != null ? money(j.chargeAmount) : "—"),
    },
    {
      key: "actions",
      header: "",
      render: (j) =>
        j.status === "in_progress" || j.status === "open" ? (
          <div className="flex flex-wrap gap-1.5">
            <Button type="button" size="sm" variant="secondary" onClick={() => setEditingJob(j)}>
              Edit
            </Button>
            <Button type="button" size="sm" loading={busy} onClick={() => void endJob(j._id)}>
              End job
            </Button>
            <Button
              type="button"
              size="sm"
              variant="danger"
              loading={actionId === j._id}
              onClick={() => setCancelTarget(j)}
            >
              Cancel
            </Button>
          </div>
        ) : null,
    },
  ];

  return (
    <>
      <PageHeader
        title="Crossdock / Trailer Rework"
        icon={<Forklift className="h-5 w-5" />}
        description="Document jobs from Expected inbound — truck numbers, start/end time, fee-schedule charge when done"
      />
      <Alert>{error || err}</Alert>
      {msg ? <Alert tone="success">{msg}</Alert> : null}

      <FormSection
        title="Start a job"
        description="Pull the Expected inbound request, enter truck number(s), start time begins now."
        className="mb-5"
      >
        <form onSubmit={onStart} className="space-y-4">
          <FormGrid cols={2}>
            <Field label="Job type" required>
              <Select
                value={type}
                onChange={(e) => setType(e.target.value as "crossdock" | "trailer_rework")}
              >
                <option value="crossdock">Crossdock</option>
                <option value="trailer_rework">Trailer Rework</option>
              </Select>
            </Field>
            <Field
              label="From Expected inbound"
              hint={
                type === "crossdock"
                  ? "Shows Crossdock appointments first — selecting pre-fills customer, pallets, truck, notes."
                  : "Shows Trailer Rework appointments first — selecting pre-fills customer, pallets, truck, notes."
              }
            >
              <SearchableSelect
                value={expectedShipmentId}
                onChange={setExpectedShipmentId}
                options={filteredExpected.map((s) => {
                  const cust =
                    s.customerId && typeof s.customerId === "object" ? s.customerId.name || "" : "";
                  const planned = expectedPalletCountOf(s);
                  const ref = (s.jobName || s.poNumber || s.notes || s._id.slice(-6)).slice(0, 40);
                  return {
                    value: s._id,
                    label: `${cust ? `${cust} · ` : ""}${ref}${planned ? ` · ${planned} plt` : ""} · ${statusLabel(s.serviceType || "expected")}`,
                    keywords: `${cust} ${s.carrier || ""} ${s.trailerNumber || ""} ${s.serviceType || ""}`,
                  };
                })}
                allowEmpty
                emptyOptionLabel="Manual (no Expected)"
                placeholder="Search Expected…"
                searchPlaceholder="Search PO, job, notes…"
              />
            </Field>
          </FormGrid>
          <FormGrid cols={2}>
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
            <Field label="Pallet count" hint="Used for crossdock fee math.">
              <NumberInput
                decimal={false}
                value={palletCountStr}
                onValueChange={setPalletCountStr}
              />
            </Field>
          </FormGrid>
          <FormGrid cols={type === "crossdock" ? 2 : 1}>
            <Field
              label={type === "crossdock" ? "Incoming truck #" : "Truck #"}
              required
            >
              <Input
                value={truckNumberIn}
                onChange={(e) => setTruckNumberIn(e.target.value)}
                required
              />
            </Field>
            {type === "crossdock" ? (
              <Field label="Outgoing truck #">
                <Input
                  value={truckNumberOut}
                  onChange={(e) => setTruckNumberOut(e.target.value)}
                />
              </Field>
            ) : null}
          </FormGrid>
          <Field label="Notes">
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" loading={busy} icon={<Forklift className="h-4 w-4" />}>
              Start {type === "crossdock" ? "crossdock" : "trailer rework"}
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={busy}
              onClick={() => {
                setExpectedShipmentId("");
                setTruckNumberIn("");
                setTruckNumberOut("");
                setPalletCountStr("0");
                setNotes("");
                setErr("");
                setMsg("");
              }}
            >
              Clear
            </Button>
          </div>
        </form>
      </FormSection>

      <Modal
        open={Boolean(cancelTarget)}
        onClose={() => {
          if (!actionId) setCancelTarget(null);
        }}
        title="Cancel job"
        description={
          cancelTarget
            ? `Cancel this ${statusLabel(cancelTarget.type)} job? It stays in the list as cancelled and is not billed.`
            : undefined
        }
        size="md"
        footer={
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              disabled={Boolean(actionId)}
              onClick={() => setCancelTarget(null)}
            >
              Keep job
            </Button>
            <Button
              type="button"
              variant="danger"
              loading={Boolean(actionId)}
              onClick={() => void confirmCancel()}
            >
              Cancel job
            </Button>
          </div>
        }
      >
        <p className="m-0 text-sm text-muted">
          {cancelTarget?.truckNumberIn
            ? `Incoming truck ${cancelTarget.truckNumberIn} will be left as cancelled.`
            : "The job will be marked cancelled and will not be billed."}
        </p>
      </Modal>

      <DataTable
        columns={columns}
        rows={data?.jobs ?? []}
        rowKey={(j) => j._id}
        loading={loading}
        emptyTitle="No yard jobs yet"
        emptyDescription="Start a Crossdock or Trailer Rework from Expected inbound above."
        pagination={paginationFrom(data)}
        onPageChange={setPage}
      />

      {editingJob ? (
        <EditYardJobModal
          job={editingJob}
          token={token}
          onClose={() => setEditingJob(null)}
          onSaved={onSavedEdit}
        />
      ) : null}
    </>
  );
}
