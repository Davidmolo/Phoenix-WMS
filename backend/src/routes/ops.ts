import { Router } from "express";
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
    const customerFilter =
      req.auth!.role === "customer" ? { customerId: req.auth!.customerId } : {};

    const [activePallets, pendingRequests, draftInvoices, customers, openCharges, locationsAvailable] =
      await Promise.all([
        Pallet.countDocuments({
          companyId,
          ...customerFilter,
          status: { $in: ["received", "stored", "staged"] },
        }),
        (await import("../models/Request")).Request.countDocuments({
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
    const invoices = await Invoice.find(filter).sort({ createdAt: -1 }).limit(100);
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

router.post("/invoices/generate-sba-month", requireRole("admin", "staff"), async (req, res, next) => {
  try {
    const { customerId, periodStart, periodEnd } = req.body;
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
        description: `Base rent — ${customer.contractSqft} SF @ contract rate`,
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
      notes: "Net 30 per Warehouse Space & Handling Services Agreement",
    });

    await Accessorial.updateMany(
      { _id: { $in: charges.map((c) => c._id) } },
      { $set: { invoiceId: invoice._id } }
    );

    res.status(201).json({ invoice, chargesAttached: charges.length });
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

export default router;
