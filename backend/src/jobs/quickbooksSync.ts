import cron from "node-cron";
import { env } from "../config/env";
import { QuickBooksConnection } from "../models/QuickBooksConnection";
import { quickbooksConfigured, syncInvoicesFromQuickBooks } from "../services/quickbooks";

let running = false;

/**
 * Sync invoices from QuickBooks for every connected company.
 * Safe to call from the manual Sync button path (per-company) or this cron.
 */
export async function syncAllQuickBooksConnections() {
  if (!quickbooksConfigured()) {
    return { ran: false, reason: "not_configured" as const };
  }

  const connections = await QuickBooksConnection.find({}).select("companyId").lean();
  if (connections.length === 0) {
    return { ran: false, reason: "no_connections" as const, companies: 0 };
  }

  const results: Array<{ companyId: string; ok: boolean; summary?: string; error?: string }> = [];

  for (const conn of connections) {
    const companyId = String(conn.companyId);
    try {
      const result = await syncInvoicesFromQuickBooks(companyId);
      results.push({ companyId, ok: true, summary: result.summary });
      console.log(`[qb-cron] ${companyId}: ${result.summary}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      results.push({ companyId, ok: false, error: message });
      console.error(`[qb-cron] ${companyId} failed:`, message);
    }
  }

  return { ran: true as const, companies: connections.length, results };
}

async function runCronTick() {
  if (running) {
    console.log("[qb-cron] previous sync still running — skipping this tick");
    return;
  }
  running = true;
  try {
    await syncAllQuickBooksConnections();
  } finally {
    running = false;
  }
}

/**
 * Start the in-process QuickBooks invoice sync schedule.
 * Staff can still click Sync invoices anytime; this keeps Mongo fresh in the background.
 */
export function startQuickBooksSyncCron() {
  if (!env.quickbooksSyncEnabled) {
    console.log("[qb-cron] disabled (QUICKBOOKS_SYNC_ENABLED=false)");
    return;
  }
  if (!quickbooksConfigured()) {
    console.log("[qb-cron] skipped — QuickBooks keys not configured");
    return;
  }
  if (!cron.validate(env.quickbooksSyncCron)) {
    console.error(
      `[qb-cron] invalid QUICKBOOKS_SYNC_CRON="${env.quickbooksSyncCron}" — expected 5-field cron (e.g. "*/15 * * * *")`
    );
    return;
  }

  cron.schedule(env.quickbooksSyncCron, () => {
    void runCronTick();
  });

  console.log(`[qb-cron] scheduled: ${env.quickbooksSyncCron} (manual Sync invoices still available)`);

  // Optional warm sync shortly after boot so portal/staff see fresh data without waiting
  if (env.quickbooksSyncOnBoot) {
    setTimeout(() => {
      void runCronTick();
    }, 15_000);
  }
}
