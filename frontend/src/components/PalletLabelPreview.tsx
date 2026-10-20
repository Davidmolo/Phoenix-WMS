"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { printDocument } from "@/lib/print";
import { titleCase } from "@/lib/format";
import { cn } from "@/lib/cn";
import type { Pallet } from "@/types";

type Props = {
  pallets: Pallet[];
  companyName?: string;
  onClose: () => void;
};

/** A single printable label — either a pallet's primary slot, or its "-B" twin for oversized units. */
type LabelEntry = {
  key: string;
  barcode: string;
  displayId: string;
  locationCode: string;
  pallet: Pallet;
  isSecondary: boolean;
};

function codeFromLoc(loc: Pallet["locationId"] | Pallet["secondaryLocationId"]): string {
  if (loc && typeof loc === "object") return loc.code || "";
  return "";
}

function primaryLocationCode(p: Pallet): string {
  return p.locationCode || codeFromLoc(p.locationId) || "—";
}

function secondaryLocationCode(p: Pallet): string {
  return p.secondaryLocationCode || codeFromLoc(p.secondaryLocationId) || "—";
}

function statusDisplay(status?: string) {
  if (status === "staged_for_store") return "Staged for Store";
  if (status === "staged_for_shipping") return "Staged for Shipping";
  return titleCase(status);
}

/** Oversized (>48" on a side) always gets a twin "-B" barcode — even after ship clears slots. */
function needsTwinLabel(p: Pallet): boolean {
  if (p.secondaryLocationId || p.secondaryLocationCode) return true;
  const L = Number(p.dimLength) || 0;
  const W = Number(p.dimWidth) || 0;
  return L > 48 || W > 48;
}

/** Expand pallets with a secondary slot into two label entries (primary + "-B" twin). */
function expandLabels(pallets: Pallet[]): LabelEntry[] {
  const out: LabelEntry[] = [];
  for (const p of pallets) {
    out.push({
      key: p._id,
      barcode: p.externalId,
      displayId: p.externalId,
      locationCode: primaryLocationCode(p),
      pallet: p,
      isSecondary: false,
    });
    if (needsTwinLabel(p)) {
      out.push({
        key: `${p._id}-B`,
        barcode: `${p.externalId}-B`,
        displayId: `${p.externalId}-B`,
        locationCode: secondaryLocationCode(p),
        pallet: p,
        isSecondary: true,
      });
    }
  }
  return out;
}

/** The visual contents of one label (brand, barcode, location, details) — shared by the
 * on-screen single preview and the hidden "print all" stack so every label looks identical. */
function LabelFace({
  label,
  companyName,
  onReady,
}: {
  label: LabelEntry;
  companyName: string;
  onReady?: () => void;
}) {
  const svgRef = useRef<SVGSVGElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const JsBarcode = (await import("jsbarcode")).default;
        if (cancelled || !svgRef.current) return;
        JsBarcode(svgRef.current, label.barcode, {
          format: "CODE128",
          displayValue: false,
          height: 56,
          margin: 0,
          width: 2,
        });
      } catch {
        /* barcode optional — readable ID still prints */
      } finally {
        if (!cancelled) onReady?.();
      }
    })();
    return () => {
      cancelled = true;
    };
    // onReady is a stable per-mount callback — only re-run when the barcode value changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [label.barcode]);

  const pallet = label.pallet;
  const poJob = pallet.jobName || pallet.poNumber || "—";
  const dims =
    pallet.dimLength && pallet.dimWidth
      ? `${pallet.dimLength}" × ${pallet.dimWidth}"`
      : "—";
  const sqft = pallet.sqft != null ? `${pallet.sqft} SF` : "—";
  const weight = pallet.weightLbs != null ? `${pallet.weightLbs} lbs` : "—";
  const loc = label.locationCode;

  return (
    <>
      <div className="mb-2 text-center text-[11px] font-bold tracking-[0.06em] text-navy uppercase">
        {companyName}
      </div>
      <svg ref={svgRef} className="mx-auto mb-1 block w-full" />
      <div className="mb-3 text-center font-mono text-xl font-extrabold tracking-wide">
        {label.displayId}
      </div>
      {label.isSecondary ? (
        <div className="mb-2 text-center text-[10px] font-bold tracking-wide text-accent-dark uppercase">
          2nd slot — oversized pallet, pair with {pallet.externalId}
        </div>
      ) : null}
      <div className="mb-3 rounded border-2 border-black px-2 py-2 text-center">
        <div className="text-[8.5px] tracking-wide text-muted uppercase">
          {pallet.status === "shipped" ? "Last storage location" : "Storage location"}
        </div>
        <div className="font-mono text-2xl font-extrabold tracking-wide">
          {loc === "—" && pallet.status === "shipped" ? "Released" : loc}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-2 border-t border-black pt-2 text-[12px]">
        <div className="col-span-2">
          <div className="text-[8.5px] tracking-wide text-muted uppercase">Description</div>
          <div className="font-bold">{pallet.description || "—"}</div>
        </div>
        <div>
          <div className="text-[8.5px] tracking-wide text-muted uppercase">PO / Job</div>
          <div className="font-bold">{poJob}</div>
        </div>
        <div>
          <div className="text-[8.5px] tracking-wide text-muted uppercase">Status</div>
          <div className="font-bold">{statusDisplay(pallet.status)}</div>
        </div>
        <div>
          <div className="text-[8.5px] tracking-wide text-muted uppercase">Footprint</div>
          <div className="font-bold">{dims}</div>
        </div>
        <div>
          <div className="text-[8.5px] tracking-wide text-muted uppercase">Square feet</div>
          <div className="font-bold">{sqft}</div>
        </div>
        <div>
          <div className="text-[8.5px] tracking-wide text-muted uppercase">Weight</div>
          <div className="font-bold">{weight}</div>
        </div>
      </div>
    </>
  );
}

/** Printable ~4" pallet label with Code128 barcode — location on label (Cesar).
 * Oversized pallets (secondaryLocationId set) print a second "-B" label for the paired slot.
 * "Print all" renders every label in a hidden print-only stack (one per page) so the whole
 * batch goes out as a single print job instead of one at a time. */
export function PalletLabelPreview({
  pallets,
  companyName = "Phoenix Cross Dock",
  onClose,
}: Props) {
  const labels = useMemo(() => expandLabels(pallets), [pallets]);
  const [index, setIndex] = useState(0);
  const [printAllMode, setPrintAllMode] = useState(false);
  const readyCountRef = useRef(0);
  const printedRef = useRef(false);
  const fallbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const label = labels[index];

  useEffect(() => {
    setIndex(0);
    setPrintAllMode(false);
  }, [pallets]);

  // Once the print dialog has been dismissed, drop back to the single-label preview.
  useEffect(() => {
    if (!printAllMode) return;
    const cleanup = () => setPrintAllMode(false);
    window.addEventListener("afterprint", cleanup, { once: true });
    return () => {
      window.removeEventListener("afterprint", cleanup);
    };
  }, [printAllMode]);

  useEffect(() => {
    return () => {
      if (fallbackTimerRef.current) clearTimeout(fallbackTimerRef.current);
    };
  }, []);

  if (!label) return null;

  function firePrintOnce() {
    if (printedRef.current) return;
    printedRef.current = true;
    if (fallbackTimerRef.current) {
      clearTimeout(fallbackTimerRef.current);
      fallbackTimerRef.current = null;
    }
    printDocument();
  }

  function handleAllLabelReady() {
    readyCountRef.current += 1;
    if (readyCountRef.current >= labels.length) firePrintOnce();
  }

  function printAll() {
    if (labels.length === 0) return;
    readyCountRef.current = 0;
    printedRef.current = false;
    setPrintAllMode(true);
    // Barcode rendering is async (dynamic import + draw) — fall back to printing anyway
    // after a short delay so a single stalled label can't block the whole batch.
    fallbackTimerRef.current = setTimeout(firePrintOnce, 1200);
  }

  return (
    <div className="pallet-label-overlay fixed inset-0 z-50 flex flex-col bg-black/50">
      <div className="no-print flex flex-col gap-2 bg-[#141413] px-4 py-2.5 text-sm text-white">
        <div className="flex items-center justify-between gap-3">
          <span>
            Pallet label {index + 1} of {labels.length} — <strong>{label.displayId}</strong>
            {label.isSecondary ? " (2nd slot — oversized)" : ""}
          </span>
          <div className="flex flex-wrap gap-2">
          {labels.length > 1 ? (
            <>
              <button
                type="button"
                className="rounded-md border border-white/40 px-3 py-1.5 text-xs font-semibold disabled:opacity-40"
                disabled={index === 0}
                onClick={() => setIndex((i) => Math.max(0, i - 1))}
              >
                Previous
              </button>
              <button
                type="button"
                className="rounded-md border border-white/40 px-3 py-1.5 text-xs font-semibold disabled:opacity-40"
                disabled={index >= labels.length - 1}
                onClick={() => setIndex((i) => Math.min(labels.length - 1, i + 1))}
              >
                Next
              </button>
            </>
          ) : null}
          <button
            type="button"
            className="rounded-md bg-white px-3 py-1.5 text-xs font-semibold text-navy"
            onClick={() => printDocument()}
          >
            Print label
          </button>
          {labels.length > 1 ? (
            <button
              type="button"
              className="rounded-md bg-accent px-3 py-1.5 text-xs font-bold text-[var(--navy-deep)]"
              onClick={printAll}
            >
              Print all ({labels.length})
            </button>
          ) : null}
          <button
            type="button"
            className="rounded-md border border-white/40 px-3 py-1.5 text-xs font-semibold"
            onClick={onClose}
          >
            Close
          </button>
          </div>
        </div>
        {labels.length > 1 ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] text-white/70 uppercase tracking-wide">Barcodes</span>
            {labels.map((l, i) => (
              <button
                key={l.key}
                type="button"
                onClick={() => setIndex(i)}
                className={cn(
                  "rounded-md px-2.5 py-1 font-mono text-xs font-bold",
                  i === index
                    ? "bg-accent text-[var(--navy-deep)]"
                    : "border border-white/35 bg-white/10 text-white hover:bg-white/20"
                )}
              >
                {l.displayId}
                {l.isSecondary ? " · 2nd slot" : ""}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <div className="flex flex-1 items-start justify-center overflow-auto p-6">
        <div
          className={cn(
            "pallet-label-sheet w-full max-w-[360px] rounded-lg border-2 border-black bg-white p-4 shadow-lg",
            // Hide the single-label preview from the print job while a batch print is in flight —
            // only the hidden print-only stack below should print.
            printAllMode && "no-print"
          )}
        >
          <LabelFace label={label} companyName={companyName} />
        </div>
      </div>

      {printAllMode ? (
        <div className="print-only" aria-hidden>
          {labels.map((l) => (
            <div
              key={l.key}
              className="pallet-label-sheet mx-auto w-full max-w-[360px] rounded-lg border-2 border-black bg-white p-4"
            >
              <LabelFace label={l} companyName={companyName} onReady={handleAllLabelReady} />
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
