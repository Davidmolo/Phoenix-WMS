"use client";

import { useEffect, useMemo } from "react";
import { ClipboardList, Printer, X, MapPin, Package } from "lucide-react";
import { Button } from "@/components/ui";
import { dateLabel } from "@/lib/format";
import { printDocument } from "@/lib/print";

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
    <div className="print-overlay fixed inset-0 z-50 flex items-end justify-center bg-navy-deep/50 p-3 backdrop-blur-sm sm:items-center sm:p-6">
      <div
        className="print-sheet print-sheet--picklist flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-[var(--radius-xl)] border border-border bg-white shadow-[var(--shadow-card)] sm:max-w-2xl"
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
          <div className="print-brand-meta">
            {list.palletCount} stop{list.palletCount === 1 ? "" : "s"} · {when}
          </div>
        </div>

        <div className="no-print flex items-center justify-between gap-3 border-b border-border px-4 py-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 font-display text-sm font-semibold tracking-wide text-navy uppercase">
              <ClipboardList className="h-4 w-4 text-accent" />
              {title}
            </div>
            <p className="m-0 mt-0.5 text-xs text-muted">
              Walk order by floor location · {list.palletCount} pallet
              {list.palletCount === 1 ? "" : "s"} · {when}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              icon={<Printer className="h-4 w-4" />}
              onClick={() => printDocument()}
            >
              Print / PDF
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

        {/* Screen: card list */}
        <div className="no-print space-y-2.5 overflow-y-auto px-3 py-3 sm:px-4">
          {list.lines.map((line) => (
            <article
              key={line.palletId}
              className="rounded-[var(--radius)] border border-border px-3 py-3"
              style={{ background: "var(--blend-kpi)" }}
            >
              <div className="flex items-start gap-3">
                <div
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-sm font-bold text-navy-deep"
                  style={{ background: "linear-gradient(135deg,#E6A030,#DA8E0B)" }}
                >
                  {line.seq}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="inline-flex items-center gap-1 font-display text-[15px] font-semibold tracking-wide text-navy uppercase">
                      <MapPin className="h-3.5 w-3.5 text-accent" />
                      {line.locationCode}
                    </span>
                    {line.aisle ? (
                      <span className="text-[11px] font-semibold text-muted uppercase">
                        Aisle {line.aisle}
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                    <span className="inline-flex items-center gap-1 font-semibold text-navy">
                      <Package className="h-3.5 w-3.5 text-muted" />
                      {line.externalId}
                    </span>
                    <span className="text-xs capitalize text-muted">{line.status}</span>
                    {line.sqft != null ? (
                      <span className="text-xs tabular-nums text-muted">{line.sqft} SF</span>
                    ) : null}
                  </div>
                  <div className="mt-1 grid gap-0.5 text-xs text-muted sm:grid-cols-2">
                    <div>
                      <span className="font-semibold text-navy">Job / PO: </span>
                      {line.jobName || line.poNumber || "—"}
                    </div>
                    <div>
                      <span className="font-semibold text-navy">Customer: </span>
                      {line.customerName || "—"}
                    </div>
                  </div>
                </div>
              </div>
            </article>
          ))}
        </div>

        {/* Print/PDF: dense table anchored to top of page */}
        <div className="print-only print-body">
          <table className="picklist-print-table">
            <thead>
              <tr>
                <th className="w-8">#</th>
                <th>Location</th>
                <th>Pallet</th>
                <th>Job / PO</th>
                <th>Customer</th>
                <th className="w-14">SF</th>
              </tr>
            </thead>
            <tbody>
              {list.lines.map((line) => (
                <tr key={line.palletId}>
                  <td>{line.seq}</td>
                  <td>
                    <strong>{line.locationCode}</strong>
                    {line.aisle ? <span className="picklist-sub"> · Aisle {line.aisle}</span> : null}
                  </td>
                  <td>
                    <strong>{line.externalId}</strong>
                    <span className="picklist-sub"> · {line.status}</span>
                  </td>
                  <td>{line.jobName || line.poNumber || "—"}</td>
                  <td>{line.customerName || "—"}</td>
                  <td>{line.sqft != null ? line.sqft : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
