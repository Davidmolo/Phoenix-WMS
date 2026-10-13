"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FileText, Link2, Mail, Pencil, Printer, RefreshCw, Search, Unlink, X } from "lucide-react";
import { BillingReportModal } from "@/components/BillingReportModal";
import { InvoiceRegisterPrintModal } from "@/components/InvoiceRegisterPrintModal";
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
  NumberInput,
  PageHeader,
  SearchableSelect,
  Select,
  statusLabel,
  statusTone,
  type Column,
} from "@/components/ui";
import { useApiQuery, invalidateApiCache } from "@/hooks/useApiQuery";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { dateLabel, money } from "@/lib/format";
import { listQuery, paginationFrom, type PaginationMeta } from "@/lib/pagination";
import type { Customer, Invoice } from "@/types";

type QbStatus = {
  configured: boolean;
  environment: string;
  connected: boolean;
  realmId: string | null;
  connectedByEmail: string | null;
  lastSyncAt: string | null;
  lastSyncSummary: string;
  redirectUri: string;
  autoSyncEnabled?: boolean;
  autoSyncCron?: string;
};

type InvoiceRow = Invoice & {
  quickbooksId?: string | null;
  customerId?: string | { _id: string; name?: string; billingMethod?: string };
};

function customerName(inv: InvoiceRow) {
  if (inv.customerId && typeof inv.customerId === "object") {
    return inv.customerId.name || "—";
  }
  return "—";
}

/** Amount still owed — prefer QuickBooks Balance when synced. */
function balanceDueOf(inv: InvoiceRow): number {
  if (inv.balanceDue != null && !Number.isNaN(Number(inv.balanceDue))) {
    return Number(inv.balanceDue);
  }
  return Number(inv.total) || 0;
}

function paidSoFar(inv: InvoiceRow): number | null {
  if (inv.balanceDue == null) return null;
  const paid = Number(inv.total) - Number(inv.balanceDue);
  if (Number.isNaN(paid) || paid <= 0) return null;
  return paid;
}

export default function BillingPage() {
  const { user, token } = useAuth();
  const isStaff = user?.role !== "customer";
  const isAdmin = user?.role === "admin";
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [showRegisterPrint, setShowRegisterPrint] = useState(false);
  const [showCustomerReport, setShowCustomerReport] = useState(false);
  const [qbMsg, setQbMsg] = useState("");
  const [qbErr, setQbErr] = useState("");
  const [qbBusy, setQbBusy] = useState(false);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [sendMsg, setSendMsg] = useState("");
  const [sendErr, setSendErr] = useState("");
  const [editInv, setEditInv] = useState<InvoiceRow | null>(null);
  const [editStatus, setEditStatus] = useState("unpaid");
  const [editTotal, setEditTotal] = useState("");
  const [editBalance, setEditBalance] = useState("");
  const [editDue, setEditDue] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [editBusy, setEditBusy] = useState(false);
  const [editErr, setEditErr] = useState("");
  const [editMsg, setEditMsg] = useState("");
  const editPanelRef = useRef<HTMLDivElement>(null);

  const { data: qbStatus, reload: reloadQb } = useApiQuery<QbStatus>("/quickbooks/status", {
    enabled: isStaff,
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const qb = params.get("qb");
    if (!qb) return;
    if (qb === "connected") {
      setQbMsg("QuickBooks connected. Click Sync invoices to pull the register.");
      void reloadQb();
    } else if (qb === "error") {
      setQbErr(params.get("message") || "QuickBooks connection failed");
    }
    window.history.replaceState({}, "", "/billing");
  }, [reloadQb]);

  const { data: custData } = useApiQuery<{ customers: Customer[] }>("/customers?portal=all", {
    enabled: isStaff,
  });
  const customers = custData?.customers ?? [];
  const selectedCustomer = customers.find((c) => c._id === customerId);

  const query = useMemo(() => {
    return listQuery("/invoices", {
      page,
      params: {
        fromDate: fromDate || undefined,
        toDate: toDate || undefined,
        customerId: isStaff && customerId ? customerId : undefined,
        q: search.trim() || undefined,
      },
    });
  }, [fromDate, toDate, customerId, isStaff, page, search]);

  const { data, error, loading, reload } = useApiQuery<
    { invoices: InvoiceRow[] } & PaginationMeta
  >(query);
  const invoices = data?.invoices ?? [];

  async function connectQuickBooks() {
    setQbBusy(true);
    setQbErr("");
    setQbMsg("");
    try {
      const { url } = await api<{ url: string }>("/quickbooks/connect", { token });
      window.location.href = url;
    } catch (ex) {
      setQbErr(ex instanceof Error ? ex.message : "Could not start QuickBooks connect");
      setQbBusy(false);
    }
  }

  async function syncQuickBooks() {
    setQbBusy(true);
    setQbErr("");
    setQbMsg("");
    try {
      const result = await api<{ summary: string }>("/quickbooks/sync", {
        method: "POST",
        token,
      });
      setQbMsg(result.summary || "Sync complete");
      invalidateApiCache("/invoices");
      invalidateApiCache("/customers");
      void reload();
      void reloadQb();
    } catch (ex) {
      setQbErr(ex instanceof Error ? ex.message : "QuickBooks sync failed");
    } finally {
      setQbBusy(false);
    }
  }

  /** Cesar: WMS → QB one-way — retry any local invoices missing a QuickBooks Id. */
  async function pushPendingToQuickBooks() {
    setQbBusy(true);
    setQbErr("");
    setQbMsg("");
    try {
      const result = await api<{ attempted: number; pushed: number }>(
        "/quickbooks/push-pending",
        { method: "POST", token }
      );
      setQbMsg(
        `Pushed ${result.pushed} of ${result.attempted} pending invoice(s) to QuickBooks`
      );
      invalidateApiCache("/invoices");
      void reload();
      void reloadQb();
    } catch (ex) {
      setQbErr(ex instanceof Error ? ex.message : "Could not push invoices to QuickBooks");
    } finally {
      setQbBusy(false);
    }
  }

  const sendInvoice = useCallback(
    async (inv: InvoiceRow) => {
      if (!token) return;
      setSendingId(inv._id);
      setSendErr("");
      setSendMsg("");
      try {
        const result = await api<{ emailedTo: string; via?: string }>(`/invoices/${inv._id}/send`, {
          method: "POST",
          token,
        });
        setSendMsg(
          result.via === "quickbooks"
            ? `Invoice ${inv.number} emailed via QuickBooks to ${result.emailedTo} (Pay Now when enabled)`
            : `Invoice ${inv.number} emailed to ${result.emailedTo}`
        );
        invalidateApiCache("/invoices");
        void reload();
      } catch (ex) {
        setSendErr(ex instanceof Error ? ex.message : "Could not email invoice");
      } finally {
        setSendingId(null);
      }
    },
    [token, reload]
  );

  function openEdit(inv: InvoiceRow) {
    setEditInv(inv);
    setEditStatus(inv.status || "unpaid");
    setEditTotal(String(inv.total ?? ""));
    setEditBalance(inv.balanceDue != null ? String(inv.balanceDue) : String(inv.total ?? ""));
    setEditDue(inv.dueDate ? String(inv.dueDate).slice(0, 10) : "");
    setEditNotes(inv.notes || "");
    setEditErr("");
    setEditMsg("");
  }

  useEffect(() => {
    if (!editInv) return;
    editPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [editInv]);

  async function saveEdit(e: FormEvent) {
    e.preventDefault();
    if (!token || !editInv) return;
    setEditBusy(true);
    setEditErr("");
    setEditMsg("");
    try {
      const result = await api<{ invoice: InvoiceRow; hint?: string }>(`/invoices/${editInv._id}`, {
        method: "PATCH",
        token,
        body: JSON.stringify({
          status: editStatus,
          total: editTotal === "" ? undefined : Number(editTotal),
          balanceDue: editBalance === "" ? undefined : Number(editBalance),
          dueDate: editDue || null,
          notes: editNotes,
        }),
      });
      setEditMsg(result.hint || "Invoice updated");
      invalidateApiCache("/invoices");
      await reload();
      setEditInv(null);
      setSendMsg(`Updated ${result.invoice?.number || "invoice"}`);
    } catch (ex) {
      setEditErr(ex instanceof Error ? ex.message : "Could not update invoice");
    } finally {
      setEditBusy(false);
    }
  }

  async function disconnectQuickBooks() {
    if (!window.confirm("Disconnect QuickBooks from Phoenix WMS?")) return;
    setQbBusy(true);
    setQbErr("");
    try {
      await api("/quickbooks/disconnect", { method: "POST", token });
      setQbMsg("QuickBooks disconnected");
      void reloadQb();
    } catch (ex) {
      setQbErr(ex instanceof Error ? ex.message : "Disconnect failed");
    } finally {
      setQbBusy(false);
    }
  }

  const filterLabel = useMemo(() => {
    const parts: string[] = [];
    if (fromDate || toDate) parts.push(`${fromDate || "…"} → ${toDate || "…"}`);
    else parts.push("All dates");
    if (selectedCustomer) parts.push(selectedCustomer.name);
    else if (isStaff) parts.push("All customers");
    return parts.join(" · ");
  }, [fromDate, toDate, selectedCustomer, isStaff]);

  const pageTotals = useMemo(() => {
    let billed = 0;
    let owed = 0;
    for (const inv of invoices) {
      billed += Number(inv.total) || 0;
      owed += balanceDueOf(inv);
    }
    return { billed, owed };
  }, [invoices]);

  const columns: Column<InvoiceRow>[] = useMemo(() => {
    const cols: Column<InvoiceRow>[] = [
      {
        key: "number",
        header: "Invoice #",
        render: (inv) => (
          <span className="font-semibold">
            {inv.number}
            {isStaff && inv.quickbooksId ? (
              <span className="mt-0.5 block text-[10px] font-normal text-muted">From QuickBooks</span>
            ) : null}
          </span>
        ),
      },
    ];
    if (isStaff) {
      cols.push({
        key: "customer",
        header: "Customer",
        render: (inv) => customerName(inv),
      });
    }
    cols.push(
      {
        key: "period",
        header: "Invoice date",
        render: (inv) => dateLabel(inv.periodStart),
      },
      {
        key: "due",
        header: "Due date",
        render: (inv) => (inv.dueDate ? dateLabel(inv.dueDate) : "—"),
      },
      {
        key: "status",
        header: "Status",
        render: (inv) => (
          <Badge tone={statusTone(inv.status)}>{statusLabel(inv.status)}</Badge>
        ),
      },
      {
        key: "total",
        header: "Invoice total",
        render: (inv) => (
          <span className="tabular-nums" title="Full amount billed">
            {money(inv.total)}
          </span>
        ),
      },
      {
        key: "balanceDue",
        header: "Balance due",
        render: (inv) => {
          const due = balanceDueOf(inv);
          const paid = paidSoFar(inv);
          return (
            <span className="block tabular-nums" title="Amount still owed after payments">
              <span
                className={
                  due > 0
                    ? "font-semibold text-navy"
                    : "font-semibold text-[var(--success)]"
                }
              >
                {money(due)}
              </span>
              {paid != null ? (
                <span className="mt-0.5 block text-[10px] font-normal text-muted">
                  {money(paid)} already paid
                </span>
              ) : null}
            </span>
          );
        },
      }
    );
    if (isStaff) {
      cols.push({
        key: "actions",
        header: "Actions",
        render: (inv) => (
          <div className="flex flex-wrap gap-1.5">
            <Button
              type="button"
              size="sm"
              variant="secondary"
              icon={<Mail className="h-3.5 w-3.5" />}
              loading={sendingId === inv._id}
              onClick={(e) => {
                e.stopPropagation();
                void sendInvoice(inv);
              }}
            >
              Email Pay Now
            </Button>
            {isAdmin ? (
              <Button
                type="button"
                size="sm"
                variant="secondary"
                icon={<Pencil className="h-3.5 w-3.5" />}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  openEdit(inv);
                }}
              >
                Edit
              </Button>
            ) : null}
          </div>
        ),
      });
    }
    return cols;
  }, [isStaff, isAdmin, sendingId, sendInvoice]);

  function clearFilters() {
    setFromDate("");
    setToDate("");
    setCustomerId("");
    setSearch("");
    setPage(1);
    invalidateApiCache("/invoices");
    invalidateApiCache("/customers");
    void reload();
  }

  return (
    <>
      <PageHeader
        title={isStaff ? "Billing" : "My invoices"}
        icon={<FileText className="h-5 w-5" />}
        description={
          isStaff
            ? "WMS → QuickBooks → customer gets Pay Now email · Sync/webhook pulls paid status back"
            : "Pay via Pay Now in your QuickBooks invoice email, or Zelle with the invoice # in the memo"
        }
        actions={
          <div className="flex flex-wrap gap-2">
            {isStaff ? (
              <>
                {!qbStatus?.connected ? (
                  <Button
                    type="button"
                    size="sm"
                    icon={<Link2 className="h-3.5 w-3.5" />}
                    loading={qbBusy}
                    onClick={() => void connectQuickBooks()}
                  >
                    Connect QuickBooks
                  </Button>
                ) : (
                  <>
                    <Button
                      type="button"
                      size="sm"
                      icon={<RefreshCw className="h-3.5 w-3.5" />}
                      loading={qbBusy}
                      onClick={() => void syncQuickBooks()}
                    >
                      Sync from QB
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      loading={qbBusy}
                      onClick={() => void pushPendingToQuickBooks()}
                    >
                      Push pending to QB
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      icon={<Unlink className="h-3.5 w-3.5" />}
                      loading={qbBusy}
                      onClick={() => void disconnectQuickBooks()}
                    >
                      Disconnect
                    </Button>
                  </>
                )}
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  icon={<Printer className="h-3.5 w-3.5" />}
                  disabled={!selectedCustomer}
                  onClick={() => setShowCustomerReport(true)}
                >
                  Customer report
                </Button>
              </>
            ) : null}
            <Button
              type="button"
              size="sm"
              variant="secondary"
              icon={<Printer className="h-3.5 w-3.5" />}
              onClick={() => setShowRegisterPrint(true)}
            >
              Print / export list
            </Button>
          </div>
        }
      />

      {isStaff ? (
        <Alert tone="info" className="mb-4">
          QuickBooks:{" "}
          {!qbStatus?.configured
            ? "Server keys not configured yet."
            : qbStatus.connected
              ? `Connected (${qbStatus.environment})${
                  qbStatus.lastSyncSummary ? ` · ${qbStatus.lastSyncSummary}` : ""
                }.${
                  qbStatus.autoSyncEnabled
                    ? ` Auto-sync runs on a schedule (${qbStatus.autoSyncCron || "*/15 * * * *"}) — or click Sync invoices anytime.`
                    : " Auto-sync is off — use Sync invoices to refresh."
                }`
              : `Not connected · Development/sandbox. After you connect, invoices sync automatically and you can Sync invoices anytime.`}
        </Alert>
      ) : null}
      {qbMsg ? (
        <Alert tone="success" className="mb-4">
          {qbMsg}
        </Alert>
      ) : null}
      {qbErr ? (
        <Alert tone="danger" className="mb-4">
          {qbErr}
        </Alert>
      ) : null}
      {sendMsg ? (
        <Alert tone="success" className="mb-4">
          {sendMsg}
        </Alert>
      ) : null}
      {sendErr ? (
        <Alert tone="danger" className="mb-4">
          {sendErr}
        </Alert>
      ) : null}

      {!isStaff ? (
        <Card className="mb-5">
          <CardBody>
            <h2 className="font-display m-0 text-[13px] font-semibold tracking-[0.04em] text-navy uppercase">
              How to pay
            </h2>
            <p className="mt-2 mb-0 text-sm leading-relaxed text-muted">
              <strong className="text-navy">1. QuickBooks Pay Now</strong> — open the invoice email
              from QuickBooks and use <strong>Pay Now</strong> for card or ACH when available.{" "}
              <strong className="text-navy">2. Zelle</strong> — pay the Phoenix Cross Dock business
              account listed in your email/welcome packet and put the <strong>invoice number</strong>{" "}
              in the memo so we can match it. Balance due below updates after QuickBooks records the
              payment.
            </p>
          </CardBody>
        </Card>
      ) : (
        <Alert tone="info" className="mb-4">
          <strong>Pay path (Cesar):</strong> Email uses QuickBooks so the customer gets{" "}
          <strong>Pay Now</strong>. Payments land in QB; Sync / webhook refresh balance due here.
          Test customers stay WMS-only (SMTP + Zelle). Admin <strong>Edit</strong> overrides status
          when someone needs to pay now.
        </Alert>
      )}

      <Alert tone="info" className="mb-4">
        <strong>Invoice total</strong> is the full amount billed.{" "}
        <strong>Balance due</strong> is what is still owed after any payments recorded in
        QuickBooks. Example: billed $750, $300 paid → balance due $450.
      </Alert>

      <Card className="mb-5">
        <CardBody>
          <FormGrid cols={isStaff ? 4 : 3}>
            <Field label="From" htmlFor="billing-from" hint="Leave blank for all dates.">
              <Input
                id="billing-from"
                type="date"
                value={fromDate}
                onChange={(e) => {
                  setFromDate(e.target.value);
                  setPage(1);
                }}
              />
            </Field>
            <Field label="To" htmlFor="billing-to" hint="Leave blank for all dates.">
              <Input
                id="billing-to"
                type="date"
                value={toDate}
                onChange={(e) => {
                  setToDate(e.target.value);
                  setPage(1);
                }}
              />
            </Field>
            {isStaff ? (
              <Field label="Customer" htmlFor="billing-customer" hint="Optional filter.">
                <SearchableSelect
                  id="billing-customer"
                  value={customerId}
                  onChange={(id) => {
                    setCustomerId(id);
                    setPage(1);
                  }}
                  options={customers.map((c) => ({
                    value: c._id,
                    label: c.name,
                    keywords: c.email,
                  }))}
                  allowEmpty
                  emptyOptionLabel="All customers"
                  placeholder="Search customer…"
                  searchPlaceholder="Search by name or email…"
                />
              </Field>
            ) : null}
            <Field label="Search" htmlFor="billing-search" hint="Invoice #, company, or status.">
              <Input
                id="billing-search"
                type="search"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                placeholder="Search invoices…"
                icon={<Search className="h-3.5 w-3.5" />}
              />
            </Field>
          </FormGrid>
          {(fromDate || toDate || customerId || search.trim()) && (
            <div className="mt-3">
              <Button type="button" size="sm" variant="ghost" onClick={clearFilters}>
                Clear filters (show all)
              </Button>
            </div>
          )}
          {invoices.length > 0 ? (
            <p className="m-0 mt-3 text-xs text-muted">
              This page: {money(pageTotals.billed)} billed · {money(pageTotals.owed)} still owed
            </p>
          ) : null}
        </CardBody>
      </Card>

      <Alert>{error}</Alert>

      {editInv && isAdmin ? (
        <div ref={editPanelRef} className="mb-4 scroll-mt-4">
          <Card>
            <CardBody>
              <div className="mb-3 flex items-start justify-between gap-2">
                <CardTitle>Edit invoice {editInv.number} (admin)</CardTitle>
                <button
                  type="button"
                  className="rounded-lg border border-border p-1.5 text-muted hover:bg-surface-2"
                  onClick={() => setEditInv(null)}
                  aria-label="Close"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <p className="mb-3 text-xs text-muted">
                Cesar override — change status/amount when a customer needs to pay now. WMS updates
                immediately; sync or edit QuickBooks if the books still show the old figure.
              </p>
              <Alert>{editErr}</Alert>
              {editMsg ? <Alert tone="success">{editMsg}</Alert> : null}
              <form onSubmit={saveEdit} className="space-y-3">
                <FormGrid cols={3}>
                  <Field label="Status">
                    <Select value={editStatus} onChange={(e) => setEditStatus(e.target.value)}>
                      <option value="draft">Draft</option>
                      <option value="unpaid">Unpaid</option>
                      <option value="past_due">Past due</option>
                      <option value="paid">Paid</option>
                      <option value="void">Void</option>
                      <option value="sent">Sent</option>
                    </Select>
                  </Field>
                  <Field label="Invoice total">
                    <NumberInput value={editTotal} onValueChange={setEditTotal} />
                  </Field>
                  <Field label="Balance due">
                    <NumberInput value={editBalance} onValueChange={setEditBalance} />
                  </Field>
                  <Field label="Due date">
                    <Input type="date" value={editDue} onChange={(e) => setEditDue(e.target.value)} />
                  </Field>
                  <Field label="Notes" className="sm:col-span-2">
                    <Input value={editNotes} onChange={(e) => setEditNotes(e.target.value)} />
                  </Field>
                </FormGrid>
                <Button type="submit" loading={editBusy} icon={<Pencil className="h-4 w-4" />}>
                  Save invoice
                </Button>
              </form>
            </CardBody>
          </Card>
        </div>
      ) : null}

      <DataTable
        columns={columns}
        rows={invoices}
        rowKey={(inv) => inv._id}
        loading={loading}
        emptyTitle="No invoices yet"
        emptyDescription={
          isStaff
            ? "Connect QuickBooks and click Sync invoices to load the register."
            : "When Phoenix issues an invoice for your account, it will show up here."
        }
        pagination={paginationFrom(data)}
        onPageChange={setPage}
      />

      {showRegisterPrint ? (
        <InvoiceRegisterPrintModal
          invoices={invoices}
          filterLabel={filterLabel}
          onClose={() => setShowRegisterPrint(false)}
        />
      ) : null}
      {showCustomerReport && selectedCustomer ? (
        <BillingReportModal
          customer={selectedCustomer}
          onClose={() => setShowCustomerReport(false)}
        />
      ) : null}
    </>
  );
}
