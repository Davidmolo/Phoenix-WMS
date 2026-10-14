import cron from "node-cron";
import { Customer } from "../models/Customer";
import { Company } from "../models/Company";
import { createAndPushInvoice } from "../services/billingInvoice";

function periodKey(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function monthBounds(d = new Date()) {
  const start = new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0);
  const end = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
  return { start, end };
}

/**
 * Cesar: Contract billing = 1st of the month, Net 30.
 * Idempotent per customer per calendar month via wmsJobKey.
 */
export async function runContractMonthlyInvoices(now = new Date()) {
  const key = periodKey(now);
  const { start, end } = monthBounds(now);
  const companies = await Company.find({}).select("_id").lean();
  const results: Array<{
    companyId: string;
    customerId: string;
    ok: boolean;
    created?: boolean;
    skipped?: string;
    invoiceNumber?: string;
    error?: string;
  }> = [];

  for (const co of companies) {
    const companyId = String(co._id);
    const customers = await Customer.find({
      companyId,
      active: true,
      billingMethod: "contract",
      contractFee: { $gt: 0 },
    });

    for (const customer of customers) {
      const customerId = String(customer._id);
      const fee = Number(customer.contractFee) || 0;
      if (fee <= 0) continue;
      try {
        const result = await createAndPushInvoice({
          companyId,
          customerId,
          wmsJobKey: `contract:${customerId}:${key}`,
          sourceType: "storage",
          sourceId: customerId,
          lines: [
            {
              description: `Contract storage — ${key}${
                customer.contractSqft ? ` · ${customer.contractSqft} SF` : ""
              }`,
              qty: 1,
              unitAmount: fee,
              amount: fee,
              type: "base_rent",
            },
          ],
          periodStart: start,
          periodEnd: end,
          notes: `Contract monthly · ${key} · Net 30`,
          termsDays: 30,
        });
        results.push({
          companyId,
          customerId,
          ok: true,
          created: result.created,
          skipped: "skipped" in result ? String(result.skipped || "") : undefined,
          invoiceNumber:
            result.invoice && "number" in result.invoice
              ? String((result.invoice as { number?: string }).number || "")
              : undefined,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        results.push({ companyId, customerId, ok: false, error: message });
        console.error(`[contract-cron] ${customerId} failed:`, message);
      }
    }
  }

  const created = results.filter((r) => r.ok && r.created).length;
  console.log(
    `[contract-cron] ${key}: ${created} created · ${results.length} contract account(s) checked`
  );
  return { period: key, results, created };
}

/** 06:00 on the 1st of each month (server local time). */
const CONTRACT_CRON = process.env.CONTRACT_MONTHLY_CRON || "0 6 1 * *";

export function startContractMonthlyCron() {
  if (process.env.CONTRACT_MONTHLY_ENABLED === "false") {
    console.log("[contract-cron] disabled (CONTRACT_MONTHLY_ENABLED=false)");
    return;
  }
  if (!cron.validate(CONTRACT_CRON)) {
    console.error(`[contract-cron] invalid cron "${CONTRACT_CRON}"`);
    return;
  }
  cron.schedule(CONTRACT_CRON, () => {
    void runContractMonthlyInvoices();
  });
  console.log(`[contract-cron] scheduled: ${CONTRACT_CRON} (1st of month · Net 30)`);
}
