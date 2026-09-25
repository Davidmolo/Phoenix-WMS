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

router.patch("/:id", requireRole("admin", "staff"), async (req, res, next) => {
  try {
    const customer = await Customer.findOneAndUpdate(
      { _id: req.params.id, companyId: req.auth!.companyId },
      { $set: req.body },
      { new: true }
    );
    if (!customer) {
      res.status(404).json({ error: "Customer not found" });
      return;
    }
    res.json({ customer });
  } catch (err) {
    next(err);
  }
});

export default router;
