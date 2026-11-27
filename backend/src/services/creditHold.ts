import { Accessorial } from "../models/Accessorial";
import { Booking } from "../models/Booking";
import { Customer } from "../models/Customer";
import { Invoice } from "../models/Invoice";
import { Pallet } from "../models/Pallet";
import { ACTIVE_PALLET_STATUSES } from "../constants/palletStatus";
import { env } from "../config/env";
import { sendCreditLimitAlertEmail, sendFreightHoldAlertEmail } from "./mail";
import { customerHasLienHold } from "./bolWorkflow";
import { loadCompanyFees, isContractCustomer } from "./customerFees";

function owed(row: { balanceDue?: number | null; total?: number | null }) {
  if (row.balanceDue == null) return Number(row.total) || 0;
  return Number(row.balanceDue) || 0;
}

/** Storage earned but not yet on an invoice (Cesar: include in net credit exposure). */
export async function estimateStorageExposure(companyId: string, customerId: string) {
  const customer = await Customer.findOne({ _id: customerId, companyId }).select("billingMethod contractNoDwellInside");
  const fees = await loadCompanyFees(companyId);
  const perMonth = Number(fees.floorStoragePerPalletMo) || 20;
  const perDay = perMonth / 30;
  const freeHours = Number(fees.crossDockFreeDwellHours) || 48;
  const afterDwellDay = Number(fees.afterFreeDwellPerPalletDay) || 10;
  const contractInside = isContractCustomer(customer) && customer?.contractNoDwellInside;

  const pallets = await Pallet.find({
    companyId,
    customerId,
    status: { $in: ACTIVE_PALLET_STATUSES },
    receiptKind: { $ne: "parcel" },
  })
    .select("receivedAt")
    .lean();

  const now = Date.now();
  let total = 0;
  for (const p of pallets) {
    if (contractInside) continue;
    const started = p.receivedAt ? new Date(p.receivedAt).getTime() : now;
    const hours = (now - started) / 3600000;
    if (hours <= freeHours) continue;
    const billDays = Math.max(1, Math.ceil((hours - freeHours) / 24));
    total += billDays * (billDays <= 2 ? afterDwellDay : perDay);
  }
  return Math.round(total * 100) / 100;
}

export async function customerCreditExposure(companyId: string, customerId: string) {
  const open = await Invoice.find({
    companyId,
    customerId,
    status: { $nin: ["paid", "void", "draft"] },
  })
    .select("balanceDue total")
    .lean();
  const invoiceTotal = open.reduce((s, i) => s + owed(i), 0);
  const unbilled = await Accessorial.find({ companyId, customerId, invoiceId: null }).select("amount").lean();
  const unbilledTotal = unbilled.reduce((s, a) => s + (Number(a.amount) || 0), 0);
  const storageEst = await estimateStorageExposure(companyId, customerId);
  const raw = invoiceTotal + unbilledTotal + storageEst;
  return Math.round(raw * 100) / 100;
}

async function oneOffBalanceDue(companyId: string, customerId: string) {
  const exposure = await customerCreditExposure(companyId, customerId);
  const bookings = await Booking.find({
    companyId,
    customerId,
    status: "confirmed",
    depositPaid: true,
  })
    .select("totalAmount depositAmount")
    .lean();
  let bookingDue = 0;
  for (const b of bookings) {
    const total = Number(b.totalAmount) || 0;
    const dep = Number(b.depositAmount) || 0;
    if (total > dep + 0.01) bookingDue += total - dep;
  }
  return Math.round((exposure + bookingDue) * 100) / 100;
}

function onNetTerms(path: string | null | undefined, limit: number) {
  return (path === "path_a" || path === "path_b") && limit > 0;
}

async function maybeCredit80Email(
  companyId: string,
  customer: { _id: unknown; name?: string },
  pct: number,
  exposure: number,
  limit: number
) {
  const doc = await Customer.findOne({ _id: customer._id, companyId });
  if (!doc) return;
  if (pct < 0.8) {
    if (doc.creditAlert80SentAt) {
      doc.creditAlert80SentAt = null;
      await doc.save();
    }
    return;
  }
  if (pct >= 1) return;
  const sent = doc.creditAlert80SentAt ? new Date(doc.creditAlert80SentAt).getTime() : 0;
  const weekMs = 7 * 24 * 60 * 60 * 1000;
  if (sent && Date.now() - sent < weekMs) return;
  doc.creditAlert80SentAt = new Date();
  await doc.save();
  void sendCreditLimitAlertEmail({ customerName: doc.name, exposure, limit, pct }).catch(() => undefined);
}

async function maybeFreightHoldEmail(
  companyId: string,
  customerId: string,
  opts: {
    pastDueHold: boolean;
    creditHold: boolean;
    message: string;
    codes: string[];
    customerName?: string;
  }
) {
  const freightHold = opts.pastDueHold || opts.creditHold;
  const doc = await Customer.findOne({ _id: customerId, companyId });
  if (!doc) return;
  if (!freightHold) {
    if (doc.freightHoldAlertSentAt) {
      doc.freightHoldAlertSentAt = null;
      await doc.save();
    }
    return;
  }
  const sent = doc.freightHoldAlertSentAt ? new Date(doc.freightHoldAlertSentAt).getTime() : 0;
  const weekMs = 7 * 24 * 60 * 60 * 1000;
  if (sent && Date.now() - sent < weekMs) return;
  doc.freightHoldAlertSentAt = new Date();
  await doc.save();
  const reason = opts.creditHold
    ? "Credit limit reached (100%)"
    : "Past due balance";
  void sendFreightHoldAlertEmail({
    customerName: doc.name || opts.customerName || "Customer",
    reason,
    message: opts.message,
    codes: opts.codes.filter((c) => c === "PAST_DUE" || c === "CREDIT_LIMIT"),
  }).catch(() => undefined);
}

async function hasPendingSettlement(companyId: string, customerId: string) {
  const n = await Invoice.countDocuments({
    companyId,
    customerId,
    paymentSettlement: "pending",
    status: { $nin: ["paid", "void"] },
  });
  return n > 0;
}

export function resolveHoldOverride(
  hold: { hold: boolean; codes: string[] },
  opts: { lienOverride?: boolean; lienOverrideReason?: string; email?: string }
) {
  if (!hold.hold) return { ok: true as const, note: "" };
  if (opts.lienOverride !== true) return { ok: false as const, error: "" };
  const reason = String(opts.lienOverrideReason || "").trim();
  if (!reason) {
    return { ok: false as const, error: "A reason is required to override this hold." };
  }
  if (!holdOverrideAllowed(opts.email)) {
    return { ok: false as const, error: "Only authorized management can override a freight hold." };
  }
  return { ok: true as const, reason };
}

export function holdOverrideAllowed(email: string | undefined | null) {
  const e = String(email || "").trim().toLowerCase();
  if (!e) return false;
  return env.holdOverrideEmails.some((row) => row === e);
}

export async function customerOutboundHold(companyId: string, customerId: string) {
  const customer = await Customer.findOne({ _id: customerId, companyId })
    .select("name creditPath creditLimit")
    .lean();
  const pastDue = await customerHasLienHold(companyId, customerId);
  const limit = Number(customer?.creditLimit) || 0;
  const path = customer?.creditPath || "none";
  const exposure = await customerCreditExposure(companyId, customerId);
  const storageEst = await estimateStorageExposure(companyId, customerId);

  let creditHold = false;
  let creditPct = 0;
  if (onNetTerms(path, limit)) {
    creditPct = limit > 0 ? exposure / limit : 0;
    creditHold = exposure >= limit;
    if (customer) void maybeCredit80Email(companyId, customer, creditPct, exposure, limit);
  }

  const oneOff = path === "none" || !onNetTerms(path, limit);
  const prepayBalance = oneOff ? await oneOffBalanceDue(companyId, customerId) : 0;
  const prepayHold = oneOff && prepayBalance > 0.01;
  const pendingPay = await hasPendingSettlement(companyId, customerId);

  const hold = pastDue.hold || creditHold || prepayHold || pendingPay;
  const codes: string[] = [];
  if (pastDue.hold) codes.push("PAST_DUE");
  if (creditHold) codes.push("CREDIT_LIMIT");
  if (prepayHold) codes.push("PREPAY_BALANCE");
  if (pendingPay) codes.push("PAYMENT_PENDING");

  let message = "";
  if (creditHold) {
    message = `Credit limit ($${limit.toFixed(2)}) — exposure $${exposure.toFixed(2)}. Pay down balance before outbound release.`;
  } else if (pendingPay) {
    message = "A payment is pending settlement (e.g. ACH) — release when funds have cleared.";
  } else if (prepayHold) {
    message = `Prepay balance $${prepayBalance.toFixed(2)} still due before release.`;
  } else if (pastDue.hold) {
    message = `Account past due ($${pastDue.balanceDue.toFixed(2)}).`;
  }

  if (customer) {
    void maybeFreightHoldEmail(companyId, customerId, {
      pastDueHold: pastDue.hold,
      creditHold,
      message,
      codes,
      customerName: customer.name,
    });
  }

  return {
    hold,
    codes,
    code: codes[0] || "",
    message,
    balanceDue: pastDue.balanceDue,
    pastDue,
    exposure,
    storageEstimate: storageEst,
    creditLimit: limit,
    creditPct: Math.round(creditPct * 1000) / 10,
    prepayBalance,
    creditPath: path,
    portalWarning:
      onNetTerms(path, limit) && creditPct >= 80 && !creditHold
        ? `Credit use is at ${Math.round(creditPct * 100)}% of your limit ($${exposure.toFixed(2)} of $${limit.toFixed(2)}).`
        : "",
  };
}

/** Bill storage on outbound ship for pallets leaving (Cesar: capture before release). */
export async function postStorageAccessorialsOnShip(opts: {
  companyId: string;
  customerId: string;
  shipmentId: string;
  pallets: Array<{ _id: unknown; externalId?: string; receivedAt?: Date | null; receiptKind?: string }>;
}) {
  const fees = await loadCompanyFees(opts.companyId);
  const customer = await Customer.findOne({ _id: opts.customerId, companyId: opts.companyId }).select(
    "contractNoDwellInside billingMethod"
  );
  const freeHours = Number(fees.crossDockFreeDwellHours) || 48;
  const afterDwellDay = Number(fees.afterFreeDwellPerPalletDay) || 10;
  const perMonth = Number(fees.floorStoragePerPalletMo) || 20;
  const perDay = perMonth / 30;
  const contractInside = isContractCustomer(customer) && customer?.contractNoDwellInside;
  if (contractInside) return;

  const now = Date.now();
  let total = 0;
  const ids: string[] = [];
  for (const p of opts.pallets) {
    if (p.receiptKind === "parcel") continue;
    const started = p.receivedAt ? new Date(p.receivedAt).getTime() : now;
    const hours = (now - started) / 3600000;
    if (hours <= freeHours) continue;
    const billDays = Math.max(1, Math.ceil((hours - freeHours) / 24));
    const amt = billDays * (billDays <= 2 ? afterDwellDay : perDay);
    total += amt;
    if (p.externalId) ids.push(p.externalId);
  }
  total = Math.round(total * 100) / 100;
  if (!(total > 0)) return;
  await Accessorial.create({
    companyId: opts.companyId,
    customerId: opts.customerId,
    shipmentId: opts.shipmentId,
    type: "storage",
    description: `Storage at release — ${ids.length || opts.pallets.length} pallet(s)${ids.length ? ` (${ids.slice(0, 5).join(", ")}${ids.length > 5 ? "…" : ""})` : ""}`,
    amount: total,
    date: new Date(),
  });
}