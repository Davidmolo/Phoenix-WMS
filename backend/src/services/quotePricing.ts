import {
  crossdockPerPallet,
  pickPerPalletRate,
  unloadPerPallet,
  type FeeScheduleRates,
} from "./customerFees";

export type QuoteBillingType = "contract" | "crossdock" | "rework" | "other";

type Party = {
  contractFee?: number | null;
  contractHandlingPerPallet?: number | null;
  contractFtlRate?: number | null;
  crossdockPerPallet?: number | null;
  unloadFee?: number | null;
  reworkHourlyRate?: number | null;
  reworkMinimumHours?: number | null;
  parcelStoragePerBoxDay?: number | null;
  parcelReceivePerBox?: number | null;
  parcelOutboundPerBox?: number | null;
  parcelOversizePerPalletDay?: number | null;
} | null;

type InvoiceType = "base_rent" | "handling" | "ftl" | "storage" | "crossdock" | "dwell" | "accessorial" | "other";

type Spec = {
  key: string;
  billingType: QuoteBillingType;
  label: string;
  invoiceType: InvoiceType;
  custom?: boolean;
  unit: (party: Party, fees: FeeScheduleRates) => number;
  minQty?: (party: Party, fees: FeeScheduleRates) => number;
};

function n(value: unknown, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function money(value: number) {
  return Math.round(value * 100) / 100;
}

const RATES: Spec[] = [
  {
    key: "contract_monthly",
    billingType: "contract",
    label: "Contract monthly",
    invoiceType: "base_rent",
    custom: true,
    unit: (party) => n(party?.contractFee),
  },
  {
    key: "contract_handling",
    billingType: "contract",
    label: "Contract handling / pallet",
    invoiceType: "handling",
    unit: (party) => n(party?.contractHandlingPerPallet),
  },
  {
    key: "contract_ftl",
    billingType: "contract",
    label: "Contract FTL",
    invoiceType: "ftl",
    unit: (party) => n(party?.contractFtlRate),
  },
  {
    key: "floorStoragePerPalletMo",
    billingType: "contract",
    label: "Floor storage / pallet / month",
    invoiceType: "storage",
    unit: (_party, fees) => n(fees.floorStoragePerPalletMo),
  },
  {
    key: "rackStoragePerPalletMo",
    billingType: "contract",
    label: "Rack storage / pallet / month",
    invoiceType: "storage",
    unit: (_party, fees) => n(fees.rackStoragePerPalletMo),
  },
  {
    key: "inOutHandlingPerPallet",
    billingType: "contract",
    label: "In/out handling / pallet",
    invoiceType: "handling",
    unit: (_party, fees) => n(fees.inOutHandlingPerPallet),
  },
  {
    key: "crossDockPerPallet",
    billingType: "crossdock",
    label: "Cross-dock / pallet",
    invoiceType: "crossdock",
    unit: (party, fees) => crossdockPerPallet(party, fees),
  },
  {
    key: "crossDockPerTrailer",
    billingType: "crossdock",
    label: "Cross-dock / trailer",
    invoiceType: "crossdock",
    unit: (_party, fees) => n(fees.crossDockPerTrailer),
  },
  {
    key: "crossDockMinimum",
    billingType: "crossdock",
    label: "Cross-dock minimum",
    invoiceType: "crossdock",
    unit: (_party, fees) => n(fees.crossDockMinimum),
  },
  {
    key: "unloadLoadPerPallet",
    billingType: "crossdock",
    label: "Unload or load / pallet",
    invoiceType: "handling",
    unit: (party, fees) => unloadPerPallet(party || {}, fees),
  },
  {
    key: "unloadLoadPerTrailer",
    billingType: "crossdock",
    label: "Unload or load / trailer",
    invoiceType: "handling",
    unit: (_party, fees) => n(fees.unloadLoadPerTrailer),
  },
  {
    key: "afterFreeDwellPerPalletDay",
    billingType: "crossdock",
    label: "Dwell / pallet / day",
    invoiceType: "dwell",
    unit: (_party, fees) => n(fees.afterFreeDwellPerPalletDay),
  },
  {
    key: "sortRelabelPerHour",
    billingType: "rework",
    label: "Rework / hour",
    invoiceType: "accessorial",
    unit: (party, fees) => pickPerPalletRate(party?.reworkHourlyRate, n(fees.sortRelabelPerHour, 65)),
    minQty: (party, fees) => Math.max(1, n(party?.reworkMinimumHours ?? fees.trailerReworkMinimumHours, 1)),
  },
  {
    key: "sortRelabelPerCase",
    billingType: "rework",
    label: "Sort / relabel / case",
    invoiceType: "accessorial",
    unit: (_party, fees) => n(fees.sortRelabelPerCase),
  },
  {
    key: "handStackPerHour",
    billingType: "rework",
    label: "Hand-stack / hour",
    invoiceType: "accessorial",
    unit: (_party, fees) => n(fees.handStackPerHour),
  },
  {
    key: "parcelStoragePerBoxDay",
    billingType: "other",
    label: "Parcel storage / box / day",
    invoiceType: "storage",
    unit: (party, fees) =>
      pickPerPalletRate(party?.parcelStoragePerBoxDay, n(fees.parcelStoragePerBoxDay, 0.05)),
  },
  {
    key: "parcelReceivePerBox",
    billingType: "other",
    label: "Parcel receiving / box",
    invoiceType: "handling",
    unit: (party, fees) => pickPerPalletRate(party?.parcelReceivePerBox, n(fees.parcelReceivePerBox, 0.75)),
  },
  {
    key: "parcelOutboundPerBox",
    billingType: "other",
    label: "Parcel outbound / box",
    invoiceType: "handling",
    unit: (party, fees) =>
      pickPerPalletRate(party?.parcelOutboundPerBox, n(fees.parcelOutboundPerBox, 0.5)),
  },
  {
    key: "parcelOversizePerPalletDay",
    billingType: "other",
    label: "Oversize parcel / day",
    invoiceType: "storage",
    unit: (party, fees) =>
      pickPerPalletRate(party?.parcelOversizePerPalletDay, n(fees.parcelOversizePerPalletDay, 1.65)),
  },
  {
    key: "noShowFee",
    billingType: "other",
    label: "No-show",
    invoiceType: "accessorial",
    unit: (_party, fees) => n(fees.noShowFee),
  },
  {
    key: "detentionPerHour",
    billingType: "other",
    label: "Detention / hour",
    invoiceType: "accessorial",
    unit: (_party, fees) => n(fees.detentionPerHour),
  },
  {
    key: "custom",
    billingType: "other",
    label: "Custom",
    invoiceType: "other",
    custom: true,
    unit: () => 0,
  },
];

const BILLING_TYPES = new Set<QuoteBillingType>(["contract", "crossdock", "rework", "other"]);

export type QuoteLineInput = {
  key: string;
  qty?: unknown;
  unitAmount?: unknown;
  description?: unknown;
  billingType?: unknown;
};

export function quoteCatalog(party: Party, fees: FeeScheduleRates) {
  return RATES.map((spec) => ({
    key: spec.key,
    billingType: spec.billingType,
    label: spec.label,
    custom: Boolean(spec.custom),
    unitAmount: money(spec.unit(party, fees)),
    minQty: spec.minQty?.(party, fees) ?? 1,
  }));
}

export function priceQuoteLines(rows: QuoteLineInput[], party: Party, fees: FeeScheduleRates) {
  const lines = [];
  for (const raw of rows) {
    const spec = RATES.find((item) => item.key === raw.key);
    if (!spec) continue;
    let qty = money(n(raw.qty, 1));
    const min = spec.minQty?.(party, fees) ?? 0;
    if (min > 0 && qty < min) qty = min;
    if (qty <= 0) continue;
    const scheduled = spec.unit(party, fees);
    const typed = raw.unitAmount;
    const unit =
      typed != null && typed !== "" && Number.isFinite(Number(typed)) ? n(typed) : scheduled;
    const description = spec.custom
      ? String(raw.description || "").trim() || spec.label
      : spec.label;
    if (spec.key === "custom" && !String(raw.description || "").trim()) {
      throw new Error("Custom lines need a description");
    }
    const billingType =
      spec.key === "custom" && BILLING_TYPES.has(raw.billingType as QuoteBillingType)
        ? (raw.billingType as QuoteBillingType)
        : spec.billingType;
    lines.push({
      rateKey: spec.key,
      billingType,
      invoiceType: spec.invoiceType,
      description,
      qty,
      unitAmount: money(unit),
      amount: money(qty * unit),
    });
  }
  if (lines.length === 0) throw new Error("Add at least one line");
  return {
    lines,
    total: money(lines.reduce((sum, line) => sum + line.amount, 0)),
  };
}

function esc(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function usd(value: number) {
  return n(value).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

export function renderQuoteHtml(opts: {
  companyName: string;
  address?: string;
  city?: string;
  number: string;
  preparedFor: string;
  email?: string;
  notes?: string;
  validUntil?: Date | null;
  lines: Array<{ description: string; billingType: string; qty: number; unitAmount: number; amount: number }>;
  total: number;
}) {
  const when = new Date().toLocaleDateString("en-US", { timeZone: "America/Phoenix" });
  const until = opts.validUntil
    ? new Date(opts.validUntil).toLocaleDateString("en-US", { timeZone: "America/Phoenix" })
    : "";
  const rows = opts.lines
    .map(
      (line) => `<tr>
        <td>${esc(line.description)}</td>
        <td>${esc(line.billingType)}</td>
        <td style="text-align:right">${line.qty}</td>
        <td style="text-align:right">${usd(line.unitAmount)}</td>
        <td style="text-align:right">${usd(line.amount)}</td>
      </tr>`
    )
    .join("");
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Estimate ${esc(opts.number)}</title>
  <style>
    body { font-family: Georgia, serif; color: #0b1f33; margin: 32px; }
    h1 { font-size: 22px; margin: 0 0 4px; }
    .muted { color: #5c6b7a; font-size: 13px; }
    table { width: 100%; border-collapse: collapse; margin-top: 20px; }
    th, td { border-bottom: 1px solid #e4e0d6; padding: 8px 6px; font-size: 14px; text-align: left; }
    th { font-size: 12px; letter-spacing: 0.04em; text-transform: uppercase; color: #5c6b7a; }
    .total { text-align: right; font-size: 18px; margin-top: 12px; }
    .note { margin-top: 24px; font-size: 13px; color: #5c6b7a; }
  </style>
</head>
<body>
  <h1>${esc(opts.companyName)}</h1>
  <div class="muted">${esc([opts.address, opts.city].filter(Boolean).join(" · "))}</div>
  <p><strong>Estimate ${esc(opts.number)}</strong><br/>
  <span class="muted">${when}${until ? ` · Valid until ${esc(until)}` : ""}</span></p>
  <p>Prepared for <strong>${esc(opts.preparedFor)}</strong>${
    opts.email ? `<br/><span class="muted">${esc(opts.email)}</span>` : ""
  }</p>
  <table>
    <thead><tr><th>Description</th><th>Type</th><th style="text-align:right">Qty</th><th style="text-align:right">Rate</th><th style="text-align:right">Amount</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <p class="total">Total ${usd(opts.total)}</p>
  ${opts.notes ? `<p>${esc(opts.notes)}</p>` : ""}
  <p class="note">This is an estimate, not an invoice. It is not posted to QuickBooks. Rates follow the current fee schedule unless a line was priced by hand. Contract, cross-dock, and rework can appear on the same estimate.</p>
</body>
</html>`;
}

export function renderQuoteText(opts: {
  number: string;
  preparedFor: string;
  lines: Array<{ description: string; qty: number; amount: number }>;
  total: number;
  notes?: string;
}) {
  const lines = opts.lines.map((line) => `${line.description} × ${line.qty} = ${usd(line.amount)}`);
  return [
    `Estimate ${opts.number}`,
    `Prepared for ${opts.preparedFor}`,
    "",
    ...lines,
    "",
    `Total ${usd(opts.total)}`,
    opts.notes || "",
    "",
    "This is an estimate, not an invoice.",
  ]
    .filter((line) => line !== undefined)
    .join("\n");
}
