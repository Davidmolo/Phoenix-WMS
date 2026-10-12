import type { Types } from "mongoose";

/** Unique Bill of Lading number — carrier-facing contract of carriage id. */
export function generateBolNumber(prefix = "PCD"): string {
  const d = new Date();
  const y = d.getUTCFullYear().toString().slice(-2);
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `${prefix}-${y}${m}${day}-${rand}`;
}

export type BolLine = {
  externalId: string;
  description: string;
  weightLbs: number | null;
  packages: number;
  poNumber?: string;
  jobName?: string;
};

export type BolDocument = {
  bolNumber: string;
  direction: string;
  carrier: string;
  trailerNumber: string;
  sealNumber: string;
  scac: string;
  shipFrom: string;
  shipTo: string;
  thirdParty: string;
  customerName: string;
  totalWeightLbs: number;
  packageCount: number;
  lines: BolLine[];
  createdAt: string;
  notes?: string;
};

export function buildBolDocument(opts: {
  bolNumber: string;
  direction: string;
  carrier?: string;
  trailerNumber?: string;
  sealNumber?: string;
  scac?: string;
  shipFrom?: string;
  shipTo?: string;
  thirdParty?: string;
  customerName: string;
  notes?: string;
  pallets: Array<{
    externalId: string;
    description?: string;
    weightLbs?: number | null;
    poNumber?: string;
    jobName?: string;
  }>;
}): BolDocument {
  const lines: BolLine[] = opts.pallets.map((p) => ({
    externalId: p.externalId,
    description: p.description || "Pallet",
    weightLbs: p.weightLbs ?? null,
    packages: 1,
    poNumber: p.poNumber,
    jobName: p.jobName,
  }));
  const totalWeightLbs = lines.reduce((s, l) => s + (Number(l.weightLbs) || 0), 0);
  return {
    bolNumber: opts.bolNumber,
    direction: opts.direction,
    carrier: opts.carrier || "",
    trailerNumber: opts.trailerNumber || "",
    sealNumber: opts.sealNumber || "",
    scac: opts.scac || "",
    shipFrom: opts.shipFrom || "Phoenix Cross Dock",
    shipTo: opts.shipTo || opts.customerName,
    thirdParty: opts.thirdParty || "",
    customerName: opts.customerName,
    totalWeightLbs,
    packageCount: lines.length,
    lines,
    createdAt: new Date().toISOString(),
    notes: opts.notes || "",
  };
}

export function bolHtml(doc: BolDocument): string {
  const rows = doc.lines
    .map(
      (l) =>
        `<tr>
          <td>${esc(l.externalId)}</td>
          <td>${esc(l.description)}</td>
          <td>${esc(l.poNumber || l.jobName || "—")}</td>
          <td style="text-align:right">${l.packages}</td>
          <td style="text-align:right">${l.weightLbs != null ? l.weightLbs : "—"}</td>
        </tr>`
    )
    .join("");
  return `<!doctype html><html><head><meta charset="utf-8"/>
    <title>BOL ${esc(doc.bolNumber)}</title>
    <style>
      body{font-family:system-ui,sans-serif;padding:24px;color:#111}
      h1{font-size:20px;margin:0 0 4px}
      .meta{display:grid;grid-template-columns:1fr 1fr;gap:8px 24px;margin:16px 0;font-size:13px}
      table{width:100%;border-collapse:collapse;font-size:13px}
      th,td{border:1px solid #ccc;padding:6px 8px;text-align:left}
      th{background:#f4f4f4}
      .foot{margin-top:16px;font-size:12px;color:#444}
    </style></head><body>
    <h1>Bill of Lading</h1>
    <div><strong>${esc(doc.bolNumber)}</strong> · ${esc(doc.direction)} · ${esc(doc.createdAt.slice(0, 10))}</div>
    <div class="meta">
      <div><strong>Ship from</strong><br/>${esc(doc.shipFrom)}</div>
      <div><strong>Ship to</strong><br/>${esc(doc.shipTo)}</div>
      <div><strong>Carrier</strong><br/>${esc(doc.carrier || "—")}</div>
      <div><strong>Trailer / Seal / SCAC</strong><br/>${esc(doc.trailerNumber || "—")} / ${esc(doc.sealNumber || "—")} / ${esc(doc.scac || "—")}</div>
      <div><strong>Customer</strong><br/>${esc(doc.customerName)}</div>
      <div><strong>Third party</strong><br/>${esc(doc.thirdParty || "—")}</div>
    </div>
    <table>
      <thead><tr><th>Unit</th><th>Description</th><th>Order</th><th>Pkgs</th><th>Weight (lbs)</th></tr></thead>
      <tbody>${rows}</tbody>
      <tfoot><tr><td colspan="3"><strong>Totals</strong></td><td style="text-align:right"><strong>${doc.packageCount}</strong></td><td style="text-align:right"><strong>${doc.totalWeightLbs || "—"}</strong></td></tr></tfoot>
    </table>
    ${doc.notes ? `<p class="foot">Notes: ${esc(doc.notes)}</p>` : ""}
    <p class="foot">Contract of carriage — present to DOT / scale as required.</p>
    </body></html>`;
}

function esc(v: string) {
  return String(v || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export type IdLike = string | Types.ObjectId;
