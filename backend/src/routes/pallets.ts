import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth";
import { Pallet } from "../models/Pallet";
import { paginationMeta, parsePagination } from "../utils/pagination";

const router = Router();

router.use(requireAuth);

router.get("/", async (req, res, next) => {
  try {
    const filter: Record<string, unknown> = { companyId: req.auth!.companyId };
    if (req.auth!.role === "customer") {
      filter.customerId = req.auth!.customerId;
    } else if (req.query.customerId) {
      filter.customerId = req.query.customerId;
    }
    if (req.query.status) filter.status = req.query.status;
    if (req.query.warehouseId) filter.warehouseId = req.query.warehouseId;

    const { page, limit, skip } = parsePagination(req.query as Record<string, unknown>, {
      defaultLimit: 50,
      maxLimit: 200,
    });
    const [total, pallets] = await Promise.all([
      Pallet.countDocuments(filter),
      Pallet.find(filter)
        .populate("locationId", "code aisle type")
        .sort({ updatedAt: -1 })
        .skip(skip)
        .limit(limit),
    ]);
    res.json({ pallets, ...paginationMeta(page, limit, total) });
  } catch (err) {
    next(err);
  }
});

router.get("/:id", async (req, res, next) => {
  try {
    const pallet = await Pallet.findOne({ _id: req.params.id, companyId: req.auth!.companyId }).populate(
      "locationId",
      "code aisle type"
    );
    if (!pallet) {
      res.status(404).json({ error: "Pallet not found" });
      return;
    }
    if (req.auth!.role === "customer" && String(pallet.customerId) !== String(req.auth!.customerId)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    res.json({ pallet });
  } catch (err) {
    next(err);
  }
});

router.post("/", requireRole("admin", "staff"), async (req, res, next) => {
  try {
    const pallet = await Pallet.create({
      ...req.body,
      companyId: req.auth!.companyId,
      receivedAt: req.body.receivedAt || new Date(),
    });
    res.status(201).json({ pallet });
  } catch (err) {
    next(err);
  }
});

router.patch("/:id", requireRole("admin", "staff"), async (req, res, next) => {
  try {
    const pallet = await Pallet.findOneAndUpdate(
      { _id: req.params.id, companyId: req.auth!.companyId },
      { $set: req.body },
      { new: true }
    );
    if (!pallet) {
      res.status(404).json({ error: "Pallet not found" });
      return;
    }
    res.json({ pallet });
  } catch (err) {
    next(err);
  }
});

export default router;
