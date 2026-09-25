"use client";

import { useState } from "react";
import { AppShell } from "@/components/AppShell";
import {
  Alert,
  Badge,
  Button,
  DataTable,
  PageHeader,
  statusTone,
  type Column,
} from "@/components/ui";
import { api } from "@/lib/api";
import { useApiQuery } from "@/hooks/useApiQuery";
import { useAuth } from "@/lib/auth";
import { dateLabel, money } from "@/lib/format";
import type { Customer, Invoice } from "@/types";

export default function BillingPage() {
  const { token, user } = useAuth();
  const { data, error, loading, reload } = useApiQuery<{ invoices: Invoice[] }>("/invoices");
  const { data: custData } = useApiQuery<{ customers: Customer[] }>("/customers", {
    enabled: user?.role !== "customer",
  });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  const columns: Column<Invoice>[] = [
    {
      key: "number",
      header: "Number",
      render: (inv) => <span className="font-semibold">{inv.number}</span>,
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

  async function generateSbaInvoice() {
    if (!token) return;
    const sba = custData?.customers?.find((c) => c.billingMethod === "contract");
    if (!sba) {
      setErr("SBA contract customer not found");
      return;
    }
    setBusy(true);
    setErr("");
    setMsg("");
    try {
      const now = new Date();
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      const result = await api<{ invoice: Invoice; chargesAttached: number }>(
        "/invoices/generate-sba-month",
        {
          method: "POST",
          token,
          body: JSON.stringify({
            customerId: sba._id,
            periodStart: start.toISOString(),
            periodEnd: end.toISOString(),
          }),
        }
      );
      setMsg(
        `Created ${result.invoice.number} for ${money(result.invoice.total)} (${result.chargesAttached} handling lines)`
      );
      await reload();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Invoice failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell>
      <PageHeader
        title="Billing"
        description="Invoices · SBA Net 30 · ACH"
        actions={
          user?.role !== "customer" ? (
            <Button onClick={generateSbaInvoice} loading={busy}>
              Generate SBA monthly invoice
            </Button>
          ) : undefined
        }
      />
      {user?.role !== "customer" ? (
        <Alert tone="info">
          Generates $7,500 base rent plus any unbilled handling/FTL charges in the current month.
        </Alert>
      ) : null}
      <Alert>{error || err}</Alert>
      {msg ? <Alert tone="info">{msg}</Alert> : null}
      <DataTable
        columns={columns}
        rows={data?.invoices ?? []}
        rowKey={(inv) => inv._id}
        loading={loading}
        emptyTitle="No invoices yet"
        emptyDescription="Generate the SBA monthly invoice after receiving pallets."
      />
    </AppShell>
  );
}
