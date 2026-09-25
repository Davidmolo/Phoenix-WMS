/** Convert inches × inches → square feet (48×48 = 16). */
export function sqftFromInches(lengthIn: number, widthIn: number): number {
  if (lengthIn <= 0 || widthIn <= 0) return 16;
  return Math.round(((lengthIn * widthIn) / 144) * 100) / 100;
}
