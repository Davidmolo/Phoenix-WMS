import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth";
import { Lpn } from "../models/Lpn";
import { Pallet } from "../models/Pallet";
import { nextLpnCode } from "../services/ids";

const router = Router();
router.use(requireAuth);

function palletIdList(lpn: { palletId?: unknown; palletIds?: unknown[] }): string[] {
  const ids = new Set<string>();
  if (lpn.palletId) ids.add(String(lpn.palletId));
  for (const id of lpn.palletIds || []) ids.add(String(id));
  return [...ids];
}

router.get("/", async (req, res, next) => {
  try {
    const filter: Record<string, unknown> = { companyId: req.auth!.companyId };
    if (req.auth!.role === "customer") filter.customerId = req.auth!.customerId;
    else if (req.query.customerId) filter.customerId = req.query.customerId;
    if (req.query.palletId) {
      filter.$or = [{ palletId: req.query.palletId }, { palletIds: req.query.palletId }];
    }
    if (req.query.status) filter.status = req.query.status;
    if (req.query.kind) filter.kind = req.query.kind;

    const lpns = await Lpn.find(filter)
      .populate("palletIds", "externalId status jobName poNumber sqft")
      .populate("palletId", "externalId status jobName poNumber sqft")
      .sort({ createdAt: -1 })
      .limit(500);
    res.json({ lpns });
  } catch (err) {
    next(err);
  }
});

router.get("/:id", async (req, res, next) => {
  try {
    const lpn = await Lpn.findOne({ _id: req.params.id, companyId: req.auth!.companyId })
      .populate("palletIds", "externalId status jobName poNumber sqft locationId")
      .populate("palletId", "externalId status jobName poNumber sqft locationId");
    if (!lpn) {
      res.status(404).json({ error: "LPN not found" });
      return;
    }
    res.json({ lpn, palletIds: palletIdList(lpn) });
  } catch (err) {
    next(err);
  }
});

/** Single-pallet / generic create (also used by receive). */
router.post("/", requireRole("admin", "staff"), async (req, res, next) => {
  try {
    const companyId = req.auth!.companyId;
    const code = req.body.code || (await nextLpnCode(companyId));
    const palletIds: string[] = Array.isArray(req.body.palletIds)
      ? req.body.palletIds
      : req.body.palletId
        ? [req.body.palletId]
        : [];

    const lpn = await Lpn.create({
      companyId,
      warehouseId: req.body.warehouseId,
      customerId: req.body.customerId,
      palletId: palletIds[0] || null,
      palletIds,
      code,
      kind: palletIds.length > 1 ? "group" : "unit",
      sku: req.body.sku || "",
      description: req.body.description || "",
      qty: palletIds.length || req.body.qty || 1,
      uom: req.body.uom || "ea",
      status: "active",
    });
    res.status(201).json({ lpn });
  } catch (err) {
    next(err);
  }
});

/**
 * Cesar staging plate: group many pallets under one scannable LPN.
 * Pulls pallets into staged status for outbound load (scan once).
 */
router.post("/group", requireRole("admin", "staff"), async (req, res, next) => {
  try {
    const companyId = req.auth!.companyId;
    const { warehouseId, customerId, palletIds = [], description = "" } = req.body;

    if (!warehouseId || !customerId) {
      res.status(400).json({ error: "warehouseId and customerId are required" });
      return;
    }
    if (!Array.isArray(palletIds) || palletIds.length < 2) {
      res.status(400).json({ error: "Select at least 2 pallets to build a staging LPN" });
      return;
    }

    const pallets = await Pallet.find({
      _id: { $in: palletIds },
      companyId,
      customerId,
      warehouseId,
      status: { $in: ["received", "stored", "staged"] },
    });

    if (pallets.length !== palletIds.length) {
      res.status(400).json({ error: "One or more pallets are missing or not stageable" });
      return;
    }

    const code = await nextLpnCode(companyId);
    const lpn = await Lpn.create({
      companyId,
      warehouseId,
      customerId,
      palletId: pallets[0]._id,
      palletIds: pallets.map((p) => p._id),
      code,
      kind: "group",
      description:
        description ||
        `Staging plate — ${pallets.length} pallets (${pallets.map((p) => p.externalId).join(", ")})`,
      qty: pallets.length,
      status: "staged",
    });

    for (const p of pallets) {
      p.status = "staged";
      const existing = (p.lpnIds || []).map(String);
      if (!existing.includes(String(lpn._id))) {
        p.lpnIds = [...(p.lpnIds || []), lpn._id];
      }
      await p.save();
    }

    const populated = await Lpn.findById(lpn._id).populate(
      "palletIds",
      "externalId status jobName poNumber sqft"
    );

    res.status(201).json({ lpn: populated });
  } catch (err) {
    next(err);
  }
});

/** Attach more pallets to an existing group LPN. */
router.post("/:id/attach", requireRole("admin", "staff"), async (req, res, next) => {
  try {
    const companyId = req.auth!.companyId;
    const lpn = await Lpn.findOne({ _id: req.params.id, companyId });
    if (!lpn) {
      res.status(404).json({ error: "LPN not found" });
      return;
    }
    if (lpn.status === "shipped" || lpn.status === "void") {
      res.status(400).json({ error: "Cannot attach to a shipped/void LPN" });
      return;
    }

    const addIds: string[] = Array.isArray(req.body.palletIds) ? req.body.palletIds : [];
    if (!addIds.length) {
      res.status(400).json({ error: "palletIds required" });
      return;
    }

    const current = new Set(palletIdList(lpn));
    const pallets = await Pallet.find({
      _id: { $in: addIds },
      companyId,
      customerId: lpn.customerId,
      status: { $in: ["received", "stored", "staged"] },
    });

    for (const p of pallets) {
      current.add(String(p._id));
      p.status = "staged";
      const existing = (p.lpnIds || []).map(String);
      if (!existing.includes(String(lpn._id))) {
        p.lpnIds = [...(p.lpnIds || []), lpn._id];
      }
      await p.save();
    }

    const allIds = [...current];
    lpn.palletIds = allIds as unknown as typeof lpn.palletIds;
    lpn.palletId = allIds[0] as unknown as typeof lpn.palletId;
    lpn.kind = allIds.length > 1 ? "group" : "unit";
    lpn.qty = allIds.length;
    lpn.status = "staged";
    await lpn.save();

    const populated = await Lpn.findById(lpn._id).populate(
      "palletIds",
      "externalId status jobName poNumber sqft"
    );
    res.json({ lpn: populated });
  } catch (err) {
    next(err);
  }
});

router.patch("/:id", requireRole("admin", "staff"), async (req, res, next) => {
  try {
    const allowed = ["description", "status", "sku"] as const;
    const $set: Record<string, unknown> = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) $set[key] = req.body[key];
    }
    const lpn = await Lpn.findOneAndUpdate(
      { _id: req.params.id, companyId: req.auth!.companyId },
      { $set },
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
