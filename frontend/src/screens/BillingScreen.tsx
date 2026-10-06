"use client";

import { useMemo, useState } from "react";
import { FileText, Printer } from "lucide-react";
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
import { useAuth } from "@/lib/auth";
import { dateLabel, money } from "@/lib/format";
import { listQuery, paginationFrom, type PaginationMeta } from "@/lib/pagination";
import type { Customer, Invoice } from "@/types";

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
  const { user } = useAuth();
  const isStaff = user?.role !== "customer";
  // Empty = show all invoices (same source as Customer → Invoices)
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [page, setPage] = useState(1);
  const [showRegisterPrint, setShowRegisterPrint] = useState(false);
  const [showCustomerReport, setShowCustomerReport] = useState(false);

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
