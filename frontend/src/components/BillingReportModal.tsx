"use client";

import { FormEvent, useEffect, useState } from "react";
import { Printer, X } from "lucide-react";
import { Alert, Button, Field, Input } from "@/components/ui";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { dateLabel, money } from "@/lib/format";
import { printDocument } from "@/lib/print";
import type { Customer } from "@/types";

export type BillingReport = {
  customer: {
    _id: string;
    name: string;
    billingMethod?: string;
    contractFee?: number;
    contractSqft?: number;
    email?: string;
    contact?: string;
  };
  periodStart: string;
  periodEnd: string;
  generatedAt: string;
  summary: {
    activePallets: number;
    chargeCount: number;
    chargeTotal: number;
    invoiceCount: number;
    invoiceTotal: number;
  };
  charges: Array<{
    _id: string;
    description: string;
    amount: number;
    type: string;
    date: string;
  }>;
  invoices: Array<{
    _id: string;
    number: string;
    status: string;
    total: number;
    periodStart: string;
    periodEnd: string;
    quickbooksId?: string | null;
  }>;
};

function monthValueFromDate(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function BillingReportModal({
  customer,
  title = "Customer billing report",
  onClose,
}: {
  customer: Pick<Customer, "_id" | "name">;
  title?: string;
  onClose: () => void;
}) {
  const { token } = useAuth();
  const [month, setMonth] = useState(monthValueFromDate);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [report, setReport] = useState<BillingReport | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function loadReport(e?: FormEvent) {
    e?.preventDefault();
    if (!token || !month) return;
    setBusy(true);
    setErr("");
    try {
      const data = await api<BillingReport>(
        `/customers/${customer._id}/billing-report?month=${encodeURIComponent(month)}`,
        { token }
      );
      setReport(data);
    } catch (ex) {
      setReport(null);
      setErr(ex instanceof Error ? ex.message : "Could not load report");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="print-overlay fixed inset-0 z-50 flex items-end justify-center bg-navy-deep/50 p-3 backdrop-blur-sm sm:items-center sm:p-6">
      <div
        className="print-sheet flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-[var(--radius-xl)] border border-border bg-white shadow-[var(--shadow-card)] sm:max-w-4xl"
        role="dialog"
        aria-label={title}
      >
        <div className="print-brand">
          <div>
            <div className="print-brand-title">
              Phoenix <span className="print-brand-accent">Cross Dock</span> · WMS
            </div>
            <div className="mt-1 text-[11px] text-white/80">{title}</div>
          </div>
          <div className="print-brand-meta">{customer.name}</div>
        </div>

        <div className="no-print flex items-center justify-between gap-3 border-b border-border px-4 py-3">
          <div className="min-w-0">
            <div className="font-display text-sm font-semibold tracking-wide text-navy uppercase">
              {title}
            </div>
            <p className="m-0 mt-0.5 truncate text-xs text-muted">{customer.name}</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {report ? (
              <Button
                type="button"
                size="sm"
                variant="secondary"
                icon={<Printer className="h-4 w-4" />}
                onClick={() => printDocument()}
              >
                Print / export
              </Button>
            ) : null}
            <button
              type="button"
              className="rounded-lg border border-border p-2 text-muted hover:bg-surface-2 hover:text-navy"
              onClick={onClose}
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="print-body overflow-y-auto px-3 py-4 sm:px-4">
          {!report ? (
            <form onSubmit={loadReport} className="no-print space-y-4">
              <Alert tone="info">
                Invoices are issued through QuickBooks. This builds a printable activity report for the
                selected month (charges + any synced invoices) — it does not create a new invoice.
              </Alert>
              <Field label="Report month" htmlFor="report-month" required>
                <Input
                  id="report-month"
                  type="month"
                  value={month}
                  onChange={(e) => setMonth(e.target.value)}
                  required
                />
              </Field>
              <Alert>{err}</Alert>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="secondary" onClick={onClose}>
                  Cancel
                </Button>
                <Button type="submit" loading={busy}>
                  Preview report
                </Button>
              </div>
            </form>
          ) : (
            <div className="space-y-5">
              <div className="no-print">
                <Alert>{err}</Alert>
                <div className="mb-3 flex flex-wrap gap-2">
                  <Button type="button" variant="secondary" size="sm" onClick={() => setReport(null)}>
                    Change month
                  </Button>
                </div>
              </div>

              <div className="text-sm">
                <div className="font-semibold text-navy">{report.customer.name}</div>
                <div className="text-xs text-muted">
                  {report.customer.contact || "—"}
                  {report.customer.email ? ` · ${report.customer.email}` : ""}
                </div>
                <div className="mt-1 text-xs text-muted">
                  Period {dateLabel(report.periodStart)} – {dateLabel(report.periodEnd)} · Prepared{" "}
                  {dateLabel(report.generatedAt)}
                </div>
                {report.customer.billingMethod === "contract" ? (
                  <div className="mt-1 text-xs text-muted">
                    Contract {money(report.customer.contractFee)}/mo
                    {report.customer.contractSqft
                      ? ` · ${report.customer.contractSqft.toLocaleString()} SF`
                      : ""}
                  </div>
                ) : null}
              </div>

              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <MiniStat label="Active pallets" value={String(report.summary.activePallets)} />
                <MiniStat label="Charge lines" value={String(report.summary.chargeCount)} />
                <MiniStat label="Charges total" value={money(report.summary.chargeTotal)} />
                <MiniStat label="Invoices total" value={money(report.summary.invoiceTotal)} />
              </div>

              <section>
                <h3 className="font-display m-0 mb-2 text-xs font-semibold tracking-wide text-navy uppercase">
                  Activity / charges
                </h3>
                {report.charges.length === 0 ? (
                  <p className="m-0 text-sm text-muted">No charges in this period.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[480px] border-collapse text-left text-sm sm:min-w-0">
                      <thead>
                        <tr className="border-b border-border text-[11px] text-muted uppercase">
                          <th className="py-2 pr-2 font-semibold">Date</th>
                          <th className="py-2 pr-2 font-semibold">Description</th>
                          <th className="py-2 pr-2 font-semibold">Type</th>
                          <th className="py-2 font-semibold">Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {report.charges.map((c) => (
                          <tr key={c._id} className="border-b border-border/70">
                            <td className="py-2 pr-2 text-xs">{dateLabel(c.date)}</td>
                            <td className="py-2 pr-2">{c.description}</td>
                            <td className="py-2 pr-2 text-xs capitalize">{c.type}</td>
                            <td className="py-2 tabular-nums font-semibold text-navy">
                              {money(c.amount)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>

              <section>
                <h3 className="font-display m-0 mb-2 text-xs font-semibold tracking-wide text-navy uppercase">
                  Invoices (QuickBooks / register)
                </h3>
                {report.invoices.length === 0 ? (
                  <p className="m-0 text-sm text-muted">
                    No invoices in this period yet. They will appear here once QuickBooks sync is
                    connected.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[480px] border-collapse text-left text-sm sm:min-w-0">
                      <thead>
                        <tr className="border-b border-border text-[11px] text-muted uppercase">
                          <th className="py-2 pr-2 font-semibold">Number</th>
                          <th className="py-2 pr-2 font-semibold">Period</th>
                          <th className="py-2 pr-2 font-semibold">Status</th>
                          <th className="py-2 font-semibold">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {report.invoices.map((inv) => (
                          <tr key={inv._id} className="border-b border-border/70">
                            <td className="py-2 pr-2 font-semibold text-navy">
                              {inv.number}
                              {inv.quickbooksId ? (
                                <span className="mt-0.5 block text-[10px] font-normal text-muted">
                                  QB {inv.quickbooksId}
                                </span>
                              ) : null}
                            </td>
                            <td className="py-2 pr-2 text-xs">
                              {dateLabel(inv.periodStart)} – {dateLabel(inv.periodEnd)}
                            </td>
                            <td className="py-2 pr-2 capitalize">{inv.status}</td>
                            <td className="py-2 tabular-nums font-semibold text-navy">
                              {money(inv.total)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="print-stat rounded-[var(--radius)] border border-border px-3 py-2">
      <div className="text-[10px] font-bold tracking-wide text-muted uppercase">{label}</div>
      <div className="mt-0.5 text-sm font-bold tabular-nums text-navy">{value}</div>
    </div>
  );
}
