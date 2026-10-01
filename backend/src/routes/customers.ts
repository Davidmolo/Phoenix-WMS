import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth";
import { Customer } from "../models/Customer";
import { Pallet } from "../models/Pallet";
import { Accessorial } from "../models/Accessorial";
import { Request as WhRequest } from "../models/Request";
import { Invoice } from "../models/Invoice";

const router = Router();

router.use(requireAuth);

router.get("/", requireRole("admin", "staff"), async (req, res, next) => {
  try {
    const customers = await Customer.find({ companyId: req.auth!.companyId, active: true }).sort({
      name: 1,
    });
    res.json({ customers });
  } catch (err) {
    next(err);
  }
});

/** Read-only billing activity report for print/export (does not create invoices — QB does). */
router.get("/:id/billing-report", requireRole("admin", "staff"), async (req, res, next) => {
  try {
    const customer = await Customer.findOne({
      _id: req.params.id,
      companyId: req.auth!.companyId,
    });
    if (!customer) {
      res.status(404).json({ error: "Customer not found" });
      return;
    }

    let start: Date;
    let end: Date;
    if (typeof req.query.month === "string" && /^\d{4}-\d{2}$/.test(req.query.month)) {
      const [y, m] = req.query.month.split("-").map(Number);
      start = new Date(y, m - 1, 1, 0, 0, 0, 0);
      end = new Date(y, m, 0, 23, 59, 59, 999);
    } else {
      const now = new Date();
      start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
      end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    }

    const filter = { companyId: req.auth!.companyId, customerId: customer._id };
    const [activePallets, charges, invoices] = await Promise.all([
      Pallet.countDocuments({ ...filter, status: { $in: ["received", "stored", "staged"] } }),
      Accessorial.find({
        ...filter,
        date: { $gte: start, $lte: end },
      }).sort({ date: 1 }),
      Invoice.find({
        ...filter,
        $or: [
          { periodStart: { $lte: end }, periodEnd: { $gte: start } },
          { createdAt: { $gte: start, $lte: end } },
        ],
      }).sort({ createdAt: -1 }),
    ]);

    const chargeTotal = charges.reduce((s, c) => s + (c.amount || 0), 0);
    const invoiceTotal = invoices.reduce((s, inv) => s + (inv.total || 0), 0);

    res.json({
      customer: {
        _id: customer._id,
        name: customer.name,
        billingMethod: customer.billingMethod,
        contractFee: customer.contractFee,
        contractSqft: customer.contractSqft,
        email: customer.email,
        contact: customer.contact,
      },
      periodStart: start.toISOString(),
      periodEnd: end.toISOString(),
      generatedAt: new Date().toISOString(),
      summary: {
        activePallets,
        chargeCount: charges.length,
        chargeTotal,
        invoiceCount: invoices.length,
        invoiceTotal,
      },
      charges,
      invoices,
    });
  } catch (err) {
    next(err);
  }
});

router.get("/:id", async (req, res, next) => {
  try {
    const customer = await Customer.findOne({
      _id: req.params.id,
      companyId: req.auth!.companyId,
    });
    if (!customer) {
      res.status(404).json({ error: "Customer not found" });
      return;
    }
    if (req.auth!.role === "customer" && String(req.auth!.customerId) !== String(customer._id)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const filter = { companyId: req.auth!.companyId, customerId: customer._id };
    const [activePallets, pallets, unbilledCharges, requests, invoices] = await Promise.all([
      Pallet.countDocuments({ ...filter, status: { $in: ["received", "stored", "staged"] } }),
      Pallet.find(filter).sort({ updatedAt: -1 }).limit(100),
      Accessorial.find({ ...filter, invoiceId: null }).sort({ date: -1 }),
      WhRequest.find(filter).sort({ dateRequested: -1 }).limit(20),
      Invoice.find(filter).sort({ createdAt: -1 }).limit(10),
    ]);

    const unbilledTotal = unbilledCharges.reduce((s, c) => s + (c.amount || 0), 0);

    res.json({
      customer,
      summary: {
        activePallets,
        unbilledTotal,
        unbilledCount: unbilledCharges.length,
        openRequests: requests.filter((r) => r.status === "pending").length,
      },
      pallets,
      unbilledCharges,
      requests,
      invoices,
    });
  } catch (err) {
    next(err);
  }
});

router.post("/", requireRole("admin", "staff"), async (req, res, next) => {
  try {
    const customer = await Customer.create({
      ...req.body,
      companyId: req.auth!.companyId,
    });
    res.status(201).json({ customer });
  } catch (err) {
    next(err);
  }
});

router.patch("/:id", async (req, res, next) => {
  try {
    const customer = await Customer.findOne({
      _id: req.params.id,
      companyId: req.auth!.companyId,
    });
    if (!customer) {
      res.status(404).json({ error: "Customer not found" });
      return;
    }

    const role = req.auth!.role;
    if (role === "customer") {
      if (String(req.auth!.customerId) !== String(customer._id)) {
        res.status(403).json({ error: "Forbidden" });
        return;
      }
      // Portal users can only maintain contact fields used for dock booking
      if (req.body.name !== undefined) customer.name = String(req.body.name ?? "").trim();
      if (req.body.contact !== undefined) customer.contact = String(req.body.contact ?? "").trim();
      if (req.body.email !== undefined) customer.email = String(req.body.email ?? "").trim();
      if (req.body.phone !== undefined) customer.phone = String(req.body.phone ?? "").trim();
      if (req.body.address !== undefined) customer.address = String(req.body.address ?? "").trim();
      await customer.save();
      res.json({ customer });
      return;
    }

    if (role !== "admin" && role !== "staff") {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    Object.assign(customer, req.body);
    await customer.save();
    res.json({ customer });
  } catch (err) {
    next(err);
  }
});

export default router;
