"use client";

import { FormEvent, useEffect, useState } from "react";
import { Mail, Pencil, Printer, Save } from "lucide-react";
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
  Input,
  Modal,
  NumberInput,
  KpiCard,
  KpiGrid,
  PageHeader,
  Select,
  statusLabel,
  statusTone,
  type Column,
} from "@/components/ui";
import { AddressAutocomplete } from "@/components/AddressAutocomplete";
import { BillingReportModal } from "@/components/BillingReportModal";
import { useApiQuery, invalidateApiCache } from "@/hooks/useApiQuery";
import { useAuth } from "@/lib/auth";
import { useAppNav } from "@/lib/appNav";
import { dateLabel, money } from "@/lib/format";
import { listQuery, paginationFrom, type PaginationMeta } from "@/lib/pagination";
import { api } from "@/lib/api";
import type { Customer, Invoice, Pallet, WhRequest } from "@/types";

type Charge = { _id: string; description: string; amount: number; type: string; date: string };

type DetailResponse = {
  customer: Customer;
  portal?: {
    email: string;
    name: string;
    active: boolean;
    invitePending: boolean;
    inviteSentAt?: string | null;
    inviteExpiresAt?: string | null;
  } | null;
  summary: {
    activePallets: number;
    unbilledTotal: number;
    unbilledCount: number;
    openRequests: number;
  };
  pallets: Pallet[];
  unbilledCharges: Charge[];
  requests: WhRequest[];
  invoices: Invoice[];
};

type EditForm = {
  billingMethod: string;
  testAccount: boolean;
  contractFee: string;
  contractSqft: string;
  contractHandlingPerPallet: string;
  contractFtlRate: string;
  rateInside: string;
  rateOutside: string;
  unloadFee: string;
  loadFee: string;
  address: string;
  contact: string;
  phone: string;
  email: string;
};

function formFromCustomer(c: Customer): EditForm {
  return {
    billingMethod: c.billingMethod || "pallet",
    testAccount: Boolean(c.testAccount),
    contractFee: c.contractFee != null ? String(c.contractFee) : "",
    contractSqft: c.contractSqft != null ? String(c.contractSqft) : "",
    contractHandlingPerPallet:
      c.contractHandlingPerPallet != null ? String(c.contractHandlingPerPallet) : "",
    contractFtlRate: c.contractFtlRate != null ? String(c.contractFtlRate) : "",
    rateInside: c.rateInside != null ? String(c.rateInside) : "",
    rateOutside: c.rateOutside != null ? String(c.rateOutside) : "",
    unloadFee: c.unloadFee != null ? String(c.unloadFee) : "",
    loadFee: c.loadFee != null ? String(c.loadFee) : "",
    address: c.address || "",
    contact: c.contact || "",
    phone: c.phone || "",
    email: c.email || "",
  };
}

function numOrNull(v: string): number | null {
  if (v.trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export default function CustomerDetailPage({ customerId }: { customerId: string }) {
  const { navigate } = useAppNav();
  const { user, token } = useAuth();
  const isAdmin = user?.role === "admin";
  const isStaff = user?.role === "admin" || user?.role === "staff";
  const { data, error, loading, reload } = useApiQuery<DetailResponse>(
    customerId ? `/customers/${customerId}` : null
  );
  const [invPage, setInvPage] = useState(1);
  // Same register as Billing — not the embedded (possibly stale) customer payload
  const invPath = customerId
    ? listQuery("/invoices", { page: invPage, params: { customerId } })
    : null;
  const { data: invData, loading: invLoading } = useApiQuery<
    { invoices: Invoice[] } & PaginationMeta
  >(invPath);
  const [showReport, setShowReport] = useState(false);

  const c = data?.customer;
  const invoices = invData?.invoices ?? [];
  /** Hide invite once they have set a portal password (onboarded). */
  const needsPortalInvite = Boolean(c && !c.portalActivated);
  const [inviteBusy, setInviteBusy] = useState(false);
  const [inviteMsg, setInviteMsg] = useState("");
  const [inviteErr, setInviteErr] = useState("");
  const [inviteUrl, setInviteUrl] = useState("");

  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<EditForm | null>(null);
  const [saveBusy, setSaveBusy] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");
  const [saveErr, setSaveErr] = useState("");

  useEffect(() => {
    if (c && !editing) setForm(formFromCustomer(c));
  }, [c, editing]);

  function beginEdit() {
    if (!c) return;
    setForm(formFromCustomer(c));
    setEditing(true);
    setSaveMsg("");
    setSaveErr("");
  }

  function cancelEdit() {
    if (c) setForm(formFromCustomer(c));
    setEditing(false);
    setSaveErr("");
  }

  async function saveEdit(e: FormEvent) {
    e.preventDefault();
    if (!token || !c || !form) return;
    setSaveBusy(true);
    setSaveErr("");
    setSaveMsg("");
    try {
      const payload: Record<string, unknown> = {
        billingMethod: form.billingMethod,
        testAccount: form.testAccount,
        address: form.address,
        contact: form.contact,
        phone: form.phone,
        email: form.email,
      };
      if (isAdmin) {
        payload.contractFee = numOrNull(form.contractFee) ?? 0;
        payload.contractSqft = numOrNull(form.contractSqft) ?? 0;
        payload.contractHandlingPerPallet = numOrNull(form.contractHandlingPerPallet);
        payload.contractFtlRate = numOrNull(form.contractFtlRate);
        payload.rateInside = numOrNull(form.rateInside) ?? 0;
        payload.rateOutside = numOrNull(form.rateOutside) ?? 0;
        payload.unloadFee = numOrNull(form.unloadFee) ?? 0;
        payload.loadFee = numOrNull(form.loadFee) ?? 0;
      }
      await api(`/customers/${c._id}`, {
        method: "PATCH",
        token,
        body: JSON.stringify(payload),
      });
      setSaveMsg("Account updated");
      setEditing(false);
      invalidateApiCache(`/customers/${c._id}`);
      await reload();
    } catch (ex) {
      setSaveErr(ex instanceof Error ? ex.message : "Save failed");
    } finally {
      setSaveBusy(false);
    }
  }

  async function sendPortalInvite() {
    if (!token || !c) return;
    setInviteBusy(true);
    setInviteErr("");
    setInviteMsg("");
    setInviteUrl("");
    try {
      const result = await api<{ inviteUrl: string; email: string; message?: string }>(
        `/customers/${c._id}/invite`,
        {
          method: "POST",
          token,
          body: JSON.stringify({ email: c.email, name: c.contact || c.name }),
        }
      );
      setInviteUrl("");
      setInviteMsg(
        result.message ||
          `Invite emailed to ${result.email}. They appear in Customers after setting a password.`
      );
      invalidateApiCache(`/customers/${c._id}`);
      await reload();
    } catch (ex) {
      setInviteErr(ex instanceof Error ? ex.message : "Invite failed");
    } finally {
      setInviteBusy(false);
    }
  }

  const palletCols: Column<Pallet>[] = [
    {
      key: "id",
      header: "Pallet",
      render: (p) => <span className="font-semibold">{p.externalId}</span>,
    },
    {
      key: "status",
      header: "Status",
      render: (p) => <Badge tone={statusTone(p.status)}>{p.status}</Badge>,
    },
    { key: "job", header: "Job", render: (p) => p.jobName || "—" },
    { key: "po", header: "PO", render: (p) => p.poNumber || "—" },
    { key: "recv", header: "Received", render: (p) => dateLabel(p.receivedAt) },
  ];

  const chargeCols: Column<Charge>[] = [
    { key: "desc", header: "Description", render: (x) => x.description },
    { key: "type", header: "Type", render: (x) => <Badge>{x.type}</Badge> },
    { key: "amt", header: "Amount", render: (x) => money(x.amount) },
    { key: "date", header: "Date", render: (x) => dateLabel(x.date) },
  ];

  const reqCols: Column<WhRequest>[] = [
    { key: "type", header: "Type", render: (r) => <Badge tone="accent">{r.type}</Badge> },
    {
      key: "status",
      header: "Status",
      render: (r) => <Badge tone={statusTone(r.status)}>{r.status}</Badge>,
    },
    { key: "qty", header: "Qty", render: (r) => r.qty },
    { key: "ref", header: "Ref", render: (r) => r.ref || "—" },
  ];

  return (
    <>
        <PageHeader
          title={loading ? "Customer…" : c?.name || "Customer"}
          description={c ? `${c.contact || "—"} · ${c.email || "—"}` : "Loading account detail"}
          actions={
            <div className="flex flex-wrap items-center gap-2">
              {isStaff && !editing ? (
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  icon={<Pencil className="h-3.5 w-3.5" />}
                  onClick={beginEdit}
                  disabled={!c}
                >
                  Edit billing & account
                </Button>
              ) : null}
              {needsPortalInvite ? (
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  icon={<Mail className="h-3.5 w-3.5" />}
                  onClick={() => void sendPortalInvite()}
                  loading={inviteBusy}
                  disabled={!c?.email}
                  title={!c?.email ? "Add an email on this customer first" : undefined}
                >
                  {data?.portal?.invitePending ? "Resend portal invite" : "Send portal invite"}
                </Button>
              ) : null}
              <Button
                type="button"
                size="sm"
                variant="secondary"
                icon={<Printer className="h-3.5 w-3.5" />}
                onClick={() => setShowReport(true)}
                disabled={!c}
              >
                Print / export
              </Button>
              <button
                type="button"
                onClick={() => navigate("/customers")}
                className="text-sm font-semibold text-accent-dark hover:underline"
              >
                ← All customers
              </button>
            </div>
          }
        />
        <Alert>{error || inviteErr || saveErr}</Alert>
        {inviteMsg ? <Alert tone="info">{inviteMsg}</Alert> : null}
        {saveMsg ? <Alert tone="success">{saveMsg}</Alert> : null}
        {inviteUrl ? (
          <Alert tone="info">
            Invite link:{" "}
            <a href={inviteUrl} className="break-all font-semibold text-navy underline">
              {inviteUrl}
            </a>
            {" · "}
            <a
              href={`mailto:${c?.email || ""}?subject=${encodeURIComponent("Phoenix Cross Dock portal access")}&body=${encodeURIComponent(`Set your customer portal password here:\n${inviteUrl}\n\nThis link expires in 7 days.`)}`}
              className="font-semibold text-navy underline"
            >
              Open email
            </a>
          </Alert>
        ) : null}

        {c ? (
          <>
            <KpiGrid>
              <KpiCard label="Billing method" value={c.billingMethod} />
              <KpiCard
                label="QB push"
                value={c.testAccount ? "Test — WMS only" : "Live → QuickBooks"}
              />
              <KpiCard
                label="Contract monthly fee"
                value={c.billingMethod === "contract" ? money(c.contractFee) : "—"}
              />
              <KpiCard
                label="Reserved square feet"
                value={
                  c.contractSqft != null && c.contractSqft > 0
                    ? `${c.contractSqft.toLocaleString()} SF`
                    : "—"
                }
              />
              <KpiCard
                label="Handling rate / pallet"
                value={
                  c.contractHandlingPerPallet != null ? money(c.contractHandlingPerPallet) : "—"
                }
              />
              <KpiCard
                label="FTL rate"
                value={c.contractFtlRate != null ? money(c.contractFtlRate) : "—"}
              />
              <KpiCard label="Active pallets" value={data?.summary.activePallets} />
              <KpiCard
                label="Unbilled charges"
                value={money(data?.summary.unbilledTotal)}
                hint={`${data?.summary.unbilledCount ?? 0} lines`}
              />
              <KpiCard label="Open requests" value={data?.summary.openRequests} />
            </KpiGrid>

            <Card className="mb-5">
              <CardBody>
                <CardTitle>Account</CardTitle>
                <div className="mt-2 grid gap-2 text-sm text-muted sm:grid-cols-2">
                  <div>
                    <span className="font-semibold text-text">Address: </span>
                    {c.address || "—"}
                  </div>
                  <div>
                    <span className="font-semibold text-text">Phone: </span>
                    {c.phone || "—"}
                  </div>
                  <div>
                    <span className="font-semibold text-text">No dwell in dedicated SF: </span>
                    {c.contractNoDwellInside ? "Yes (per contract)" : "—"}
                  </div>
                  <div>
                    <span className="font-semibold text-text">Portal: </span>
                    {c.portalActivated
                      ? "Onboarded (active login)"
                      : data?.portal?.invitePending
                        ? "Invite sent — waiting for password"
                        : "Not onboarded"}
                  </div>
                </div>
              </CardBody>
            </Card>

            <Modal
              open={Boolean(editing && form)}
              onClose={() => {
                if (!saveBusy) cancelEdit();
              }}
              title="Edit billing & account"
              description="Admin — billing method, test/live QB push, rates, and contact."
              size="xl"
              footer={
                <div className="flex flex-wrap justify-end gap-2">
                  <Button type="button" variant="secondary" onClick={cancelEdit} disabled={saveBusy}>
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    form="customer-edit-account"
                    loading={saveBusy}
                    icon={<Save className="h-4 w-4" />}
                  >
                    Save changes
                  </Button>
                </div>
              }
            >
              {form ? (
                <form id="customer-edit-account" onSubmit={saveEdit} className="space-y-4">
                  <FormGrid cols={3}>
                    <Field label="Billing method">
                      <Select
                        value={form.billingMethod}
                        onChange={(e) => setForm({ ...form, billingMethod: e.target.value })}
                      >
                        <option value="pallet">Pallet</option>
                        <option value="sqft">Square feet</option>
                        <option value="contract">Contract</option>
                        <option value="crossdock">Crossdock</option>
                      </Select>
                    </Field>
                    <Field
                      label="Test account"
                      hint="Skip QuickBooks push — use for audit / throwaway customers"
                    >
                      <Select
                        value={form.testAccount ? "yes" : "no"}
                        onChange={(e) =>
                          setForm({ ...form, testAccount: e.target.value === "yes" })
                        }
                      >
                        <option value="no">No — push to QuickBooks</option>
                        <option value="yes">Yes — WMS only</option>
                      </Select>
                    </Field>
                    <Field label="Contract monthly fee">
                      <NumberInput
                        value={form.contractFee}
                        onValueChange={(v) => setForm({ ...form, contractFee: v })}
                      />
                    </Field>
                    <Field label="Contract SF">
                      <NumberInput
                        decimal={false}
                        value={form.contractSqft}
                        onValueChange={(v) => setForm({ ...form, contractSqft: v })}
                      />
                    </Field>
                    <Field label="Handling / pallet" hint="Flat inbound+outbound handling">
                      <NumberInput
                        value={form.contractHandlingPerPallet}
                        onValueChange={(v) =>
                          setForm({ ...form, contractHandlingPerPallet: v })
                        }
                      />
                    </Field>
                    <Field label="FTL rate" hint="Flat rate in lieu of per-pallet handling">
                      <NumberInput
                        value={form.contractFtlRate}
                        onValueChange={(v) => setForm({ ...form, contractFtlRate: v })}
                      />
                    </Field>
                    <Field label="Rate inside (/pallet/mo)">
                      <NumberInput
                        value={form.rateInside}
                        onValueChange={(v) => setForm({ ...form, rateInside: v })}
                      />
                    </Field>
                    <Field label="Rate outside (/pallet/mo)">
                      <NumberInput
                        value={form.rateOutside}
                        onValueChange={(v) => setForm({ ...form, rateOutside: v })}
                      />
                    </Field>
                    <Field label="Unload fee">
                      <NumberInput
                        value={form.unloadFee}
                        onValueChange={(v) => setForm({ ...form, unloadFee: v })}
                      />
                    </Field>
                    <Field label="Load fee">
                      <NumberInput
                        value={form.loadFee}
                        onValueChange={(v) => setForm({ ...form, loadFee: v })}
                      />
                    </Field>
                  </FormGrid>
                  <FormGrid cols={2}>
                    <Field label="Contact name">
                      <Input
                        value={form.contact}
                        onChange={(e) => setForm({ ...form, contact: e.target.value })}
                      />
                    </Field>
                    <Field label="Phone">
                      <Input
                        value={form.phone}
                        onChange={(e) => setForm({ ...form, phone: e.target.value })}
                      />
                    </Field>
                    <Field label="Email">
                      <Input
                        type="email"
                        value={form.email}
                        onChange={(e) => setForm({ ...form, email: e.target.value })}
                      />
                    </Field>
                    <Field label="Address">
                      <AddressAutocomplete
                        value={form.address}
                        onChange={(address) => setForm({ ...form, address })}
                      />
                    </Field>
                  </FormGrid>
                </form>
              ) : null}
            </Modal>

            <div className="mb-5">
              <PageHeader title="Pallets" />
              <DataTable
                columns={palletCols}
                rows={data?.pallets ?? []}
                rowKey={(p) => p._id}
                emptyTitle="No pallets for this customer"
              />
            </div>

            <div className="mb-5">
              <PageHeader title="Unbilled charges" />
              <DataTable
                columns={chargeCols}
                rows={data?.unbilledCharges ?? []}
                rowKey={(x) => x._id}
                emptyTitle="No open charges"
              />
            </div>

            <div className="mb-5">
              <PageHeader title="Requests" />
              <DataTable
                columns={reqCols}
                rows={data?.requests ?? []}
                rowKey={(r) => r._id}
                emptyTitle="No requests"
              />
            </div>

            <div className="mb-5">
              <PageHeader
                title="Invoices"
                description="Same register as Billing — invoice total is billed; balance due is still owed"
              />
              <DataTable
                columns={[
                  {
                    key: "number",
                    header: "Invoice #",
                    render: (inv: Invoice) => (
                      <span className="font-semibold">{inv.number}</span>
                    ),
                  },
                  {
                    key: "period",
                    header: "Invoice date",
                    render: (inv: Invoice) => dateLabel(inv.periodStart),
                  },
                  {
                    key: "status",
                    header: "Status",
                    render: (inv: Invoice) => (
                      <Badge tone={statusTone(inv.status)}>{statusLabel(inv.status)}</Badge>
                    ),
                  },
                  {
                    key: "total",
                    header: "Invoice total",
                    render: (inv: Invoice) => (
                      <span className="tabular-nums" title="Full amount billed">
                        {money(inv.total)}
                      </span>
                    ),
                  },
                  {
                    key: "balanceDue",
                    header: "Balance due",
                    render: (inv: Invoice) => {
                      const due =
                        inv.balanceDue != null && !Number.isNaN(Number(inv.balanceDue))
                          ? Number(inv.balanceDue)
                          : Number(inv.total) || 0;
                      return (
                        <span
                          className="tabular-nums font-semibold text-navy"
                          title="Amount still owed after payments"
                        >
                          {money(due)}
                        </span>
                      );
                    },
                  },
                ]}
                rows={invoices}
                rowKey={(inv) => inv._id}
                loading={invLoading}
                emptyTitle="No invoices for this customer"
                emptyDescription="Invoices appear here after QuickBooks sync (same list as Billing)."
                pagination={paginationFrom(invData)}
                onPageChange={setInvPage}
              />
            </div>
          </>
        ) : null}

      {showReport && c ? (
        <BillingReportModal customer={c} onClose={() => setShowReport(false)} />
      ) : null}
    </>
  );
}
