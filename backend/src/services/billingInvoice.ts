import { Invoice } from "../models/Invoice";
import { Accessorial } from "../models/Accessorial";
import { Customer } from "../models/Customer";
import { Company } from "../models/Company";
import { env } from "../config/env";
import { pushInvoiceToQuickBooks, requireCustomerEmail } from "./quickbooks";
import {
  crossdockPerPallet,
  isContractCustomer,
  loadPerPallet,
  resolveCompanyFees,
  unloadPerPallet,
} from "./customerFees";
import { Shipment } from "../models/Shipment";

export type InvoiceLineInput = {
  description: string;
  qty?: number;
  unitAmount: number;
  amount: number;
  type?:
    | "base_rent"
    | "handling"
    | "ftl"
    | "storage"
    | "crossdock"
    | "dwell"
    | "accessorial"
    | "other";
  palletId?: string | null;
  shipmentId?: string | null;
};

async function nextInvoiceNumber(companyId: string) {
  // Prefer max existing INV-##### + 1 so gaps/deletes don't collide as often as count+1
  const latest = await Invoice.find({ companyId, number: /^INV-\d+$/ })
    .sort({ number: -1 })
    .limit(1)
    .select("number")
    .lean();
  const n = latest[0]?.number ? Number(String(latest[0].number).replace(/\D/g, "")) : 0;
  const next = (Number.isFinite(n) ? n : 0) + 1;
  return `INV-${String(next).padStart(5, "0")}`;
}

async function pushExisting(invoice: InstanceType<typeof Invoice>) {
  if (invoice.quickbooksId) {
    return {
      invoiceId: String(invoice._id),
      quickbooksId: invoice.quickbooksId,
      pushed: false,
      skipped: "already_pushed" as const,
    };
  }
  return pushInvoiceToQuickBooks(String(invoice._id));
}

/**
 * Create a local WMS invoice (idempotent on wmsJobKey) and push to QuickBooks.
 * Guarantees: customer linked, line items, correct due date, no duplicate QB invoice.
 */
export async function createAndPushInvoice(opts: {
  companyId: string;
  customerId: string;
  wmsJobKey: string;
  sourceType: "yard_job" | "shipment" | "storage" | "manual";
  sourceId: string;
  lines: InvoiceLineInput[];
  periodStart: Date;
  periodEnd: Date;
  notes?: string;
  termsDays?: number;
  accessorialIds?: string[];
}) {
  const customer = await Customer.findOne({
    _id: opts.customerId,
    companyId: opts.companyId,
  });
  if (!customer) throw new Error("Customer not found");
  requireCustomerEmail(customer.email);

  /** Skip QBO when globally disabled or this is a test customer (Cesar audit). */
  const skipQb =
    !env.quickbooksPushEnabled || Boolean((customer as { testAccount?: boolean }).testAccount);

  const existing = await Invoice.findOne({
    companyId: opts.companyId,
    wmsJobKey: opts.wmsJobKey,
  });
  if (existing) {
    if (skipQb) {
      return {
        invoice: existing,
        push: {
          invoiceId: String(existing._id),
          quickbooksId: null,
          pushed: false,
          skipped: "test_or_push_disabled" as const,
        },
        created: false,
      };
    }
    const push = await pushExisting(existing);
    return { invoice: existing, push, created: false };
  }

  const lines = (opts.lines || []).filter((l) => Number(l.amount) > 0);
  if (lines.length === 0) {
    return { invoice: null, push: null, created: false, skipped: "no_charge" as const };
  }

  const total = Math.round(lines.reduce((s, l) => s + Number(l.amount), 0) * 100) / 100;
  const termsDays = opts.termsDays ?? 30;
  // termsDays 0 = due same day as the job/invoice date (crossdock & rework)
  const dueDate = new Date(opts.periodEnd.getTime() + Math.max(0, termsDays) * 24 * 60 * 60 * 1000);

  let invoice: InstanceType<typeof Invoice>;
  try {
    let number = await nextInvoiceNumber(opts.companyId);
    // Rare race: if number taken, bump once
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        invoice = await Invoice.create({
          companyId: opts.companyId,
          customerId: opts.customerId,
          number,
          periodStart: opts.periodStart,
          periodEnd: opts.periodEnd,
          status: "draft",
          lines: lines.map((l) => ({
            description: l.description,
            qty: l.qty ?? 1,
            unitAmount: l.unitAmount,
            amount: l.amount,
            type: l.type || "other",
            palletId: l.palletId || null,
            shipmentId: l.shipmentId || null,
          })),
          subtotal: total,
          total,
          balanceDue: total,
          dueDate,
          termsDays,
          notes: [
            opts.notes || "",
            skipQb ? "TEST / not pushed to QuickBooks" : "",
          ]
            .filter(Boolean)
            .join(" · "),
          wmsJobKey: opts.wmsJobKey,
          sourceType: opts.sourceType,
          sourceId: opts.sourceId,
        });
        break;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (/duplicate key|E11000/i.test(msg) && /number/i.test(msg)) {
          number = `INV-${String(Number(number.replace(/\D/g, "")) + 1).padStart(5, "0")}`;
          continue;
        }
        throw err;
      }
    }
    if (!invoice!) {
      throw new Error("Could not allocate a unique invoice number");
    }
  } catch (err) {
    // Concurrent create with same wmsJobKey — return the winner and push if needed
    const msg = err instanceof Error ? err.message : String(err);
    if (/duplicate key|E11000/i.test(msg)) {
      const raced = await Invoice.findOne({
        companyId: opts.companyId,
        wmsJobKey: opts.wmsJobKey,
      });
      if (raced) {
        const push = await pushExisting(raced);
        return { invoice: raced, push, created: false };
      }
    }
    throw err;
  }

  if (opts.accessorialIds?.length) {
    await Accessorial.updateMany(
      { _id: { $in: opts.accessorialIds }, companyId: opts.companyId },
      { $set: { invoiceId: invoice._id } }
    );
  }

  if (skipQb) {
    // Keep as unpaid in WMS so portal/ops can still see balance; do not touch QBO
    invoice.status = "unpaid";
    invoice.quickbooksPushError = skipQb
      ? (customer as { testAccount?: boolean }).testAccount
        ? "Skipped: test customer (testAccount)"
        : "Skipped: QUICKBOOKS_PUSH_ENABLED=false"
      : "";
    await invoice.save();
    return {
      invoice,
      push: {
        invoiceId: String(invoice._id),
        quickbooksId: null,
        pushed: false,
        skipped: "test_or_push_disabled" as const,
      },
      created: true,
    };
  }

  const push = await pushInvoiceToQuickBooks(String(invoice._id));
  if (push.pushed && push.quickbooksId) {
    // Open balance before due date → unpaid (not "sent")
    invoice.status = "unpaid";
    await invoice.save();
  }

  return { invoice, push, created: true };
}

/**
 * Cesar: invoice unload/handling when inbound receive completes (no inbound BOL).
 * Uses open accessorials from receive, or builds fee-schedule / customer unload rate lines.
 */
export async function invoiceInboundShipment(opts: {
  companyId: string;
  customerId: string;
  shipmentId: string;
  palletCount: number;
  carrier?: string;
  completedAt?: Date;
}) {
  const customer = await Customer.findOne({
    _id: opts.customerId,
    companyId: opts.companyId,
  });
  if (!customer) return { invoice: null, push: null, created: false, skipped: "no_customer" as const };

  const company = await Company.findById(opts.companyId);
  const fees = resolveCompanyFees(company);
  const when = opts.completedAt || new Date();
  const lines: InvoiceLineInput[] = [];
  const accessorialIds: string[] = [];

  const openAcc = await Accessorial.find({
    companyId: opts.companyId,
    shipmentId: opts.shipmentId,
    invoiceId: null,
  });
  for (const a of openAcc) {
    lines.push({
      description: a.description,
      qty: 1,
      unitAmount: a.amount,
      amount: a.amount,
      type: (["handling", "ftl", "crossdock", "dwell", "storage", "accessorial"].includes(a.type)
        ? a.type
        : "accessorial") as InvoiceLineInput["type"],
      shipmentId: opts.shipmentId,
      palletId: a.palletId ? String(a.palletId) : null,
    });
    accessorialIds.push(String(a._id));
  }

  // If receive didn't post accessorials (legacy), build from schedule / service type
  if (lines.length === 0 && !isContractCustomer(customer)) {
    const shipment = await Shipment.findById(opts.shipmentId).select("serviceType").lean();
    const service = String(shipment?.serviceType || "drop_and_store");
    const isXd = service === "crossdock";
    const per = isXd
      ? crossdockPerPallet(customer as { crossdockPerPallet?: number | null }, fees)
      : unloadPerPallet(customer, fees);
    const qty = Math.max(1, opts.palletCount);
    let amount = Math.round(per * qty * 100) / 100;
    if (!isXd) {
      amount = Math.max(Number(fees.unloadLoadMinimum ?? 125), amount);
    }
    lines.push({
      description: `${isXd ? "Cross-dock" : "Inbound unload / handling"} — ${qty} pallet(s)${
        opts.carrier ? ` · ${opts.carrier}` : ""
      }`,
      qty,
      unitAmount: per,
      amount,
      type: isXd ? "crossdock" : "handling",
      shipmentId: opts.shipmentId,
    });
  }

  return createAndPushInvoice({
    companyId: opts.companyId,
    customerId: opts.customerId,
    // Cesar: no inbound BOL — key stays stable if a legacy inbound BOL close retries
    wmsJobKey: `inbound:${opts.shipmentId}`,
    sourceType: "shipment",
    sourceId: opts.shipmentId,
    lines,
    periodStart: when,
    periodEnd: when,
    notes: `Inbound receive · shipment ${opts.shipmentId}`,
    termsDays: 30,
    accessorialIds,
  });
}

/** Outbound ship invoice — Cesar: if something is leaving, they need to pay (SBA exception). */
export async function invoiceOutboundShipment(opts: {
  companyId: string;
  customerId: string;
  shipmentId: string;
  palletCount: number;
  carrier?: string;
  billAsFtl?: boolean;
  completedAt?: Date;
}) {
  const customer = await Customer.findOne({
    _id: opts.customerId,
    companyId: opts.companyId,
  });
  if (!customer) return { invoice: null, push: null, created: false, skipped: "no_customer" as const };

  const company = await Company.findById(opts.companyId);
  const fees = resolveCompanyFees(company);
  const when = opts.completedAt || new Date();
  const lines: InvoiceLineInput[] = [];
  const accessorialIds: string[] = [];

  // Unbilled accessorials already posted against this shipment (e.g. FTL)
  const openAcc = await Accessorial.find({
    companyId: opts.companyId,
    shipmentId: opts.shipmentId,
    invoiceId: null,
  });
  for (const a of openAcc) {
    lines.push({
      description: a.description,
      qty: 1,
      unitAmount: a.amount,
      amount: a.amount,
      type: (["handling", "ftl", "crossdock", "dwell", "storage", "accessorial"].includes(a.type)
        ? a.type
        : "accessorial") as InvoiceLineInput["type"],
      shipmentId: opts.shipmentId,
    });
    accessorialIds.push(String(a._id));
  }

  const isContract = isContractCustomer(customer);
  // Contract: IN+OUT handling already on inbound — only extra FTL / accessorials
  if (!isContract) {
    const shipment = await Shipment.findById(opts.shipmentId).select("serviceType").lean();
    const service = String(shipment?.serviceType || "drop_and_store");
    const isXd = service === "crossdock";
    const per = isXd
      ? crossdockPerPallet(customer as { crossdockPerPallet?: number | null }, fees)
      : loadPerPallet(customer, fees);
    const qty = Math.max(1, opts.palletCount);
    let amount = Math.round(per * qty * 100) / 100;
    if (!isXd) {
      amount = Math.max(Number(fees.unloadLoadMinimum ?? 125), amount);
    }
    lines.push({
      description: `Outbound load / handling — ${qty} pallet(s)${
        opts.carrier ? ` · ${opts.carrier}` : ""
      }`,
      qty,
      unitAmount: per,
      amount,
      type: isXd ? "crossdock" : "handling",
      shipmentId: opts.shipmentId,
    });
  } else if (opts.billAsFtl && customer.contractFtlRate && openAcc.length === 0) {
    lines.push({
      description: `FTL outbound handling — ${opts.carrier || "load"}`,
      qty: 1,
      unitAmount: customer.contractFtlRate,
      amount: customer.contractFtlRate,
      type: "ftl",
      shipmentId: opts.shipmentId,
    });
  }

  return createAndPushInvoice({
    companyId: opts.companyId,
    customerId: opts.customerId,
    wmsJobKey: `ship:${opts.shipmentId}`,
    sourceType: "shipment",
    sourceId: opts.shipmentId,
    lines,
    periodStart: when,
    periodEnd: when,
    notes: `Outbound shipment ${opts.shipmentId}`,
    termsDays: 30,
    accessorialIds,
  });
}
