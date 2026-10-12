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
 * Email invoice to customer.
 * Prefer QuickBooks send (includes QB Pay Now when enabled); fall back to WMS SMTP + portal/Zelle.
 */
router.post("/invoices/:id/send", requireRole("admin", "staff"), async (req, res, next) => {
  try {
    const invoice = await Invoice.findOne({
      _id: req.params.id,
      companyId: req.auth!.companyId,
    }).populate("customerId", "name email");
    if (!invoice) {
      res.status(404).json({ error: "Invoice not found" });
      return;
    }
    const customer = invoice.customerId as unknown as { name?: string; email?: string } | null;
    const to = String(req.body.email || customer?.email || "").trim();
    if (!to || !to.includes("@")) {
      res.status(400).json({
        error: "Customer email is required on WMS before sending an invoice",
      });
      return;
    }

    // Cesar: QB emails the invoice (pay link). Push first if not yet in QB.
    const {
      pushInvoiceToQuickBooks,
      sendInvoiceEmailViaQuickBooks,
      quickbooksConfigured,
    } = await import("../services/quickbooks");
    const { QuickBooksConnection } = await import("../models/QuickBooksConnection");
    const companyId = String(req.auth!.companyId);
    const qbConnected = Boolean(await QuickBooksConnection.findOne({ companyId }));

    if (quickbooksConfigured() && qbConnected) {
      if (!invoice.quickbooksId) {
        const pushed = await pushInvoiceToQuickBooks(String(invoice._id));
        if (!pushed.quickbooksId) {
          res.status(502).json({
            error: pushed.error || "Could not create invoice in QuickBooks before emailing",
          });
          return;
        }
        invoice.quickbooksId = pushed.quickbooksId;
      }
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
      });
      return;
    }

    const { sendInvoiceEmail } = await import("../services/mail");
    const { env } = await import("../config/env");
    const portalUrl = `${env.appUrl.replace(/\/$/, "")}/billing`;
    const zelleHint =
      process.env.ZELLE_PAY_HINT ||
      "Pay via Zelle to the Phoenix Cross Dock business account listed in your welcome email.";
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
    res.json({ ok: true, via: "wms_smtp", invoice, emailedTo: to });
  } catch (err) {
    next(err);
  }
});

export default router;
