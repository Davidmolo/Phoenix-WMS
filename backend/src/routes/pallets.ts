import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth";
import { Lpn } from "../models/Lpn";
import { Pallet } from "../models/Pallet";
import { Location } from "../models/Location";
import { Shipment } from "../models/Shipment";
import { toStandardBayCode } from "../services/locationCodes";
import { paginationMeta, parsePagination } from "../utils/pagination";

const router = Router();

router.use(requireAuth);

/**
 * Cesar putaway: scan pallet barcode, then scan storage location → status stored.
 * Body: { palletCode (externalId), locationCode }
 */
router.post("/store", requireRole("admin", "staff"), async (req, res, next) => {
  try {
    const companyId = req.auth!.companyId;
    // Twin oversized label scans as PLT-xxxxx-B — resolve to the parent pallet
    const rawCode = String(req.body.palletCode || req.body.externalId || "").trim();
    const palletCode = rawCode.replace(/-B$/i, "");
    const scannedSecondary = /-B$/i.test(rawCode);
    const locationCode = String(req.body.locationCode || "").trim();

    if (!palletCode || !locationCode) {
      res.status(400).json({ error: "palletCode and locationCode are required" });
      return;
    }

    const pallet = await Pallet.findOne({
      companyId,
      externalId: new RegExp(`^${palletCode.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i"),
    });
    if (!pallet) {
      res.status(404).json({
        error: scannedSecondary
          ? `Pallet ${palletCode} (from ${rawCode}) not found`
          : `Pallet ${palletCode} not found`,
      });
      return;
    }
    if (!["staged_for_store", "received", "stored"].includes(pallet.status)) {
      res.status(400).json({
        error: `Pallet ${palletCode} cannot be stored (status: ${pallet.status})`,
      });
      return;
    }

    const codePattern = (value: string) =>
      new RegExp(`^${value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i");
    const standardCode = toStandardBayCode(locationCode);
    let location = await Location.findOne({
      companyId,
      warehouseId: pallet.warehouseId,
      code: codePattern(locationCode),
    });
    if (!location && standardCode && standardCode.toUpperCase() !== locationCode.toUpperCase()) {
      location = await Location.findOne({
        companyId,
        warehouseId: pallet.warehouseId,
        code: codePattern(standardCode),
      });
    }
    if (!location) {
      res.status(404).json({ error: `Location ${locationCode} not found` });
      return;
    }
    if (location.active === false) {
      res.status(400).json({ error: `Location ${location.code} is inactive. Turn it on in Warehouse setup first.` });
      return;
    }

    const occupiedByOther =
      location.palletId && String(location.palletId) !== String(pallet._id);
    if (occupiedByOther) {
      res.status(400).json({ error: `Location ${locationCode} is already occupied` });
      return;
    }

    const isSecondary =
      pallet.secondaryLocationId &&
      String(pallet.secondaryLocationId) === String(location._id);

    // Free previous reserved slot if moving to a different bin (primary only)
    if (
      pallet.locationId &&
      String(pallet.locationId) !== String(location._id) &&
      !isSecondary
    ) {
      await Location.findOneAndUpdate(
        { _id: pallet.locationId, palletId: pallet._id },
        { palletId: null }
      );
    }

    location.palletId = pallet._id;
    await location.save();

    if (!isSecondary) {
      const previous = String(pallet.locationCode || "");
      if (previous && previous.toUpperCase() !== location.code.toUpperCase()) {
        pallet.countFlag = "store_override";
        pallet.countFlagNote = `Stored at ${location.code}. The receipt location was ${previous}.`;
      }
      pallet.locationId = location._id;
      pallet.locationCode = location.code;
    } else {
      pallet.secondaryLocationCode = location.code;
    }
    // Confirming either reserved slot (or a chosen bin) marks putaway complete
    pallet.status = "stored";
    await pallet.save();

    const populated = await Pallet.findById(pallet._id)
      .populate({ path: "locationId", select: "code aisle type" })
      .populate({ path: "secondaryLocationId", select: "code aisle type" });
    const secondary =
      populated?.secondaryLocationId &&
      typeof populated.secondaryLocationId === "object" &&
      "code" in populated.secondaryLocationId
        ? String((populated.secondaryLocationId as { code?: string }).code || "")
        : "";
    res.json({
      pallet: populated,
      message: secondary
        ? `${palletCode} stored at ${location.code} (pair includes ${secondary})`
        : `${palletCode} stored at ${location.code}`,
    });
  } catch (err) {
    next(err);
  }
});

router.post("/move", requireRole("admin", "staff"), async (req, res, next) => {
  try {
    const companyId = req.auth!.companyId;
    const palletCode = String(req.body.palletCode || req.body.externalId || "")
      .trim()
      .replace(/-B$/i, "");
    const locationCode = String(req.body.locationCode || "").trim();
    if (!palletCode || !locationCode) {
      res.status(400).json({ error: "palletCode and locationCode are required" });
      return;
    }
    const pallet = await Pallet.findOne({
      companyId,
      externalId: new RegExp(`^${palletCode.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i"),
    });
    if (!pallet) {
      res.status(404).json({ error: `Pallet ${palletCode} not found` });
      return;
    }
    if (["shipped", "void", "staged_for_shipping"].includes(pallet.status)) {
      res.status(400).json({ error: `Pallet ${palletCode} cannot be moved (status: ${pallet.status})` });
      return;
    }
    req.body.palletCode = pallet.externalId;
    req.body.locationCode = locationCode;
    const codePattern = (value: string) =>
      new RegExp(`^${value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i");
    const standardCode = toStandardBayCode(locationCode);
    let location = await Location.findOne({
      companyId,
      warehouseId: pallet.warehouseId,
      code: codePattern(locationCode),
    });
    if (!location && standardCode && standardCode.toUpperCase() !== locationCode.toUpperCase()) {
      location = await Location.findOne({
        companyId,
        warehouseId: pallet.warehouseId,
        code: codePattern(standardCode),
      });
    }
    if (!location) {
      res.status(404).json({ error: `Location ${locationCode} not found` });
      return;
    }
    if (location.active === false) {
      res.status(400).json({ error: `Location ${location.code} is inactive` });
      return;
    }
    if (location.palletId && String(location.palletId) !== String(pallet._id)) {
      res.status(400).json({ error: `Location ${location.code} is already occupied` });
      return;
    }
    if (pallet.locationId && String(pallet.locationId) !== String(location._id)) {
      await Location.findOneAndUpdate(
        { _id: pallet.locationId, palletId: pallet._id },
        { palletId: null }
      );
    }
    if (pallet.secondaryLocationId) {
      await Location.findOneAndUpdate(
        { _id: pallet.secondaryLocationId, palletId: pallet._id },
        { palletId: null }
      );
      pallet.secondaryLocationId = null;
      pallet.secondaryLocationCode = "";
    }
    location.palletId = pallet._id;
    await location.save();
    pallet.locationId = location._id;
    pallet.locationCode = location.code;
    pallet.countFlag = "moved";
    pallet.countFlagNote = `Moved to ${location.code}.`;
    if (pallet.status === "staged_for_store" || pallet.status === "received") {
      pallet.status = "stored";
    }
    await pallet.save();
    res.json({
      pallet,
      message: `${pallet.externalId} moved to ${location.code}`,
    });
  } catch (err) {
    next(err);
  }
});

router.get("/", async (req, res, next) => {
  try {
    const openBol = await Shipment.find({
      companyId: req.auth!.companyId,
      direction: "outbound",
      "bol.status": "open",
    }).select("palletIds");
    const openIds = openBol.flatMap((s) => s.palletIds || []);
    if (openIds.length) {
      await Pallet.updateMany(
        { _id: { $in: openIds }, status: "shipped" },
        { $set: { status: "staged_for_shipping", shippedAt: null } }
      );
      await Lpn.updateMany(
        {
          status: "shipped",
          $or: [{ palletId: { $in: openIds } }, { palletIds: { $in: openIds } }],
        },
        { $set: { status: "staged" } }
      );
    }

    const filter: Record<string, unknown> = { companyId: req.auth!.companyId };
    if (req.auth!.role === "customer") {
      filter.customerId = req.auth!.customerId;
    } else if (req.query.customerId) {
      filter.customerId = req.query.customerId;
    }
    if (req.query.status) filter.status = req.query.status;
    if (req.query.warehouseId) filter.warehouseId = req.query.warehouseId;
    const q = String(req.query.q || "").trim();
    if (q) {
      const safe = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const rx = new RegExp(safe, "i");
      filter.$or = [
        { externalId: rx },
        { description: rx },
        { jobName: rx },
        { poNumber: rx },
        { locationCode: rx },
        { ref: rx },
        { notes: rx },
      ];
    }

    const { page, limit, skip } = parsePagination(req.query as Record<string, unknown>, {
      defaultLimit: 50,
      maxLimit: req.query.export === "1" ? 2000 : 200,
    });
    const [total, pallets] = await Promise.all([
      Pallet.countDocuments(filter),
      Pallet.find(filter)
        .populate({ path: "locationId", select: "code aisle type" })
        .populate({ path: "secondaryLocationId", select: "code aisle type" })
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
    const pallet = await Pallet.findOne({ _id: req.params.id, companyId: req.auth!.companyId })
      .populate({ path: "locationId", select: "code aisle type" })
      .populate({ path: "secondaryLocationId", select: "code aisle type" });
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
    const pallet = await Pallet.findOne({
      _id: req.params.id,
      companyId: req.auth!.companyId,
    });
    if (!pallet) {
      res.status(404).json({ error: "Pallet not found" });
      return;
    }

    if (req.body.description !== undefined) pallet.description = String(req.body.description);
    if (req.body.poNumber !== undefined) pallet.poNumber = String(req.body.poNumber);
    if (req.body.jobName !== undefined) pallet.jobName = String(req.body.jobName);
    if (req.body.ref !== undefined) pallet.ref = String(req.body.ref);
    if (req.body.notes !== undefined) pallet.notes = String(req.body.notes);
    if (req.body.dimLength !== undefined) pallet.dimLength = Number(req.body.dimLength) || null;
    if (req.body.dimWidth !== undefined) pallet.dimWidth = Number(req.body.dimWidth) || null;
    if (req.body.dimHeight !== undefined) pallet.dimHeight = Number(req.body.dimHeight) || null;
    if (req.body.sqft !== undefined) pallet.sqft = Number(req.body.sqft) || null;
    if (req.body.weightLbs !== undefined) {
      pallet.weightLbs =
        req.body.weightLbs === null || req.body.weightLbs === ""
          ? null
          : Number(req.body.weightLbs);
    }
    if (req.body.status !== undefined && req.body.status !== "void") {
      pallet.status = req.body.status;
    }

    // Void: free reserved floor slots so the barcode is retired (Cesar modify)
    if (req.body.status === "void") {
      if (pallet.locationId) {
        await Location.findOneAndUpdate(
          { _id: pallet.locationId, palletId: pallet._id },
          { palletId: null }
        );
      }
      if (pallet.secondaryLocationId) {
        await Location.findOneAndUpdate(
          { _id: pallet.secondaryLocationId, palletId: pallet._id },
          { palletId: null }
        );
      }
      pallet.locationId = null;
      pallet.secondaryLocationId = null;
      pallet.locationCode = "";
      pallet.secondaryLocationCode = "";
      pallet.status = "void";
    }

    await pallet.save();
    const populated = await Pallet.findById(pallet._id)
      .populate({ path: "locationId", select: "code aisle type" })
      .populate({ path: "secondaryLocationId", select: "code aisle type" });
    res.json({ pallet: populated });
  } catch (err) {
    next(err);
  }
});

export default router;
