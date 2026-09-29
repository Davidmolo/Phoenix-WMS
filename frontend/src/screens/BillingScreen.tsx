"use client";

import { useEffect, useMemo, useState } from "react";
import { FileText } from "lucide-react";
import {
  Alert,
  Badge,
  Button,
  DataTable,
  Field,
  FormGrid,
  PageHeader,
  Select,
  statusTone,
  type Column,
} from "@/components/ui";
import { api } from "@/lib/api";
import { useApiQuery, invalidateApiCache } from "@/hooks/useApiQuery";
import { useAuth } from "@/lib/auth";
import { takeBillingCustomerId } from "@/lib/billingNav";
import { useScreenActive } from "@/lib/screenActive";
import { dateLabel, money } from "@/lib/format";
import type { Customer, Invoice } from "@/types";

type InvoiceRow = Invoice & {
  customerId?: string | { _id: string; name?: string; billingMethod?: string };
};

function customerName(inv: InvoiceRow) {
  if (inv.customerId && typeof inv.customerId === "object") {
    return inv.customerId.name || "—";
  }
  return "—";
}

export default function BillingPage() {
  const { token, user } = useAuth();
  const screenActive = useScreenActive();
  const { data, error, loading, reload } = useApiQuery<{ invoices: InvoiceRow[] }>("/invoices");
  const { data: custData } = useApiQuery<{ customers: Customer[] }>("/customers", {
    enabled: user?.role !== "customer",
  });
  const customers = custData?.customers ?? [];
  const [customerId, setCustomerId] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  // Prefer a customer handed off from Customers → Generate
  useEffect(() => {
    if (!screenActive) return;
    const pending = takeBillingCustomerId();
    if (pending) setCustomerId(pending);
  }, [screenActive]);

  useEffect(() => {
    if (!customerId && customers[0]) setCustomerId(customers[0]._id);
  }, [customers, customerId]);

  const selected = useMemo(
    () => customers.find((c) => c._id === customerId),
    [customers, customerId]
  );

  const columns: Column<InvoiceRow>[] = [
    {
      key: "number",
      header: "Number",
      render: (inv) => <span className="font-semibold">{inv.number}</span>,
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

  async function generateInvoice() {
    if (!token || !customerId) return;
    setBusy(true);
    setErr("");
    setMsg("");
    try {
      const now = new Date();
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      const result = await api<{ invoice: InvoiceRow; chargesAttached: number }>(
        "/invoices/generate-month",
        {
          method: "POST",
          token,
          body: JSON.stringify({
            customerId,
            periodStart: start.toISOString(),
            periodEnd: end.toISOString(),
          }),
        }
      );
      setMsg(
        `Created ${result.invoice.number} for ${customerName(result.invoice)} · ${money(result.invoice.total)} (${result.chargesAttached} handling lines)`
      );
      invalidateApiCache();
      await reload();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Invoice failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Billing"
        icon={<FileText className="h-5 w-5" />}
        description="All invoices · pick a customer to generate · QuickBooks send when credentials are connected"
      />

      {user?.role !== "customer" ? (
        <div className="mb-5 rounded-[var(--radius-lg)] border border-border bg-white p-4 shadow-[var(--shadow)]">
          <FormGrid cols={2}>
            <Field
              label="Customer"
              required
              hint="From Customers you can jump here with a customer already selected. Includes contract rent (if any) plus unbilled charges this month."
            >
              <Select
                value={customerId}
                onChange={(e) => setCustomerId(e.target.value)}
                required
              >
                <option value="" disabled>
                  Select customer…
                </option>
                {customers.map((c) => (
                  <option key={c._id} value={c._id}>
                    {c.name}
                    {c.billingMethod === "contract" && c.contractFee
                      ? ` · contract ${money(c.contractFee)}/mo`
                      : ""}
                  </option>
                ))}
              </Select>
            </Field>
            <div className="flex items-end">
              <Button onClick={generateInvoice} loading={busy} disabled={!customerId}>
                Generate monthly invoice
                {selected ? ` — ${selected.name}` : ""}
              </Button>
            </div>
          </FormGrid>
        </div>
      ) : null}

      <Alert tone="info">
        This page is the invoice register for every customer. Sending/email/PDF will go through
        QuickBooks once Cesar connects credentials.
      </Alert>

      <Alert>{error || err}</Alert>
      {msg ? <Alert tone="info">{msg}</Alert> : null}
      <DataTable
        columns={columns}
        rows={data?.invoices ?? []}
        rowKey={(inv) => inv._id}
        loading={loading}
        emptyTitle="No invoices yet"
        emptyDescription="Select a customer and generate their monthly invoice."
      />
    </>
  );
}
