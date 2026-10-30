import { Router } from "express";
import { Types } from "mongoose";
import { requireAuth, requireRole } from "../middleware/auth";
import { Company } from "../models/Company";
import { Warehouse } from "../models/Warehouse";
import { Invoice } from "../models/Invoice";
import { Customer } from "../models/Customer";
import { Pallet } from "../models/Pallet";
import { Accessorial } from "../models/Accessorial";
import { Shipment } from "../models/Shipment";
import { Lpn } from "../models/Lpn";
import { Location } from "../models/Location";
import { Request as WhRequest } from "../models/Request";
import { paginationMeta, parsePagination } from "../utils/pagination";
import { ACTIVE_PALLET_STATUSES } from "../constants/palletStatus";

const router = Router();

router.use(requireAuth);

router.get("/company", async (req, res, next) => {
  try {
    const company = await Company.findById(req.auth!.companyId);
    res.json({ company });
  } catch (err) {
    next(err);
  }
});

router.get("/warehouses", async (req, res, next) => {
  try {
    const warehouses = await Warehouse.find({
      companyId: req.auth!.companyId,
      active: true,
    }).sort({ name: 1 });
    res.json({ warehouses });
  } catch (err) {
    next(err);
  }
});

router.get("/dashboard", async (req, res, next) => {
  try {
    const companyId = req.auth!.companyId;
    const companyOid = new Types.ObjectId(companyId);
    const customerFilter =
      req.auth!.role === "customer" ? { customerId: req.auth!.customerId } : {};

    const activeStatus = { $in: [...ACTIVE_PALLET_STATUSES] };

    const [activePallets, pendingRequests, draftInvoices, customers, openCharges, locationsAvailable] =
      await Promise.all([
        Pallet.countDocuments({
          companyId,
          ...customerFilter,
          status: activeStatus,
        }),
        WhRequest.countDocuments({
          companyId,
          ...customerFilter,
          status: "pending",
        }),
        Invoice.countDocuments({ companyId, ...customerFilter, status: "draft" }),
        req.auth!.role === "customer"
          ? Promise.resolve(1)
          : Customer.countDocuments({ companyId, active: true }),
        Accessorial.countDocuments({ companyId, ...customerFilter, invoiceId: null }),
        req.auth!.role === "customer"
          ? Promise.resolve(0)
          : Location.countDocuments({ companyId, palletId: null }),
      ]);

    const warehouse = await Warehouse.findOne({ companyId, active: true }).sort({ name: 1 });
    const capacitySqft = Number(warehouse?.sqft) || 0;
    const match: Record<string, unknown> = {
      companyId: companyOid,
      status: activeStatus,
    };
    if (req.auth!.role === "customer" && req.auth!.customerId) {
      match.customerId = new Types.ObjectId(String(req.auth!.customerId));
    }
    const occupiedAgg = await Pallet.aggregate([
      { $match: match },
      { $group: { _id: null, occupiedSqft: { $sum: { $ifNull: ["$sqft", 16] } } } },
    ]);
    const occupiedSqft = Math.round((occupiedAgg[0]?.occupiedSqft ?? 0) * 100) / 100;
    const availableSqft = Math.max(0, Math.round((capacitySqft - occupiedSqft) * 100) / 100);

    const recentShipments = await Shipment.find({ companyId, ...customerFilter })
      .populate("customerId", "name")
      .sort({ createdAt: -1 })
      .limit(5);

    // Revenue: paid + sent invoices by period (MTD + prior calendar month)
    const now = new Date();
    const mtdStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const lastMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
    const lastMonthEnd = mtdStart;
    const invoiceMatch: Record<string, unknown> = {
      companyId: companyOid,
      status: { $in: ["paid", "sent", "past_due"] },
    };
    if (req.auth!.role === "customer" && req.auth!.customerId) {
      invoiceMatch.customerId = new Types.ObjectId(String(req.auth!.customerId));
    }
    const sumInvoices = async (from: Date, to?: Date) => {
      const match: Record<string, unknown> = {
        ...invoiceMatch,
        createdAt: to ? { $gte: from, $lt: to } : { $gte: from },
      };
      const agg = await Invoice.aggregate([
        { $match: match },
        { $group: { _id: null, total: { $sum: { $ifNull: ["$total", 0] } } } },
      ]);
      return Math.round((agg[0]?.total ?? 0) * 100) / 100;
    };
    const [revenueMtd, revenueLastMonth] = await Promise.all([
      sumInvoices(mtdStart),
      sumInvoices(lastMonthStart, lastMonthEnd),
    ]);

    res.json({
      kpis: {
        activePallets,
        pendingRequests,
        draftInvoices,
        customers,
        openCharges,
        locationsAvailable,
        capacitySqft,
        occupiedSqft,
        availableSqft,
        revenueMtd,
        revenueLastMonth,
      },
      recentShipments,
    });
  } catch (err) {
    next(err);
  }
});

router.get("/invoices", async (req, res, next) => {
  try {
    const filter: Record<string, unknown> = { companyId: req.auth!.companyId };
    if (req.auth!.role === "customer") {
      filter.customerId = req.auth!.customerId;
      filter.status = { $ne: "draft" };
    } else if (req.query.customerId) {
      filter.customerId = req.query.customerId;
    }

    const parseDay = (raw: string, endOfDay: boolean) => {
      // Parse YYYY-MM-DD as local calendar day (avoid UTC shift)
      const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw.trim());
      if (!m) return null;
      const y = Number(m[1]);
      const mo = Number(m[2]) - 1;
      const d = Number(m[3]);
      if (endOfDay) return new Date(y, mo, d, 23, 59, 59, 999);
      return new Date(y, mo, d, 0, 0, 0, 0);
    };

    const fromRaw =
      (typeof req.query.fromDate === "string" && req.query.fromDate) ||
      (typeof req.query.onDate === "string" && req.query.onDate) ||
      "";
    const toRaw =
      (typeof req.query.toDate === "string" && req.query.toDate) ||
      (typeof req.query.onDate === "string" && req.query.onDate) ||
      "";

    const andClauses: Record<string, unknown>[] = [];

    if (fromRaw || toRaw) {
      const start = parseDay(fromRaw || toRaw, false);
      const end = parseDay(toRaw || fromRaw, true);
      if (start && end) {
        const rangeStart = start <= end ? start : end;
        const rangeEnd = start <= end ? end : start;
        andClauses.push({
          $or: [
            { periodStart: { $lte: rangeEnd }, periodEnd: { $gte: rangeStart } },
            { createdAt: { $gte: rangeStart, $lte: rangeEnd } },
          ],
        });
      }
    }

    const qRaw = typeof req.query.q === "string" ? req.query.q.trim() : "";
    if (qRaw) {
      const escaped = qRaw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const nameMatches = await Customer.find({
        companyId: req.auth!.companyId,
        name: { $regex: escaped, $options: "i" },
      })
        .select("_id")
        .lean();
      andClauses.push({
        $or: [
          { number: { $regex: escaped, $options: "i" } },
          { notes: { $regex: escaped, $options: "i" } },
          { status: { $regex: `^${escaped}`, $options: "i" } },
          { customerId: { $in: nameMatches.map((c) => c._id) } },
        ],
      });
    }

    const phoenixDay = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Phoenix" });
    const phoenixToday = phoenixDay.format(new Date());
    const phoenixTodayStart = new Date(`${phoenixToday}T07:00:00.000Z`);

    const balance = String(req.query.balance || "");
    if (balance === "past_due") {
      andClauses.push({
        status: { $nin: ["paid", "void"] },
        $or: [{ status: "past_due" }, { dueDate: { $lt: phoenixTodayStart } }],
      });
    } else if (balance === "unpaid") {
      andClauses.push({
        status: { $in: ["draft", "sent", "unpaid"] },
        $or: [{ dueDate: null }, { dueDate: { $gte: phoenixTodayStart } }],
      });
    }

    if (andClauses.length === 1) {
      Object.assign(filter, andClauses[0]);
    } else if (andClauses.length > 1) {
      filter.$and = andClauses;
    }

    const { page, limit, skip } = parsePagination(req.query as Record<string, unknown>, {
      defaultLimit: 50,
      maxLimit: 200,
    });
    const [total, invoices] = await Promise.all([
      Invoice.countDocuments(filter),
      Invoice.find(filter)
        .populate("customerId", "name billingMethod")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
    ]);
    for (const invoice of invoices) {
      if (
        invoice.status === "past_due" &&
        invoice.dueDate &&
        phoenixDay.format(invoice.dueDate) >= phoenixToday
      ) {
        invoice.status = "unpaid";
      }
    }
    res.json({ invoices, ...paginationMeta(page, limit, total) });
  } catch (err) {
    next(err);
  }
});

router.get("/accessorials", requireRole("admin", "staff"), async (req, res, next) => {
  try {
    const filter: Record<string, unknown> = { companyId: req.auth!.companyId };
    if (req.query.customerId) filter.customerId = req.query.customerId;
    if (req.query.unbilled === "true") filter.invoiceId = null;
    const accessorials = await Accessorial.find(filter).sort({ date: -1 }).limit(200);
    res.json({ accessorials });
  } catch (err) {
    next(err);
  }
});

router.get("/stats/overview", requireRole("admin", "staff"), async (req, res, next) => {
  try {
    const companyId = req.auth!.companyId;
    const [lpns, shipments] = await Promise.all([
      Lpn.countDocuments({ companyId, status: "active" }),
      Shipment.countDocuments({ companyId }),
    ]);
    res.json({ lpns, shipments });
  } catch (err) {
    next(err);
  }
});

/**
 * Cesar Oct 12: admin-only invoice edit (override amount/status when ops need a customer to pay now).
 * Updates WMS; if linked to QB, best-effort SyncToken update of DocNumber notes / PrivateNote only
 * for status/amount — full line sync is manual in QB when needed.
 */
router.patch("/invoices/:id", requireRole("admin"), async (req, res, next) => {
  try {
    const invoice = await Invoice.findOne({
      _id: req.params.id,
      companyId: req.auth!.companyId,
    });
    if (!invoice) {
      res.status(404).json({ error: "Invoice not found" });
      return;
    }

    const {
      status,
      notes,
      dueDate,
      termsDays,
      total,
      balanceDue,
      lines,
    } = req.body;

    if (status !== undefined) {
      const allowed = ["draft", "sent", "unpaid", "paid", "void", "past_due"];
      if (!allowed.includes(String(status))) {
        res.status(400).json({ error: `status must be one of ${allowed.join(", ")}` });
        return;
      }
      invoice.status = status;
      if (status === "paid") {
        invoice.balanceDue = 0;
      }
    }
    if (notes !== undefined) invoice.notes = String(notes ?? "");
    if (dueDate !== undefined) {
      invoice.dueDate = dueDate ? new Date(dueDate) : null;
    }
    if (termsDays !== undefined) {
      invoice.termsDays = Number(termsDays);
    }
    if (Array.isArray(lines) && lines.length > 0) {
      invoice.lines = lines.map(
        (l: {
          description?: string;
          qty?: number;
          unitAmount?: number;
          amount?: number;
          type?: string;
        }) => {
          const qty = Number(l.qty) || 1;
          const unitAmount = Number(l.unitAmount ?? l.amount) || 0;
          const amount =
            l.amount != null ? Number(l.amount) : Math.round(qty * unitAmount * 100) / 100;
          return {
            description: String(l.description || "Line").slice(0, 500),
            qty,
            unitAmount,
            amount,
            type: l.type || "other",
            palletId: null,
            shipmentId: null,
          };
        }
      ) as typeof invoice.lines;
      const sum = Math.round(invoice.lines.reduce((s, l) => s + Number(l.amount || 0), 0) * 100) / 100;
      invoice.subtotal = sum;
      invoice.total = sum;
      if (invoice.status !== "paid") {
        invoice.balanceDue = sum;
      }
    } else {
      if (total !== undefined) {
        const t = Number(total);
        if (!Number.isFinite(t) || t < 0) {
          res.status(400).json({ error: "total must be a non-negative number" });
          return;
        }
        invoice.total = t;
        invoice.subtotal = t;
      }
      if (balanceDue !== undefined) {
        const b = Number(balanceDue);
        if (!Number.isFinite(b) || b < 0) {
          res.status(400).json({ error: "balanceDue must be a non-negative number" });
          return;
        }
        invoice.balanceDue = b;
        if (b === 0 && invoice.status !== "void") invoice.status = "paid";
      }
    }

    if (
      invoice.status === "past_due" &&
      (invoice.balanceDue == null || Number(invoice.balanceDue) === 0) &&
      Number(invoice.total) > 0 &&
      balanceDue === undefined
    ) {
      invoice.balanceDue = Number(invoice.total);
    }

    const editNote = `Edited by ${req.auth!.email || "admin"} ${new Date().toISOString()}`;
    invoice.notes = invoice.notes
      ? `${invoice.notes}\n${editNote}`
      : editNote;

    await invoice.save();

    // Cesar: WMS edit → QuickBooks (amount / due / notes; paid → Payment; void → void)
    let qbSync: {
      synced: boolean;
      skipped?: string;
      voided?: boolean;
      paymentCreated?: boolean;
      error?: string;
    } | null = null;
    if (invoice.quickbooksId) {
      const { updateInvoiceInQuickBooks } = await import("../services/quickbooks");
      qbSync = await updateInvoiceInQuickBooks(String(invoice._id));
    }

    const populated = await Invoice.findById(invoice._id).populate(
      "customerId",
      "name billingMethod email"
    );

    let hint = "WMS updated.";
    if (!invoice.quickbooksId) {
      hint = "WMS updated (not in QuickBooks yet).";
    } else if (qbSync?.synced) {
      hint = qbSync.voided
        ? "WMS + QuickBooks updated (invoice voided in QB)."
        : qbSync.paymentCreated
          ? "WMS + QuickBooks updated (payment recorded in QB)."
          : "WMS + QuickBooks updated.";
    } else if (qbSync?.skipped === "test_account" || qbSync?.skipped === "push_disabled") {
      hint = "WMS updated (QB push skipped for this account / setting).";
    } else if (qbSync?.error) {
      hint = `WMS updated, but QuickBooks sync failed: ${qbSync.error}`;
    }

    res.json({
      invoice: populated,
      qbSync,
      hint,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * Delete is a void when the invoice is in QuickBooks, so the accounting record is not erased.
 * WMS-only invoices (no QuickBooks id) are removed.
 */
router.delete("/invoices/:id", requireRole("admin"), async (req, res, next) => {
  try {
    const invoice = await Invoice.findOne({
      _id: req.params.id,
      companyId: req.auth!.companyId,
    });
    if (!invoice) {
      res.status(404).json({ error: "Invoice not found" });
      return;
    }
    if (invoice.quickbooksId) {
      invoice.status = "void";
      invoice.balanceDue = 0;
      const note = `Voided by ${req.auth!.email || "admin"} ${new Date().toISOString()}`;
      invoice.notes = invoice.notes ? `${invoice.notes}\n${note}` : note;
      await invoice.save();
      const { updateInvoiceInQuickBooks } = await import("../services/quickbooks");
      const qbSync = await updateInvoiceInQuickBooks(String(invoice._id));
      res.json({
        voided: true,
        deleted: false,
        qbSync,
        hint: qbSync?.voided
          ? "Invoice voided in WMS and QuickBooks."
          : "Invoice voided in WMS. QuickBooks was not hard-deleted.",
      });
      return;
    }
    await invoice.deleteOne();
    res.json({ deleted: true, voided: false, hint: "WMS-only invoice removed." });
  } catch (err) {
    next(err);
  }
});

/**
 * Email invoice to customer.
 * Prefer QuickBooks send (includes QB Pay Now when enabled); fall back to WMS SMTP + portal/Zelle.
 */
router.post("/invoices/:id/send", requireRole("admin", "staff"), async (req, res, next) => {
  try {
    const invoice = await Invoice.findOne({
      _id: req.params.id,
      companyId: req.auth!.companyId,
    }).populate("customerId", "name email testAccount");
    if (!invoice) {
      res.status(404).json({ error: "Invoice not found" });
      return;
    }
    const customer = invoice.customerId as unknown as {
      name?: string;
      email?: string;
      testAccount?: boolean;
    } | null;
    const to = String(req.body.email || customer?.email || "").trim();
    if (!to || !to.includes("@")) {
      res.status(400).json({
        error: "Customer email is required on WMS before sending an invoice",
      });
      return;
    }

    const { env } = await import("../config/env");
    // Cesar: live customers → QB create + QB email (Pay Now). Test / no QB → SMTP + Zelle.
    const {
      pushInvoiceToQuickBooks,
      sendInvoiceEmailViaQuickBooks,
      quickbooksConfigured,
    } = await import("../services/quickbooks");
    const { QuickBooksConnection } = await import("../models/QuickBooksConnection");
    const companyId = String(req.auth!.companyId);
    const qbConnected = Boolean(await QuickBooksConnection.findOne({ companyId }));
    const allowQbPay =
      env.quickbooksPushEnabled && !customer?.testAccount && quickbooksConfigured() && qbConnected;

    if (allowQbPay) {
      if (!invoice.quickbooksId) {
        const pushed = await pushInvoiceToQuickBooks(String(invoice._id));
        if (pushed.quickbooksId) {
          invoice.quickbooksId = pushed.quickbooksId;
        } else if (pushed.skipped !== "test_account" && pushed.skipped !== "push_disabled") {
          res.status(502).json({
            error: pushed.error || "Could not create invoice in QuickBooks before emailing",
          });
          return;
        }
      }
      if (invoice.quickbooksId) {
        await sendInvoiceEmailViaQuickBooks({
          companyId,
          quickbooksInvoiceId: String(invoice.quickbooksId),
          sendTo: to,
        });
        if (invoice.status === "draft") {
          invoice.status = "unpaid";
          await invoice.save();
        }
        const fresh = await Invoice.findById(invoice._id);
        res.json({
          ok: true,
          via: "quickbooks",
          invoice: fresh,
          emailedTo: to,
          payHint: "Customer should use Pay Now in the QuickBooks email (card/ACH when enabled).",
        });
        return;
      }
    }

    const { sendInvoiceEmail } = await import("../services/mail");
    const portalUrl = `${env.appUrl.replace(/\/$/, "")}/billing`;
    const zelleHint =
      process.env.ZELLE_PAY_HINT ||
      "Pay via Zelle to the Phoenix Cross Dock business account listed in your welcome email. Include the invoice number in the memo.";
    await sendInvoiceEmail({
      to,
      name: customer?.name || to,
      invoiceNumber: invoice.number,
      total: invoice.total,
      portalUrl,
      zelleHint,
    });
    if (invoice.status === "draft") {
      invoice.status = "unpaid";
      await invoice.save();
    }
    res.json({
      ok: true,
      via: "wms_smtp",
      invoice,
      emailedTo: to,
      payHint: "Zelle (and portal). QuickBooks Pay Now is used when the invoice is in QBO.",
    });
  } catch (err) {
    next(err);
  }
});

/** Admin: run contract monthly invoices now (same job as 1st-of-month cron · Net 30). */
router.post("/contract-monthly/run", requireRole("admin"), async (_req, res, next) => {
  try {
    const { runContractMonthlyInvoices } = await import("../jobs/contractMonthly");
    const result = await runContractMonthlyInvoices();
    res.json(result);
  } catch (err) {
    next(err);
  }
});

export default router;
