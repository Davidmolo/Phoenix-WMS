import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth";
import { Lpn } from "../models/Lpn";
import { Pallet } from "../models/Pallet";
import { createUniqueLpn } from "../services/ids";
import { paginationMeta, parsePagination } from "../utils/pagination";

const router = Router();
router.use(requireAuth);

function palletIdList(lpn: { palletId?: unknown; palletIds?: unknown[] }): string[] {
  const ids = new Set<string>();
  if (lpn.palletId) ids.add(String(lpn.palletId));
  for (const id of lpn.palletIds || []) ids.add(String(id));
  return [...ids];
}

/**
 * One active plate per pallet. A receive-time unit LPN is retired when the pallet
 * joins a staging plate. A second group plate is rejected.
 */
async function claimPalletsForNewPlate(
  companyId: string,
  palletIds: string[],
  exceptLpnId?: string
): Promise<string | null> {
  const wanted = new Set(palletIds.map(String));
  const plates = await Lpn.find({
    companyId,
    status: { $in: ["active", "staged"] },
    $or: [{ palletIds: { $in: palletIds } }, { palletId: { $in: palletIds } }],
  });
  for (const plate of plates) {
    if (exceptLpnId && String(plate._id) === exceptLpnId) continue;
    const ids = palletIdList(plate);
    const overlap = ids.filter((id) => wanted.has(id));
    if (!overlap.length) continue;
    const unitPlate = plate.kind !== "group" && ids.length <= 1;
    if (!unitPlate) {
      return `Pallet is already on LPN ${plate.code}. One active plate per pallet.`;
    }
    plate.status = "void";
    await plate.save();
    await Pallet.updateOne({ _id: overlap[0] }, { $pull: { lpnIds: plate._id } });
  }
  return null;
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
    const q = String(req.query.q || "").trim();
    if (q) {
      const safe = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const rx = new RegExp(safe, "i");
      const text = { $or: [{ code: rx }, { description: rx }, { sku: rx }] };
      if (filter.$or) {
        filter.$and = [{ $or: filter.$or as unknown[] }, text];
        delete filter.$or;
      } else {
        filter.$or = text.$or;
      }
    }

    const { page, limit, skip } = parsePagination(req.query as Record<string, unknown>, {
      defaultLimit: 50,
      maxLimit: req.query.export === "1" ? 2000 : 200,
    });
    const [total, lpns] = await Promise.all([
      Lpn.countDocuments(filter),
      Lpn.find(filter)
        .populate("palletIds", "externalId status jobName poNumber sqft")
        .populate("palletId", "externalId status jobName poNumber sqft")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
    ]);
    res.json({ lpns, ...paginationMeta(page, limit, total) });
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
    const suppliedCode = String(req.body.code || "").trim();
    const palletIds: string[] = Array.isArray(req.body.palletIds)
      ? req.body.palletIds
      : req.body.palletId
        ? [req.body.palletId]
        : [];

    try {
      const lpn = await createUniqueLpn({
        companyId,
        warehouseId: req.body.warehouseId,
        customerId: req.body.customerId,
        palletId: palletIds[0] || null,
        palletIds,
        ...(suppliedCode ? { code: suppliedCode } : {}),
        kind: palletIds.length > 1 ? "group" : "unit",
        sku: req.body.sku || "",
        description: req.body.description || "",
        qty: palletIds.length || req.body.qty || 1,
        uom: req.body.uom || "ea",
        status: "active",
      });
      res.status(201).json({ lpn });
    } catch (err) {
      const statusCode = (err as { statusCode?: number }).statusCode;
      if (statusCode === 409) {
        res.status(409).json({ error: err instanceof Error ? err.message : "Duplicate LPN" });
        return;
      }
      throw err;
    }
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
      status: { $in: ["received", "staged_for_store", "stored", "staged"] },
    });

    if (pallets.length !== palletIds.length) {
      res.status(400).json({ error: "One or more pallets are missing or not stageable" });
      return;
    }

    const conflict = await claimPalletsForNewPlate(
      companyId,
      pallets.map((p) => String(p._id))
    );
    if (conflict) {
      res.status(409).json({ error: conflict });
      return;
    }

    const lpn = await createUniqueLpn({
      companyId,
      warehouseId,
      customerId,
      palletId: pallets[0]._id,
      palletIds: pallets.map((p) => p._id),
      kind: "group",
      description:
        description ||
        `Staging plate — ${pallets.length} pallets (${pallets.map((p) => p.externalId).join(", ")})`,
      qty: pallets.length,
      status: "staged",
    });

    for (const p of pallets) {
      p.status = "staged";
      p.lpnIds = [lpn._id];
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

    const conflict = await claimPalletsForNewPlate(companyId, addIds, String(lpn._id));
    if (conflict) {
      res.status(409).json({ error: conflict });
      return;
    }

    const current = new Set(palletIdList(lpn));
    const pallets = await Pallet.find({
      _id: { $in: addIds },
      companyId,
      customerId: lpn.customerId,
      status: { $in: ["received", "staged_for_store", "stored", "staged"] },
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
