import { Router } from "express";
import { Types } from "mongoose";
import { requireAuth, requireRole } from "../middleware/auth";
import { Location } from "../models/Location";
import { Warehouse } from "../models/Warehouse";
import { Pallet } from "../models/Pallet";
import { isLegacyFloorCode, structuredSlot, type SpotLetter } from "../services/locationCodes";

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
    if (req.query.available === "true") filter.palletId = null;

    const locations = await Location.find(filter).sort({ aisle: 1, code: 1 }).limit(1000);
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
    if (warehouseId) await migrateFlatFloorCodes(companyId, warehouseId);

    const locations = warehouseId
      ? await Location.find({ companyId, warehouseId }).sort({ row: 1, col: 1, level: 1, spot: 1 })
      : [];

    const occupied = locations.filter((l) => l.palletId).length;
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
        total: locations.length,
        occupied,
        available: locations.length - occupied,
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

    const locations = await Location.find({ companyId, warehouseId, row, col }).sort({
      level: 1,
      spot: 1,
    });
    res.json({ locations });
  } catch (err) {
    next(err);
  }
});

export default router;
