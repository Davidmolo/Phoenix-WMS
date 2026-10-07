"use client";

import { useEffect, useRef } from "react";
import { printDocument } from "@/lib/print";
import type { Pallet } from "@/types";

type Props = {
  pallet: Pallet;
  companyName?: string;
  onClose: () => void;
};

/** Printable ~4" pallet label with Code128 barcode (prototype parity / Cesar ask). */
export function PalletLabelPreview({ pallet, companyName = "Phoenix Cross Dock", onClose }: Props) {
  const svgRef = useRef<SVGSVGElement | null>(null);

  useEffect(() => {
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
  }, [pallet.externalId]);

  const poJob = pallet.jobName || pallet.poNumber || "—";
  const dims =
    pallet.dimLength && pallet.dimWidth
      ? `${pallet.dimLength}" × ${pallet.dimWidth}"`
      : "—";
  const sqft = pallet.sqft != null ? `${pallet.sqft} SF` : "—";

  return (
    <div className="pallet-label-overlay fixed inset-0 z-50 flex flex-col bg-black/50">
      <div className="no-print flex items-center justify-between gap-3 bg-[#141413] px-4 py-2.5 text-sm text-white">
        <span>
          Pallet label — <strong>{pallet.externalId}</strong>
        </span>
        <div className="flex gap-2">
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
          <div className="grid grid-cols-2 gap-x-3 gap-y-2 border-t border-black pt-2 text-[12px]">
            <div>
              <div className="text-[8.5px] tracking-wide text-muted uppercase">PO / Job</div>
              <div className="font-bold">{poJob}</div>
            </div>
            <div>
              <div className="text-[8.5px] tracking-wide text-muted uppercase">Status</div>
              <div className="font-bold capitalize">{pallet.status}</div>
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
