/**
 * Floor identity: Lane (row A–Z) × section (column A–Z) × Level (1–5) × Spot (A/B).
 * Example AA1A = lane A, first bay, level 1, spot A. AA1B is the pair beside it.
 */

export type SpotLetter = "A" | "B";

export function laneFromIndex(index: number): string {
  let n = Math.max(0, Math.floor(index)) + 1;
  let s = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

export function spotLetterOf(spot: number | string | null | undefined): SpotLetter {
  if (spot === 2 || spot === "2" || spot === "B" || spot === "b") return "B";
  return "A";
}

/** W-1 and the earlier A-L1-S1 labels both get rewritten to lane/level/spot. */
export function isLegacyFloorCode(code: string): boolean {
  const c = String(code || "").trim();
  return /^W-\d+$/.test(c) || /^[A-Z]+-L\d+-S\d+$/.test(c);
}

export function structuredSlot(
  row: number,
  col: number,
  level = 1,
  spot: number | SpotLetter = "A"
) {
  const lane = laneFromIndex(row);
  const section = laneFromIndex(col);
  const lvl = Math.min(5, Math.max(1, Math.floor(level) || 1));
  const letter = spotLetterOf(spot);
  return {
    aisle: lane,
    section,
    level: lvl,
    spot: letter === "B" ? 2 : 1,
    spotLetter: letter,
    floorOnly: lvl === 1,
    code: `${lane}${section}${lvl}${letter}`,
  };
}
