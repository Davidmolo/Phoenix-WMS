"use client";

import { useEffect, useRef, useState } from "react";
import { printDocument } from "@/lib/print";
import { titleCase } from "@/lib/format";
import type { Pallet } from "@/types";

type Props = {
  pallets: Pallet[];
  companyName?: string;
  onClose: () => void;
};

function locationCode(pallet: Pallet) {
  if (pallet.locationId && typeof pallet.locationId === "object") {
    return pallet.locationId.code || "—";
  }
  return "—";
}

function statusDisplay(status?: string) {
  if (status === "staged_for_store") return "Staged for Store";
  return titleCase(status);
}

/** Printable ~4" pallet label with Code128 barcode — location on label (Cesar). */
export function PalletLabelPreview({
  pallets,
  companyName = "Phoenix Cross Dock",
  onClose,
}: Props) {
  const [index, setIndex] = useState(0);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const pallet = pallets[index];

  useEffect(() => {
    setIndex(0);
  }, [pallets]);

  useEffect(() => {
    if (!pallet) return;
    let cancelled = false;
    (async () => {
      try {
        const JsBarcode = (await import("jsbarcode")).default;
        if (cancelled || !svgRef.current) return;
        JsBarcode(svgRef.current, pallet.externalId, {
          format: "CODE128",
          displayValue: false,
          height: 56,
          margin: 0,
          width: 2,
        });
      } catch {
        /* barcode optional — readable ID still prints */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pallet?.externalId, index]);

  if (!pallet) return null;

  const poJob = pallet.jobName || pallet.poNumber || "—";
  const dims =
    pallet.dimLength && pallet.dimWidth
      ? `${pallet.dimLength}" × ${pallet.dimWidth}"`
      : "—";
  const sqft = pallet.sqft != null ? `${pallet.sqft} SF` : "—";
  const loc = locationCode(pallet);

  return (
    <div className="pallet-label-overlay fixed inset-0 z-50 flex flex-col bg-black/50">
      <div className="no-print flex items-center justify-between gap-3 bg-[#141413] px-4 py-2.5 text-sm text-white">
        <span>
          Pallet label {index + 1} of {pallets.length} — <strong>{pallet.externalId}</strong>
        </span>
        <div className="flex flex-wrap gap-2">
          {pallets.length > 1 ? (
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
                disabled={index >= pallets.length - 1}
                onClick={() => setIndex((i) => Math.min(pallets.length - 1, i + 1))}
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
          <button
            type="button"
            className="rounded-md border border-white/40 px-3 py-1.5 text-xs font-semibold"
            onClick={onClose}
          >
            Close
          </button>
        </div>
      </div>

      <div className="flex flex-1 items-start justify-center overflow-auto p-6">
        <div className="pallet-label-sheet w-full max-w-[360px] rounded-lg border-2 border-black bg-white p-4 shadow-lg">
          <div className="mb-2 text-center text-[11px] font-bold tracking-[0.06em] text-navy uppercase">
            {companyName}
          </div>
          <svg ref={svgRef} className="mx-auto mb-1 block w-full" />
          <div className="mb-3 text-center font-mono text-xl font-extrabold tracking-wide">
            {pallet.externalId}
          </div>
          <div className="mb-3 rounded border-2 border-black px-2 py-2 text-center">
            <div className="text-[8.5px] tracking-wide text-muted uppercase">Storage location</div>
            <div className="font-mono text-2xl font-extrabold tracking-wide">{loc}</div>
          </div>
          <div className="grid grid-cols-2 gap-x-3 gap-y-2 border-t border-black pt-2 text-[12px]">
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
          </div>
        </div>
      </div>
    </div>
  );
}
