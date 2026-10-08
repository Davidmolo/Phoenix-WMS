import { Router } from "express";
import { Types } from "mongoose";
import { requireAuth, requireRole } from "../middleware/auth";
import { Location } from "../models/Location";
import { Warehouse } from "../models/Warehouse";
import { Pallet } from "../models/Pallet";

const router = Router();
router.use(requireAuth);

router.get("/", async (req, res, next) => {
  try {
    const filter: Record<string, unknown> = { companyId: req.auth!.companyId };
    if (req.query.warehouseId) filter.warehouseId = req.query.warehouseId;
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
    const locations = warehouseId
      ? await Location.find({ companyId, warehouseId }).sort({ row: 1, col: 1 })
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
    let maxCode = remaining.reduce((m, l) => {
      const n = Number(String(l.code).replace(/\D/g, ""));
      return Number.isFinite(n) ? Math.max(m, n) : m;
    }, 0);

    const toCreate = [];
    for (let row = 0; row < nextRows; row++) {
      for (let col = 0; col < nextCols; col++) {
        const key = `${row}:${col}`;
        if (occupiedCells.has(key)) continue;
        // Only auto-fill empty cells that have no location yet
        const hasAny = remaining.some((l) => l.row === row && l.col === col);
        if (hasAny) continue;
        maxCode += 1;
        toCreate.push({
          companyId,
          warehouseId,
          code: `W-${maxCode}`,
          aisle: "W",
          type: "inside",
          level: 1,
          spot: 1,
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

export default router;
