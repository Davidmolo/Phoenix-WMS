import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth";
import { env } from "../config/env";
import { QuickBooksConnection } from "../models/QuickBooksConnection";
import {
  buildConnectUrl,
  connectionStatus,
  parseOAuthState,
  quickbooksConfigured,
  saveTokensFromAuthCode,
  syncInvoicesFromQuickBooks,
} from "../services/quickbooks";

const router = Router();

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

export default router;
