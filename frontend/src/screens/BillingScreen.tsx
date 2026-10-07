"use client";

import { useEffect, useMemo, useState } from "react";
import { FileText, Link2, Printer, RefreshCw, Unlink } from "lucide-react";
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
  Select,
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

export default function BillingPage() {
  const { user, token } = useAuth();
  const isStaff = user?.role !== "customer";
  // Empty = show all invoices (same source as Customer → Invoices)
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [customerId, setCustomerId] = useState("");
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
      },
    });
  }, [fromDate, toDate, customerId, isStaff, page]);

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

  const columns: Column<InvoiceRow>[] = [
    {
      key: "number",
      header: "Number",
      render: (inv) => (
        <span className="font-semibold">
          {inv.number}
          {inv.quickbooksId ? (
            <span className="mt-0.5 block text-[10px] font-normal text-muted">QB synced</span>
          ) : null}
        </span>
      ),
    },
    {
      key: "customer",
      header: "Customer",
      render: (inv) => customerName(inv),
    },
    {
      key: "period",
      header: "Period",
      render: (inv) => `${dateLabel(inv.periodStart)} – ${dateLabel(inv.periodEnd)}`,
    },
    {
      key: "status",
      header: "Status",
      render: (inv) => <Badge tone={statusTone(inv.status)}>{inv.status}</Badge>,
    },
    {
      key: "total",
      header: "Total",
      render: (inv) => money(inv.total),
    },
  ];

  function clearFilters() {
    setFromDate("");
    setToDate("");
    setCustomerId("");
    setPage(1);
    invalidateApiCache("/invoices");
    invalidateApiCache("/customers");
    void reload();
  }

  return (
    <>
      <PageHeader
        title="Billing"
        icon={<FileText className="h-5 w-5" />}
        description="Same invoice register as Customer detail · optional date range and customer filters"
        actions={
          isStaff ? (
            <div className="flex flex-wrap gap-2">
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
                onClick={() => setShowRegisterPrint(true)}
              >
                Print / export list
              </Button>
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
            </div>
          ) : undefined
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
                }`
              : `Not connected · Development/sandbox. After you connect, use Sync invoices.`}
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

      <Card className="mb-5">
        <CardBody>
          <FormGrid cols={isStaff ? 3 : 2}>
            <Field label="From" htmlFor="billing-from" hint="Leave blank to include all dates.">
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
            <Field label="To" htmlFor="billing-to" hint="Leave blank to include all dates.">
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
                <Select
                  id="billing-customer"
                  value={customerId}
                  onChange={(e) => {
                    setCustomerId(e.target.value);
                    setPage(1);
                  }}
                >
                  <option value="">All customers</option>
                  {customers.map((c) => (
                    <option key={c._id} value={c._id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              </Field>
            ) : null}
          </FormGrid>
          {(fromDate || toDate || customerId) && (
            <div className="mt-3">
              <Button type="button" size="sm" variant="ghost" onClick={clearFilters}>
                Clear filters (show all)
              </Button>
            </div>
          )}
        </CardBody>
      </Card>

      <Alert tone="info">
        Billing and Customer → Invoices both read <strong>/invoices</strong>. If a row appears on
        one screen but not the other, clear filters here or refresh — stale cache can linger after
        data changes.
      </Alert>

      <Alert>{error}</Alert>
      <DataTable
        columns={columns}
        rows={invoices}
        rowKey={(inv) => inv._id}
        loading={loading}
        emptyTitle="No invoices"
        emptyDescription="There are no invoices in the register yet (QuickBooks sync will fill this)."
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
