import { Router } from "express";
import { Types } from "mongoose";
import { requireAuth, requireRole } from "../middleware/auth";
import { Location } from "../models/Location";
import { Warehouse } from "../models/Warehouse";
import { Pallet } from "../models/Pallet";
import {
  bayCode,
  toStandardBayCode,
  isLegacyFloorCode,
  STANDARD_CODE,
  STANDARD_COLUMNS,
  STANDARD_LANES,
  STANDARD_LEVELS,
  structuredSlot,
  type SpotLetter,
} from "../services/locationCodes";

const router = Router();
router.use(requireAuth);

router.get("/", async (req, res, next) => {
  try {
    const companyId = req.auth!.companyId;
    const filter: Record<string, unknown> = { companyId };
    if (req.query.warehouseId) {
      filter.warehouseId = req.query.warehouseId;
      await migrateFlatFloorCodes(companyId, String(req.query.warehouseId));
    } else {
      const warehouses = await Warehouse.find({ companyId, active: true }).select("_id");
      for (const warehouse of warehouses) {
        await migrateFlatFloorCodes(companyId, String(warehouse._id));
      }
    }
    if (req.query.available === "true") {
      filter.palletId = null;
      filter.active = { $ne: false };
    }

    const locations = await Location.find(filter).sort({ aisle: 1, code: 1 }).limit(6000);
    res.json({ locations });
  } catch (err) {
    next(err);
  }
});

router.get("/warehouse-setup", requireRole("admin", "staff"), async (req, res, next) => {
  try {
    const companyId = req.auth!.companyId;
    const warehouses = await Warehouse.find({
      companyId,
      active: true,
    }).sort({ name: 1 });

    const warehouseId = (req.query.warehouseId as string) || String(warehouses[0]?._id || "");
    const warehouse = warehouses.find((w) => String(w._id) === warehouseId) || warehouses[0];
    if (warehouseId) {
      await migrateFlatFloorCodes(companyId, warehouseId);
      await ensureStandardLayout(companyId, warehouseId);
      await syncInventoryOntoLayout(companyId, warehouseId);
    }

    const locations = warehouseId
      ? await Location.find({ companyId, warehouseId }).sort({ row: 1, col: 1, level: 1, spot: 1 })
      : [];

    const rack = locations.filter((l) => STANDARD_CODE.test(l.code));
    const occupied = rack.filter((l) => l.palletId).length;
    const openActive = rack.filter((l) => !l.palletId && l.active !== false).length;
    const capacitySqft = Number(warehouse?.sqft) || 0;
    const occupiedAgg = warehouseId
      ? await Pallet.aggregate([
          {
            $match: {
              companyId: new Types.ObjectId(companyId),
              warehouseId: new Types.ObjectId(warehouseId),
              status: { $in: ["received", "staged_for_store", "stored", "staged"] },
            },
          },
          { $group: { _id: null, occupiedSqft: { $sum: { $ifNull: ["$sqft", 16] } } } },
        ])
      : [];
    const occupiedSqft = Math.round((occupiedAgg[0]?.occupiedSqft ?? 0) * 100) / 100;
    const availableSqft = Math.max(0, Math.round((capacitySqft - occupiedSqft) * 100) / 100);

    const mapLayout = {
      rows: Number(warehouse?.mapLayout?.rows) || Math.max(1, ...locations.map((l) => l.row + 1), 5),
      cols: Number(warehouse?.mapLayout?.cols) || Math.max(1, ...locations.map((l) => l.col + 1), 8),
    };

    res.json({
      warehouses,
      warehouseId: warehouseId || null,
      locations,
      mapLayout,
      summary: {
        total: rack.length,
        occupied,
        available: openActive,
        capacitySqft,
        occupiedSqft,
        availableSqft,
      },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * Save a customizable floor-map layout.
 * Body: { warehouseId, rows, cols, placements?: [{ locationId, row, col }] }
 * Expanding the grid creates empty slots; shrinking refuses if occupied slots fall outside.
 */
router.patch("/active", requireRole("admin", "staff"), async (req, res, next) => {
  try {
    const companyId = req.auth!.companyId;
    const active = req.body.active !== false;
    const code = String(req.body.code || "").trim();
    const level = req.body.level != null ? Number(req.body.level) : null;
    const warehouseId = String(req.body.warehouseId || "");
    if (!warehouseId || (!code && !level)) {
      res.status(400).json({ error: "warehouseId and a code or level are required" });
      return;
    }
    const filter: Record<string, unknown> = { companyId, warehouseId };
    if (code) filter.code = code;
    if (level) filter.level = level;
    const result = await Location.updateMany(filter, { $set: { active } });
    res.json({ ok: true, updated: result.modifiedCount, active });
  } catch (err) {
    next(err);
  }
});

router.put("/map-layout", requireRole("admin", "staff"), async (req, res, next) => {
  try {
    const companyId = req.auth!.companyId;
    const {
      warehouseId,
      rows,
      cols,
      placements = [],
    } = req.body as {
      warehouseId?: string;
      rows?: number;
      cols?: number;
      placements?: Array<{ locationId: string; row: number; col: number }>;
    };

    if (!warehouseId) {
      res.status(400).json({ error: "warehouseId is required" });
      return;
    }

    const warehouse = await Warehouse.findOne({ _id: warehouseId, companyId });
    if (!warehouse) {
      res.status(404).json({ error: "Warehouse not found" });
      return;
    }

    const nextRows = Math.min(40, Math.max(1, Number(rows) || warehouse.mapLayout?.rows || 5));
    const nextCols = Math.min(40, Math.max(1, Number(cols) || warehouse.mapLayout?.cols || 8));

    const locations = await Location.find({ companyId, warehouseId });
    const byId = new Map(locations.map((l) => [String(l._id), l]));

    for (const p of placements) {
      const loc = byId.get(String(p.locationId));
      if (!loc) continue;
      const r = Number(p.row);
      const c = Number(p.col);
      if (!Number.isFinite(r) || !Number.isFinite(c) || r < 0 || c < 0 || r >= nextRows || c >= nextCols) {
        res.status(400).json({
          error: `Placement for ${loc.code} is outside the ${nextRows}×${nextCols} grid`,
        });
        return;
      }
      loc.row = r;
      loc.col = c;
      await loc.save();
    }

    const refreshed = await Location.find({ companyId, warehouseId });
    const outsideOccupied = refreshed.filter(
      (l) => l.palletId && (l.row >= nextRows || l.col >= nextCols)
    );
    if (outsideOccupied.length > 0) {
      res.status(400).json({
        error: `Cannot shrink map: ${outsideOccupied.length} occupied slot(s) sit outside the new grid`,
      });
      return;
    }

    // Drop empty slots that fall outside the new bounds
    await Location.deleteMany({
      companyId,
      warehouseId,
      palletId: null,
      $or: [{ row: { $gte: nextRows } }, { col: { $gte: nextCols } }],
    });

    const remaining = await Location.find({ companyId, warehouseId });
    const occupiedCells = new Set(remaining.map((l) => `${l.row}:${l.col}`));

    const toCreate = [];
    for (let row = 0; row < nextRows; row++) {
      for (let col = 0; col < nextCols; col++) {
        const key = `${row}:${col}`;
        if (occupiedCells.has(key)) continue;
        const hasAny = remaining.some((l) => l.row === row && l.col === col);
        if (hasAny) continue;
        const slot = structuredSlot(row, col, 1, "A");
        toCreate.push({
          companyId,
          warehouseId,
          code: slot.code,
          aisle: slot.aisle,
          type: "inside",
          level: slot.level,
          spot: slot.spot,
          floorOnly: true,
          row,
          col,
          palletId: null,
        });
      }
    }
    if (toCreate.length) await Location.insertMany(toCreate);

    warehouse.mapLayout = { rows: nextRows, cols: nextCols };
    await warehouse.save();

    const locationsOut = await Location.find({ companyId, warehouseId }).sort({ row: 1, col: 1 });
    res.json({
      warehouse,
      mapLayout: { rows: nextRows, cols: nextCols },
      locations: locationsOut,
    });
  } catch (err) {
    next(err);
  }
});

/** Cesar layout: lane A–Z, levels 1–5, columns A–T, spots 1 and 2. Code example A1A-1. */
async function ensureStandardLayout(companyId: string, warehouseId: string) {
  const dashed = await Location.find({
    companyId,
    warehouseId,
    code: /^[A-Z]-[1-5]-[A-T]-[12]$/,
  }).select("code");
  if (dashed.length) {
    const renames = dashed.flatMap((loc) => {
      const next = toStandardBayCode(loc.code);
      if (!next || next === loc.code) return [];
      return [{ updateOne: { filter: { _id: loc._id }, update: { $set: { code: next } } } }];
    });
    if (renames.length) await Location.bulkWrite(renames);
  }

  const picture = await Location.find({
    companyId,
    warehouseId,
    code: /^[A-Z]\d{2}-[1-5][AB]$/,
  }).select("code");
  if (picture.length) {
    const renames = picture.flatMap((loc) => {
      const next = toStandardBayCode(loc.code);
      if (!next || next === loc.code) return [];
      return [
        {
          updateOne: {
            filter: { _id: loc._id },
            update: { $set: { code: next } },
          },
        },
      ];
    });
    if (renames.length) await Location.bulkWrite(renames);
  }

  await Location.updateMany(
    {
      companyId,
      warehouseId,
      level: { $gt: 1 },
      palletId: null,
      active: { $exists: false },
    },
    { $set: { active: false } }
  );

  const expected = STANDARD_LANES.length * STANDARD_COLUMNS * STANDARD_LEVELS * 2;
  const have = await Location.countDocuments({
    companyId,
    warehouseId,
    code: STANDARD_CODE,
  });
  if (have >= expected) return;

  const existing = await Location.find({ companyId, warehouseId }).select("code").lean();
  const taken = new Set(existing.map((loc) => loc.code));
  const toCreate: Array<Record<string, unknown>> = [];
  STANDARD_LANES.forEach((lane, row) => {
    for (let column = 1; column <= STANDARD_COLUMNS; column += 1) {
      for (let level = 1; level <= STANDARD_LEVELS; level += 1) {
        for (const letter of ["A", "B"] as SpotLetter[]) {
          const code = bayCode(lane, column, level, letter);
          if (taken.has(code)) continue;
          toCreate.push({
            companyId,
            warehouseId,
            code,
            aisle: lane,
            type: "inside",
            level,
            spot: letter === "B" ? 2 : 1,
            floorOnly: level === 1,
            active: level === 1,
            row,
            col: column,
            palletId: null,
          });
        }
      }
    }
  });
  if (toCreate.length) await Location.insertMany(toCreate, { ordered: false });
}

/** Point pallets that are still in the building at the rack code, and mark that slot filled. */
async function syncInventoryOntoLayout(companyId: string, warehouseId: string) {
  const active = await Pallet.find({
    companyId,
    warehouseId,
    status: { $in: ["received", "staged_for_store", "stored", "staged"] },
  }).select("locationId locationCode secondaryLocationId secondaryLocationCode");

  const filled = new Map<string, string>();
  for (const pallet of active) {
    const $set: Record<string, unknown> = {};
    for (const [codeField, idField] of [
      ["locationCode", "locationId"],
      ["secondaryLocationCode", "secondaryLocationId"],
    ] as const) {
      const next = toStandardBayCode(String(pallet[codeField] || ""));
      if (!next) continue;
      if (!filled.has(next)) filled.set(next, String(pallet._id));
      if (pallet[codeField] !== next) $set[codeField] = next;
      const slot = await Location.findOne({ companyId, warehouseId, code: next }).select("_id");
      if (slot && String(pallet[idField] || "") !== String(slot._id)) {
        $set[idField] = slot._id;
      }
    }
    // Patch location fields only. A full save here races Confirm store and
    // writes the pre-store status back, so the pallet stays on Waiting for Store.
    if (Object.keys($set).length) {
      await Pallet.updateOne({ _id: pallet._id }, { $set });
    }
  }

  const rack = await Location.find({
    companyId,
    warehouseId,
    code: STANDARD_CODE,
  }).select("code palletId");
  for (const loc of rack) {
    const owner = filled.get(loc.code) || null;
    const current = loc.palletId ? String(loc.palletId) : null;
    if (current === owner) continue;
    const claimsSlot = {
      $or: [
        { locationId: loc._id },
        { locationCode: loc.code },
        { secondaryLocationId: loc._id },
        { secondaryLocationCode: loc.code },
      ],
    };
    if (owner) {
      const stillThere = await Pallet.exists({ _id: owner, ...claimsSlot });
      if (!stillThere) continue;
    } else if (current) {
      const stillClaims = await Pallet.exists({ _id: current, ...claimsSlot });
      if (stillClaims) continue;
    }
    await Location.updateOne(
      { _id: loc._id, palletId: loc.palletId ?? null },
      { $set: { palletId: owner ? new Types.ObjectId(owner) : null } }
    );
  }

  await Location.updateMany(
    {
      companyId,
      warehouseId,
      code: { $not: STANDARD_CODE },
      palletId: { $ne: null },
    },
    { $set: { palletId: null } }
  );
}

/** Rewrite W-1 and A-L1-S1 labels into lane/section/level/spot (AA1A) and refresh pallet snapshots. */
async function migrateFlatFloorCodes(companyId: string, warehouseId: string) {
  const locations = await Location.find({ companyId, warehouseId });
  const legacy = locations.filter((loc) => isLegacyFloorCode(loc.code));
  if (!legacy.length) return;

  const taken = new Set(
    locations.filter((loc) => !isLegacyFloorCode(loc.code)).map((loc) => loc.code)
  );

  for (const loc of legacy) {
    const slot = structuredSlot(loc.row, loc.col, loc.level || 1, loc.spot || 1);
    if (taken.has(slot.code)) continue;
    taken.add(slot.code);
    loc.code = slot.code;
    loc.aisle = slot.aisle;
    loc.level = slot.level;
    loc.spot = slot.spot;
    loc.floorOnly = slot.level === 1;
    await loc.save();
    await Pallet.updateMany({ locationId: loc._id }, { $set: { locationCode: slot.code } });
    await Pallet.updateMany(
      { secondaryLocationId: loc._id },
      { $set: { secondaryLocationCode: slot.code } }
    );
  }

}

/**
 * Set how many levels (1–5) and which spots (A and/or B) exist at one floor cell.
 * Occupied slots that would be removed are rejected.
 */
router.put("/stack", requireRole("admin", "staff"), async (req, res, next) => {
  try {
    const companyId = req.auth!.companyId;
    const warehouseId = String(req.body.warehouseId || "");
    const row = Number(req.body.row);
    const col = Number(req.body.col);
    const levelCount = Math.min(5, Math.max(1, Number(req.body.levels) || 1));
    const requested = Array.isArray(req.body.spots) ? req.body.spots : ["A"];
    const letters = new Set<SpotLetter>();
    for (const raw of requested) {
      letters.add(String(raw).toUpperCase() === "B" ? "B" : "A");
    }
    if (!letters.size) letters.add("A");

    if (!warehouseId || !Number.isFinite(row) || !Number.isFinite(col) || row < 0 || col < 0) {
      res.status(400).json({ error: "warehouseId, row, and col are required" });
      return;
    }

    const warehouse = await Warehouse.findOne({ _id: warehouseId, companyId });
    if (!warehouse) {
      res.status(404).json({ error: "Warehouse not found" });
      return;
    }

    const wanted = [];
    for (let level = 1; level <= levelCount; level++) {
      for (const letter of letters) {
        wanted.push(structuredSlot(row, col, level, letter));
      }
    }

    const existing = await Location.find({ companyId, warehouseId, row, col });
    const occupied = existing.filter((loc) => loc.palletId);
    if (occupied.length > wanted.length) {
      res.status(400).json({
        error: `${occupied.length} occupied slot(s) at this cell do not fit in ${wanted.length} lane positions. Move pallets first.`,
      });
      return;
    }
    existing.sort((a, b) => Number(Boolean(b.palletId)) - Number(Boolean(a.palletId)));
    const used = new Set<string>();

    for (const slot of wanted) {
      const match =
        existing.find(
          (loc) =>
            !used.has(String(loc._id)) &&
            (loc.code === slot.code || (loc.level === slot.level && loc.spot === slot.spot))
        ) || existing.find((loc) => !used.has(String(loc._id)));

      if (match) {
        used.add(String(match._id));
        match.code = slot.code;
        match.aisle = slot.aisle;
        match.level = slot.level;
        match.spot = slot.spot;
        match.floorOnly = slot.level === 1;
        await match.save();
        await Pallet.updateMany({ locationId: match._id }, { $set: { locationCode: slot.code } });
        await Pallet.updateMany(
          { secondaryLocationId: match._id },
          { $set: { secondaryLocationCode: slot.code } }
        );
      } else {
        await Location.create({
          companyId,
          warehouseId,
          code: slot.code,
          aisle: slot.aisle,
          type: "inside",
          level: slot.level,
          spot: slot.spot,
          floorOnly: slot.level === 1,
          row,
          col,
          palletId: null,
        });
      }
    }

    for (const loc of existing) {
      if (used.has(String(loc._id))) continue;
      if (loc.palletId) {
        res.status(400).json({
          error: `Cannot remove occupied slot ${loc.code}. Move the pallet first.`,
        });
        return;
      }
      await loc.deleteOne();
    }

    await Location.deleteMany({
      companyId,
      warehouseId,
      row,
      col: { $ne: col },
      palletId: null,
    });

    const locations = await Location.find({ companyId, warehouseId, row, col }).sort({
      level: 1,
      spot: 1,
    });
    const held = await Location.find({
      companyId,
      warehouseId,
      row,
      col: { $ne: col },
      palletId: { $ne: null },
    }).select("code");
    res.json({
      locations,
      heldElsewhere: held.map((loc) => loc.code),
    });
  } catch (err) {
    next(err);
  }
});

export default router;
