import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth";
import { Lpn } from "../models/Lpn";
import { nextLpnCode } from "../services/ids";

const router = Router();
router.use(requireAuth);

router.get("/", async (req, res, next) => {
  try {
    const filter: Record<string, unknown> = { companyId: req.auth!.companyId };
    if (req.auth!.role === "customer") filter.customerId = req.auth!.customerId;
    else if (req.query.customerId) filter.customerId = req.query.customerId;
    if (req.query.palletId) filter.palletId = req.query.palletId;
    if (req.query.status) filter.status = req.query.status;

    const lpns = await Lpn.find(filter).sort({ createdAt: -1 }).limit(500);
    res.json({ lpns });
  } catch (err) {
    next(err);
  }
});

router.post("/", requireRole("admin", "staff"), async (req, res, next) => {
  try {
    const companyId = req.auth!.companyId;
    const code = req.body.code || (await nextLpnCode(companyId));
    const lpn = await Lpn.create({
      companyId,
      warehouseId: req.body.warehouseId,
      customerId: req.body.customerId,
      palletId: req.body.palletId || null,
      code,
      sku: req.body.sku || "",
      description: req.body.description || "",
      qty: req.body.qty ?? 1,
      uom: req.body.uom || "ea",
      status: "active",
    });
    res.status(201).json({ lpn });
  } catch (err) {
    next(err);
  }
});

router.patch("/:id", requireRole("admin", "staff"), async (req, res, next) => {
  try {
    const lpn = await Lpn.findOneAndUpdate(
      { _id: req.params.id, companyId: req.auth!.companyId },
      { $set: req.body },
      { new: true }
    );
    if (!lpn) {
      res.status(404).json({ error: "LPN not found" });
      return;
    }
    res.json({ lpn });
  } catch (err) {
    next(err);
  }
});

export default router;
