import { DEFAULT_FEE_SCHEDULE } from "../constants/feeSchedule";
import type { Company } from "../models/Company";
import type { Customer } from "../models/Customer";

export type FeeScheduleRates = typeof DEFAULT_FEE_SCHEDULE & Record<string, unknown>;

/** Company published schedule (defaults + company overrides). */
export function resolveCompanyFees(
  company?: { feeSchedule?: Record<string, unknown> | null } | null
): FeeScheduleRates {
  return {
    ...DEFAULT_FEE_SCHEDULE,
    ...((company?.feeSchedule || {}) as Record<string, unknown>),
  } as FeeScheduleRates;
}

export function isContractCustomer(
  customer: { billingMethod?: string | null } | null | undefined
): boolean {
  return customer?.billingMethod === "contract";
}

/**
 * Cesar Oct 14: per-pallet costs come from the fee schedule except contract.
 * Admin may set a positive per-customer override; blank/0 → schedule.
 */
export function pickPerPalletRate(
  override: number | null | undefined,
  scheduleRate: number
): number {
  if (override == null || override === ("" as unknown)) {
    return Number(scheduleRate) || 0;
  }
  const n = Number(override);
  if (Number.isFinite(n) && n > 0) return n;
  return Number(scheduleRate) || 0;
}

export function unloadPerPallet(
  customer: InstanceType<typeof Customer> | { unloadFee?: number | null },
  fees: FeeScheduleRates
): number {
  return pickPerPalletRate(customer.unloadFee, Number(fees.unloadLoadPerPallet ?? 14));
}

export function loadPerPallet(
  customer: InstanceType<typeof Customer> | { loadFee?: number | null },
  fees: FeeScheduleRates
): number {
  return pickPerPalletRate(customer.loadFee, Number(fees.unloadLoadPerPallet ?? 14));
}

export function crossdockPerPallet(
  customer: { crossdockPerPallet?: number | null } | null | undefined,
  fees: FeeScheduleRates
): number {
  return pickPerPalletRate(
    customer?.crossdockPerPallet ?? null,
    Number(fees.crossDockPerPallet ?? 25)
  );
}

export async function loadCompanyFees(companyId: string): Promise<FeeScheduleRates> {
  const { Company: CompanyModel } = await import("../models/Company");
  const company = await CompanyModel.findById(companyId).select("feeSchedule").lean();
  return resolveCompanyFees(company as InstanceType<typeof Company> | null);
}
