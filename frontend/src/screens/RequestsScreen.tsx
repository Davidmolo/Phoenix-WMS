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
  Modal,
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
import type { Pallet, WhRequest } from "@/types";

type RequestsResponse = { requests: WhRequest[] } & PaginationMeta;

function companyName(r: WhRequest) {
  if (r.customerId && typeof r.customerId === "object") {
    return r.customerId.name || "—";
  }
  return "—";
}

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
  const [abnormalPallets, setAbnormalPallets] = useState(false);
  const [abnormalPalletSize, setAbnormalPalletSize] = useState("");
  const [weightLbs, setWeightLbs] = useState("");
  const [dateNeeded, setDateNeeded] = useState("");
  const [pickedPalletIds, setPickedPalletIds] = useState<string[]>([]);
  const { data: myPallets } = useApiQuery<{ pallets: Pallet[] }>(
    isPortal && type === "Outbound" ? "/pallets?limit=200" : null
  );
  const shippablePallets = (myPallets?.pallets ?? []).filter((p) =>
    ["stored", "staged", "staged_for_store", "staged_for_shipping"].includes(p.status)
  );
  const [busy, setBusy] = useState(false);
  const [actionId, setActionId] = useState<string | null>(null);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [openRequest, setOpenRequest] = useState<WhRequest | null>(null);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    if (!token) return;
    if (abnormalPallets && !abnormalPalletSize.trim()) {
      setErr("Please enter the abnormal pallet size(s).");
      return;
    }
    setBusy(true);
    setErr("");
    setMsg("");
    try {
      const created = await api<{ notified?: boolean }>("/requests", {
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
          abnormalPallets,
          abnormalPalletSize: abnormalPallets ? abnormalPalletSize.trim() : "",
          weightLbs: weightLbs === "" ? null : Number(weightLbs),
          dateNeeded: dateNeeded || null,
          palletIds: type === "Outbound" ? pickedPalletIds : [],
        }),
      });
      setMsg(
        created.notified
          ? "Request submitted. Admin and staff were emailed."
          : "Request submitted. The staff email did not send — check SMTP on the server."
      );
      setPoOrJob("");
      setNotes("");
      setAbnormalPallets(false);
      setAbnormalPalletSize("");
      setWeightLbs("");
      setDateNeeded("");
      setPickedPalletIds([]);
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

  const columns: Column<WhRequest>[] = [];

  if (!isPortal) {
    columns.push({
      key: "company",
      header: "Company",
      render: (r) => <span className="font-semibold text-navy">{companyName(r)}</span>,
    });
  }

  columns.push(
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
      key: "abnormal",
      header: "Abnormal size",
      render: (r) =>
        r.abnormalPallets ? (
          <span className="text-sm font-medium text-navy">{r.abnormalPalletSize || "Yes"}</span>
        ) : (
          <span className="text-xs text-muted">No</span>
        ),
    },
    {
      key: "date",
      header: "Requested",
      render: (r) => dateLabel(r.dateRequested),
    }
  );

  if (!isPortal) {
    columns.push({
      key: "actions",
      header: "Actions",
      render: (r) =>
        r.status === "pending" || r.status === "scheduled" ? (
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
            ? "Submit inbound/outbound requests — tell us if any pallets are abnormal size"
            : "Portal requests — approve or cancel pending and scheduled items"
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
              <Field
                label={type === "Outbound" && pickedPalletIds.length > 0 ? "Pallet qty (from the list)" : "Pallet qty"}
                hint={type === "Outbound" ? "Used when you do not pick specific pallets below." : undefined}
              >
                <Input
                  type="number"
                  min={1}
                  value={type === "Outbound" && pickedPalletIds.length > 0 ? pickedPalletIds.length : qty}
                  onChange={(e) => setQty(Number(e.target.value))}
                  disabled={type === "Outbound" && pickedPalletIds.length > 0}
                />
              </Field>
              <Field label="Weight (lbs)" hint="Total weight for this request.">
                <Input
                  type="number"
                  min={0}
                  value={weightLbs}
                  onChange={(e) => setWeightLbs(e.target.value)}
                  placeholder="Optional"
                />
              </Field>
              <Field label="Date needed">
                <Input type="date" value={dateNeeded} onChange={(e) => setDateNeeded(e.target.value)} />
              </Field>
            </FormGrid>
            {type === "Outbound" ? (
              <Field label="Pallets to ship" hint="Check the ones you want. Leave them all unchecked to send a quantity only.">
                {shippablePallets.length === 0 ? (
                  <p className="m-0 text-sm text-muted">No stored or staged pallets on your account yet.</p>
                ) : (
                  <div className="max-h-48 space-y-1 overflow-y-auto rounded-lg border border-border bg-white p-2">
                    {shippablePallets.map((p) => (
                      <label key={p._id} className="flex items-center gap-2 rounded px-2 py-1.5 text-sm">
                        <input
                          type="checkbox"
                          className="h-4 w-4 accent-[var(--accent)]"
                          checked={pickedPalletIds.includes(p._id)}
                          onChange={() =>
                            setPickedPalletIds((ids) =>
                              ids.includes(p._id) ? ids.filter((id) => id !== p._id) : [...ids, p._id]
                            )
                          }
                        />
                        <span className="font-mono font-semibold text-navy">{p.externalId}</span>
                        <span className="text-xs text-muted">
                          {p.locationCode || "no location"} · {p.jobName || p.poNumber || p.description || p.status}
                        </span>
                      </label>
                    ))}
                  </div>
                )}
              </Field>
            ) : null}
            <Field label="PO / Job name" required>
              <Input
                value={poOrJob}
                onChange={(e) => setPoOrJob(e.target.value)}
                placeholder="One reference — PO or job name"
                required
              />
            </Field>
            <Field
              label="Abnormal sized pallets?"
              hint="Yes if any pallet is not standard 48×48 (or your usual size)."
            >
              <Select
                value={abnormalPallets ? "yes" : "no"}
                onChange={(e) => {
                  const yes = e.target.value === "yes";
                  setAbnormalPallets(yes);
                  if (!yes) setAbnormalPalletSize("");
                }}
              >
                <option value="no">No</option>
                <option value="yes">Yes</option>
              </Select>
            </Field>
            {abnormalPallets ? (
              <Field
                label="What size are they?"
                required
                hint="Example: 48×60, 40×48 oversized, mix of sizes."
              >
                <Input
                  value={abnormalPalletSize}
                  onChange={(e) => setAbnormalPalletSize(e.target.value)}
                  placeholder="Describe length × width (and height if needed)"
                  required
                />
              </Field>
            ) : null}
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
        onRowClick={setOpenRequest}
      />
      <Modal
        open={Boolean(openRequest)}
        onClose={() => setOpenRequest(null)}
        title={openRequest ? `${openRequest.type} request` : "Request"}
        description={openRequest ? companyName(openRequest) : undefined}
        size="md"
      >
        {openRequest ? (
          <div className="space-y-2 text-sm text-muted">
            <p className="m-0"><span className="font-semibold text-navy">Status: </span>{openRequest.status}</p>
            <p className="m-0"><span className="font-semibold text-navy">Qty: </span>{openRequest.qty}</p>
            <p className="m-0"><span className="font-semibold text-navy">PO / Job: </span>{openRequest.jobName || openRequest.poNumber || openRequest.ref || "—"}</p>
            <p className="m-0"><span className="font-semibold text-navy">Weight: </span>{openRequest.weightLbs != null ? `${openRequest.weightLbs} lbs` : "—"}</p>
            <p className="m-0"><span className="font-semibold text-navy">Date needed: </span>{openRequest.scheduledDate ? dateLabel(openRequest.scheduledDate) : "—"}</p>
            <p className="m-0"><span className="font-semibold text-navy">Requested: </span>{dateLabel(openRequest.dateRequested)}</p>
            <p className="m-0"><span className="font-semibold text-navy">Notes: </span>{openRequest.notes || "—"}</p>
            {openRequest.abnormalPallets ? (
              <p className="m-0"><span className="font-semibold text-navy">Abnormal size: </span>{openRequest.abnormalPalletSize || "Yes"}</p>
            ) : null}
          </div>
        ) : null}
      </Modal>
    </>
  );
}
