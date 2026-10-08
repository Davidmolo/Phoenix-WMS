/** Pallets still in the warehouse (not shipped/void). */
export const ACTIVE_PALLET_STATUSES = [
  "received",
  "staged_for_store",
  "stored",
  "staged",
] as const;

export type ActivePalletStatus = (typeof ACTIVE_PALLET_STATUSES)[number];
