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

/**
 * Cesar: one lane, then levels, then the next column, then two pallet spots.
 * Spoken order is lane, level, column, spot. Example A-1-A-1.
 */
export const STANDARD_LANES = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
export const STANDARD_COLUMNS = 20;
export const STANDARD_LEVELS = 5;
export const STANDARD_CODE = /^[A-Z]-[1-5]-[A-T]-[12]$/;

export function columnLetter(column: number) {
  const n = Math.min(STANDARD_COLUMNS, Math.max(1, Math.floor(column)));
  return String.fromCharCode(64 + n);
}

/** Lane A, level 1, column A, spot 1 → A-1-A-1. Spot 2 is the other pallet. */
export function bayCode(
  lane: string,
  column: number,
  level: number,
  spot: number | SpotLetter | "1" | "2"
) {
  const lvl = Math.min(STANDARD_LEVELS, Math.max(1, Math.floor(level) || 1));
  const spotNo = spot === 2 || spot === "2" || spot === "B" || spot === "b" ? "2" : "1";
  return `${lane.toUpperCase()}-${lvl}-${columnLetter(column)}-${spotNo}`;
}

/** Older labels (A1A, AD1A, A05-3B) become lane-level-column-spot. */
export function toStandardBayCode(code: string): string | null {
  const raw = String(code || "").trim().toUpperCase();
  if (STANDARD_CODE.test(raw)) return raw;
  const picture = raw.match(/^([A-Z])(\d{2})-([1-5])([AB])$/);
  if (picture) return bayCode(picture[1], Number(picture[2]), Number(picture[3]), picture[4] as SpotLetter);
  const short = raw.match(/^([A-Z])([1-5])([AB])$/);
  if (short) return bayCode(short[1], 1, Number(short[2]), short[3] as SpotLetter);
  const long = raw.match(/^([A-Z])([A-Z])([1-5])([AB])$/);
  if (long) {
    const column = long[2].charCodeAt(0) - 64;
    return bayCode(long[1], column, Number(long[3]), long[4] as SpotLetter);
  }
  return null;
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
