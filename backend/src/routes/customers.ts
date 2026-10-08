import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth";
import { Customer } from "../models/Customer";
import { Pallet } from "../models/Pallet";
import { Accessorial } from "../models/Accessorial";
import { Request as WhRequest } from "../models/Request";
import { Invoice } from "../models/Invoice";
import { User } from "../models/User";
import { issuePortalInvite } from "../services/portalInvite";

const router = Router();

router.use(requireAuth);

router.get("/", requireRole("admin", "staff"), async (req, res, next) => {
  try {
    const filter: Record<string, unknown> = { companyId: req.auth!.companyId, active: true };
    // Customers page: only accounts that finished portal signup (set password).
    // Ops / billing dropdowns pass portal=all to include pending invites.
    const portal = String(req.query.portal || "activated");
    if (portal === "activated") filter.portalActivated = true;
    else if (portal === "pending") filter.portalActivated = false;

    const customers = await Customer.find(filter).sort({ name: 1 });
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
      Pallet.countDocuments({
        ...filter,
        status: { $in: ["received", "staged_for_store", "stored", "staged"] },
      }),
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
    const balanceDueTotal = invoices.reduce((s, inv) => {
      const due =
        inv.balanceDue != null && !Number.isNaN(Number(inv.balanceDue))
          ? Number(inv.balanceDue)
          : Number(inv.total) || 0;
      return s + due;
    }, 0);

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
        balanceDueTotal,
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
      Pallet.countDocuments({
        ...filter,
        status: { $in: ["received", "staged_for_store", "stored", "staged"] },
      }),
      Pallet.find(filter).sort({ updatedAt: -1 }).limit(100),
      Accessorial.find({ ...filter, invoiceId: null }).sort({ date: -1 }),
      WhRequest.find(filter).sort({ dateRequested: -1 }).limit(20),
      Invoice.find(filter).sort({ createdAt: -1 }).limit(10),
    ]);

    const unbilledTotal = unbilledCharges.reduce((s, c) => s + (c.amount || 0), 0);
    const portalUser = await User.findOne({
      companyId: req.auth!.companyId,
      customerId: customer._id,
      role: "customer",
    }).select("email name active inviteSentAt inviteExpiresAt inviteTokenHash");

    res.json({
      customer,
      portal: portalUser
        ? {
            email: portalUser.email,
            name: portalUser.name,
            active: portalUser.active,
            invitePending: Boolean(portalUser.inviteTokenHash),
            inviteSentAt: portalUser.inviteSentAt,
            inviteExpiresAt: portalUser.inviteExpiresAt,
          }
        : null,
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
    const email = String(req.body?.email || "").trim();
    if (!email || !email.includes("@")) {
      res.status(400).json({ error: "Email is required — we send the portal invite there" });
      return;
    }
    const name = String(req.body?.name || "").trim();
    if (!name) {
      res.status(400).json({ error: "Company name is required" });
      return;
    }

    const customer = await Customer.create({
      ...req.body,
      name,
      email,
      companyId: req.auth!.companyId,
      portalActivated: false,
    });

    try {
      const invite = await issuePortalInvite({
        companyId: String(req.auth!.companyId),
        customerId: String(customer._id),
        email,
        name: String(req.body?.contact || name).trim(),
      });
      res.status(201).json({
        customer,
        invite,
        message: `Invite emailed to ${invite.email}. They will appear in Customers after setting a password.`,
      });
    } catch (inviteErr) {
      // Roll back the empty customer so staff can retry with working mail config
      await Customer.deleteOne({ _id: customer._id });
      res.status(400).json({
        error: inviteErr instanceof Error ? inviteErr.message : "Could not send portal invite",
      });
    }
  } catch (err) {
    next(err);
  }
});

router.post("/:id/invite", requireRole("admin", "staff"), async (req, res, next) => {
  try {
    const customer = await Customer.findOne({
      _id: req.params.id,
      companyId: req.auth!.companyId,
    });
    if (!customer) {
      res.status(404).json({ error: "Customer not found" });
      return;
    }
    const email = String(req.body?.email || customer.email || "").trim();
    const name = String(req.body?.name || customer.contact || customer.name || "").trim();
    try {
      const invite = await issuePortalInvite({
        companyId: String(req.auth!.companyId),
        customerId: String(customer._id),
        email,
        name,
      });
      res.json({
        ok: true,
        message: `Invite emailed to ${invite.email}. They appear in Customers after setting a password.`,
        ...invite,
      });
    } catch (e) {
      res.status(400).json({ error: e instanceof Error ? e.message : "Invite failed" });
    }
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
