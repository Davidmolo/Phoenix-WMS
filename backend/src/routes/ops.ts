import { Router, type Request, type Response, type NextFunction } from "express";
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

    const activeStatus = { $in: ["received", "stored", "staged"] };

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
      .sort({ createdAt: -1 })
      .limit(5);

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
    if (req.auth!.role === "customer") filter.customerId = req.auth!.customerId;
    const invoices = await Invoice.find(filter)
      .populate("customerId", "name billingMethod")
      .sort({ createdAt: -1 })
      .limit(100);
    res.json({ invoices });
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

/** Generate a monthly invoice for any customer (contract base rent + unbilled charges). */
async function generateCustomerMonthInvoice(req: Request, res: Response, next: NextFunction) {
  try {
    const { customerId, periodStart, periodEnd } = req.body;
    if (!customerId) {
      res.status(400).json({ error: "customerId is required" });
      return;
    }
    const customer = await Customer.findOne({
      _id: customerId,
      companyId: req.auth!.companyId,
    });
    if (!customer) {
      res.status(404).json({ error: "Customer not found" });
      return;
    }

    const start = new Date(periodStart);
    const end = new Date(periodEnd);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      res.status(400).json({ error: "periodStart and periodEnd are required" });
      return;
    }

    const lines: Array<{
      description: string;
      qty: number;
      unitAmount: number;
      amount: number;
      type: string;
      palletId?: unknown;
      shipmentId?: unknown;
    }> = [];

    if (customer.billingMethod === "contract" && customer.contractFee > 0) {
      lines.push({
        description: `Base rent — ${customer.name} · ${customer.contractSqft} SF @ contract rate`,
        qty: 1,
        unitAmount: customer.contractFee,
        amount: customer.contractFee,
        type: "base_rent",
      });
    }

    const charges = await Accessorial.find({
      companyId: req.auth!.companyId,
      customerId: customer._id,
      invoiceId: null,
      date: { $gte: start, $lte: end },
    });

    for (const c of charges) {
      lines.push({
        description: c.description,
        qty: 1,
        unitAmount: c.amount,
        amount: c.amount,
        type: c.type,
        palletId: c.palletId || undefined,
        shipmentId: c.shipmentId || undefined,
      });
    }

    if (lines.length === 0) {
      res.status(400).json({ error: "No billable lines for this customer in the selected period" });
      return;
    }

    const subtotal = lines.reduce((s, l) => s + l.amount, 0);
    const count = await Invoice.countDocuments({ companyId: req.auth!.companyId });
    const number = `INV-${String(count + 1).padStart(5, "0")}`;
    const dueDate = new Date(end);
    dueDate.setDate(dueDate.getDate() + 30);

    const invoice = await Invoice.create({
      companyId: req.auth!.companyId,
      customerId: customer._id,
      number,
      periodStart: start,
      periodEnd: end,
      lines,
      subtotal,
      total: subtotal,
      dueDate,
      status: "draft",
      notes: "Net 30",
    });

    await Accessorial.updateMany(
      { _id: { $in: charges.map((c) => c._id) } },
      { $set: { invoiceId: invoice._id } }
    );

    const populated = await Invoice.findById(invoice._id).populate("customerId", "name billingMethod");
    res.status(201).json({ invoice: populated, chargesAttached: charges.length });
  } catch (err) {
    next(err);
  }
}

router.post("/invoices/generate-month", requireRole("admin", "staff"), generateCustomerMonthInvoice);
/** @deprecated Use /invoices/generate-month — kept for existing clients/scripts */
router.post("/invoices/generate-sba-month", requireRole("admin", "staff"), generateCustomerMonthInvoice);

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

export default router;
