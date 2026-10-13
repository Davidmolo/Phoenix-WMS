import type { Shipment } from "@/types";

/** Pull planned pallet count from dedicated field or notes ("10 pallet(s)"). */
export function expectedPalletCountOf(exp: Shipment | undefined | null): number | null {
  if (!exp) return null;
  if (exp.expectedPalletCount != null && Number(exp.expectedPalletCount) > 0) {
    return Math.max(1, Math.min(200, Number(exp.expectedPalletCount)));
  }
  const m = String(exp.notes || "").match(/(\d+)\s*pallet/i);
  if (m) return Math.max(1, Math.min(200, Number(m[1])));
  return null;
}

export function customerIdOfShipment(exp: Shipment): string {
  if (!exp.customerId) return "";
  return typeof exp.customerId === "string"
    ? exp.customerId
    : String((exp.customerId as { _id?: string })._id || "");
}
