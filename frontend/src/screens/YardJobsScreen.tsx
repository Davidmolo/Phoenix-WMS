"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { Forklift } from "lucide-react";
import {
  Alert,
  Badge,
  Button,
  DataTable,
  Field,
  FormGrid,
  FormSection,
  Input,
  PageHeader,
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
  const [palletCount, setPalletCount] = useState(0);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!customerId && customers[0]) setCustomerId(customers[0]._id);
  }, [customers, customerId]);

  useEffect(() => {
    if (!expectedShipmentId) return;
    const exp = (expectedData?.shipments ?? []).find((s) => s._id === expectedShipmentId);
    if (!exp) return;
    const cid =
      typeof exp.customerId === "string"
        ? exp.customerId
        : (exp.customerId as { _id?: string } | undefined)?._id;
    if (cid) setCustomerId(cid);
    if (exp.trailerNumber) setTruckNumberIn(exp.trailerNumber);
  }, [expectedShipmentId, expectedData]);

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
          palletCount,
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
          <Button type="button" size="sm" loading={busy} onClick={() => void endJob(j._id)}>
            End job
          </Button>
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
            <Field label="From Expected inbound" hint="Cesar: documentation comes from Expected.">
              <Select
                value={expectedShipmentId}
                onChange={(e) => setExpectedShipmentId(e.target.value)}
              >
                <option value="">Manual (no Expected)</option>
                {(expectedData?.shipments ?? []).map((s) => (
                  <option key={s._id} value={s._id}>
                    {(s.jobName || s.poNumber || s.notes || s._id.slice(-6)).slice(0, 48)}
                  </option>
                ))}
              </Select>
            </Field>
          </FormGrid>
          <FormGrid cols={2}>
            <Field label="Customer" required>
              <Select value={customerId} onChange={(e) => setCustomerId(e.target.value)} required>
                {customers.map((c) => (
                  <option key={c._id} value={c._id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Pallet count" hint="Used for crossdock fee math.">
              <Input
                type="number"
                min={0}
                value={palletCount}
                onChange={(e) => setPalletCount(Number(e.target.value))}
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
          <Button type="submit" loading={busy} icon={<Forklift className="h-4 w-4" />}>
            Start {type === "crossdock" ? "crossdock" : "trailer rework"}
          </Button>
        </form>
      </FormSection>

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
    </>
  );
}
