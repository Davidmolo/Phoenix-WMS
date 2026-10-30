import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { env } from "../config/env";
import { chargePaymentToken, nmiReady } from "../services/nmi";
import { Invoice } from "../models/Invoice";
import { Booking } from "../models/Booking";
import { Customer } from "../models/Customer";
import { Warehouse } from "../models/Warehouse";
import { Request as WhRequest } from "../models/Request";
import { getServiceType } from "../constants/booking";
import {
  assertSlotOpen,
  buildDaySlots,
  durationForService,
  loadDayBookings,
  toDateKey,
} from "../services/bookingAvailability";
import { crossdockPerPallet, loadCompanyFees } from "../services/customerFees";
import { sendBookingNotifyEmail } from "../services/mail";
import { updateInvoiceInQuickBooks, recordPartialPayment } from "../services/quickbooks";
import { createAndPushInvoice } from "../services/billingInvoice";

const router = Router();
router.use(requireAuth);

function money(n: number) {
  return Math.round(n * 100) / 100;
}

async function quoteBooking(companyId: string, customerId: string | null, serviceType: string, palletCount: number) {
  const svc = getServiceType(serviceType);
  if (!svc) return null;
  const fees = await loadCompanyFees(companyId);
  const customer = customerId
    ? await Customer.findOne({ _id: customerId, companyId }).select("billingMethod crossdockPerPallet name")
    : null;
  const pallets = Math.max(1, Math.floor(Number(palletCount) || 1));
  let total = Number(fees.crossDockMinimum) || 150;
  if (serviceType === "crossdock") {
    const per = crossdockPerPallet(customer, fees);
    total = Math.max(Number(fees.crossDockMinimum) || 0, money(per * pallets));
  } else if (serviceType === "trailer_rework") {
    total = money(Number(fees.trailerReworkMinimumHours || 1) * Number(fees.sortRelabelPerHour || 65));
  } else if (serviceType === "drop_and_store" || serviceType === "pickup") {
    total = Math.max(Number(fees.unloadLoadMinimum) || 0, money(Number(fees.unloadLoadPerPallet || 14) * pallets));
  }
  const contract = customer?.billingMethod === "contract";
  const dueNow = contract ? 0 : money(total / 2);
  return {
    serviceLabel: svc.label,
    total: money(total),
    dueNow,
    balanceLater: money(total - dueNow),
    depositRequired: dueNow > 0,
    palletCount: pallets,
  };
}

router.get("/config", (_req, res) => {
  res.json({
    ready: nmiReady(),
    tokenizationKey: env.nmiTokenizationKey || "",
    sandbox: env.nmiApiBase.includes("sandbox"),
  });
});

router.get("/booking-quote", async (req, res, next) => {
  try {
    const customerId = req.auth!.role === "customer" ? req.auth!.customerId || null : null;
    const quote = await quoteBooking(
      req.auth!.companyId,
      customerId,
      String(req.query.serviceType || ""),
      Number(req.query.palletCount || 1)
    );
    if (!quote) {
      res.status(400).json({ error: "Unknown service type" });
      return;
    }
    res.json(quote);
  } catch (err) {
    next(err);
  }
});

router.post("/booking", async (req, res, next) => {
  try {
    if (req.auth!.role !== "customer" || !req.auth!.customerId) {
      res.status(403).json({ error: "Portal customers pay the deposit here. Staff bookings do not." });
      return;
    }
    const companyId = req.auth!.companyId;
    const customerId = req.auth!.customerId;
    const serviceType = String(req.body.serviceType || "");
    const svc = getServiceType(serviceType);
    if (!svc) {
      res.status(400).json({ error: "serviceType required" });
      return;
    }
    const quote = await quoteBooking(
      companyId,
      customerId,
      serviceType,
      Number(req.body.freight?.palletCount) || 1
    );
    if (!quote) {
      res.status(400).json({ error: "Unknown service type" });
      return;
    }
    const token = String(req.body.paymentToken || "");
    if (quote.depositRequired && !token) {
      res.status(402).json({ error: "Pay half before this booking is confirmed.", ...quote });
      return;
    }

    const startsAt = new Date(req.body.startsAt);
    if (Number.isNaN(startsAt.getTime())) {
      res.status(400).json({ error: "startsAt required" });
      return;
    }
    const dateKey = toDateKey(startsAt);
    const warehouse = await Warehouse.findOne({ companyId, active: true }).sort({ name: 1 });
    const dayBookings = await loadDayBookings(companyId, dateKey, warehouse?._id?.toString());
    const slots = buildDaySlots(dateKey, serviceType, dayBookings);
    const check = assertSlotOpen(slots, startsAt.toISOString());
    if (!check.ok) {
      res.status(409).json({ error: check.error });
      return;
    }

    let charged: { transactionId: string; amount: number } | null = null;
    if (quote.depositRequired) {
      charged = await chargePaymentToken(quote.dueNow, token);
    }

    const customer = await Customer.findOne({ _id: customerId, companyId });
    const companyName = customer?.name || String(req.body.companyName || "");
    const contactName = customer?.contact || String(req.body.contactName || "");
    const phone = customer?.phone || String(req.body.phone || "");
    const email = customer?.email || String(req.body.email || "");
    const durationMinutes = durationForService(serviceType);
    const endsAt = new Date(startsAt.getTime() + durationMinutes * 60_000);
    const depositNote = charged
      ? `Deposit $${charged.amount.toFixed(2)} paid. Balance $${quote.balanceLater.toFixed(2)}. NMI ${charged.transactionId}`
      : "";

    let requestDoc;
    let booking;
    try {
    requestDoc = await WhRequest.create({
      companyId,
      customerId,
      warehouseId: warehouse?._id || null,
      type: "Inbound",
      status: "pending",
      qty: quote.palletCount,
      palletCount: quote.palletCount,
      notes: [`Booking ${svc.label} · ${check.slot.label}`, depositNote, req.body.notes || null]
        .filter(Boolean)
        .join(" · "),
      dateRequested: new Date(),
      scheduledDate: startsAt,
    });

    booking = await Booking.create({
      companyId,
      warehouseId: warehouse?._id || null,
      customerId,
      requestId: requestDoc._id,
      serviceType,
      startsAt,
      endsAt,
      durationMinutes,
      status: "confirmed",
      source: "portal",
      companyName,
      contactName,
      phone,
      email,
      notes: [req.body.notes || "", depositNote].filter(Boolean).join("\n"),
      totalAmount: quote.total,
      depositAmount: charged?.amount || 0,
      depositPaid: Boolean(charged),
      nmiTransactionId: charged?.transactionId || "",
      freight: {
        trailerNumber: req.body.freight?.trailerNumber || "",
        palletCount: quote.palletCount,
        weightLbs: req.body.freight?.weightLbs ?? null,
        details: req.body.freight?.details || "",
      },
    });
    } catch (saveErr) {
      const paid = charged ? ` Payment ${charged.transactionId} for $${charged.amount.toFixed(2)} went through.` : "";
      throw new Error(
        `The booking was not saved.${paid} ${saveErr instanceof Error ? saveErr.message : ""}`.trim()
      );
    }
    if (!booking) throw new Error("The booking was not saved.");

    if (charged) {
      try {
        const billed = await createAndPushInvoice({
          companyId,
          customerId,
          wmsJobKey: `booking:${String(booking._id)}`,
          sourceType: "manual",
          sourceId: String(booking._id),
          lines: [
            {
              description: `${svc.label} · ${check.slot.label}`,
              qty: 1,
              unitAmount: quote.total,
              amount: quote.total,
              type: "crossdock",
            },
          ],
          periodStart: startsAt,
          periodEnd: startsAt,
          termsDays: 0,
          notes: depositNote,
        });
        if (billed.invoice) {
          await recordPartialPayment(
            String(billed.invoice._id),
            charged.amount,
            `Deposit paid ${charged.transactionId}. Balance $${quote.balanceLater.toFixed(2)} still due.`
          );
          booking.notes = [booking.notes, `Invoice ${billed.invoice.number}`].filter(Boolean).join("\n");
          await booking.save();
        }
      } catch (syncErr) {
        console.error("[payments] deposit sync", syncErr instanceof Error ? syncErr.message : syncErr);
        booking.notes = [
          booking.notes,
          `Deposit recorded in WMS. QuickBooks sync failed: ${syncErr instanceof Error ? syncErr.message : "unknown"}`,
        ]
          .filter(Boolean)
          .join("\n");
        await booking.save();
      }
    }

    void sendBookingNotifyEmail({
      bookingId: String(booking._id),
      source: "portal",
      serviceLabel: svc.label,
      startsAt,
      endsAt,
      companyName,
      contactName,
      phone,
      email,
      notes: booking.notes,
      palletCount: quote.palletCount,
      trailerNumber: booking.freight?.trailerNumber || "",
      slotLabel: check.slot?.label,
    }).catch(() => undefined);

    res.status(201).json({ booking, quote, transactionId: charged?.transactionId || "" });
  } catch (err) {
    next(err);
  }
});

router.post("/invoices", async (req, res, next) => {
  try {
    const ids = Array.isArray(req.body.invoiceIds) ? req.body.invoiceIds.map(String).filter(Boolean) : [];
    const token = String(req.body.paymentToken || "");
    if (!ids.length || !token) {
      res.status(400).json({ error: "Choose at least one invoice and submit the payment." });
      return;
    }
    const filter: Record<string, unknown> = {
      _id: { $in: ids },
      companyId: req.auth!.companyId,
      status: { $in: ["sent", "unpaid", "past_due"] },
    };
    if (req.auth!.role === "customer") filter.customerId = req.auth!.customerId;
    const invoices = await Invoice.find(filter);
    if (invoices.length !== ids.length) {
      res.status(400).json({ error: "One or more invoices cannot be paid." });
      return;
    }
    const amount = money(
      invoices.reduce((sum, inv) => sum + Number(inv.balanceDue != null ? inv.balanceDue : inv.total), 0)
    );
    const charged = await chargePaymentToken(amount, token);
    const note = `Paid $${charged.amount.toFixed(2)} via NMI ${charged.transactionId}`;
    for (const invoice of invoices) {
      invoice.status = "paid";
      invoice.balanceDue = 0;
      invoice.notes = invoice.notes ? `${invoice.notes}\n${note}` : note;
      await invoice.save();
      if (invoice.quickbooksId) {
        void updateInvoiceInQuickBooks(String(invoice._id)).catch((err) =>
          console.error("[payments] quickbooks", err instanceof Error ? err.message : err)
        );
      }
    }
    res.json({
      ok: true,
      transactionId: charged.transactionId,
      amount: charged.amount,
      invoiceIds: invoices.map((inv) => String(inv._id)),
    });
  } catch (err) {
    next(err);
  }
});

export default router;
