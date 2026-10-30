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
  ChipGroup,
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
import { downloadCsv } from "@/lib/csv";
import type { Customer, Invoice, Pallet, WhRequest } from "@/types";

type Charge = { _id: string; description: string; amount: number; type: string; date: string };

type PortalAccess = {
  email: string;
  name?: string;
  active?: boolean;
  invitePending: boolean;
  inviteSentAt?: string | null;
  inviteExpiresAt?: string | null;
};

type DetailResponse = {
  customer: Customer;
  portalUsers?: PortalAccess[];
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
    unpaidTotal?: number;
    unpaidCount?: number;
    pastDueTotal?: number;
    pastDueCount?: number;
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
  crossdockPerPallet: string;
  serviceDropStore: boolean;
  serviceCrossdock: boolean;
  serviceRework: boolean;
  reworkHourlyRate: string;
  reworkMinimumHours: string;
  parcelStoragePerBoxDay: string;
  parcelReceivePerBox: string;
  parcelOutboundPerBox: string;
  parcelOversizePerPalletDay: string;
  address: string;
  contact: string;
  phone: string;
  email: string;
};

function formFromCustomer(c: Customer): EditForm {
  return {
    billingMethod:
      c.billingMethod === "rework"
        ? "rework"
        : c.billingMethod === "crossdock"
          ? "crossdock"
          : c.billingMethod === "contract" || c.billingMethod === "sqft"
            ? "contract"
            : "crossdock",
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
    crossdockPerPallet: c.crossdockPerPallet != null ? String(c.crossdockPerPallet) : "",
    serviceDropStore: c.serviceDropStore !== false,
    serviceCrossdock: c.serviceCrossdock !== false,
    serviceRework: c.serviceRework !== false,
    reworkHourlyRate: c.reworkHourlyRate != null ? String(c.reworkHourlyRate) : "",
    reworkMinimumHours: c.reworkMinimumHours != null ? String(c.reworkMinimumHours) : "",
    parcelStoragePerBoxDay: c.parcelStoragePerBoxDay != null ? String(c.parcelStoragePerBoxDay) : "",
    parcelReceivePerBox: c.parcelReceivePerBox != null ? String(c.parcelReceivePerBox) : "",
    parcelOutboundPerBox: c.parcelOutboundPerBox != null ? String(c.parcelOutboundPerBox) : "",
    parcelOversizePerPalletDay:
      c.parcelOversizePerPalletDay != null ? String(c.parcelOversizePerPalletDay) : "",
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
  const [palletSearch, setPalletSearch] = useState("");
  const [palletStatus, setPalletStatus] = useState<
    "all" | "staged_for_store" | "stored" | "staged" | "staged_for_shipping" | "shipped" | "void"
  >("all");

  const c = data?.customer;
  const invoices = invData?.invoices ?? [];
  const [inviteBusyEmail, setInviteBusyEmail] = useState("");
  const [inviteMsg, setInviteMsg] = useState("");
  const [inviteErr, setInviteErr] = useState("");
  const [inviteUrl, setInviteUrl] = useState("");
  const [newContact, setNewContact] = useState({ name: "", email: "", phone: "", primary: false });
  const [contactBusy, setContactBusy] = useState(false);

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
        serviceDropStore: form.serviceDropStore,
        serviceCrossdock: form.serviceCrossdock,
        serviceRework: form.serviceRework,
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
        payload.rateInside = numOrNull(form.rateInside);
        payload.rateOutside = numOrNull(form.rateOutside);
        payload.unloadFee = numOrNull(form.unloadFee);
        payload.loadFee = numOrNull(form.loadFee);
        payload.crossdockPerPallet = numOrNull(form.crossdockPerPallet);
        payload.reworkHourlyRate = numOrNull(form.reworkHourlyRate);
        payload.reworkMinimumHours = numOrNull(form.reworkMinimumHours);
        payload.parcelStoragePerBoxDay = numOrNull(form.parcelStoragePerBoxDay);
        payload.parcelReceivePerBox = numOrNull(form.parcelReceivePerBox);
        payload.parcelOutboundPerBox = numOrNull(form.parcelOutboundPerBox);
        payload.parcelOversizePerPalletDay = numOrNull(form.parcelOversizePerPalletDay);
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

  async function addContact() {
    if (!token || !c) return;
    const email = newContact.email.trim().toLowerCase();
    if (!email.includes("@")) {
      setInviteErr("Enter a valid email for this contact");
      return;
    }
    const existing = c.contacts || [];
    if (existing.some((row) => row.email.trim().toLowerCase() === email)) {
      setInviteErr("That email is already a contact on this account");
      return;
    }
    setContactBusy(true);
    setInviteErr("");
    setInviteMsg("");
    try {
      await api(`/customers/${c._id}`, {
        method: "PATCH",
        token,
        body: JSON.stringify({
          contacts: [
            ...existing.map((row) => ({ ...row, primary: newContact.primary ? false : Boolean(row.primary) })),
            {
              name: newContact.name.trim(),
              email,
              phone: newContact.phone.trim(),
              primary: newContact.primary,
            },
          ],
        }),
      });
      setNewContact({ name: "", email: "", phone: "", primary: false });
      setInviteMsg("Contact added. Use Invite when they should have portal access.");
      invalidateApiCache(`/customers/${c._id}`);
      await reload();
    } catch (ex) {
      setInviteErr(ex instanceof Error ? ex.message : "Could not add contact");
    } finally {
      setContactBusy(false);
    }
  }

  async function setPrimaryContact(email: string) {
    if (!token || !c || !email) return;
    setContactBusy(true);
    setInviteErr("");
    setInviteMsg("");
    try {
      await api(`/customers/${c._id}`, {
        method: "PATCH",
        token,
        body: JSON.stringify({
          contacts: (c.contacts || []).map((row) => ({
            ...row,
            primary: row.email.trim().toLowerCase() === email.trim().toLowerCase(),
          })),
        }),
      });
      setInviteMsg("Primary contact updated. QuickBooks invoices use this email.");
      invalidateApiCache(`/customers/${c._id}`);
      await reload();
    } catch (ex) {
      setInviteErr(ex instanceof Error ? ex.message : "Could not set the primary contact");
    } finally {
      setContactBusy(false);
    }
  }

  async function sendPortalInvite(contact: { name: string; email: string }) {
    if (!token || !c || !contact.email) return;
    setInviteBusyEmail(contact.email);
    setInviteErr("");
    setInviteMsg("");
    setInviteUrl("");
    try {
      const result = await api<{ inviteUrl: string; email: string; message?: string }>(
        `/customers/${c._id}/invite`,
        {
          method: "POST",
          token,
          body: JSON.stringify({ email: contact.email, name: contact.name || c.name }),
        }
      );
      setInviteMsg(
        result.message ||
          `Invite emailed to ${result.email}. They appear in Customers after setting a password.`
      );
      invalidateApiCache(`/customers/${c._id}`);
      await reload();
    } catch (ex) {
      setInviteErr(ex instanceof Error ? ex.message : "Invite failed");
    } finally {
      setInviteBusyEmail("");
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
    { key: "desc", header: "Description", render: (p) => p.description || "—" },
    { key: "job", header: "Job", render: (p) => p.jobName || "—" },
    { key: "po", header: "PO", render: (p) => p.poNumber || "—" },
    { key: "recv", header: "Received", render: (p) => dateLabel(p.receivedAt) },
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
              <KpiCard
                label="Active pallets"
                value={data?.summary.activePallets}
                onClick={() =>
                  document.getElementById("customer-pallets")?.scrollIntoView({ behavior: "smooth" })
                }
              />
              <KpiCard
                label="Unpaid"
                value={money(data?.summary.unpaidTotal ?? 0)}
                hint={`${data?.summary.unpaidCount ?? 0} invoices · open in Billing`}
                onClick={() => {
                  sessionStorage.setItem(
                    "phoenix.billingFocus",
                    JSON.stringify({ customerId: c._id, focus: "unpaid" })
                  );
                  navigate("/billing");
                }}
              />
              <KpiCard
                label="Past due"
                value={money(data?.summary.pastDueTotal ?? 0)}
                hint={`${data?.summary.pastDueCount ?? 0} invoices · open in Billing`}
                onClick={() => {
                  sessionStorage.setItem(
                    "phoenix.billingFocus",
                    JSON.stringify({ customerId: c._id, focus: "past_due" })
                  );
                  navigate("/billing");
                }}
              />
              <KpiCard
                label="Open requests"
                value={data?.summary.openRequests}
                onClick={() =>
                  document.getElementById("customer-requests")?.scrollIntoView({ behavior: "smooth" })
                }
              />
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

            {isStaff ? (
              <Card className="mb-5" id="customer-contacts">
                <CardBody>
                  <CardTitle>Portal contacts</CardTitle>
                  <p className="mt-1 mb-3 text-xs text-muted">
                    Each email gets its own Invite button and its own portal login. Check Primary on the one email QuickBooks should use for invoices.
                  </p>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[640px] border-collapse text-left text-sm">
                      <thead>
                        <tr className="border-b border-border text-[10px] font-semibold tracking-wide text-muted uppercase">
                          <th className="py-2 pr-3">Primary</th>
                          <th className="py-2 pr-3">Name</th>
                          <th className="py-2 pr-3">Email</th>
                          <th className="py-2 pr-3">Phone</th>
                          <th className="py-2 pr-3">Portal</th>
                          <th className="py-2 text-right">Invite</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(c.contacts || []).map((contact) => {
                          const access = (data?.portalUsers || []).find(
                            (row) => row.email.toLowerCase() === contact.email.toLowerCase()
                          );
                          const portalLabel = !contact.email
                            ? "No email"
                            : access?.invitePending || contact.invitedAt
                              ? access && !access.invitePending
                                ? "Has access"
                                : "Invite sent"
                              : access
                                ? "Has access"
                                : "Not invited";
                          return (
                            <tr key={contact.email || contact.phone} className="border-b border-border/60">
                              <td className="py-2 pr-3">
                                <input
                                  type="checkbox"
                                  checked={Boolean(contact.primary)}
                                  disabled={!contact.email || contactBusy}
                                  aria-label={`Primary invoice email ${contact.email}`}
                                  onChange={() => void setPrimaryContact(contact.email)}
                                />
                              </td>
                              <td className="py-2 pr-3">{contact.name || "—"}</td>
                              <td className="py-2 pr-3">{contact.email || "—"}</td>
                              <td className="py-2 pr-3">{contact.phone || "—"}</td>
                              <td className="py-2 pr-3">
                                <Badge tone={access && !access.invitePending ? "success" : "neutral"}>
                                  {portalLabel}
                                </Badge>
                              </td>
                              <td className="py-2 text-right">
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="secondary"
                                  icon={<Mail className="h-3.5 w-3.5" />}
                                  disabled={!contact.email}
                                  loading={inviteBusyEmail === contact.email}
                                  onClick={() => void sendPortalInvite(contact)}
                                >
                                  {access ? "Invite again" : "Invite"}
                                </Button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <FormGrid cols={3} className="mt-4">
                    <Field label="Name">
                      <Input
                        value={newContact.name}
                        onChange={(e) => setNewContact({ ...newContact, name: e.target.value })}
                      />
                    </Field>
                    <Field label="Email">
                      <Input
                        type="email"
                        value={newContact.email}
                        onChange={(e) => setNewContact({ ...newContact, email: e.target.value })}
                      />
                    </Field>
                    <Field label="Phone">
                      <Input
                        value={newContact.phone}
                        onChange={(e) => setNewContact({ ...newContact, phone: e.target.value })}
                      />
                    </Field>
                  </FormGrid>
                  <label className="mt-3 flex items-center gap-2 text-sm text-navy">
                    <input
                      type="checkbox"
                      checked={newContact.primary}
                      onChange={(e) => setNewContact({ ...newContact, primary: e.target.checked })}
                    />
                    Primary — QuickBooks invoices go to this email
                  </label>
                  <div className="mt-3">
                    <Button type="button" loading={contactBusy} onClick={() => void addContact()}>
                      Add contact
                    </Button>
                  </div>
                </CardBody>
              </Card>
            ) : null}

            <Modal
              open={Boolean(editing && form)}
              onClose={() => {
                if (!saveBusy) cancelEdit();
              }}
              title="Edit billing & account"
              description="Every customer can use Contract, Crossdock, and Rework. Contract bills on the 1st (Net 30). Crossdock and Rework bill when the job ends. Square feet is part of the contract."
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
                    <Field
                      label="Account type"
                      hint="Contract, Crossdock, or Rework. A contract customer can still run a one-off crossdock."
                    >
                      <Select
                        value={form.billingMethod}
                        onChange={(e) => setForm({ ...form, billingMethod: e.target.value })}
                      >
                        <option value="contract">Contract — monthly on the 1st, Net 30</option>
                        <option value="crossdock">Crossdock — billed when the job ends</option>
                        <option value="rework">Rework — billed when the job ends</option>
                      </Select>
                    </Field>
                    <Field label="Services" hint="Any mix. These do not replace each other.">
                      <div className="flex flex-col gap-1.5 pt-1 text-sm text-navy">
                        <label className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={form.serviceDropStore}
                            onChange={(e) =>
                              setForm({ ...form, serviceDropStore: e.target.checked })
                            }
                          />
                          Drop & Store
                        </label>
                        <label className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={form.serviceCrossdock}
                            onChange={(e) =>
                              setForm({ ...form, serviceCrossdock: e.target.checked })
                            }
                          />
                          Crossdock
                        </label>
                        <label className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={form.serviceRework}
                            onChange={(e) => setForm({ ...form, serviceRework: e.target.checked })}
                          />
                          Rework
                        </label>
                      </div>
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
                  </FormGrid>

                  <div className="rounded-[var(--radius)] border border-border bg-surface-2/40 p-3.5">
                    <p className="m-0 mb-3 text-[11px] font-bold tracking-wide text-navy uppercase">
                      Contract (monthly · 1st · Net 30)
                    </p>
                    <FormGrid cols={3}>
                      <Field label="Monthly fee">
                        <NumberInput
                          value={form.contractFee}
                          onValueChange={(v) => setForm({ ...form, contractFee: v })}
                        />
                      </Field>
                      <Field label="Reserved SF">
                        <NumberInput
                          decimal={false}
                          value={form.contractSqft}
                          onValueChange={(v) => setForm({ ...form, contractSqft: v })}
                        />
                      </Field>
                      <Field label="Handling / pallet" hint="Contract IN+OUT flat">
                        <NumberInput
                          value={form.contractHandlingPerPallet}
                          onValueChange={(v) =>
                            setForm({ ...form, contractHandlingPerPallet: v })
                          }
                        />
                      </Field>
                      <Field label="FTL rate" hint="Flat in lieu of per-pallet">
                        <NumberInput
                          value={form.contractFtlRate}
                          onValueChange={(v) => setForm({ ...form, contractFtlRate: v })}
                        />
                      </Field>
                    </FormGrid>
                  </div>

                  <div className="rounded-[var(--radius)] border border-border bg-surface-2/40 p-3.5">
                    <p className="m-0 mb-1 text-[11px] font-bold tracking-wide text-navy uppercase">
                      What we charge this customer
                    </p>
                    <p className="m-0 mb-3 text-xs text-muted">
                      Contract: monthly fee, reserved square feet, handling, and FTL are above.
                      Crossdock and Rework below. Leave a rate blank to use the company fee schedule.
                    </p>
                    <FormGrid cols={3}>
                      <Field label="Unload / pallet">
                        <NumberInput
                          value={form.unloadFee}
                          onValueChange={(v) => setForm({ ...form, unloadFee: v })}
                          placeholder="Schedule"
                        />
                      </Field>
                      <Field label="Load / pallet">
                        <NumberInput
                          value={form.loadFee}
                          onValueChange={(v) => setForm({ ...form, loadFee: v })}
                          placeholder="Schedule"
                        />
                      </Field>
                      <Field label="Crossdock / pallet">
                        <NumberInput
                          value={form.crossdockPerPallet}
                          onValueChange={(v) => setForm({ ...form, crossdockPerPallet: v })}
                          placeholder="Schedule"
                        />
                      </Field>
                      <Field label="Rework $/hr" hint="Blank uses $65/hr on the fee schedule">
                        <NumberInput
                          value={form.reworkHourlyRate}
                          onValueChange={(v) => setForm({ ...form, reworkHourlyRate: v })}
                          placeholder="Schedule"
                        />
                      </Field>
                      <Field label="Rework minimum hours">
                        <NumberInput
                          value={form.reworkMinimumHours}
                          onValueChange={(v) => setForm({ ...form, reworkMinimumHours: v })}
                          placeholder="1"
                        />
                      </Field>
                      <Field label="Storage inside (/pallet/mo)">
                        <NumberInput
                          value={form.rateInside}
                          onValueChange={(v) => setForm({ ...form, rateInside: v })}
                          placeholder="Schedule"
                        />
                      </Field>
                      <Field label="Storage outside (/pallet/mo)">
                        <NumberInput
                          value={form.rateOutside}
                          onValueChange={(v) => setForm({ ...form, rateOutside: v })}
                          placeholder="Schedule"
                        />
                      </Field>
                      <Field label="Parcel storage (/box/day)" hint="Blank uses $0.05 on the fee schedule">
                        <NumberInput
                          value={form.parcelStoragePerBoxDay}
                          onValueChange={(v) => setForm({ ...form, parcelStoragePerBoxDay: v })}
                          placeholder="Schedule"
                        />
                      </Field>
                      <Field label="Parcel receiving (/box)">
                        <NumberInput
                          value={form.parcelReceivePerBox}
                          onValueChange={(v) => setForm({ ...form, parcelReceivePerBox: v })}
                          placeholder="Schedule"
                        />
                      </Field>
                      <Field label="Parcel outbound (/box)">
                        <NumberInput
                          value={form.parcelOutboundPerBox}
                          onValueChange={(v) => setForm({ ...form, parcelOutboundPerBox: v })}
                          placeholder="Schedule"
                        />
                      </Field>
                      <Field label="Oversize parcel (/pallet/day)">
                        <NumberInput
                          value={form.parcelOversizePerPalletDay}
                          onValueChange={(v) => setForm({ ...form, parcelOversizePerPalletDay: v })}
                          placeholder="Schedule"
                        />
                      </Field>
                    </FormGrid>
                  </div>
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
                    <Field label="Billing email" hint="QuickBooks invoices use this address only.">
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

            <div className="mb-5" id="customer-pallets">
              <PageHeader
                title="Pallets"
                actions={
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      const rows = (data?.pallets ?? []).filter((p) => {
                        if (palletStatus !== "all" && p.status !== palletStatus) return false;
                        const q = palletSearch.trim().toLowerCase();
                        if (!q) return true;
                        return [p.externalId, p.description, p.jobName, p.poNumber, p.status]
                          .join(" ")
                          .toLowerCase()
                          .includes(q);
                      });
                      downloadCsv(
                        "customer-pallets.csv",
                        ["Pallet", "Status", "Description", "Job", "PO", "Received"],
                        rows.map((p) => [
                          p.externalId,
                          p.status,
                          p.description || "",
                          p.jobName || "",
                          p.poNumber || "",
                          p.receivedAt || "",
                        ])
                      );
                    }}
                  >
                    Export CSV
                  </Button>
                }
              />
              <div className="mb-3 flex flex-col gap-3">
                <ChipGroup
                  label="Status"
                  size="sm"
                  options={(
                    ["all", "staged_for_store", "stored", "staged", "staged_for_shipping", "shipped", "void"] as const
                  ).map((f) => ({
                    id: f,
                    label: f === "all" ? "All" : statusLabel(f),
                  }))}
                  value={palletStatus}
                  onChange={setPalletStatus}
                />
                <div className="max-w-sm">
                  <Input
                    type="search"
                    value={palletSearch}
                    onChange={(e) => setPalletSearch(e.target.value)}
                    placeholder="Search pallet, job, PO, description…"
                  />
                </div>
              </div>
              <DataTable
                columns={palletCols}
                rows={(data?.pallets ?? []).filter((p) => {
                  if (palletStatus !== "all" && p.status !== palletStatus) return false;
                  const q = palletSearch.trim().toLowerCase();
                  if (!q) return true;
                  return [p.externalId, p.description, p.jobName, p.poNumber, p.status]
                    .join(" ")
                    .toLowerCase()
                    .includes(q);
                })}
                rowKey={(p) => p._id}
                emptyTitle="No pallets for this customer"
              />
            </div>

            <div className="mb-5" id="customer-requests">
              <PageHeader title="Requests" />
              <DataTable
                columns={reqCols}
                rows={data?.requests ?? []}
                rowKey={(r) => r._id}
                emptyTitle="No requests"
              />
            </div>

            <div className="mb-5" id="customer-invoices">
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
