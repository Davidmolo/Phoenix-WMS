import { createHmac, timingSafeEqual } from "crypto";
import { Router, type Request } from "express";
import { requireAuth, requireRole } from "../middleware/auth";
import { env } from "../config/env";
import { QuickBooksConnection } from "../models/QuickBooksConnection";
import {
  buildConnectUrl,
  connectionStatus,
  parseOAuthState,
  pushInvoiceToQuickBooks,
  quickbooksConfigured,
  saveTokensFromAuthCode,
  syncInvoiceByQuickBooksId,
  syncInvoicesFromQuickBooks,
} from "../services/quickbooks";
import { Invoice } from "../models/Invoice";

const router = Router();

function verifyIntuitWebhookSignature(rawBody: Buffer, signatureHeader: string, verifier: string) {
  if (!verifier || !signatureHeader) return false;
  const hash = createHmac("sha256", verifier).update(rawBody).digest("base64");
  try {
    const a = Buffer.from(hash);
    const b = Buffer.from(signatureHeader);
    return a.length === b.length && timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/** Intuit redirects here — no JWT (browser redirect). */
router.get("/callback", async (req, res) => {
  const appBilling = `${env.appUrl.replace(/\/$/, "")}/billing`;
  try {
    const code = String(req.query.code || "");
    const realmId = String(req.query.realmId || "");
    const state = String(req.query.state || "");
    const err = String(req.query.error || "");
    if (err) {
      res.redirect(`${appBilling}?qb=error&message=${encodeURIComponent(err)}`);
      return;
    }
    if (!code || !realmId || !state) {
      res.redirect(`${appBilling}?qb=error&message=${encodeURIComponent("Missing OAuth code")}`);
      return;
    }
    const { companyId, email } = parseOAuthState(state);
    await saveTokensFromAuthCode({ code, realmId, companyId, email });
    res.redirect(`${appBilling}?qb=connected`);
  } catch (e) {
    const message = e instanceof Error ? e.message : "QuickBooks connect failed";
    res.redirect(`${appBilling}?qb=error&message=${encodeURIComponent(message)}`);
  }
});

/** Soft landing pages for Intuit app URL settings (public). */
router.get("/disconnect", (_req, res) => {
  res.type("html").send(
    `<!doctype html><html><body style="font-family:system-ui;padding:2rem">
    <h1>QuickBooks disconnect URL</h1>
    <p>Use <strong>Billing → Disconnect QuickBooks</strong> inside Phoenix WMS to remove the connection.</p>
    <p><a href="${env.appUrl}/billing">Open Billing</a></p>
    </body></html>`
  );
});

router.get("/connect-page", (_req, res) => {
  res.type("html").send(
    `<!doctype html><html><body style="font-family:system-ui;padding:2rem">
    <h1>Connect QuickBooks</h1>
    <p>Sign in to Phoenix WMS as staff, open <strong>Billing</strong>, then click <strong>Connect QuickBooks</strong>.</p>
    <p><a href="${env.appUrl}/billing">Open Billing</a></p>
    </body></html>`
  );
});

/**
 * Intuit webhooks — when an Invoice/Payment changes in QB, refresh WMS (paid / unpaid / past_due).
 * Configure in Intuit Developer → Webhooks:
 *   URL: https://wms.phoenixcrossdocks.com/api/quickbooks/webhook
 *   Entities: Invoice, Payment
 * Cron sync remains as backup every few minutes.
 */
router.post("/webhook", async (req, res) => {
  try {
    const verifier = env.quickbooksWebhookVerifier;
    const signature = String(req.headers["intuit-signature"] || "");
    const raw = (req as Request & { rawBody?: Buffer }).rawBody;
    if (verifier) {
      if (!raw || !verifyIntuitWebhookSignature(raw, signature, verifier)) {
        res.status(401).json({ error: "Invalid webhook signature" });
        return;
      }
    }

    type Entity = { name?: string; id?: string; operation?: string };
    type Note = {
      realmId?: string;
      dataChangeEvent?: { entities?: Entity[] };
    };
    const payload = req.body as { eventNotifications?: Note[] };
    const notes = payload.eventNotifications || [];
    const results: Array<{ realmId: string; entity: string; id: string; ok: boolean; error?: string }> =
      [];

    for (const note of notes) {
      const realmId = String(note.realmId || "");
      const conn = realmId
        ? await QuickBooksConnection.findOne({ realmId })
        : null;
      if (!conn) continue;
      const companyId = String(conn.companyId);
      for (const ent of note.dataChangeEvent?.entities || []) {
        const name = String(ent.name || "");
        const id = String(ent.id || "");
        if (!id) continue;
        // Invoice balance changes on Payment too — refresh matching invoices via full sync of that id
        if (name === "Invoice") {
          try {
            await syncInvoiceByQuickBooksId(companyId, id);
            results.push({ realmId, entity: name, id, ok: true });
          } catch (e) {
            results.push({
              realmId,
              entity: name,
              id,
              ok: false,
              error: e instanceof Error ? e.message : String(e),
            });
          }
        } else if (name === "Payment") {
          // Payment payloads don't include invoice ids — pull recent invoices for this company
          try {
            await syncInvoicesFromQuickBooks(companyId);
            results.push({ realmId, entity: name, id, ok: true });
          } catch (e) {
            results.push({
              realmId,
              entity: name,
              id,
              ok: false,
              error: e instanceof Error ? e.message : String(e),
            });
          }
        }
      }
    }

    res.json({ ok: true, processed: results.length, results });
  } catch (err) {
    console.error("[qb-webhook]", err);
    res.status(500).json({ error: "Webhook processing failed" });
  }
});

router.use(requireAuth);
router.use(requireRole("admin", "staff"));

router.get("/status", async (req, res, next) => {
  try {
    const status = await connectionStatus(req.auth!.companyId);
    res.json(status);
  } catch (err) {
    next(err);
  }
});

router.get("/connect", async (req, res, next) => {
  try {
    if (!quickbooksConfigured()) {
      res.status(503).json({
        error:
          "QuickBooks is not configured on the server yet (QUICKBOOKS_CLIENT_ID / SECRET missing).",
      });
      return;
    }
    const url = buildConnectUrl(req.auth!.companyId, req.auth!.email || "");
    res.json({ url });
  } catch (err) {
    next(err);
  }
});

router.post("/disconnect", async (req, res, next) => {
  try {
    await QuickBooksConnection.deleteOne({ companyId: req.auth!.companyId });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.post("/sync", async (req, res, next) => {
  try {
    if (!quickbooksConfigured()) {
      res.status(503).json({ error: "QuickBooks is not configured on the server" });
      return;
    }
    const result = await syncInvoicesFromQuickBooks(req.auth!.companyId);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

/** Retry WMS → QB invoice push for one local invoice (idempotent). */
router.post("/push-invoice/:id", async (req, res, next) => {
  try {
    const inv = await Invoice.findOne({
      _id: req.params.id,
      companyId: req.auth!.companyId,
    });
    if (!inv) {
      res.status(404).json({ error: "Invoice not found" });
      return;
    }
    const result = await pushInvoiceToQuickBooks(String(inv._id));
    const fresh = await Invoice.findById(inv._id);
    res.json({ ...result, invoice: fresh });
  } catch (err) {
    next(err);
  }
});

/** Push all local invoices that are missing a QuickBooks Id. */
router.post("/push-pending", async (req, res, next) => {
  try {
    const pending = await Invoice.find({
      companyId: req.auth!.companyId,
      $or: [{ quickbooksId: null }, { quickbooksId: "" }],
      status: { $ne: "void" },
      total: { $gt: 0 },
    }).limit(50);
    const results = [];
    for (const inv of pending) {
      results.push(await pushInvoiceToQuickBooks(String(inv._id)));
    }
    res.json({
      attempted: results.length,
      pushed: results.filter((r) => r.pushed).length,
      results,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
