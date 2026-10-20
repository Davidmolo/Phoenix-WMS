import { Location } from "../models/Location";
import { STANDARD_CODE, toStandardBayCode } from "./locationCodes";

/** Cesar: standard 48×48 = 1 slot; anything larger on a side needs 2 adjacent slots. */
export function slotsPerPallet(dimLength?: number | null, dimWidth?: number | null): number {
  const L = Number(dimLength) || 48;
  const W = Number(dimWidth) || 48;
  return L > 48 || W > 48 ? 2 : 1;
}

type LocLean = {
  _id: unknown;
  code: string;
  aisle?: string;
  row?: number;
  col?: number;
  spot?: number;
};

function codeNum(code: string): number | null {
  const m = String(code).match(/(\d+)\s*$/);
  return m ? Number(m[1]) : null;
}

function areAdjacent(a: LocLean, b: LocLean): boolean {
  if (a.row != null && b.row != null && a.col != null && b.col != null) {
    if (a.row === b.row && Math.abs(Number(a.col) - Number(b.col)) === 1) return true;
    if (a.col === b.col && Math.abs(Number(a.row) - Number(b.row)) === 1) return true;
  }
  if ((a.aisle || "") === (b.aisle || "")) {
    const na = codeNum(a.code);
    const nb = codeNum(b.code);
    if (na != null && nb != null && Math.abs(na - nb) === 1) return true;
    if (a.spot != null && b.spot != null && Math.abs(Number(a.spot) - Number(b.spot)) === 1) {
      return true;
    }
  }
  return false;
}

/**
 * Pick open locations for N pallets × slotsEach.
 * Returns groups of location id arrays, one group per pallet.
 */
export async function assignLocationGroups(opts: {
  companyId: string;
  warehouseId: string;
  palletCount: number;
  slotsEach: number;
  preferredIds?: string[];
}): Promise<string[][]> {
  const { companyId, warehouseId, palletCount, slotsEach } = opts;
  const preferred = (opts.preferredIds || []).map(String).filter(Boolean);

  const open = await Location.find({
    companyId,
    warehouseId,
    palletId: null,
    active: { $ne: false },
  }).select("code");
  const standardTaken = new Set(
    (
      await Location.find({ companyId, warehouseId, code: STANDARD_CODE }).select("code").lean()
    ).map((loc) => loc.code)
  );
  const renames = open.flatMap((loc) => {
    if (STANDARD_CODE.test(loc.code)) return [];
    const next = toStandardBayCode(loc.code);
    if (!next || standardTaken.has(next)) return [];
    standardTaken.add(next);
    return [{ updateOne: { filter: { _id: loc._id, code: loc.code }, update: { $set: { code: next } } } }];
  });
  if (renames.length) await Location.bulkWrite(renames);

  const available = (await Location.find({
    companyId,
    warehouseId,
    palletId: null,
    active: { $ne: false },
    code: STANDARD_CODE,
  })
    .sort({ aisle: 1, row: 1, col: 1, code: 1 })
    .lean()) as LocLean[];

  if (preferred.length > 0) {
    const byId = new Map(available.map((l) => [String(l._id), l]));
    const selected = preferred.map((id) => byId.get(id)).filter(Boolean) as LocLean[];
    if (selected.length < palletCount * slotsEach) {
      throw new Error(
        `Select ${palletCount * slotsEach} location(s) for this receipt (got ${selected.length}).`
      );
    }
    const groups: string[][] = [];
    let idx = 0;
    for (let p = 0; p < palletCount; p++) {
      const group = selected.slice(idx, idx + slotsEach);
      if (slotsEach === 2 && group.length === 2 && !areAdjacent(group[0], group[1])) {
        throw new Error(
          `Locations ${group[0].code} and ${group[1].code} must be adjacent for oversized pallets.`
        );
      }
      groups.push(group.map((l) => String(l._id)));
      idx += slotsEach;
    }
    return groups;
  }

  if (slotsEach === 1) {
    if (available.length < palletCount) {
      throw new Error(
        `Need ${palletCount} open location(s); only ${available.length} available. Free slots or choose fewer pallets.`
      );
    }
    return available.slice(0, palletCount).map((l) => [String(l._id)]);
  }

  // Pair adjacent opens for oversized
  const used = new Set<string>();
  const groups: string[][] = [];
  for (let i = 0; i < available.length && groups.length < palletCount; i++) {
    const a = available[i];
    const aid = String(a._id);
    if (used.has(aid)) continue;
    for (let j = i + 1; j < available.length; j++) {
      const b = available[j];
      const bid = String(b._id);
      if (used.has(bid)) continue;
      if (!areAdjacent(a, b)) continue;
      used.add(aid);
      used.add(bid);
      groups.push([aid, bid]);
      break;
    }
  }

  if (groups.length < palletCount) {
    throw new Error(
      `Need ${palletCount} adjacent location pair(s) for oversized pallets; only found ${groups.length}. Free neighboring slots or reduce count.`
    );
  }
  return groups;
}
