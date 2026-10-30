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

function qbFaultMessage(data: Record<string, unknown>, status: number) {
  const fault = data.Fault as { Error?: Array<{ Message?: string; Detail?: string }> } | undefined;
  return (
    fault?.Error?.[0]?.Detail ||
    fault?.Error?.[0]?.Message ||
    `QuickBooks API error (${status})`
  );
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
  if (!res.ok) throw new Error(qbFaultMessage(data, res.status));
  return data as T;
}

async function qbPost<T>(
  companyId: string,
  pathAndQuery: string,
  body: Record<string, unknown>,
  opts?: { requestId?: string }
): Promise<T> {
  const conn = await getValidConnection(companyId);
  const url = `${apiHost()}/v3/company/${conn.realmId}/${pathAndQuery}`;
  const headers: Record<string, string> = {
    Accept: "application/json",
    "Content-Type": "application/json",
    Authorization: `Bearer ${conn.accessToken}`,
  };
  // Intuit idempotency — same Request-Id must not create a duplicate entity
  if (opts?.requestId) headers["Request-Id"] = opts.requestId.slice(0, 50);
  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new Error(qbFaultMessage(data, res.status));
  return data as T;
}

function mapInvoiceStatus(
  balance: number,
  _emailStatus?: string,
  dueDate?: Date | null
): "draft" | "sent" | "unpaid" | "paid" | "past_due" {
  if (balance <= 0) return "paid";
  // Overdue: still owed and due date has passed
  if (dueDate && dueDate.getTime() < Date.now()) return "past_due";
  // Balance owed but not yet past due → unpaid
  return "unpaid";
}

function ymd(d: Date) {
  return d.toISOString().slice(0, 10);
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
    source: "quickbooks",
    portalActivated: false,
    active: true,
  });
}

type QbInvoice = {
  Id?: string;
  SyncToken?: string;
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
    SalesItemLineDetail?: {
      Qty?: number;
      UnitPrice?: number;
      ItemRef?: { value?: string; name?: string };
    };
    SubTotalLineDetail?: Record<string, unknown>;
    DiscountLineDetail?: Record<string, unknown>;
    DescriptionOnly?: Record<string, unknown>;
  }>;
};

export type UpdateInvoiceInQbResult = {
  synced: boolean;
  skipped?: string;
  voided?: boolean;
  paymentCreated?: boolean;
  error?: string;
};

/**
 * Cesar: after admin edits an invoice in WMS, push DueDate / amount / notes to QBO.
 * Paid → create a Payment for remaining Balance; void → void the QBO invoice.
 */
export async function updateInvoiceInQuickBooks(invoiceId: string): Promise<UpdateInvoiceInQbResult> {
  const invoice = await Invoice.findById(invoiceId);
  if (!invoice) throw new Error("Invoice not found");
  const companyId = String(invoice.companyId);
  const qbId = String(invoice.quickbooksId || "");
  if (!qbId) {
    return { synced: false, skipped: "not_in_quickbooks" };
  }
  if (!env.quickbooksPushEnabled) {
    return { synced: false, skipped: "push_disabled" };
  }
  const cust = await Customer.findById(invoice.customerId).select("testAccount email");
  if (cust?.testAccount) {
    return { synced: false, skipped: "test_account" };
  }
  if (!quickbooksConfigured()) {
    return { synced: false, skipped: "not_configured" };
  }

  try {
    const raw = await qbGet<{ Invoice?: QbInvoice }>(
      companyId,
      `invoice/${qbId}?minorversion=65`
    );
    const qbInv = raw.Invoice;
    if (!qbInv?.Id || qbInv.SyncToken == null) {
      throw new Error(`QuickBooks invoice ${qbId} not found or missing SyncToken`);
    }

    // Void in QB
    if (invoice.status === "void") {
      await qbPost(companyId, "invoice?operation=void&minorversion=65", {
        Id: qbInv.Id,
        SyncToken: qbInv.SyncToken,
      });
      invoice.quickbooksPushError = "";
      await invoice.save();
      return { synced: true, voided: true };
    }

    const company = await Company.findById(companyId);
    const salesLines: Array<Record<string, unknown>> = [];
    const wmsLines = (invoice.lines || []).filter((l) => Number(l.amount) > 0);

    if (wmsLines.length > 0) {
      for (const line of wmsLines) {
        const amount = Number(line.amount) || 0;
        const qty = Number(line.qty) || 1;
        const unit = Number(line.unitAmount) || amount / qty;
        const itemId = await itemIdForLineType(
          companyId,
          String(line.type || "other"),
          company?.quickbooksItemMap as ItemMap | undefined
        );
        salesLines.push({
          DetailType: "SalesItemLineDetail",
          Amount: Math.round(amount * 100) / 100,
          Description: String(line.description || "WMS charge").slice(0, 4000),
          SalesItemLineDetail: {
            ItemRef: { value: itemId },
            Qty: qty,
            UnitPrice: Math.round(unit * 100) / 100,
          },
        });
      }
    } else {
      // No WMS lines — scale / replace existing QB sales lines to match WMS total
      const existingSales = (qbInv.Line || []).filter((l) => l.DetailType === "SalesItemLineDetail");
      const targetTotal = Math.round(Number(invoice.total) * 100) / 100;
      if (existingSales.length === 1) {
        const old = existingSales[0];
        const qty = Number(old.SalesItemLineDetail?.Qty ?? 1) || 1;
        salesLines.push({
          Id: old.Id,
          DetailType: "SalesItemLineDetail",
          Amount: targetTotal,
          Description: old.Description || invoice.number,
          SalesItemLineDetail: {
            ItemRef: old.SalesItemLineDetail?.ItemRef || {
              value: await itemIdForLineType(companyId, "other", company?.quickbooksItemMap as ItemMap),
            },
            Qty: qty,
            UnitPrice: Math.round((targetTotal / qty) * 100) / 100,
          },
        });
      } else if (existingSales.length > 1 && targetTotal >= 0) {
        const oldSum =
          existingSales.reduce((s, l) => s + (Number(l.Amount) || 0), 0) || targetTotal || 1;
        for (const old of existingSales) {
          const share = (Number(old.Amount) || 0) / oldSum;
          const amount = Math.round(targetTotal * share * 100) / 100;
          const qty = Number(old.SalesItemLineDetail?.Qty ?? 1) || 1;
          salesLines.push({
            Id: old.Id,
            DetailType: "SalesItemLineDetail",
            Amount: amount,
            Description: old.Description || "WMS charge",
            SalesItemLineDetail: {
              ItemRef: old.SalesItemLineDetail?.ItemRef || {
                value: await itemIdForLineType(companyId, "other", company?.quickbooksItemMap as ItemMap),
              },
              Qty: qty,
              UnitPrice: Math.round((amount / qty) * 100) / 100,
            },
          });
        }
      } else {
        const itemId = await itemIdForLineType(
          companyId,
          "other",
          company?.quickbooksItemMap as ItemMap | undefined
        );
        salesLines.push({
          DetailType: "SalesItemLineDetail",
          Amount: targetTotal,
          Description: `Phoenix WMS · ${invoice.number}`,
          SalesItemLineDetail: {
            ItemRef: { value: itemId },
            Qty: 1,
            UnitPrice: targetTotal,
          },
        });
      }
    }

    const payload: Record<string, unknown> = {
      Id: qbInv.Id,
      SyncToken: qbInv.SyncToken,
      sparse: true,
      Line: salesLines,
      PrivateNote: String(invoice.notes || "").slice(0, 4000),
    };
    if (invoice.dueDate) {
      payload.DueDate = ymd(invoice.dueDate instanceof Date ? invoice.dueDate : new Date(invoice.dueDate));
    }

    const updated = await qbPost<{ Invoice?: QbInvoice }>(
      companyId,
      "invoice?minorversion=65",
      payload
    );
    let paymentCreated = false;
    const fresh = await qbGet<{ Invoice?: QbInvoice }>(
      companyId,
      `invoice/${qbId}?minorversion=65`
    );
    const balance = Number(fresh.Invoice?.Balance) || 0;
    const wmsLeft =
      invoice.status === "paid"
        ? 0
        : Math.max(0, Number(invoice.balanceDue ?? invoice.total) || 0);
    const apply = Math.round((balance - wmsLeft) * 100) / 100;
    if (apply > 0.009) {
      const customerRef = String(fresh.Invoice?.CustomerRef?.value || qbInv.CustomerRef?.value || "");
      if (!customerRef) throw new Error("QuickBooks invoice missing CustomerRef for payment");
      await qbPost(
        companyId,
        "payment?minorversion=65",
        {
          CustomerRef: { value: customerRef },
          TotalAmt: apply,
          PrivateNote: `WMS balance $${wmsLeft.toFixed(2)}`.slice(0, 4000),
          Line: [
            {
              Amount: apply,
              LinkedTxn: [{ TxnId: qbId, TxnType: "Invoice" }],
            },
          ],
        },
        { requestId: `bal-${qbId}-${Math.round(apply * 100)}-${Math.round(wmsLeft * 100)}`.slice(0, 50) }
      );
      paymentCreated = true;
    }

    invoice.quickbooksPushError = "";
    await invoice.save();
    // Pull QB totals/status back into WMS
    try {
      await syncInvoiceByQuickBooksId(companyId, qbId);
    } catch {
      /* edit already saved locally */
    }
    return { synced: true, paymentCreated };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    invoice.quickbooksPushError = `QB sync after edit failed: ${message}`.slice(0, 500);
    await invoice.save();
    return { synced: false, error: message };
  }
}

/** Half deposit (or any partial). Leaves the invoice open in WMS and QuickBooks. */
export async function recordPartialPayment(
  invoiceId: string,
  amount: number,
  memo: string
): Promise<{ quickbooks: boolean; balanceDue: number }> {
  const invoice = await Invoice.findById(invoiceId);
  if (!invoice) throw new Error("Invoice not found");
  const paid = Math.round(amount * 100) / 100;
  const total = Number(invoice.total) || 0;
  const alreadyPaid = Math.max(0, Math.round((total - Number(invoice.balanceDue ?? total)) * 100) / 100);
  const remaining = Math.max(0, Math.round((total - alreadyPaid - paid) * 100) / 100);
  invoice.balanceDue = remaining;
  invoice.status = remaining <= 0.009 ? "paid" : "unpaid";
  invoice.notes = [invoice.notes, memo].filter(Boolean).join("\n");
  await invoice.save();

  const qbId = String(invoice.quickbooksId || "");
  const companyId = String(invoice.companyId);
  if (!qbId || !env.quickbooksPushEnabled || !quickbooksConfigured()) {
    return { quickbooks: false, balanceDue: remaining };
  }
  const cust = await Customer.findById(invoice.customerId).select("testAccount");
  if (cust?.testAccount) return { quickbooks: false, balanceDue: remaining };

  try {
    const fresh = await qbGet<{ Invoice?: QbInvoice }>(companyId, `invoice/${qbId}?minorversion=65`);
    const customerRef = String(fresh.Invoice?.CustomerRef?.value || "");
    if (!customerRef) throw new Error("QuickBooks invoice missing CustomerRef for payment");
    const qbBalance = Number(fresh.Invoice?.Balance) || 0;
    const apply = Math.min(paid, qbBalance);
    if (apply > 0.009) {
      await qbPost(
        companyId,
        "payment?minorversion=65",
        {
          CustomerRef: { value: customerRef },
          TotalAmt: Math.round(apply * 100) / 100,
          PrivateNote: memo.slice(0, 4000),
          Line: [
            {
              Amount: Math.round(apply * 100) / 100,
              LinkedTxn: [{ TxnId: qbId, TxnType: "Invoice" }],
            },
          ],
        },
        { requestId: `dep-${qbId}-${Math.round(apply * 100)}`.slice(0, 50) }
      );
    }
    await syncInvoiceByQuickBooksId(companyId, qbId);
    await Invoice.updateOne({ _id: invoice._id }, { $set: { quickbooksPushError: "" } });
    return { quickbooks: true, balanceDue: remaining };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    invoice.quickbooksPushError = `Partial payment not in QuickBooks: ${message}`.slice(0, 500);
    await invoice.save();
    return { quickbooks: false, balanceDue: remaining };
  }
}

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
    const status = mapInvoiceStatus(balanceDue, inv.EmailStatus, dueDate);

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
      // Keep WMS notes if we authored them; otherwise adopt QBO PrivateNote
      if (!existing.wmsJobKey) existing.notes = inv.PrivateNote || existing.notes || "";
      existing.quickbooksPushError = "";
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

/** Cesar: every billable customer must have an email on WMS (QB send + portal). */
export function requireCustomerEmail(email?: string | null): string {
  const to = String(email || "").trim();
  if (!to || !to.includes("@")) {
    throw new Error(
      "Customer email is required on WMS before creating or emailing a QuickBooks invoice"
    );
  }
  return to;
}

/** Keep QBO customer PrimaryEmailAddr in sync with WMS (needed for invoice Bill Email). */
async function syncQbCustomerEmail(companyId: string, qbCustomerId: string, email: string) {
  const to = requireCustomerEmail(email);
  try {
    const got = await qbGet<{ Customer?: { Id?: string; SyncToken?: string; PrimaryEmailAddr?: { Address?: string } } }>(
      companyId,
      `customer/${qbCustomerId}?minorversion=65`
    );
    const c = got.Customer;
    if (!c?.Id || c.SyncToken == null) return;
    const existing = String(c.PrimaryEmailAddr?.Address || "").trim().toLowerCase();
    if (existing === to.toLowerCase()) return;
    await qbPost(companyId, "customer?minorversion=65", {
      sparse: true,
      Id: String(c.Id),
      SyncToken: String(c.SyncToken),
      PrimaryEmailAddr: { Address: to },
    });
  } catch (err) {
    console.warn("[qb] could not sync customer email:", err instanceof Error ? err.message : err);
  }
}

/** Ensure WMS customer has a QBO Customer.Id (create in QB if missing). */
export async function ensureQuickBooksCustomer(companyId: string, customerId: string) {
  const customer = await Customer.findOne({ _id: customerId, companyId });
  if (!customer) throw new Error("Customer not found");
  const email = requireCustomerEmail(customer.email);
  if (customer.quickbooksCustomerId) {
    await syncQbCustomerEmail(companyId, String(customer.quickbooksCustomerId), email);
    return { customer, qbCustomerId: String(customer.quickbooksCustomerId) };
  }

  // Prefer match by DisplayName to avoid duplicates in QB
  const safeName = customer.name.replace(/'/g, "\\'");
  const query = encodeURIComponent(
    `select Id, DisplayName from Customer where DisplayName = '${safeName}' maxresults 1`
  );
  const found = await qbGet<{ QueryResponse?: { Customer?: Array<{ Id?: string }> } }>(
    companyId,
    `query?query=${query}&minorversion=65`
  );
  const existingId = found.QueryResponse?.Customer?.[0]?.Id;
  if (existingId) {
    customer.quickbooksCustomerId = String(existingId);
    await customer.save();
    await syncQbCustomerEmail(companyId, String(existingId), email);
    return { customer, qbCustomerId: String(existingId) };
  }

  const created = await qbPost<{ Customer?: { Id?: string } }>(
    companyId,
    "customer?minorversion=65",
    {
      DisplayName: customer.name.slice(0, 100),
      CompanyName: customer.name.slice(0, 50),
      PrimaryEmailAddr: { Address: email },
      PrimaryPhone: customer.phone ? { FreeFormNumber: customer.phone } : undefined,
      BillAddr: customer.address ? { Line1: customer.address.slice(0, 500) } : undefined,
      Notes: `WMS customer ${customer._id}`,
    }
  );
  const id = String(created.Customer?.Id || "");
  if (!id) throw new Error("QuickBooks did not return a Customer Id");
  customer.quickbooksCustomerId = id;
  await customer.save();
  return { customer, qbCustomerId: id };
}

type ItemMap = {
  handling?: string;
  storage?: string;
  overage?: string;
  rewrap?: string;
  crossdock?: string;
  detention?: string;
  ftl?: string;
  dwell?: string;
  accessorial?: string;
  other?: string;
  defaultItem?: string;
};

const itemIdCache = new Map<string, string>(); // companyId:ref → Item Id

async function findAnyServiceItemId(companyId: string): Promise<string | null> {
  const anyQ = encodeURIComponent(
    "select Id, Name from Item where Type = 'Service' maxresults 5"
  );
  const any = await qbGet<{ QueryResponse?: { Item?: Array<{ Id?: string }> } }>(
    companyId,
    `query?query=${anyQ}&minorversion=65`
  );
  return any.QueryResponse?.Item?.[0]?.Id ? String(any.QueryResponse.Item[0].Id) : null;
}

async function findIncomeAccountId(companyId: string): Promise<string | null> {
  const q = encodeURIComponent(
    "select Id, Name from Account where AccountType = 'Income' maxresults 5"
  );
  const raw = await qbGet<{ QueryResponse?: { Account?: Array<{ Id?: string }> } }>(
    companyId,
    `query?query=${q}&minorversion=65`
  );
  return raw.QueryResponse?.Account?.[0]?.Id
    ? String(raw.QueryResponse.Account[0].Id)
    : null;
}

async function resolveQbItemId(companyId: string, ref: string): Promise<string> {
  const key = `${companyId}:${ref}`;
  const cached = itemIdCache.get(key);
  if (cached) return cached;

  // Numeric Id already
  if (/^\d+$/.test(ref)) {
    itemIdCache.set(key, ref);
    return ref;
  }

  const safe = ref.replace(/'/g, "\\'");
  const query = encodeURIComponent(
    `select Id, Name from Item where Name = '${safe}' maxresults 1`
  );
  const found = await qbGet<{ QueryResponse?: { Item?: Array<{ Id?: string }> } }>(
    companyId,
    `query?query=${query}&minorversion=65`
  );
  let id = found.QueryResponse?.Item?.[0]?.Id;

  if (!id) {
    try {
      const incomeId = await findIncomeAccountId(companyId);
      const body: Record<string, unknown> = {
        Name: ref.slice(0, 100),
        Type: "Service",
      };
      if (incomeId) body.IncomeAccountRef = { value: incomeId };
      const created = await qbPost<{ Item?: { Id?: string } }>(
        companyId,
        "item?minorversion=65",
        body
      );
      id = created.Item?.Id;
    } catch {
      id = undefined;
    }
  }

  if (!id) id = (await findAnyServiceItemId(companyId)) || undefined;
  if (!id) {
    throw new Error(
      `QuickBooks Item "${ref}" not found — create a Service item in QB or set company.quickbooksItemMap`
    );
  }
  itemIdCache.set(key, String(id));
  return String(id);
}

async function itemIdForLineType(companyId: string, lineType: string, map?: ItemMap | null) {
  const m = map || {};
  const typeKey = lineType === "trailer_rework" ? "accessorial" : lineType;
  const ref =
    (m as Record<string, string | undefined>)[typeKey] ||
    m.defaultItem ||
    m.other ||
    "Services";
  return resolveQbItemId(companyId, ref || "Services");
}

export type PushInvoiceResult = {
  invoiceId: string;
  quickbooksId: string | null;
  pushed: boolean;
  emailed?: boolean;
  emailedTo?: string;
  skipped?: string;
  error?: string;
};

/**
 * Cesar: QuickBooks emails the invoice (includes QB Pay Now / ACH-card link when enabled).
 * POST /v3/company/{realmId}/invoice/{id}/send?sendTo=
 */
export async function sendInvoiceEmailViaQuickBooks(opts: {
  companyId: string;
  quickbooksInvoiceId: string;
  sendTo: string;
}) {
  const to = requireCustomerEmail(opts.sendTo);
  const conn = await getValidConnection(opts.companyId);
  const q = new URLSearchParams({ sendTo: to, minorversion: "65" });
  const url = `${apiHost()}/v3/company/${conn.realmId}/invoice/${opts.quickbooksInvoiceId}/send?${q.toString()}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${conn.accessToken}`,
      "Content-Type": "application/octet-stream",
    },
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new Error(qbFaultMessage(data, res.status));
  return { emailedTo: to, invoice: (data as { Invoice?: QbInvoice }).Invoice };
}

/** Pull one QBO invoice by Id and upsert into WMS (used by webhooks + targeted sync). */
export async function syncInvoiceByQuickBooksId(companyId: string, qbInvoiceId: string) {
  const raw = await qbGet<{ Invoice?: QbInvoice }>(
    companyId,
    `invoice/${qbInvoiceId}?minorversion=65`
  );
  const inv = raw.Invoice;
  if (!inv?.Id) throw new Error(`QuickBooks invoice ${qbInvoiceId} not found`);

  const qbCustomerId = String(inv.CustomerRef?.value || "");
  const displayName = String(inv.CustomerRef?.name || "QuickBooks customer");
  const email = String(inv.BillEmail?.Address || "");
  const customer = await resolveCustomer(companyId, qbCustomerId, displayName, email);

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

  const lineSum = lines.reduce((s, l) => s + l.amount, 0);
  const total =
    inv.TotalAmt != null && !Number.isNaN(Number(inv.TotalAmt)) ? Number(inv.TotalAmt) : lineSum;
  const balanceDue =
    inv.Balance != null && !Number.isNaN(Number(inv.Balance)) ? Number(inv.Balance) : total;
  const txnDate = inv.TxnDate ? new Date(`${inv.TxnDate}T12:00:00`) : new Date();
  const dueDate = inv.DueDate ? new Date(`${inv.DueDate}T12:00:00`) : null;
  const number = String(inv.DocNumber || `QB-${inv.Id}`).trim();
  const status = mapInvoiceStatus(balanceDue, inv.EmailStatus, dueDate);
  const qbId = String(inv.Id);

  const existing = await Invoice.findOne({ companyId, quickbooksId: qbId });
  if (existing) {
    // Don't overwrite WMS-authored line types/notes when we already own the invoice
    existing.status = status;
    existing.total = total;
    existing.subtotal = lineSum || existing.subtotal;
    existing.balanceDue = balanceDue;
    existing.dueDate = dueDate;
    if (!existing.wmsJobKey) {
      existing.set("lines", lines);
      existing.notes = inv.PrivateNote || existing.notes || "";
      existing.number = number;
    }
    await existing.save();
    return { invoice: existing, updated: true as const };
  }

  const numberTaken = await Invoice.findOne({ companyId, number, quickbooksId: { $ne: qbId } });
  const safeNumber = numberTaken ? `QB-${number}-${qbId}` : number;
  const created = await Invoice.create({
    companyId,
    customerId: customer._id,
    number: safeNumber,
    periodStart: txnDate,
    periodEnd: txnDate,
    status,
    lines,
    subtotal: lineSum,
    total,
    balanceDue,
    dueDate,
    notes: inv.PrivateNote || "Synced from QuickBooks",
    quickbooksId: qbId,
    sourceType: "quickbooks",
  });
  return { invoice: created, updated: false as const };
}

/**
 * Cesar: invoice sync is one-way WMS → QB.
 * Idempotent via Invoice.quickbooksId + wmsJobKey + Request-Id header.
 */
export async function pushInvoiceToQuickBooks(invoiceId: string): Promise<PushInvoiceResult> {
  const invoice = await Invoice.findById(invoiceId);
  if (!invoice) throw new Error("Invoice not found");
  const companyId = String(invoice.companyId);

  if (invoice.quickbooksId) {
    return {
      invoiceId: String(invoice._id),
      quickbooksId: invoice.quickbooksId,
      pushed: false,
      skipped: "already_pushed",
    };
  }

  // Cesar: live customers only — test accounts and global kill-switch stay WMS-only
  if (!env.quickbooksPushEnabled) {
    invoice.quickbooksPushError = "Skipped: QUICKBOOKS_PUSH_ENABLED=false";
    await invoice.save();
    return {
      invoiceId: String(invoice._id),
      quickbooksId: null,
      pushed: false,
      skipped: "push_disabled",
    };
  }
  const custFlags = await Customer.findById(invoice.customerId).select("testAccount email");
  if (custFlags?.testAccount) {
    invoice.quickbooksPushError = "Skipped: test customer (testAccount)";
    await invoice.save();
    return {
      invoiceId: String(invoice._id),
      quickbooksId: null,
      pushed: false,
      skipped: "test_account",
    };
  }

  if (!quickbooksConfigured()) {
    return {
      invoiceId: String(invoice._id),
      quickbooksId: null,
      pushed: false,
      skipped: "not_configured",
    };
  }

  const conn = await QuickBooksConnection.findOne({ companyId });
  if (!conn) {
    invoice.quickbooksPushError = "QuickBooks not connected";
    await invoice.save();
    return {
      invoiceId: String(invoice._id),
      quickbooksId: null,
      pushed: false,
      skipped: "not_connected",
    };
  }

  try {
    const company = await Company.findById(companyId);
    const { customer, qbCustomerId } = await ensureQuickBooksCustomer(
      companyId,
      String(invoice.customerId)
    );
    const billEmail = requireCustomerEmail(customer.email);

    const lines = [];
    for (const line of invoice.lines || []) {
      const amount = Number(line.amount) || 0;
      if (amount === 0) continue;
      const qty = Number(line.qty) || 1;
      const unit = Number(line.unitAmount) || amount / qty;
      const itemId = await itemIdForLineType(
        companyId,
        String(line.type || "other"),
        company?.quickbooksItemMap as ItemMap | undefined
      );
      lines.push({
        DetailType: "SalesItemLineDetail",
        Amount: Math.round(amount * 100) / 100,
        Description: String(line.description || "WMS charge").slice(0, 4000),
        SalesItemLineDetail: {
          ItemRef: { value: itemId },
          Qty: qty,
          UnitPrice: Math.round(unit * 100) / 100,
        },
      });
    }

    if (lines.length === 0) {
      return {
        invoiceId: String(invoice._id),
        quickbooksId: null,
        pushed: false,
        skipped: "no_lines",
      };
    }

    // termsDays 0 = due same day (crossdock/rework). Do NOT use `|| 30` — 0 is valid.
    const termsDays =
      invoice.termsDays != null && !Number.isNaN(Number(invoice.termsDays))
        ? Number(invoice.termsDays)
        : 30;
    const txnDate = invoice.periodEnd || invoice.periodStart || new Date();
    const due =
      invoice.dueDate ||
      new Date(txnDate.getTime() + Math.max(0, termsDays) * 24 * 60 * 60 * 1000);
    // Persist corrected due/terms so retries stay consistent
    invoice.dueDate = due;
    invoice.termsDays = termsDays;

    const wmsTag = invoice.wmsJobKey ? `WMS:${invoice.wmsJobKey}` : `WMS:inv:${invoice._id}`;
    const privateNote = [
      wmsTag,
      invoice.sourceId ? `source:${invoice.sourceType || "job"}:${invoice.sourceId}` : null,
      invoice.notes || null,
    ]
      .filter(Boolean)
      .join(" · ")
      .slice(0, 4000);

    // Recover if a prior push succeeded in QB but WMS lost the Id (no duplicate)
    if (invoice.wmsJobKey) {
      const existingQbId = await findQbInvoiceIdByWmsKey(companyId, invoice.wmsJobKey);
      if (existingQbId) {
        invoice.quickbooksId = existingQbId;
        invoice.quickbooksPushError = "";
        invoice.status = mapInvoiceStatus(Number(invoice.balanceDue ?? invoice.total), undefined, due);
        await invoice.save();
        // Still try Pay Now email — customer may never have received the QB send
        let emailed = false;
        let emailedTo: string | undefined;
        try {
          const to = requireCustomerEmail(billEmail);
          await sendInvoiceEmailViaQuickBooks({
            companyId,
            quickbooksInvoiceId: existingQbId,
            sendTo: to,
          });
          emailed = true;
          emailedTo = to;
        } catch (mailErr) {
          const mailMsg = mailErr instanceof Error ? mailErr.message : String(mailErr);
          invoice.quickbooksPushError = `Recovered QB Id but email failed: ${mailMsg}`.slice(0, 500);
          await invoice.save();
        }
        return {
          invoiceId: String(invoice._id),
          quickbooksId: existingQbId,
          pushed: false,
          skipped: "recovered_existing_qb",
          emailed,
          emailedTo,
        };
      }
    }

    const requestId = (invoice.wmsJobKey || String(invoice._id)).replace(/[^a-zA-Z0-9_-]/g, "-");

    const payload: Record<string, unknown> = {
      Line: lines,
      CustomerRef: { value: qbCustomerId },
      // QB "Enter customer email" on the invoice comes from BillEmail — not only the customer record
      BillEmail: { Address: billEmail },
      TxnDate: ymd(txnDate),
      DueDate: ymd(due),
      PrivateNote: privateNote,
      CustomerMemo: {
        value: `Phoenix WMS · ${invoice.number}${invoice.wmsJobKey ? ` · ${invoice.wmsJobKey}` : ""}`.slice(
          0,
          1000
        ),
      },
    };

    // Prefer stable DocNumber from WMS invoice number when QB accepts it
    if (invoice.number) {
      payload.DocNumber = String(invoice.number).slice(0, 21);
    }

    let created: { Invoice?: { Id?: string; DocNumber?: string; Balance?: number } };
    try {
      created = await qbPost(companyId, "invoice?minorversion=65", payload, { requestId });
    } catch (createErr) {
      const msg = createErr instanceof Error ? createErr.message : String(createErr);
      // DocNumber collision — retry once without DocNumber (QB assigns its own)
      if (/docnumber|duplicate document|already exists/i.test(msg) && payload.DocNumber) {
        delete payload.DocNumber;
        created = await qbPost(companyId, "invoice?minorversion=65", payload, {
          requestId: `${requestId}-r`,
        });
      } else {
        // Last chance: another request may have created it
        if (invoice.wmsJobKey) {
          const recovered = await findQbInvoiceIdByWmsKey(companyId, invoice.wmsJobKey);
          if (recovered) {
            invoice.quickbooksId = recovered;
            invoice.quickbooksPushError = "";
            await invoice.save();
            return {
              invoiceId: String(invoice._id),
              quickbooksId: recovered,
              pushed: false,
              skipped: "recovered_after_error",
            };
          }
        }
        throw createErr;
      }
    }

    const qbId = String(created.Invoice?.Id || "");
    if (!qbId) throw new Error("QuickBooks did not return an Invoice Id");

    invoice.quickbooksId = qbId;
    invoice.balanceDue =
      created.Invoice?.Balance != null ? Number(created.Invoice.Balance) : invoice.total;
    invoice.status = mapInvoiceStatus(Number(invoice.balanceDue), undefined, due);
    invoice.dueDate = due;
    invoice.quickbooksPushError = "";
    if (created.Invoice?.DocNumber) {
      const doc = String(created.Invoice.DocNumber);
      if (doc && doc !== invoice.number) {
        const clash = await Invoice.findOne({
          companyId,
          number: doc,
          _id: { $ne: invoice._id },
        });
        if (!clash) invoice.number = doc;
      }
    }
    await invoice.save();

    // Email via QuickBooks (Pay Now link when enabled on the QB company)
    let emailed = false;
    let emailedTo: string | undefined;
    try {
      const cust = await Customer.findById(invoice.customerId).select("email");
      const to = requireCustomerEmail(cust?.email);
      await sendInvoiceEmailViaQuickBooks({
        companyId,
        quickbooksInvoiceId: qbId,
        sendTo: to,
      });
      emailed = true;
      emailedTo = to;
    } catch (mailErr) {
      const mailMsg = mailErr instanceof Error ? mailErr.message : String(mailErr);
      invoice.quickbooksPushError = `Invoice created in QB but email failed: ${mailMsg}`.slice(0, 500);
      await invoice.save();
    }

    return {
      invoiceId: String(invoice._id),
      quickbooksId: qbId,
      pushed: true,
      emailed,
      emailedTo,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    invoice.quickbooksPushError = message.slice(0, 500);
    await invoice.save();
    return {
      invoiceId: String(invoice._id),
      quickbooksId: null,
      pushed: false,
      error: message,
    };
  }
}

/** Find an existing QBO invoice by our WMS: job key in PrivateNote (dedupe). */
async function findQbInvoiceIdByWmsKey(companyId: string, wmsJobKey: string): Promise<string | null> {
  // QBO query can't reliably CONTAINS PrivateNote — pull recent and scan
  const query = encodeURIComponent(
    "select Id, DocNumber, PrivateNote from Invoice order by MetaData.CreateTime DESC MAXRESULTS 50"
  );
  try {
    const raw = await qbGet<{
      QueryResponse?: { Invoice?: Array<{ Id?: string; PrivateNote?: string }> };
    }>(companyId, `query?query=${query}&minorversion=65`);
    const needle = `WMS:${wmsJobKey}`;
    for (const inv of raw.QueryResponse?.Invoice || []) {
      if (String(inv.PrivateNote || "").includes(needle) && inv.Id) {
        return String(inv.Id);
      }
    }
  } catch {
    /* best-effort dedupe */
  }
  return null;
}
