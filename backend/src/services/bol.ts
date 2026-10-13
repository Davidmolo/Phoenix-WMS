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

/** Cesar workflow codes on BOL: 1 Cross-Dock, 4 Storage, 5 Contract. */
export function workflowLabel(serviceType?: string | null): string {
  switch (String(serviceType || "")) {
    case "crossdock":
      return "1 Cross-Dock";
    case "drop_and_store":
      return "4 Storage";
    case "trailer_rework":
    case "pickup":
      return "5 Contract";
    default:
      return serviceType ? String(serviceType) : "";
  }
}

export type BolLine = {
  externalId: string;
  description: string;
  weightLbs: number | null;
  packages: number;
  packageType?: string;
  poNumber?: string;
  jobName?: string;
  hazmat?: boolean;
};

export type BolDocument = {
  bolNumber: string;
  direction: string;
  /** ISO datetime shown on BOL */
  dateTime: string;
  wmsJobId: string;
  workflow: string;
  appointmentSlot: string;
  refInboundBol: string;
  carrier: string;
  driverName: string;
  truckNumber: string;
  trailerNumber: string;
  sealNumber: string;
  scac: string;
  shipFrom: string;
  shipTo: string;
  thirdParty: string;
  customerName: string;
  customerAccountId: string;
  warehouseName: string;
  totalWeightLbs: number;
  packageCount: number;
  palletCount: number;
  declaredValue: string;
  countVerified: boolean | null;
  actualCount: number | null;
  rewrapBanding: boolean | null;
  condition: string;
  exceptionNotes: string;
  timeReceived: string;
  timeReleased: string;
  billingFlags: string[];
  lines: BolLine[];
  createdAt: string;
  notes?: string;
  signatures: Array<{
    role: "driver" | "warehouse";
    name: string;
    imageDataUrl?: string;
    signedAt?: string | Date;
  }>;
  exceptionPhotoPaths: string[];
};

export function buildBolDocument(opts: {
  bolNumber: string;
  direction: string;
  dateTime?: string | Date | null;
  wmsJobId?: string;
  serviceType?: string | null;
  appointmentSlot?: string;
  refInboundBol?: string;
  carrier?: string;
  driverName?: string;
  truckNumber?: string;
  trailerNumber?: string;
  sealNumber?: string;
  scac?: string;
  shipFrom?: string;
  shipTo?: string;
  thirdParty?: string;
  customerName: string;
  customerAccountId?: string;
  warehouseName?: string;
  declaredValue?: string;
  countVerified?: boolean | null;
  actualCount?: number | null;
  rewrapBanding?: boolean | null;
  condition?: string;
  exceptionNotes?: string;
  timeReceived?: string | Date | null;
  timeReleased?: string | Date | null;
  billingFlags?: string[];
  notes?: string;
  signatures?: Array<{
    role: "driver" | "warehouse";
    name: string;
    imageDataUrl?: string;
    signedAt?: string | Date;
  }>;
  exceptionPhotoPaths?: string[];
  pallets: Array<{
    externalId: string;
    description?: string;
    weightLbs?: number | null;
    poNumber?: string;
    jobName?: string;
    hazmat?: boolean;
  }>;
}): BolDocument {
  const lines: BolLine[] = opts.pallets.map((p) => ({
    externalId: p.externalId,
    description: p.description || "Pallet",
    weightLbs: p.weightLbs ?? null,
    packages: 1,
    packageType: "Pallet",
    poNumber: p.poNumber,
    jobName: p.jobName,
    hazmat: Boolean(p.hazmat),
  }));
  const totalWeightLbs = lines.reduce((s, l) => s + (Number(l.weightLbs) || 0), 0);
  const createdAt = new Date().toISOString();
  const dateTime = toIso(opts.dateTime) || createdAt;
  return {
    bolNumber: opts.bolNumber,
    direction: opts.direction,
    dateTime,
    wmsJobId: opts.wmsJobId || "",
    workflow: workflowLabel(opts.serviceType),
    appointmentSlot: opts.appointmentSlot || "",
    refInboundBol: opts.refInboundBol || "",
    carrier: opts.carrier || "",
    driverName: opts.driverName || "",
    truckNumber: opts.truckNumber || "",
    trailerNumber: opts.trailerNumber || "",
    sealNumber: opts.sealNumber || "",
    scac: opts.scac || "",
    shipFrom: opts.shipFrom || "Phoenix Arizona Cross Dock LLC",
    shipTo: opts.shipTo || opts.customerName,
    thirdParty: opts.thirdParty || "",
    customerName: opts.customerName,
    customerAccountId: opts.customerAccountId || "",
    warehouseName: opts.warehouseName || "Phoenix Arizona Cross Dock LLC",
    totalWeightLbs,
    packageCount: lines.length,
    palletCount: lines.length,
    declaredValue: opts.declaredValue || "",
    countVerified: opts.countVerified ?? null,
    actualCount: opts.actualCount ?? null,
    rewrapBanding: opts.rewrapBanding ?? null,
    condition: opts.condition || "No exceptions",
    exceptionNotes: opts.exceptionNotes || "",
    timeReceived: toIso(opts.timeReceived),
    timeReleased: toIso(opts.timeReleased),
    billingFlags: opts.billingFlags || [],
    lines,
    createdAt,
    notes: opts.notes || "",
    signatures: opts.signatures || [],
    exceptionPhotoPaths: opts.exceptionPhotoPaths || [],
  };
}

function toIso(v?: string | Date | null): string {
  if (!v) return "";
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? "" : v.toISOString();
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? String(v) : d.toISOString();
}

function fmtPhoenix(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return esc(iso);
  return d.toLocaleString("en-US", {
    timeZone: "America/Phoenix",
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function yn(v: boolean | null | undefined): string {
  if (v === true) return "Yes";
  if (v === false) return "No";
  return "—";
}

function check(label: string, on: boolean): string {
  return `[${on ? "X" : " "}] ${label}`;
}

/** Printable BOL matching Cesar’s Phoenix Cross Dock template. */
export function bolHtml(doc: BolDocument): string {
  const dirIn = /inbound/i.test(doc.direction);
  const dirOut = /outbound/i.test(doc.direction);
  const wf = doc.workflow;
  const rows = doc.lines
    .map(
      (l) =>
        `<tr>
          <td>1</td>
          <td>${esc(String(l.packages))}</td>
          <td>${esc(l.packageType || "Pallet")}</td>
          <td>${esc(l.description)}${l.externalId ? ` <span class="muted">(${esc(l.externalId)})</span>` : ""}</td>
          <td style="text-align:right">${l.weightLbs != null ? l.weightLbs : "—"}</td>
          <td>${esc(l.poNumber || l.jobName || "—")}</td>
          <td style="text-align:center">${l.hazmat ? "Y" : "N"}</td>
        </tr>`
    )
    .join("");

  const flags = [
    check("Overage days", doc.billingFlags.includes("overage")),
    check("After-hours", doc.billingFlags.includes("after_hours")),
    check("Detention", doc.billingFlags.includes("detention")),
    check("No-show", doc.billingFlags.includes("no_show")),
    check("Other", doc.billingFlags.some((f) => !["overage", "after_hours", "detention", "no_show"].includes(f))),
  ].join(" &nbsp; ");

  const cond = String(doc.condition || "").toLowerCase();
  const condChecks = [
    check("No exceptions", !cond || cond.includes("no exception")),
    check("Damage", cond.includes("damage")),
    check("Shortage", cond.includes("shortage")),
    check("Overage", cond.includes("overage")),
  ].join(" &nbsp; ");

  return `<!doctype html><html><head><meta charset="utf-8"/>
    <title>BOL ${esc(doc.bolNumber)}</title>
    <style>
      @page { margin: 0.5in; }
      body{font-family:Georgia, "Times New Roman", serif;padding:20px;color:#111;font-size:12px;line-height:1.35}
      h1{font-size:18px;margin:0 0 2px;letter-spacing:0.02em}
      .sub{font-size:11px;color:#333;margin:0 0 12px}
      .grid{display:grid;grid-template-columns:1fr 1fr;gap:6px 16px;margin:10px 0;border:1px solid #222;padding:8px}
      .grid3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px 12px;margin:10px 0;border:1px solid #222;padding:8px}
      .lbl{font-size:9px;text-transform:uppercase;letter-spacing:0.04em;color:#444}
      .val{font-size:12px;font-weight:600}
      table{width:100%;border-collapse:collapse;font-size:11px;margin-top:8px}
      th,td{border:1px solid #333;padding:5px 6px;text-align:left;vertical-align:top}
      th{background:#eee;font-size:10px;text-transform:uppercase}
      .sig{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:18px}
      .sigbox{border:1px solid #222;padding:10px;min-height:72px}
      .muted{color:#666;font-size:10px;font-weight:400}
      .legal{margin-top:12px;font-size:10px;color:#333}
      .checks{margin:8px 0;font-size:11px}
    </style></head><body>
    <h1>BILL OF LADING</h1>
    <p class="sub">Phoenix Arizona Cross Dock LLC d/b/a Phoenix Cross Dock · phoenixcrossdocks.com</p>

    <div class="grid3">
      <div><div class="lbl">BOL #</div><div class="val">${esc(doc.bolNumber)}</div></div>
      <div><div class="lbl">Date / Time</div><div class="val">${fmtPhoenix(doc.dateTime)}</div></div>
      <div><div class="lbl">Type</div><div class="val">${check("Inbound", dirIn)} &nbsp; ${check("Outbound", dirOut)}</div></div>
      <div><div class="lbl">WMS Job ID</div><div class="val">${esc(doc.wmsJobId || "—")}</div></div>
      <div><div class="lbl">Workflow</div><div class="val">${esc(wf || "—")}<br/><span class="muted">${check("1 Cross-Dock", wf.startsWith("1"))} ${check("4 Storage", wf.startsWith("4"))} ${check("5 Contract", wf.startsWith("5"))}</span></div></div>
      <div><div class="lbl">Appointment slot</div><div class="val">${esc(doc.appointmentSlot || "—")}</div></div>
      ${dirOut ? `<div><div class="lbl">Ref inbound BOL #</div><div class="val">${esc(doc.refInboundBol || "—")}</div></div>` : ""}
    </div>

    <div class="grid">
      <div><div class="lbl">Shipper (name / address / contact)</div><div class="val">${esc(doc.shipFrom || "—")}</div></div>
      <div><div class="lbl">Consignee (name / address / contact)</div><div class="val">${esc(doc.shipTo || "—")}</div></div>
      <div><div class="lbl">Carrier (name / MC-SCAC #)</div><div class="val">${esc(doc.carrier || "—")}${doc.scac ? ` / ${esc(doc.scac)}` : ""}</div></div>
      <div><div class="lbl">Driver / Truck # / Trailer # / Seal #</div><div class="val">${esc(doc.driverName || "—")} / ${esc(doc.truckNumber || "—")} / ${esc(doc.trailerNumber || "—")} / ${esc(doc.sealNumber || "—")}</div></div>
      <div><div class="lbl">Billed customer (account ID)</div><div class="val">${esc(doc.customerName || "—")}${doc.customerAccountId ? ` · ${esc(doc.customerAccountId)}` : ""}</div></div>
      <div><div class="lbl">Warehouse</div><div class="val">${esc(doc.warehouseName)}</div></div>
    </div>

    <table>
      <thead>
        <tr>
          <th>Pallets</th><th>Pieces</th><th>Pkg type</th><th>Description of goods</th>
          <th>Weight (lb)</th><th>Customer PO / Ref</th><th>Haz Y/N</th>
        </tr>
      </thead>
      <tbody>${rows || `<tr><td colspan="7" class="muted">No freight lines</td></tr>`}</tbody>
      <tfoot>
        <tr>
          <td colspan="3"><strong>TOTAL</strong> · ${doc.palletCount} pallet(s)</td>
          <td></td>
          <td style="text-align:right"><strong>${doc.totalWeightLbs || "—"}</strong></td>
          <td colspan="2"></td>
        </tr>
      </tfoot>
    </table>

    <div class="grid" style="margin-top:10px">
      <div><div class="lbl">Declared value (optional)</div><div class="val">${esc(doc.declaredValue || "—")}</div></div>
      <div><div class="lbl">Count verified</div><div class="val">${yn(doc.countVerified)} · Actual count: ${doc.actualCount != null ? doc.actualCount : "—"}</div></div>
      <div><div class="lbl">Re-wrap / banding</div><div class="val">${yn(doc.rewrapBanding)}</div></div>
      <div><div class="lbl">Time received / released</div><div class="val">${fmtPhoenix(doc.timeReceived)} / ${fmtPhoenix(doc.timeReleased)}</div></div>
    </div>

    <div class="checks"><strong>Condition</strong> — ${condChecks}<br/><span class="muted">(photos required if any exception)</span></div>
    <div><div class="lbl">Exception / damage notes</div><div class="val">${esc(doc.exceptionNotes || doc.notes || "—")}</div></div>
    <div class="checks" style="margin-top:8px"><strong>Billing flags:</strong> ${flags}</div>

    <p class="legal">Liability for loss or damage while in Provider's care is limited per the governing fee schedule / agreement. Received in apparent good order except as noted. Goods may be held until the account is current.</p>

    ${
      doc.exceptionPhotoPaths?.length
        ? `<div class="checks" style="margin-top:8px"><strong>Exception photos on file:</strong> ${doc.exceptionPhotoPaths.length}</div>`
        : ""
    }

    <div class="sig">
      ${sigBox(doc, "driver", "Driver — printed name")}
      ${sigBox(doc, "warehouse", "Warehouse — printed name")}
    </div>
    </body></html>`;
}

function sigBox(
  doc: BolDocument,
  role: "driver" | "warehouse",
  label: string
): string {
  const sig = (doc.signatures || []).find((s) => s.role === role);
  const when = sig?.signedAt
    ? fmtPhoenix(
        sig.signedAt instanceof Date ? sig.signedAt.toISOString() : String(sig.signedAt)
      )
    : "—";
  const img =
    sig?.imageDataUrl && sig.imageDataUrl.startsWith("data:image")
      ? `<img src="${sig.imageDataUrl}" alt="${role} signature" style="max-height:48px;margin-top:8px"/>`
      : sig?.imageDataUrl
        ? `<div class="muted" style="margin-top:8px">Signature on file</div>`
        : `<div style="margin-top:28px;border-top:1px solid #999;padding-top:4px" class="muted">Signature</div>`;
  return `<div class="sigbox">
      <div class="lbl">${label}</div>
      <div class="val">${esc(sig?.name || "—")}</div>
      ${img}
      <div class="muted" style="margin-top:6px">Date / time: ${when}</div>
    </div>`;
}

function esc(v: string) {
  return String(v || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export type IdLike = string | Types.ObjectId;
