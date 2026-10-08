import jwt from "jsonwebtoken";
import { env } from "../config/env";
import { QuickBooksConnection } from "../models/QuickBooksConnection";
import { Customer } from "../models/Customer";
import { Invoice } from "../models/Invoice";
import { Company } from "../models/Company";

const AUTH_URL = "https://appcenter.intuit.com/connect/oauth2";
const TOKEN_URL = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";
const SCOPES = "com.intuit.quickbooks.accounting";

function apiHost() {
  return env.quickbooksEnv === "production"
    ? "https://quickbooks.api.intuit.com"
    : "https://sandbox-quickbooks.api.intuit.com";
}

export function quickbooksConfigured() {
  return Boolean(env.quickbooksClientId && env.quickbooksClientSecret && env.quickbooksRedirectUri);
}

function basicAuthHeader() {
  const raw = `${env.quickbooksClientId}:${env.quickbooksClientSecret}`;
  return `Basic ${Buffer.from(raw).toString("base64")}`;
}

export function buildConnectUrl(companyId: string, email: string) {
  const state = jwt.sign(
    { companyId, email, purpose: "qb_oauth" },
    env.jwtSecret,
    { expiresIn: "20m" }
  );
  const params = new URLSearchParams({
    client_id: env.quickbooksClientId,
    redirect_uri: env.quickbooksRedirectUri,
    response_type: "code",
    scope: SCOPES,
    state,
  });
  return `${AUTH_URL}?${params.toString()}`;
}

export function parseOAuthState(state: string): { companyId: string; email: string } {
  const payload = jwt.verify(state, env.jwtSecret) as {
    companyId?: string;
    email?: string;
    purpose?: string;
  };
  if (payload.purpose !== "qb_oauth" || !payload.companyId) {
    throw new Error("Invalid OAuth state");
  }
  return { companyId: payload.companyId, email: payload.email || "" };
}

async function exchangeToken(body: Record<string, string>) {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: basicAuthHeader(),
    },
    body: new URLSearchParams(body).toString(),
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const msg =
      (typeof data.error_description === "string" && data.error_description) ||
      (typeof data.error === "string" && data.error) ||
      `Token exchange failed (${res.status})`;
    throw new Error(msg);
  }
  return data as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
    x_refresh_token_expires_in?: number;
  };
}

export async function saveTokensFromAuthCode(opts: {
  code: string;
  realmId: string;
  companyId: string;
  email: string;
}) {
  const tokens = await exchangeToken({
    grant_type: "authorization_code",
    code: opts.code,
    redirect_uri: env.quickbooksRedirectUri,
  });
  const now = Date.now();
  const doc = await QuickBooksConnection.findOneAndUpdate(
    { companyId: opts.companyId },
    {
      companyId: opts.companyId,
      realmId: opts.realmId,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      accessTokenExpiresAt: new Date(now + tokens.expires_in * 1000),
      refreshTokenExpiresAt: tokens.x_refresh_token_expires_in
        ? new Date(now + tokens.x_refresh_token_expires_in * 1000)
        : null,
      connectedByEmail: opts.email,
      environment: env.quickbooksEnv,
    },
    { upsert: true, new: true }
  );
  return doc;
}

async function refreshAccessToken(conn: {
  companyId: unknown;
  refreshToken: string;
}) {
  const tokens = await exchangeToken({
    grant_type: "refresh_token",
    refresh_token: conn.refreshToken,
  });
  const now = Date.now();
  return QuickBooksConnection.findOneAndUpdate(
    { companyId: conn.companyId },
    {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token || conn.refreshToken,
      accessTokenExpiresAt: new Date(now + tokens.expires_in * 1000),
      refreshTokenExpiresAt: tokens.x_refresh_token_expires_in
        ? new Date(now + tokens.x_refresh_token_expires_in * 1000)
        : null,
    },
    { new: true }
  );
}

async function getValidConnection(companyId: string) {
  let conn = await QuickBooksConnection.findOne({ companyId });
  if (!conn) throw new Error("QuickBooks is not connected yet");
  const skewMs = 60_000;
  if (conn.accessTokenExpiresAt.getTime() <= Date.now() + skewMs) {
    conn = await refreshAccessToken(conn);
    if (!conn) throw new Error("Could not refresh QuickBooks token");
  }
  return conn;
}

async function qbGet<T>(companyId: string, pathAndQuery: string): Promise<T> {
  const conn = await getValidConnection(companyId);
  const url = `${apiHost()}/v3/company/${conn.realmId}/${pathAndQuery}`;
  const res = await fetch(url, {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${conn.accessToken}`,
    },
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const fault = data.Fault as { Error?: Array<{ Message?: string; Detail?: string }> } | undefined;
    const msg =
      fault?.Error?.[0]?.Detail ||
      fault?.Error?.[0]?.Message ||
      `QuickBooks API error (${res.status})`;
    throw new Error(msg);
  }
  return data as T;
}

function mapInvoiceStatus(balance: number, emailStatus?: string): "draft" | "sent" | "paid" | "past_due" {
  if (balance <= 0) return "paid";
  if (String(emailStatus || "").toLowerCase() === "emailSent") return "sent";
  return "sent";
}

async function resolveCustomer(
  companyId: string,
  qbCustomerId: string,
  displayName: string,
  email: string
) {
  if (qbCustomerId) {
    const byQb = await Customer.findOne({ companyId, quickbooksCustomerId: qbCustomerId });
    if (byQb) return byQb;
  }
  const name = (displayName || "QuickBooks customer").trim();
  if (email) {
    const byEmail = await Customer.findOne({
      companyId,
      email: new RegExp(`^${email.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i"),
    });
    if (byEmail) {
      byEmail.quickbooksCustomerId = qbCustomerId || byEmail.quickbooksCustomerId;
      await byEmail.save();
      return byEmail;
    }
  }
  const byName = await Customer.findOne({
    companyId,
    name: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i"),
  });
  if (byName) {
    byName.quickbooksCustomerId = qbCustomerId || byName.quickbooksCustomerId;
    await byName.save();
    return byName;
  }

  return Customer.create({
    companyId,
    name,
    email: email || "",
    contact: "",
    billingMethod: "crossdock",
    quickbooksCustomerId: qbCustomerId || null,
    portalActivated: false,
    active: true,
  });
}

type QbInvoice = {
  Id?: string;
  DocNumber?: string;
  TxnDate?: string;
  DueDate?: string;
  TotalAmt?: number;
  Balance?: number;
  PrivateNote?: string;
  EmailStatus?: string;
  CustomerRef?: { value?: string; name?: string };
  BillEmail?: { Address?: string };
  Line?: Array<{
    Id?: string;
    Amount?: number;
    Description?: string;
    DetailType?: string;
    SalesItemLineDetail?: { Qty?: number; UnitPrice?: number };
    SubTotalLineDetail?: Record<string, unknown>;
    DiscountLineDetail?: Record<string, unknown>;
    DescriptionOnly?: Record<string, unknown>;
  }>;
};

export async function syncInvoicesFromQuickBooks(companyId: string) {
  const company = await Company.findById(companyId);
  if (!company) throw new Error("Company not found");

  // Pull recent invoices (QBO query max ~1000; paginate if needed later)
  const query = encodeURIComponent(
    "select * from Invoice order by MetaData.LastUpdatedTime DESC MAXRESULTS 100"
  );
  const raw = await qbGet<{ QueryResponse?: { Invoice?: QbInvoice[] } }>(
    companyId,
    `query?query=${query}&minorversion=65`
  );
  const list = raw.QueryResponse?.Invoice || [];

  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (const inv of list) {
    const qbId = String(inv.Id || "");
    if (!qbId) {
      skipped += 1;
      continue;
    }

    const qbCustomerId = String(inv.CustomerRef?.value || "");
    const displayName = String(inv.CustomerRef?.name || "QuickBooks customer");
    const email = String(inv.BillEmail?.Address || "");
    const customer = await resolveCustomer(companyId, qbCustomerId, displayName, email);

    // QBO returns SubTotal / Discount / DescriptionOnly rows too — never treat those as items.
    const lines = (inv.Line || [])
      .filter((l) => l.DetailType === "SalesItemLineDetail")
      .map((l) => {
        const qty = Number(l.SalesItemLineDetail?.Qty ?? 1) || 1;
        const amount = Number(l.Amount ?? 0);
        const unitFromQb = l.SalesItemLineDetail?.UnitPrice;
        const unit =
          unitFromQb != null && !Number.isNaN(Number(unitFromQb))
            ? Number(unitFromQb)
            : qty
              ? amount / qty
              : amount;
        return {
          description: l.Description || "QuickBooks line",
          qty,
          unitAmount: unit,
          amount,
          type: "other" as const,
        };
      });

    // Always prefer QBO TotalAmt (authoritative). Fall back to sales lines only.
    const lineSum = lines.reduce((s, l) => s + l.amount, 0);
    const total =
      inv.TotalAmt != null && !Number.isNaN(Number(inv.TotalAmt))
        ? Number(inv.TotalAmt)
        : lineSum;
    const balanceDue =
      inv.Balance != null && !Number.isNaN(Number(inv.Balance)) ? Number(inv.Balance) : total;
    const subtotal = lineSum;
    const txnDate = inv.TxnDate ? new Date(`${inv.TxnDate}T12:00:00`) : new Date();
    const dueDate = inv.DueDate ? new Date(`${inv.DueDate}T12:00:00`) : null;
    const number = String(inv.DocNumber || `QB-${qbId}`).trim();
    const status = mapInvoiceStatus(balanceDue, inv.EmailStatus);

    const existing = await Invoice.findOne({ companyId, quickbooksId: qbId });
    if (existing) {
      existing.customerId = customer._id;
      existing.number = number;
      existing.periodStart = txnDate;
      existing.periodEnd = txnDate;
      existing.status = status;
      existing.set("lines", lines);
      existing.subtotal = subtotal;
      existing.total = total;
      existing.balanceDue = balanceDue;
      existing.dueDate = dueDate;
      existing.notes = inv.PrivateNote || existing.notes || "";
      await existing.save();
      updated += 1;
      continue;
    }

    // Avoid unique number clash with a non-QB invoice
    const numberTaken = await Invoice.findOne({ companyId, number, quickbooksId: { $ne: qbId } });
    const safeNumber = numberTaken ? `QB-${number}-${qbId}` : number;

    await Invoice.create({
      companyId,
      customerId: customer._id,
      number: safeNumber,
      periodStart: txnDate,
      periodEnd: txnDate,
      status,
      lines,
      subtotal,
      total,
      balanceDue,
      dueDate,
      notes: inv.PrivateNote || "Synced from QuickBooks",
      quickbooksId: qbId,
    });
    created += 1;
  }

  const summary = `Synced ${list.length} QBO invoices · ${created} new · ${updated} updated · ${skipped} skipped`;
  await QuickBooksConnection.findOneAndUpdate(
    { companyId },
    { lastSyncAt: new Date(), lastSyncSummary: summary }
  );

  return { fetched: list.length, created, updated, skipped, summary };
}

export async function connectionStatus(companyId: string) {
  const conn = await QuickBooksConnection.findOne({ companyId }).lean();
  return {
    configured: quickbooksConfigured(),
    environment: env.quickbooksEnv,
    connected: Boolean(conn),
    realmId: conn?.realmId || null,
    connectedByEmail: conn?.connectedByEmail || null,
    lastSyncAt: conn?.lastSyncAt || null,
    lastSyncSummary: conn?.lastSyncSummary || "",
    redirectUri: env.quickbooksRedirectUri,
    autoSyncEnabled: env.quickbooksSyncEnabled && quickbooksConfigured(),
    autoSyncCron: env.quickbooksSyncCron,
  };
}
