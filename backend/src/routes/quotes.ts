import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth";
import { Quote } from "../models/Quote";
import { Customer } from "../models/Customer";
import { Invoice } from "../models/Invoice";
import { Company } from "../models/Company";
import { loadCompanyFees } from "../services/customerFees";
import { issuePortalInvite } from "../services/portalInvite";
import { sendQuoteEmail } from "../services/mail";
import { paginationMeta, parsePagination } from "../utils/pagination";
import {
  priceQuoteLines,
  quoteCatalog,
  renderQuoteHtml,
  renderQuoteText,
  type QuoteLineInput,
} from "../services/quotePricing";

const router = Router();
router.use(requireAuth, requireRole("admin", "staff"));

function lineInputs(body: { lines?: unknown }): QuoteLineInput[] {
  if (!Array.isArray(body.lines)) return [];
  return body.lines.map((row) => {
    const line = row as Record<string, unknown>;
    return {
      key: String(line.rateKey || line.key || ""),
      qty: line.qty,
      unitAmount: line.unitAmount,
      description: line.description,
      billingType: line.billingType,
    };
  });
}

async function partyFor(companyId: string, customerId: unknown) {
  if (!customerId) return null;
  return Customer.findOne({ _id: customerId, companyId }).lean();
}

function namedParty(customerId: unknown) {
  if (!customerId || typeof customerId !== "object") return null;
  return customerId as { name?: string; email?: string };
}

function partyName(quote: { prospectName?: string | null; customerId?: unknown }) {
  const party = namedParty(quote.customerId);
  if (party?.name) return party.name;
  return quote.prospectName || "Prospect";
}

function partyEmail(quote: { prospectEmail?: string | null; customerId?: unknown }) {
  const party = namedParty(quote.customerId);
  if (party?.email) return party.email;
  return quote.prospectEmail || "";
}

async function nextNumber(companyId: string, prefix: "QTE" | "INV") {
  const filter = { companyId, number: new RegExp(`^${prefix}-\\d+$`) };
  const latest =
    prefix === "QTE"
      ? await Quote.find(filter).sort({ number: -1 }).select("number").limit(1).lean()
      : await Invoice.find(filter).sort({ number: -1 }).select("number").limit(1).lean();
  const current = latest[0] ? Number(String(latest[0].number).replace(/\D/g, "")) : 0;
  return `${prefix}-${String((Number.isFinite(current) ? current : 0) + 1).padStart(5, "0")}`;
}

async function companyHeader(companyId: string) {
  const company = await Company.findById(companyId).select("name legalName address city").lean();
  return {
    companyName: company?.legalName || company?.name || "Phoenix Cross Dock",
    address: company?.address || "",
    city: company?.city || "",
  };
}

router.get("/catalog", async (req, res, next) => {
  try {
    const companyId = req.auth!.companyId;
    const [fees, party] = await Promise.all([
      loadCompanyFees(companyId),
      partyFor(companyId, req.query.customerId),
    ]);
    res.json({ rates: quoteCatalog(party, fees) });
  } catch (err) {
    next(err);
  }
});

router.get("/", async (req, res, next) => {
  try {
    const companyId = req.auth!.companyId;
    const { page, limit, skip } = parsePagination(req.query as Record<string, unknown>);
    const filter = { companyId };
    const [total, quotes] = await Promise.all([
      Quote.countDocuments(filter),
      Quote.find(filter)
        .populate("customerId", "name email")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
    ]);
    res.json({ quotes, ...paginationMeta(page, limit, total) });
  } catch (err) {
    next(err);
  }
});

router.post("/", async (req, res, next) => {
  try {
    const companyId = req.auth!.companyId;
    const customerId = req.body.customerId || null;
    const prospectName = String(req.body.prospectName || "").trim();
    if (!customerId && !prospectName) {
      res.status(400).json({ error: "Pick a customer or enter a prospect name" });
      return;
    }
    const party = await partyFor(companyId, customerId);
    if (customerId && !party) {
      res.status(400).json({ error: "Customer not found" });
      return;
    }
    const fees = await loadCompanyFees(companyId);
    const priced = priceQuoteLines(lineInputs(req.body), party, fees);
    const validUntil = req.body.validUntil ? new Date(req.body.validUntil) : null;
    let number = await nextNumber(companyId, "QTE");
    let quote = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        quote = await Quote.create({
          companyId,
          number,
          customerId: customerId || null,
          prospectName: customerId ? "" : prospectName,
          prospectEmail: customerId ? "" : String(req.body.prospectEmail || "").trim(),
          notes: String(req.body.notes || ""),
          contractSqft: Number(req.body.contractSqft) || 0,
          validUntil: validUntil && !Number.isNaN(validUntil.getTime()) ? validUntil : null,
          lines: priced.lines,
          total: priced.total,
        });
        break;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (!/duplicate key|E11000/i.test(msg)) throw err;
        number = `QTE-${String(Number(number.replace(/\D/g, "")) + 1).padStart(5, "0")}`;
      }
    }
    const saved = await Quote.findById(quote?._id).populate("customerId", "name email");
    res.status(201).json({ quote: saved });
  } catch (err) {
    if (err instanceof Error && /Custom lines|at least one line/.test(err.message)) {
      res.status(400).json({ error: err.message });
      return;
    }
    next(err);
  }
});

router.patch("/:id", async (req, res, next) => {
  try {
    const companyId = req.auth!.companyId;
    const quote = await Quote.findOne({ _id: req.params.id, companyId });
    if (!quote) {
      res.status(404).json({ error: "Estimate not found" });
      return;
    }
    if (quote.status === "accepted" || quote.status === "declined") {
      res.status(400).json({ error: "This estimate is closed" });
      return;
    }
    const customerId = req.body.customerId === undefined ? quote.customerId : req.body.customerId || null;
    const prospectName = String(req.body.prospectName ?? quote.prospectName ?? "").trim();
    if (!customerId && !prospectName) {
      res.status(400).json({ error: "Pick a customer or enter a prospect name" });
      return;
    }
    const party = await partyFor(companyId, customerId);
    if (customerId && !party) {
      res.status(400).json({ error: "Customer not found" });
      return;
    }
    const fees = await loadCompanyFees(companyId);
    const priced = priceQuoteLines(lineInputs(req.body), party, fees);
    const validUntil = req.body.validUntil ? new Date(req.body.validUntil) : null;
    quote.customerId = customerId || null;
    quote.prospectName = customerId ? "" : prospectName;
    quote.prospectEmail = customerId ? "" : String(req.body.prospectEmail ?? quote.prospectEmail ?? "").trim();
    quote.notes = String(req.body.notes ?? quote.notes ?? "");
    quote.contractSqft = Number(req.body.contractSqft ?? quote.contractSqft) || 0;
    quote.validUntil = validUntil && !Number.isNaN(validUntil.getTime()) ? validUntil : null;
    quote.set("lines", priced.lines);
    quote.total = priced.total;
    await quote.save();
    const saved = await Quote.findById(quote._id).populate("customerId", "name email");
    res.json({ quote: saved });
  } catch (err) {
    if (err instanceof Error && /Custom lines|at least one line/.test(err.message)) {
      res.status(400).json({ error: err.message });
      return;
    }
    next(err);
  }
});

router.get("/:id/document", async (req, res, next) => {
  try {
    const quote = await Quote.findOne({ _id: req.params.id, companyId: req.auth!.companyId }).populate(
      "customerId",
      "name email"
    );
    if (!quote) {
      res.status(404).json({ error: "Estimate not found" });
      return;
    }
    const header = await companyHeader(req.auth!.companyId);
    const html = renderQuoteHtml({
      ...header,
      number: quote.number,
      preparedFor: partyName(quote),
      email: partyEmail(quote),
      notes: quote.notes,
      validUntil: quote.validUntil,
      lines: quote.lines,
      total: quote.total,
    });
    res.type("html").send(html);
  } catch (err) {
    next(err);
  }
});

router.post("/:id/email", async (req, res, next) => {
  try {
    const quote = await Quote.findOne({ _id: req.params.id, companyId: req.auth!.companyId }).populate(
      "customerId",
      "name email"
    );
    if (!quote) {
      res.status(404).json({ error: "Estimate not found" });
      return;
    }
    const to = String(req.body.email || partyEmail(quote)).trim();
    if (!to.includes("@")) {
      res.status(400).json({ error: "Enter an email address to send this estimate" });
      return;
    }
    const name = partyName(quote);
    const header = await companyHeader(req.auth!.companyId);
    const html = renderQuoteHtml({
      ...header,
      number: quote.number,
      preparedFor: name,
      email: to,
      notes: quote.notes,
      validUntil: quote.validUntil,
      lines: quote.lines,
      total: quote.total,
    });
    await sendQuoteEmail({
      to,
      number: quote.number,
      html,
      text: renderQuoteText({
        number: quote.number,
        preparedFor: name,
        lines: quote.lines,
        total: quote.total,
        notes: quote.notes,
      }),
    });
    if (quote.status === "draft") quote.status = "sent";
    if (!quote.customerId) quote.prospectEmail = to;
    await quote.save();
    res.json({ quote, emailed: to });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Could not send email";
    if (/not configured|SMTP|email/i.test(msg)) {
      res.status(400).json({ error: msg });
      return;
    }
    next(err);
  }
});

function startingAccountType(lines: Array<{ billingType?: string; amount?: number }>) {
  const types = new Set(lines.filter((line) => Number(line.amount) > 0).map((line) => line.billingType));
  if (types.has("contract")) return "contract" as const;
  if (types.has("rework") && !types.has("crossdock")) return "rework" as const;
  return "crossdock" as const;
}

router.post("/:id/invite", async (req, res, next) => {
  try {
    const companyId = req.auth!.companyId;
    const quote = await Quote.findOne({ _id: req.params.id, companyId });
    if (!quote) {
      res.status(404).json({ error: "Estimate not found" });
      return;
    }
    if (quote.status === "declined") {
      res.status(400).json({ error: "This estimate was declined" });
      return;
    }
    let createdId: string | null = null;
    if (!quote.customerId) {
      const name = quote.prospectName.trim();
      const email = String(req.body.email || quote.prospectEmail || "").trim();
      if (!name || !email.includes("@")) {
        res.status(400).json({ error: "A prospect name and email are required to send an invite" });
        return;
      }
      const monthly = quote.lines.find((line) => line.rateKey === "contract_monthly");
      const handling = quote.lines.find((line) => line.rateKey === "contract_handling");
      const ftl = quote.lines.find((line) => line.rateKey === "contract_ftl");
      const cross = quote.lines.find((line) => line.rateKey === "crossDockPerPallet");
      const rework = quote.lines.find((line) => line.rateKey === "sortRelabelPerHour");
      const customer = await Customer.create({
        companyId,
        name,
        email,
        contact: name,
        contacts: [{ name, email, primary: true }],
        billingMethod: startingAccountType(quote.lines),
        serviceDropStore: true,
        serviceCrossdock: true,
        serviceRework: true,
        contractFee: monthly ? monthly.unitAmount : 0,
        contractSqft: Number(quote.contractSqft) || 0,
        contractHandlingPerPallet: handling ? handling.unitAmount : null,
        contractFtlRate: ftl ? ftl.unitAmount : null,
        crossdockPerPallet: cross ? cross.unitAmount : null,
        reworkHourlyRate: rework ? rework.unitAmount : null,
        portalActivated: false,
        source: "wms",
        testAccount: false,
      });
      createdId = String(customer._id);
      quote.customerId = customer._id;
      try {
        await issuePortalInvite({ companyId, customerId: createdId, email, name });
      } catch (err) {
        await Customer.deleteOne({ _id: customer._id });
        quote.customerId = null;
        throw err;
      }
    } else {
      const customer = await Customer.findOne({ _id: quote.customerId, companyId });
      if (!customer) {
        res.status(400).json({ error: "Customer not found" });
        return;
      }
      const email = String(req.body.email || customer.email || "").trim();
      await issuePortalInvite({
        companyId,
        customerId: String(customer._id),
        email,
        name: customer.contact || customer.name,
      });
    }
    quote.status = "accepted";
    await quote.save();
    const saved = await Quote.findById(quote._id).populate("customerId", "name email");
    res.json({ quote: saved });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Could not send invite";
    if (err instanceof Error) {
      res.status(400).json({ error: msg });
      return;
    }
    next(err);
  }
});

router.post("/:id/invoice", async (req, res, next) => {
  try {
    const companyId = req.auth!.companyId;
    const quote = await Quote.findOne({ _id: req.params.id, companyId });
    if (!quote) {
      res.status(404).json({ error: "Estimate not found" });
      return;
    }
    if (quote.status === "declined") {
      res.status(400).json({ error: "This estimate was declined" });
      return;
    }
    if (!quote.customerId) {
      res.status(400).json({ error: "Invite the prospect as a customer before creating an invoice" });
      return;
    }
    if (!(quote.total > 0)) {
      res.status(400).json({ error: "This estimate has no amount to invoice" });
      return;
    }
    const jobKey = `quote:${quote._id}`;
    let invoice = await Invoice.findOne({ companyId, wmsJobKey: jobKey });
    if (!invoice) {
      const today = new Date();
      const due = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000);
      let number = await nextNumber(companyId, "INV");
      for (let attempt = 0; attempt < 3 && !invoice; attempt++) {
        try {
          invoice = await Invoice.create({
            companyId,
            customerId: quote.customerId,
            number,
            periodStart: today,
            periodEnd: today,
            status: "draft",
            lines: quote.lines.map((line) => ({
              description: line.description,
              qty: line.qty,
              unitAmount: line.unitAmount,
              amount: line.amount,
              type: line.invoiceType || "other",
            })),
            subtotal: quote.total,
            total: quote.total,
            balanceDue: quote.total,
            dueDate: due,
            termsDays: 30,
            notes: `Estimate ${quote.number}. Draft only — send it from Billing when you are ready. Not posted to QuickBooks yet.`,
            wmsJobKey: jobKey,
            sourceType: "quote",
            sourceId: String(quote._id),
          });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          if (!/duplicate key|E11000/i.test(msg)) throw err;
          if (/wmsJobKey/i.test(msg)) {
            invoice = await Invoice.findOne({ companyId, wmsJobKey: jobKey });
            break;
          }
          number = `INV-${String(Number(number.replace(/\D/g, "")) + 1).padStart(5, "0")}`;
        }
      }
    }
    if (!invoice) {
      res.status(500).json({ error: "Could not create the draft invoice" });
      return;
    }
    quote.invoiceId = invoice._id;
    quote.status = "accepted";
    await quote.save();
    const saved = await Quote.findById(quote._id).populate("customerId", "name email");
    res.json({ quote: saved, invoice });
  } catch (err) {
    next(err);
  }
});

router.post("/:id/decline", async (req, res, next) => {
  try {
    const quote = await Quote.findOne({ _id: req.params.id, companyId: req.auth!.companyId });
    if (!quote) {
      res.status(404).json({ error: "Estimate not found" });
      return;
    }
    if (quote.invoiceId) {
      res.status(400).json({ error: "This estimate already has a draft invoice" });
      return;
    }
    quote.status = "declined";
    await quote.save();
    res.json({ quote });
  } catch (err) {
    next(err);
  }
});

export default router;
