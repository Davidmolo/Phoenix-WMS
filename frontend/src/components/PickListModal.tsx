"use client";

import { useEffect, useMemo, useState } from "react";
import { ClipboardList, Printer, X } from "lucide-react";
import { Badge, Button } from "@/components/ui";
import { dateLabel } from "@/lib/format";

export type PickListLine = {
  seq: number;
  palletId: string;
  externalId: string;
  status: string;
  description?: string;
  jobName?: string;
  poNumber?: string;
  sqft?: number | null;
  customerName?: string;
  locationCode: string;
  aisle?: string;
  row: number;
  col: number;
};

export type PickListPayload = {
  generatedAt: string;
  palletCount: number;
  lines: PickListLine[];
};

export function PickListModal({
  list,
  title = "Outbound pick list",
  onClose,
}: {
  list: PickListPayload;
  title?: string;
  onClose: () => void;
}) {
  const when = useMemo(() => dateLabel(list.generatedAt), [list.generatedAt]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-navy-deep/50 p-3 backdrop-blur-sm sm:items-center sm:p-6 print:static print:bg-white print:p-0">
      <div
        className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-[var(--radius-xl)] border border-border bg-white shadow-[var(--shadow-card)] print:max-h-none print:max-w-none print:rounded-none print:border-0 print:shadow-none"
        role="dialog"
        aria-label={title}
      >
        <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3 print:border-b-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2 font-display text-sm font-semibold tracking-wide text-navy uppercase">
              <ClipboardList className="h-4 w-4 text-accent print:hidden" />
              {title}
            </div>
            <p className="m-0 mt-0.5 text-xs text-muted">
              {list.palletCount} pallet{list.palletCount === 1 ? "" : "s"} · walk order by floor
              location · {when}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2 print:hidden">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              icon={<Printer className="h-4 w-4" />}
              onClick={() => window.print()}
            >
              Print
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

        <div className="overflow-y-auto px-4 py-3">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-border text-[11px] tracking-wide text-muted uppercase">
                <th className="py-2 pr-2 font-semibold">#</th>
                <th className="py-2 pr-2 font-semibold">Location</th>
                <th className="py-2 pr-2 font-semibold">Pallet</th>
                <th className="py-2 pr-2 font-semibold">Job / PO</th>
                <th className="py-2 pr-2 font-semibold">Customer</th>
                <th className="py-2 font-semibold">SF</th>
              </tr>
            </thead>
            <tbody>
              {list.lines.map((line) => (
                <tr key={line.palletId} className="border-b border-border/70 align-top">
                  <td className="py-2.5 pr-2 tabular-nums text-muted">{line.seq}</td>
                  <td className="py-2.5 pr-2">
                    <span className="font-semibold text-navy">{line.locationCode}</span>
                    {line.aisle ? (
                      <span className="mt-0.5 block text-[11px] text-muted">Aisle {line.aisle}</span>
                    ) : null}
                  </td>
                  <td className="py-2.5 pr-2">
                    <span className="font-semibold">{line.externalId}</span>
                    <div className="mt-1">
                      <Badge tone="neutral">{line.status}</Badge>
                    </div>
                  </td>
                  <td className="py-2.5 pr-2 text-xs">
                    {line.jobName || line.poNumber || "—"}
                    {line.description ? (
                      <span className="mt-0.5 block text-muted">{line.description}</span>
                    ) : null}
                  </td>
                  <td className="py-2.5 pr-2 text-xs">{line.customerName || "—"}</td>
                  <td className="py-2.5 tabular-nums text-xs">
                    {line.sqft != null ? line.sqft : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
