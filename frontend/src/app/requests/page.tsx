"use client";

import { FormEvent, useState } from "react";
import { AppShell } from "@/components/AppShell";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  CardTitle,
  DataTable,
  Input,
  Label,
  PageHeader,
  Select,
  statusTone,
  type Column,
} from "@/components/ui";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useApiQuery } from "@/hooks/useApiQuery";
import { dateLabel } from "@/lib/format";
import type { WhRequest } from "@/types";

export default function RequestsPage() {
  const { token, user } = useAuth();
  const { data, error, loading, reload } = useApiQuery<{ requests: WhRequest[] }>("/requests");
  const isPortal = user?.role === "customer";

  const [type, setType] = useState<"Inbound" | "Outbound">("Inbound");
  const [qty, setQty] = useState(1);
  const [poOrJob, setPoOrJob] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [actionId, setActionId] = useState<string | null>(null);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    if (!token) return;
    setBusy(true);
    setErr("");
    setMsg("");
    try {
      await api("/requests", {
        method: "POST",
        token,
        body: JSON.stringify({
          type,
          qty,
          palletCount: qty,
          ref: poOrJob,
          notes,
          jobName: poOrJob,
          poNumber: poOrJob,
          status: "pending",
        }),
      });
      setMsg("Request submitted");
      setPoOrJob("");
      setNotes("");
      await reload();
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "Failed to submit");
    } finally {
      setBusy(false);
    }
  }

  async function setStatus(id: string, status: "approved" | "cancelled" | "completed") {
    if (!token) return;
    setActionId(id);
    setErr("");
    setMsg("");
    try {
      const result = await api<{
        request: WhRequest;
        expectedShipment?: { _id: string; direction: string; status: string } | null;
      }>(`/requests/${id}`, {
        method: "PATCH",
        token,
        body: JSON.stringify({ status }),
      });
      if (status === "approved" && result.expectedShipment) {
        setMsg(
          `Approved — expected ${result.expectedShipment.direction} created. Open Expected to receive when the truck arrives.`
        );
      } else {
        setMsg(`Request ${result.request.status}`);
      }
      await reload();
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "Update failed");
    } finally {
      setActionId(null);
    }
  }

  const columns: Column<WhRequest>[] = [
    {
      key: "type",
      header: "Type",
      render: (r) => <Badge tone="accent">{r.type}</Badge>,
    },
    {
      key: "status",
      header: "Status",
      render: (r) => <Badge tone={statusTone(r.status)}>{r.status}</Badge>,
    },
    {
      key: "qty",
      header: "Qty",
      render: (r) => r.qty,
    },
    {
      key: "ref",
      header: "PO / Job",
      render: (r) => r.jobName || r.poNumber || r.ref || "—",
    },
    {
      key: "date",
      header: "Requested",
      render: (r) => dateLabel(r.dateRequested),
    },
  ];

  if (!isPortal) {
    columns.push({
      key: "actions",
      header: "Actions",
      render: (r) =>
        r.status === "pending" ? (
          <div className="flex flex-wrap gap-1.5">
            <Button
              size="sm"
              loading={actionId === r._id}
              onClick={() => setStatus(r._id, "approved")}
            >
              Approve
            </Button>
            <Button
              size="sm"
              variant="secondary"
              loading={actionId === r._id}
              onClick={() => setStatus(r._id, "cancelled")}
            >
              Cancel
            </Button>
          </div>
        ) : r.status === "approved" ? (
          <Button
            size="sm"
            variant="secondary"
            loading={actionId === r._id}
            onClick={() => setStatus(r._id, "completed")}
          >
            Complete
          </Button>
        ) : (
          "—"
        ),
    });
  }

  return (
    <AppShell>
      <PageHeader
        title="Requests"
        description={
          isPortal
            ? "Submit inbound/outbound requests — agreement §10 portal target"
            : "Inbound / outbound portal requests — approve or cancel pending items"
        }
      />
      <Alert>{error || err}</Alert>
      {msg ? <Alert tone="info">{msg}</Alert> : null}

      {isPortal ? (
        <Card className="mb-6">
          <CardBody className="p-5">
            <CardTitle>New request</CardTitle>
            <form onSubmit={onCreate} className="mt-4 grid gap-4 sm:grid-cols-2">
              <div>
                <Label>Type</Label>
                <Select
                  value={type}
                  onChange={(e) => setType(e.target.value as "Inbound" | "Outbound")}
                >
                  <option value="Inbound">Inbound</option>
                  <option value="Outbound">Outbound</option>
                </Select>
              </div>
              <div>
                <Label>Pallet qty</Label>
                <Input
                  type="number"
                  min={1}
                  value={qty}
                  onChange={(e) => setQty(Number(e.target.value))}
                />
              </div>
              <div className="sm:col-span-2">
                <Label>PO / Job name</Label>
                <Input
                  value={poOrJob}
                  onChange={(e) => setPoOrJob(e.target.value)}
                  placeholder="One reference — PO or job name"
                  required
                />
              </div>
              <div className="sm:col-span-2">
                <Label>Notes</Label>
                <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
              </div>
              <div className="sm:col-span-2">
                <Button type="submit" loading={busy}>
                  Submit request
                </Button>
              </div>
            </form>
          </CardBody>
        </Card>
      ) : null}

      <DataTable
        columns={columns}
        rows={data?.requests ?? []}
        rowKey={(r) => r._id}
        loading={loading}
        emptyTitle="No requests yet"
        emptyDescription={
          isPortal ? "Submit your first inbound or outbound request above." : undefined
        }
      />
    </AppShell>
  );
}
