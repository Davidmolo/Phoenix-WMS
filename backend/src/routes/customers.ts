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
    const companyId = req.auth!.companyId;
    const filter: Record<string, unknown> = { companyId, active: true };
    // Customers page default used to be activated-only; ops/billing use portal=all.
    const portal = String(req.query.portal || "activated");
    if (portal === "activated") filter.portalActivated = true;
    else if (portal === "pending") filter.portalActivated = false;

    const customers = await Customer.find(filter).sort({ name: 1 }).lean();

    // Enrich with invite state so UI can tell: onboarded vs invite sent vs never invited
    const ids = customers.map((c) => c._id);
    const portalUsers = await User.find({
      companyId,
      role: "customer",
      customerId: { $in: ids },
    })
      .select("customerId inviteTokenHash")
      .lean();

    const inviteByCustomer = new Map(
      portalUsers.map((u) => [String(u.customerId), Boolean(u.inviteTokenHash)])
    );

    const enriched = customers.map((c) => {
      const invitePending = inviteByCustomer.get(String(c._id)) === true;
      const portalStatus = c.portalActivated
        ? "active"
        : invitePending
          ? "invite_sent"
          : "not_invited";
      return { ...c, invitePending, portalStatus };
    });

    res.json({ customers: enriched });
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
    const openInvoices = await Invoice.find({
      ...filter,
      status: { $nin: ["paid", "void"] },
    }).select("status balanceDue total dueDate");
    const now = Date.now();
    let unpaidTotal = 0;
    let unpaidCount = 0;
    let pastDueTotal = 0;
    let pastDueCount = 0;
    for (const inv of openInvoices) {
      const owed = inv.balanceDue == null ? Number(inv.total) || 0 : Number(inv.balanceDue) || 0;
      if (!(owed > 0)) continue;
      const overdue =
        inv.status === "past_due" ||
        Boolean(inv.dueDate && new Date(inv.dueDate).getTime() < now);
      if (overdue) {
        pastDueTotal += owed;
        pastDueCount += 1;
      } else {
        unpaidTotal += owed;
        unpaidCount += 1;
      }
    }
    if (!customer.contacts?.length && (customer.email || customer.phone || customer.contact)) {
      customer.set("contacts", [
        {
          name: customer.contact || "",
          email: String(customer.email || "").trim().toLowerCase(),
          phone: customer.phone || "",
          primary: true,
        },
      ]);
      await customer.save();
    }

    const billingEmail = String(customer.email || "").trim().toLowerCase();
    if (billingEmail && !(customer.contacts || []).some((row) => row.primary)) {
      const match = (customer.contacts || []).find(
        (row) => String(row.email || "").trim().toLowerCase() === billingEmail
      );
      if (match) {
        for (const row of customer.contacts || []) {
          row.primary = String(row.email || "").trim().toLowerCase() === billingEmail;
        }
        customer.markModified("contacts");
        await customer.save();
      }
    }

    const portalUsers = await User.find({
      companyId: req.auth!.companyId,
      customerId: customer._id,
      role: "customer",
    }).select("email name active inviteSentAt inviteExpiresAt inviteTokenHash");

    res.json({
      customer,
      portalUsers: portalUsers.map((portalUser) => ({
        email: portalUser.email,
        name: portalUser.name,
        active: portalUser.active,
        invitePending: Boolean(portalUser.inviteTokenHash),
        inviteSentAt: portalUser.inviteSentAt,
        inviteExpiresAt: portalUser.inviteExpiresAt,
      })),
      summary: {
        activePallets,
        unbilledTotal,
        unbilledCount: unbilledCharges.length,
        unpaidTotal,
        unpaidCount,
        pastDueTotal,
        pastDueCount,
        openRequests: requests.filter((r) => r.status === "pending" || r.status === "scheduled")
          .length,
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
      source: "wms",
      // Invites are always real customers — test flag is only set on customer detail
      testAccount: false,
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
      const invitedEmail = invite.email.trim().toLowerCase();
      const rows = (customer.contacts || []).map((row) => ({
        name: row.name || "",
        email: row.email || "",
        phone: row.phone || "",
        primary: Boolean(row.primary),
        invitedAt:
          String(row.email || "").trim().toLowerCase() === invitedEmail
            ? new Date()
            : row.invitedAt || null,
      }));
      if (rows.some((row) => String(row.email).trim().toLowerCase() === invitedEmail)) {
        customer.set("contacts", rows);
        customer.markModified("contacts");
        await customer.save();
      }
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

    // Contact / identity — admin or staff
    if (req.body.name !== undefined) customer.name = String(req.body.name ?? "").trim();
    if (req.body.contact !== undefined) customer.contact = String(req.body.contact ?? "").trim();
    if (req.body.email !== undefined) customer.email = String(req.body.email ?? "").trim();
    if (req.body.phone !== undefined) customer.phone = String(req.body.phone ?? "").trim();
    if (req.body.address !== undefined) customer.address = String(req.body.address ?? "").trim();
    if (Array.isArray(req.body.contacts)) {
      const seen = new Set<string>();
      const next: {
        name: string;
        email: string;
        phone: string;
        primary: boolean;
        invitedAt: Date | null;
      }[] = [];
      for (const raw of req.body.contacts) {
        const email = String(raw?.email || "").trim().toLowerCase();
        const name = String(raw?.name || "").trim();
        const phone = String(raw?.phone || "").trim();
        if (!email && !phone && !name) continue;
        if (email && !email.includes("@")) {
          res.status(400).json({ error: `Contact email is not valid: ${email}` });
          return;
        }
        if (email && seen.has(email)) continue;
        if (email) seen.add(email);
        const prior = (customer.contacts || []).find(
          (row) => email && String(row.email || "").trim().toLowerCase() === email
        );
        next.push({
          name,
          email,
          phone,
          primary: Boolean(raw?.primary),
          invitedAt: raw?.invitedAt
            ? new Date(raw.invitedAt)
            : prior?.invitedAt || null,
        });
      }
      const primaryIndex = next.findIndex((row) => row.primary && row.email);
      next.forEach((row, index) => {
        row.primary = primaryIndex === -1 ? false : index === primaryIndex;
      });
      if (primaryIndex >= 0) {
        customer.email = next[primaryIndex].email;
        if (next[primaryIndex].name) customer.contact = next[primaryIndex].name;
        if (next[primaryIndex].phone) customer.phone = next[primaryIndex].phone;
      }
      customer.set("contacts", next);
      customer.markModified("contacts");
    }
    if (req.body.active !== undefined) customer.active = Boolean(req.body.active);
    if (req.body.transportEnabled !== undefined) {
      customer.transportEnabled = Boolean(req.body.transportEnabled);
    }

    // Cesar audit: staff can set billing method; rate amounts stay admin-only
    if (req.body.billingMethod !== undefined && (role === "admin" || role === "staff")) {
      customer.billingMethod = req.body.billingMethod;
    }
    if (req.body.testAccount !== undefined && (role === "admin" || role === "staff")) {
      customer.testAccount = Boolean(req.body.testAccount);
    }
    if (req.body.serviceDropStore !== undefined) {
      customer.serviceDropStore = Boolean(req.body.serviceDropStore);
    }
    if (req.body.serviceCrossdock !== undefined) {
      customer.serviceCrossdock = Boolean(req.body.serviceCrossdock);
    }
    if (req.body.serviceRework !== undefined) {
      customer.serviceRework = Boolean(req.body.serviceRework);
    }

    const nullableRate = (raw: unknown): number | null => {
      if (raw === null || raw === "") return null;
      const n = Number(raw);
      return Number.isFinite(n) ? n : null;
    };

    const ratesTouched =
      req.body.contractSqft !== undefined ||
      req.body.contractFee !== undefined ||
      req.body.contractHandlingPerPallet !== undefined ||
      req.body.contractFtlRate !== undefined ||
      req.body.rateInside !== undefined ||
      req.body.rateOutside !== undefined ||
      req.body.unloadFee !== undefined ||
      req.body.loadFee !== undefined ||
      req.body.crossdockPerPallet !== undefined ||
      req.body.reworkHourlyRate !== undefined ||
      req.body.reworkMinimumHours !== undefined ||
      req.body.parcelStoragePerBoxDay !== undefined ||
      req.body.parcelReceivePerBox !== undefined ||
      req.body.parcelOutboundPerBox !== undefined ||
      req.body.parcelOversizePerPalletDay !== undefined ||
      req.body.rateInsideSqft !== undefined ||
      req.body.rateOutsideSqft !== undefined ||
      req.body.contractNoDwellInside !== undefined ||
      req.body.transportInboundFee !== undefined ||
      req.body.transportOutboundFee !== undefined;

    if (ratesTouched) {
      if (role !== "admin") {
        res.status(403).json({ error: "Only admins can change billing rates" });
        return;
      }
      if (req.body.contractSqft !== undefined) customer.contractSqft = Number(req.body.contractSqft) || 0;
      if (req.body.contractFee !== undefined) customer.contractFee = Number(req.body.contractFee) || 0;
      if (req.body.contractHandlingPerPallet !== undefined) {
        customer.contractHandlingPerPallet = nullableRate(req.body.contractHandlingPerPallet);
      }
      if (req.body.contractFtlRate !== undefined) {
        customer.contractFtlRate = nullableRate(req.body.contractFtlRate);
      }
      if (req.body.rateInside !== undefined) customer.rateInside = nullableRate(req.body.rateInside);
      if (req.body.rateOutside !== undefined) customer.rateOutside = nullableRate(req.body.rateOutside);
      if (req.body.unloadFee !== undefined) customer.unloadFee = nullableRate(req.body.unloadFee);
      if (req.body.loadFee !== undefined) customer.loadFee = nullableRate(req.body.loadFee);
      if (req.body.crossdockPerPallet !== undefined) {
        customer.crossdockPerPallet = nullableRate(req.body.crossdockPerPallet);
      }
      if (req.body.reworkHourlyRate !== undefined) {
        customer.reworkHourlyRate = nullableRate(req.body.reworkHourlyRate);
      }
      if (req.body.reworkMinimumHours !== undefined) {
        customer.reworkMinimumHours = nullableRate(req.body.reworkMinimumHours);
      }
      if (req.body.parcelStoragePerBoxDay !== undefined) {
        customer.parcelStoragePerBoxDay = nullableRate(req.body.parcelStoragePerBoxDay);
      }
      if (req.body.parcelReceivePerBox !== undefined) {
        customer.parcelReceivePerBox = nullableRate(req.body.parcelReceivePerBox);
      }
      if (req.body.parcelOutboundPerBox !== undefined) {
        customer.parcelOutboundPerBox = nullableRate(req.body.parcelOutboundPerBox);
      }
      if (req.body.parcelOversizePerPalletDay !== undefined) {
        customer.parcelOversizePerPalletDay = nullableRate(req.body.parcelOversizePerPalletDay);
      }
      if (req.body.rateInsideSqft !== undefined) {
        customer.rateInsideSqft = nullableRate(req.body.rateInsideSqft);
      }
      if (req.body.rateOutsideSqft !== undefined) {
        customer.rateOutsideSqft = nullableRate(req.body.rateOutsideSqft);
      }
      if (req.body.contractNoDwellInside !== undefined) {
        customer.contractNoDwellInside = Boolean(req.body.contractNoDwellInside);
      }
      if (req.body.transportInboundFee !== undefined) {
        customer.transportInboundFee = Number(req.body.transportInboundFee) || 0;
      }
      if (req.body.transportOutboundFee !== undefined) {
        customer.transportOutboundFee = Number(req.body.transportOutboundFee) || 0;
      }
    }

    await customer.save();
    res.json({ customer });
  } catch (err) {
    next(err);
  }
});

export default router;
