"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { FileText, Link2, Mail, Pencil, Printer, RefreshCw, Search, Trash2, Unlink } from "lucide-react";
import { BillingReportModal } from "@/components/BillingReportModal";
import { InvoiceRegisterPrintModal } from "@/components/InvoiceRegisterPrintModal";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  ChipGroup,
  DataTable,
  Field,
  FormGrid,
  Input,
  Modal,
  NumberInput,
  PageHeader,
  useDialog,
  SearchableSelect,
  Select,
  statusLabel,
  statusTone,
  type Column,
} from "@/components/ui";
import { useApiQuery, invalidateApiCache } from "@/hooks/useApiQuery";

const NmiPayBox = dynamic(() => import("@/components/NmiPayBox"), { ssr: false });
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useScreenActive } from "@/lib/screenActive";
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
  const dialog = useDialog();
  const screenActive = useScreenActive();
  const { user, token } = useAuth();
  const isStaff = user?.role !== "customer";
  const isAdmin = user?.role === "admin";
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [balance, setBalance] = useState("");
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
  type EditLine = {
    description: string;
    qty: string;
    unitAmount: string;
    type: string;
  };
  const [editInv, setEditInv] = useState<InvoiceRow | null>(null);
  const [viewInv, setViewInv] = useState<InvoiceRow | null>(null);
  const [payItems, setPayItems] = useState<{ id: string; amount: number }[]>([]);
  const payBoxRef = useRef<HTMLDivElement>(null);
  const [editStatus, setEditStatus] = useState("unpaid");
  const [editTotal, setEditTotal] = useState("");
  const [editBalance, setEditBalance] = useState("");
  const [editDue, setEditDue] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [editLines, setEditLines] = useState<EditLine[]>([]);
  const [editBusy, setEditBusy] = useState(false);
  const [editErr, setEditErr] = useState("");
  const [editMsg, setEditMsg] = useState("");

  const editLinesTotal = useMemo(() => {
    return Math.round(
      editLines.reduce((s, l) => {
        const qty = Number(l.qty) || 0;
        const unit = Number(l.unitAmount) || 0;
        return s + qty * unit;
      }, 0) * 100
    ) / 100;
  }, [editLines]);

  const { data: qbStatus, reload: reloadQb } = useApiQuery<QbStatus>("/quickbooks/status", {
    enabled: isStaff,
  });

  useEffect(() => {
    if (!screenActive) return;
    const raw = sessionStorage.getItem("phoenix.billingFocus");
    if (!raw) return;
    sessionStorage.removeItem("phoenix.billingFocus");
    try {
      const focus = JSON.parse(raw) as { customerId?: string; focus?: string };
      if (focus.customerId) setCustomerId(focus.customerId);
      if (focus.focus === "unpaid" || focus.focus === "past_due") setBalance(focus.focus);
      setPage(1);
    } catch {
      /* ignore bad focus payload */
    }
  }, [screenActive]);

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
        balance: balance || undefined,
        q: search.trim() || undefined,
      },
    });
  }, [fromDate, toDate, customerId, isStaff, page, search, balance]);

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

  const removeInvoice = useCallback(
    async (inv: InvoiceRow) => {
      if (!token) return;
      const linked = Boolean(inv.quickbooksId);
      const ok = await dialog.confirm({
        title: linked ? "Void invoice" : "Delete invoice",
        message: linked
          ? `${inv.number} is linked to QuickBooks. This voids it in WMS and in QuickBooks. It does not erase the QuickBooks invoice.`
          : `${inv.number} exists only in WMS. This removes it.`,
        confirmLabel: linked ? "Void invoice" : "Delete invoice",
      });
      if (!ok) return;
      setEditErr("");
      setEditMsg("");
      try {
        const result = await api<{ hint?: string }>(`/invoices/${inv._id}`, {
          method: "DELETE",
          token,
        });
        setEditMsg(result.hint || (linked ? "Invoice voided." : "Invoice deleted."));
        invalidateApiCache("/invoices");
        void reload();
      } catch (ex) {
        setEditErr(ex instanceof Error ? ex.message : "Could not delete invoice");
      }
    },
    [token, reload, dialog]
  );

  function openEdit(inv: InvoiceRow) {
    setEditInv(inv);
    setEditStatus(inv.status || "unpaid");
    setEditTotal(String(inv.total ?? ""));
    setEditBalance(inv.balanceDue != null ? String(inv.balanceDue) : String(inv.total ?? ""));
    setEditDue(inv.dueDate ? String(inv.dueDate).slice(0, 10) : "");
    setEditNotes(inv.notes || "");
    const lines = (inv.lines || []).map((l) => {
      const qty = Number(l.qty) || 1;
      const unit =
        l.unitAmount != null
          ? Number(l.unitAmount)
          : qty
            ? Number(l.amount) / qty
            : Number(l.amount) || 0;
      return {
        description: l.description || "",
        qty: String(qty),
        unitAmount: String(Math.round(unit * 100) / 100),
        type: l.type || "other",
      };
    });
    setEditLines(
      lines.length
        ? lines
        : [
            {
              description: inv.number ? `Invoice ${inv.number}` : "Charge",
              qty: "1",
              unitAmount: String(inv.total ?? 0),
              type: "other",
            },
          ]
    );
    setEditErr("");
    setEditMsg("");
  }

  async function saveEdit(e: FormEvent) {
    e.preventDefault();
    if (!token || !editInv) return;
    setEditBusy(true);
    setEditErr("");
    setEditMsg("");
    try {
      const linesPayload = editLines
        .filter((l) => l.description.trim())
        .map((l) => {
          const qty = Number(l.qty) || 1;
          const unitAmount = Number(l.unitAmount) || 0;
          return {
            description: l.description.trim(),
            qty,
            unitAmount,
            amount: Math.round(qty * unitAmount * 100) / 100,
            type: l.type || "other",
          };
        });
      if (!linesPayload.length) {
        setEditErr("Add at least one line item");
        setEditBusy(false);
        return;
      }
      const result = await api<{
        invoice: InvoiceRow;
        hint?: string;
        qbSync?: { synced?: boolean; error?: string };
      }>(`/invoices/${editInv._id}`, {
        method: "PATCH",
        token,
        body: JSON.stringify({
          status: editStatus,
          dueDate: editDue || null,
          notes: editNotes,
          lines: linesPayload,
          balanceDue: editBalance === "" ? undefined : Number(editBalance),
        }),
      });
      const hint = result.hint || "Invoice updated";
      invalidateApiCache("/invoices");
      await reload();
      setEditInv(null);
      if (result.qbSync?.error) {
        setSendErr(hint);
        setSendMsg("");
      } else {
        setSendMsg(hint);
        setSendErr("");
      }
    } catch (ex) {
      setEditErr(ex instanceof Error ? ex.message : "Could not update invoice");
    } finally {
      setEditBusy(false);
    }
  }

  async function disconnectQuickBooks() {
    const ok = await dialog.confirm({
      title: "Disconnect QuickBooks",
      message: "Disconnect QuickBooks from Phoenix WMS? Invoices stay in WMS. Pay Now email stops until you connect again.",
      confirmLabel: "Disconnect",
      danger: true,
    });
    if (!ok) return;
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
        render: (inv) => {
          const payable =
            !isStaff && !["paid", "void", "draft"].includes(inv.status) && balanceDueOf(inv) > 0;
          return (
            <span className="font-semibold">
              {payable ? (
                <input
                  type="checkbox"
                  className="mr-2 h-4 w-4 accent-[var(--accent)]"
                  checked={payItems.some((row) => row.id === inv._id)}
                  onClick={(e) => e.stopPropagation()}
                  onChange={() =>
                    setPayItems((rows) =>
                      rows.some((row) => row.id === inv._id)
                        ? rows.filter((row) => row.id !== inv._id)
                        : [...rows, { id: inv._id, amount: balanceDueOf(inv) }]
                    )
                  }
                />
              ) : null}
              {inv.number}
              {isStaff && inv.quickbooksId ? (
                <span className="mt-0.5 block text-[10px] font-normal text-muted">From QuickBooks</span>
              ) : null}
            </span>
          );
        },
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
              <>
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
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  icon={<Trash2 className="h-3.5 w-3.5" />}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    void removeInvoice(inv);
                  }}
                >
                  {inv.quickbooksId ? "Void" : "Delete"}
                </Button>
              </>
            ) : null}
          </div>
        ),
      });
    }
    if (!isStaff) {
      cols.push({
        key: "pay",
        header: "",
        render: (inv) => {
          const due = balanceDueOf(inv);
          const payable = !["paid", "void", "draft"].includes(inv.status) && due > 0;
          if (!payable) return null;
          const selected = payItems.some((row) => row.id === inv._id);
          return (
            <Button
              type="button"
              size="sm"
              variant={selected ? "secondary" : "primary"}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setPayItems([{ id: inv._id, amount: due }]);
              }}
            >
              Pay {money(due)}
            </Button>
          );
        },
      });
    }
    return cols;
  }, [isStaff, isAdmin, sendingId, sendInvoice, removeInvoice, payItems]);

  useEffect(() => {
    if (!payItems.length) return;
    payBoxRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [payItems]);

  function clearFilters() {
    setFromDate("");
    setToDate("");
    setCustomerId("");
    setBalance("");
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
            : "Click Pay on an invoice to pay that balance by card or bank. Check more than one to pay them together."
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
              Click <strong className="text-navy">Pay</strong> on the invoice you want to pay. The
              card and bank form charges that balance. To pay several at once, check their boxes and
              use the same form. The balance updates here and in QuickBooks after the payment goes
              through.
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
            <Field label="From" htmlFor="billing-from">
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
            <Field label="To" htmlFor="billing-to">
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
              <Field label="Customer" htmlFor="billing-customer">
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
            <Field label="Search" htmlFor="billing-search">
              <Input
                id="billing-search"
                type="search"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                placeholder="Invoice #, company, or status"
                icon={<Search className="h-3.5 w-3.5" />}
              />
            </Field>
          </FormGrid>
          <div className="mt-4 border-t border-border pt-3">
            <ChipGroup
              label="Balance"
              options={[
                { id: "", label: "All invoices" },
                { id: "unpaid", label: "Unpaid" },
                { id: "past_due", label: "Past due" },
              ]}
              value={balance}
              onChange={(id) => {
                setBalance(id);
                setPage(1);
              }}
            />
          </div>
          {(fromDate || toDate || customerId || search.trim() || balance) && (
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
      {!isStaff && payItems.length > 0 ? (
        <div ref={payBoxRef} className="scroll-mt-28">
        <Card className="mb-4">
          <CardBody>
            <NmiPayBox
              amount={payItems.reduce((sum, row) => sum + row.amount, 0)}
              invoiceIds={payItems.map((row) => row.id)}
              rows={[
                {
                  label: payItems.length === 1 ? "1 invoice selected" : `${payItems.length} invoices selected`,
                  value: "Paid in full",
                },
                {
                  label: "Due today",
                  value: money(payItems.reduce((sum, row) => sum + row.amount, 0)),
                  emphasize: true,
                },
              ]}
              note="This charges the balance of the invoice you chose. If more than one is checked, they are paid together. Nothing else is added on this page."
              onPaid={(message) => {
                setEditMsg(message);
                setPayItems([]);
                setViewInv(null);
                invalidateApiCache("/invoices");
                void reload();
              }}
            />
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
        onRowClick={isStaff ? undefined : (inv) => setViewInv(inv)}
      />

      <Modal
        open={Boolean(viewInv)}
        onClose={() => setViewInv(null)}
        title={viewInv ? viewInv.number : "Invoice"}
        description={viewInv ? statusLabel(viewInv.status) : undefined}
        size="md"
      >
        {viewInv ? (
          <div className="space-y-3 text-sm">
            <p className="m-0 text-muted">
              <span className="font-semibold text-navy">Invoice total: </span>
              {money(viewInv.total)}
              <span className="font-semibold text-navy"> · Balance due: </span>
              {money(balanceDueOf(viewInv))}
            </p>
            {!isStaff &&
            !["paid", "void", "draft"].includes(viewInv.status) &&
            balanceDueOf(viewInv) > 0 ? (
              <Button
                type="button"
                onClick={() => {
                  setPayItems([{ id: viewInv._id, amount: balanceDueOf(viewInv) }]);
                  setViewInv(null);
                }}
              >
                Pay {money(balanceDueOf(viewInv))}
              </Button>
            ) : null}
            {(viewInv.lines ?? []).length === 0 ? (
              <p className="m-0 text-muted">No line items on this invoice.</p>
            ) : (
              <ul className="m-0 list-none space-y-2 p-0">
                {(viewInv.lines ?? []).map((line, index) => (
                  <li key={`${line.description}-${index}`} className="border-b border-border pb-2">
                    <div className="font-semibold text-navy">{line.description}</div>
                    <div className="text-muted">
                      {line.qty ?? 1} × {money(line.unitAmount ?? line.amount)} · {money(line.amount)}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : null}
      </Modal>

      <Modal
        open={Boolean(editInv) && isAdmin}
        onClose={() => {
          if (!editBusy) setEditInv(null);
        }}
        title={editInv ? `Edit invoice ${editInv.number}` : "Edit invoice"}
        description="Admin override — edit line items, rates, and amounts. Saves in WMS and syncs QuickBooks when linked."
        size="xl"
        footer={
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="m-0 text-sm font-semibold text-navy">
              Line total {money(editLinesTotal)}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="secondary"
                disabled={editBusy}
                onClick={() => setEditInv(null)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                form="billing-edit-invoice"
                loading={editBusy}
                icon={<Pencil className="h-4 w-4" />}
              >
                Save invoice
              </Button>
            </div>
          </div>
        }
      >
        <Alert>{editErr}</Alert>
        {editMsg ? <Alert tone="success">{editMsg}</Alert> : null}
        <form id="billing-edit-invoice" onSubmit={saveEdit} className="space-y-4">
          <FormGrid cols={2}>
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
            <Field label="Due date">
              <Input type="date" value={editDue} onChange={(e) => setEditDue(e.target.value)} />
            </Field>
            <Field
              label="Balance due"
              hint="Leave as line total unless a partial payment already posted."
            >
              <NumberInput value={editBalance} onValueChange={setEditBalance} />
            </Field>
            <Field label="Notes">
              <Input value={editNotes} onChange={(e) => setEditNotes(e.target.value)} />
            </Field>
          </FormGrid>

          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="m-0 text-[11px] font-bold tracking-wide text-muted uppercase">
                Line items
              </p>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() =>
                  setEditLines((prev) => [
                    ...prev,
                    { description: "", qty: "1", unitAmount: "", type: "other" },
                  ])
                }
              >
                Add line
              </Button>
            </div>
            <div className="space-y-2">
              {editLines.map((line, idx) => {
                const qty = Number(line.qty) || 0;
                const unit = Number(line.unitAmount) || 0;
                const amount = Math.round(qty * unit * 100) / 100;
                return (
                  <div
                    key={`eline-${idx}`}
                    className="rounded-[var(--radius)] border border-border bg-surface-2/40 p-3"
                  >
                    <FormGrid cols={2}>
                      <Field label="Description" className="sm:col-span-2">
                        <Input
                          value={line.description}
                          onChange={(e) =>
                            setEditLines((prev) => {
                              const next = [...prev];
                              next[idx] = { ...next[idx], description: e.target.value };
                              return next;
                            })
                          }
                          placeholder="e.g. Inbound unload / handling"
                        />
                      </Field>
                      <Field label="Qty">
                        <NumberInput
                          value={line.qty}
                          onValueChange={(v) =>
                            setEditLines((prev) => {
                              const next = [...prev];
                              next[idx] = { ...next[idx], qty: v };
                              return next;
                            })
                          }
                        />
                      </Field>
                      <Field label="Rate / unit">
                        <NumberInput
                          value={line.unitAmount}
                          onValueChange={(v) =>
                            setEditLines((prev) => {
                              const next = [...prev];
                              next[idx] = { ...next[idx], unitAmount: v };
                              return next;
                            })
                          }
                        />
                      </Field>
                      <Field label="Type">
                        <Select
                          value={line.type}
                          onChange={(e) =>
                            setEditLines((prev) => {
                              const next = [...prev];
                              next[idx] = { ...next[idx], type: e.target.value };
                              return next;
                            })
                          }
                        >
                          <option value="handling">Handling</option>
                          <option value="crossdock">Crossdock</option>
                          <option value="storage">Storage</option>
                          <option value="ftl">FTL</option>
                          <option value="dwell">Dwell</option>
                          <option value="accessorial">Accessorial</option>
                          <option value="base_rent">Base rent</option>
                          <option value="other">Other</option>
                        </Select>
                      </Field>
                      <Field label="Line amount">
                        <Input value={money(amount)} readOnly />
                      </Field>
                    </FormGrid>
                    <div className="mt-2 flex justify-end">
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        disabled={editLines.length <= 1}
                        onClick={() =>
                          setEditLines((prev) => prev.filter((_, i) => i !== idx))
                        }
                      >
                        Remove line
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
            <p className="m-0 text-xs text-muted">
              Invoice total updates from line items ({money(editLinesTotal)}). Was{" "}
              {money(Number(editTotal) || 0)} before this edit.
            </p>
          </div>
        </form>
      </Modal>

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
