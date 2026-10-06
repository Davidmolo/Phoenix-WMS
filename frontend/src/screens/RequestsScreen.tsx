"use client";

import { FormEvent, useMemo, useState } from "react";
import { Inbox } from "lucide-react";
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
  statusTone,
  type Column,
} from "@/components/ui";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useApiQuery, invalidateApiCache } from "@/hooks/useApiQuery";
import { dateLabel } from "@/lib/format";
import { listQuery, paginationFrom, type PaginationMeta } from "@/lib/pagination";
import type { WhRequest } from "@/types";

type RequestsResponse = { requests: WhRequest[] } & PaginationMeta;

export default function RequestsPage() {
  const { token, user } = useAuth();
  const [page, setPage] = useState(1);
  const path = useMemo(() => listQuery("/requests", { page }), [page]);
  const { data, error, loading, reload } = useApiQuery<RequestsResponse>(path);
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
      setPage(1);
      invalidateApiCache("/requests");
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
          `Approved — expected ${result.expectedShipment.direction} created. Open Expected to receive.`
        );
      } else {
        setMsg(`Request ${status}`);
      }
      invalidateApiCache();
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
    <>
        <PageHeader
          title="Requests"
          icon={<Inbox className="h-5 w-5" />}
          description={
            isPortal
              ? "Submit inbound/outbound requests — agreement §10 portal target"
              : "Inbound / outbound portal requests — approve or cancel pending items"
          }
        />
        <Alert>{error || err}</Alert>
        {msg ? <Alert tone="info">{msg}</Alert> : null}

        {isPortal ? (
          <FormSection
            title="New request"
            description="Portal requests route to the dock for approval."
            icon={<Inbox className="h-4 w-4" />}
            className="mb-6"
          >
            <form onSubmit={onCreate} className="space-y-4">
              <FormGrid>
                <Field label="Type">
                  <Select
                    value={type}
                    onChange={(e) => setType(e.target.value as "Inbound" | "Outbound")}
                  >
                    <option value="Inbound">Inbound</option>
                    <option value="Outbound">Outbound</option>
                  </Select>
                </Field>
                <Field label="Pallet qty">
                  <Input
                    type="number"
                    min={1}
                    value={qty}
                    onChange={(e) => setQty(Number(e.target.value))}
                  />
                </Field>
              </FormGrid>
              <Field label="PO / Job name" required>
                <Input
                  value={poOrJob}
                  onChange={(e) => setPoOrJob(e.target.value)}
                  placeholder="One reference — PO or job name"
                  required
                />
              </Field>
              <Field label="Notes">
                <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
              </Field>
              <Button type="submit" loading={busy}>
                Submit request
              </Button>
            </form>
          </FormSection>
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
          pagination={paginationFrom(data)}
          onPageChange={setPage}
        />
    </>
  );
}
