"use client";

import { useEffect } from "react";
import { Printer, X } from "lucide-react";
import { Button } from "@/components/ui";
import { dateLabel, money } from "@/lib/format";
import { printDocument } from "@/lib/print";

export type RegisterInvoice = {
  _id: string;
  number: string;
  status: string;
  total: number;
  balanceDue?: number | null;
  periodStart: string;
  periodEnd: string;
  dueDate?: string | null;
  quickbooksId?: string | null;
  customerId?: string | { _id: string; name?: string };
};

function balanceDueOf(inv: RegisterInvoice) {
  if (inv.balanceDue != null && !Number.isNaN(Number(inv.balanceDue))) {
    return Number(inv.balanceDue);
  }
  return Number(inv.total) || 0;
}

function customerLabel(inv: RegisterInvoice) {
  if (inv.customerId && typeof inv.customerId === "object") return inv.customerId.name || "—";
  return "—";
}

export function InvoiceRegisterPrintModal({
  invoices,
  filterLabel,
  onClose,
}: {
  invoices: RegisterInvoice[];
  filterLabel: string;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const billed = invoices.reduce((s, inv) => s + (inv.total || 0), 0);
  const owed = invoices.reduce((s, inv) => s + balanceDueOf(inv), 0);

  return (
    <div className="print-overlay fixed inset-0 z-50 flex items-end justify-center bg-navy-deep/50 p-3 backdrop-blur-sm sm:items-center sm:p-6">
      <div
        className="print-sheet flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-[var(--radius-xl)] border border-border bg-white shadow-[var(--shadow-card)] sm:max-w-4xl"
        role="dialog"
        aria-label="Invoice register report"
      >
        <div className="print-brand hidden">
          <div>
            <div className="print-brand-title">
              Phoenix <span className="print-brand-accent">Cross Dock</span> · WMS
            </div>
            <div className="mt-1 text-[11px] text-white/80">Invoice register</div>
          </div>
          <div className="print-brand-meta">
            {filterLabel}
            <br />
            {invoices.length} invoice{invoices.length === 1 ? "" : "s"} · billed{" "}
            {money(billed)} · owed {money(owed)}
          </div>
        </div>

        <div className="no-print flex items-center justify-between gap-3 border-b border-border px-4 py-3">
          <div className="min-w-0">
            <div className="font-display text-sm font-semibold tracking-wide text-navy uppercase">
              Invoice register
            </div>
            <p className="m-0 mt-0.5 text-xs text-muted">
              {filterLabel} · {invoices.length} invoice{invoices.length === 1 ? "" : "s"} · billed{" "}
              {money(billed)} · still owed {money(owed)}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="secondary"
              icon={<Printer className="h-4 w-4" />}
              onClick={() => printDocument()}
            >
              Print / export
            </Button>
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

        <div className="print-body overflow-y-auto px-3 py-3 sm:px-4">
          {invoices.length === 0 ? (
            <p className="m-0 text-sm text-muted">No invoices in this filter to print.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] border-collapse text-left text-sm sm:min-w-0">
                <thead>
                  <tr className="border-b border-border text-[11px] tracking-wide text-muted uppercase">
                    <th className="py-2 pr-2 font-semibold">Number</th>
                    <th className="py-2 pr-2 font-semibold">Customer</th>
                    <th className="py-2 pr-2 font-semibold">Date</th>
                    <th className="py-2 pr-2 font-semibold">Status</th>
                    <th className="py-2 pr-2 font-semibold">Invoice total</th>
                    <th className="py-2 font-semibold">Balance due</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((inv) => (
                    <tr key={inv._id} className="border-b border-border/70">
                      <td className="py-2.5 pr-2 font-semibold text-navy">
                        {inv.number}
                        {inv.quickbooksId ? (
                          <span className="mt-0.5 block text-[10px] font-normal text-muted">
                            From QuickBooks
                          </span>
                        ) : null}
                      </td>
                      <td className="py-2.5 pr-2 text-xs">{customerLabel(inv)}</td>
                      <td className="py-2.5 pr-2 text-xs">{dateLabel(inv.periodStart)}</td>
                      <td className="py-2.5 pr-2 capitalize">{inv.status}</td>
                      <td className="py-2.5 pr-2 tabular-nums text-navy">{money(inv.total)}</td>
                      <td className="py-2.5 tabular-nums font-semibold text-navy">
                        {money(balanceDueOf(inv))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
