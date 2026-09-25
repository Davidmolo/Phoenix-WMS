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
              status: { $in: ["received", "stored", "staged"] },
            },
          },
          { $group: { _id: null, occupiedSqft: { $sum: { $ifNull: ["$sqft", 16] } } } },
        ])
      : [];
    const occupiedSqft = Math.round((occupiedAgg[0]?.occupiedSqft ?? 0) * 100) / 100;
    const availableSqft = Math.max(0, Math.round((capacitySqft - occupiedSqft) * 100) / 100);

    res.json({
      warehouses,
      warehouseId: warehouseId || null,
      locations,
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

export default router;
