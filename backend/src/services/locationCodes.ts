/**
 * Floor identity: Lane (A–Z) × Level (1–5) × Spot (A/B).
 * Example A1A = lane A, level 1, spot A. A1B is the pair on that level.
 * Column is only kept so older grid rows stay unique until a lane is saved.
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

/** Cesar's rack: 26 lanes, 20 columns, 5 levels, spots A and B. Code A05-3B. */
export const STANDARD_LANES = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
export const STANDARD_COLUMNS = 20;
export const STANDARD_LEVELS = 5;

/** Lane A, column 5, level 3, spot B → A05-3B. */
export function bayCode(lane: string, column: number, level: number, spot: SpotLetter) {
  const col = String(Math.min(STANDARD_COLUMNS, Math.max(1, column))).padStart(2, "0");
  const lvl = Math.min(STANDARD_LEVELS, Math.max(1, level));
  return `${lane.toUpperCase()}${col}-${lvl}${spot}`;
}

/** W-1, A-L1-S1, and the extra bay letter (AA1A) all rewrite to lane/level/spot. */
export function isLegacyFloorCode(code: string): boolean {
  const c = String(code || "").trim();
  return /^W-\d+$/.test(c) || /^[A-Z]+-L\d+-S\d+$/.test(c) || /^[A-Z]{2,}\d[AB]$/.test(c);
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
  const code = col > 0 ? `${lane}${section}${lvl}${letter}` : `${lane}${lvl}${letter}`;
  return {
    aisle: lane,
    section,
    level: lvl,
    spot: letter === "B" ? 2 : 1,
    spotLetter: letter,
    floorOnly: lvl === 1,
    code,
  };
}
