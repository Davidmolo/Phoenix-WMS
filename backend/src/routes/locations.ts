import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth";
import { Location } from "../models/Location";
import { Warehouse } from "../models/Warehouse";

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
    const warehouses = await Warehouse.find({
      companyId: req.auth!.companyId,
      active: true,
    }).sort({ name: 1 });

    const warehouseId = (req.query.warehouseId as string) || String(warehouses[0]?._id || "");
    const locations = warehouseId
      ? await Location.find({ companyId: req.auth!.companyId, warehouseId }).sort({ row: 1, col: 1 })
      : [];

    const occupied = locations.filter((l) => l.palletId).length;
    res.json({
      warehouses,
      warehouseId: warehouseId || null,
      locations,
      summary: {
        total: locations.length,
        occupied,
        available: locations.length - occupied,
      },
    });
  } catch (err) {
    next(err);
  }
});

export default router;
