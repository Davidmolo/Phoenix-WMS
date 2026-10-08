"use client";

import { useEffect, useMemo, useState } from "react";
import { FileText, Link2, Printer, RefreshCw, Search, Unlink } from "lucide-react";
import { BillingReportModal } from "@/components/BillingReportModal";
import { InvoiceRegisterPrintModal } from "@/components/InvoiceRegisterPrintModal";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  DataTable,
  Field,
  FormGrid,
  Input,
  PageHeader,
  SearchableSelect,
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
        render: (inv) => <Badge tone={statusTone(inv.status)}>{inv.status}</Badge>,
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
    return cols;
  }, [isStaff]);

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
            ? "Invoice register from QuickBooks — billed vs still owed"
            : "Invoice total = billed · Balance due = still owed"
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
                      Sync invoices
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
