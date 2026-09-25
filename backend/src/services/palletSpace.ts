/** Pallet footprint helpers — Cesar / prototype: 48"×48" = 16 SF. */

export function sqftFromInches(lengthIn?: number | null, widthIn?: number | null): number | null {
  if (lengthIn == null || widthIn == null || lengthIn <= 0 || widthIn <= 0) return null;
  return Math.round(((lengthIn * widthIn) / 144) * 100) / 100;
}

export function resolvePalletSqft(input: {
  sqft?: number | null;
  dimLength?: number | null;
  dimWidth?: number | null;
}): { sqft: number; dimLength: number; dimWidth: number } {
  const dimLength = Number(input.dimLength) > 0 ? Number(input.dimLength) : 48;
  const dimWidth = Number(input.dimWidth) > 0 ? Number(input.dimWidth) : 48;
  const fromDims = sqftFromInches(dimLength, dimWidth) ?? 16;
  const sqft = Number(input.sqft) > 0 ? Number(input.sqft) : fromDims;
  return { sqft, dimLength, dimWidth };
}

/** Single client reference box → PO and/or Job (same value is fine). */
export function splitClientReference(poOrJob: unknown): { poNumber: string; jobName: string } {
  const raw = String(poOrJob ?? "").trim();
  if (!raw) return { poNumber: "", jobName: "" };
  // Prefer storing in both so inventory/invoice search finds either column
  return { poNumber: raw, jobName: raw };
}
