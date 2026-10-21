import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth";
import { CycleCount } from "../models/CycleCount";
import { Location } from "../models/Location";
import { Pallet } from "../models/Pallet";
import { toStandardBayCode } from "../services/locationCodes";

const router = Router();
router.use(requireAuth);

/** Cesar: recount stored freight that has not been checked in this many days. */
export const CYCLE_COUNT_DAYS = 30;

const IN_BUILDING = ["received", "staged_for_store", "stored", "staged"];

function sameCode(a: string, b: string) {
  const left = toStandardBayCode(a) || a;
  const right = toStandardBayCode(b) || b;
  return left.trim().toUpperCase() === right.trim().toUpperCase();
}

router.get("/dashboard", requireRole("admin", "staff"), async (req, res, next) => {
  try {
    const companyId = req.auth!.companyId;
    const cutoff = new Date(Date.now() - CYCLE_COUNT_DAYS * 86400000);
    const inBuilding = await Pallet.find({
      companyId,
      status: { $in: IN_BUILDING },
    })
      .select("externalId status locationCode description customerId lastCountedAt countFlag countFlagNote receivedAt")
      .populate("customerId", "name")
      .sort({ lastCountedAt: 1 })
      .lean();

    const due = inBuilding.filter(
      (p) => !p.lastCountedAt || new Date(p.lastCountedAt) < cutoff
    );
    const moved = inBuilding.filter((p) => p.countFlag === "moved");
    const storeOverrides = inBuilding.filter((p) => p.countFlag === "store_override");
    const discrepancies = inBuilding.filter((p) => p.countFlag === "discrepancy");
    const recent = await CycleCount.find({ companyId }).sort({ countedAt: -1 }).limit(30).lean();

    res.json({
      cadenceDays: CYCLE_COUNT_DAYS,
      summary: {
        due: due.length,
        moved: moved.length,
        storeOverrides: storeOverrides.length,
        discrepancies: discrepancies.length,
      },
      due,
      moved,
      storeOverrides,
      discrepancies,
      recent,
    });
  } catch (err) {
    next(err);
  }
});

router.post("/", requireRole("admin", "staff"), async (req, res, next) => {
  try {
    const companyId = req.auth!.companyId;
    const palletCode = String(req.body.palletCode || "").trim().replace(/-B$/i, "");
    const physicalLocation = String(req.body.physicalLocation || "").trim();
    const adjustmentNote = String(req.body.adjustmentNote || "").trim();
    if (!palletCode || !physicalLocation) {
      res.status(400).json({ error: "palletCode and physicalLocation are required" });
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
    const systemLocation = pallet.locationCode || "";
    const match = sameCode(systemLocation, physicalLocation);
    if (!match && !adjustmentNote) {
      res.status(400).json({
        error: `System shows ${systemLocation || "no location"}. ${physicalLocation} does not match. Enter an adjustment note.`,
      });
      return;
    }

    if (!match) {
      const standard = toStandardBayCode(physicalLocation) || physicalLocation;
      const location = await Location.findOne({
        companyId,
        warehouseId: pallet.warehouseId,
        code: new RegExp(`^${standard.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i"),
      });
      if (location && location.palletId && String(location.palletId) !== String(pallet._id)) {
        res.status(400).json({ error: `Location ${location.code} is already occupied` });
        return;
      }
      if (pallet.locationId && (!location || String(pallet.locationId) !== String(location._id))) {
        await Location.findOneAndUpdate(
          { _id: pallet.locationId, palletId: pallet._id },
          { palletId: null }
        );
      }
      if (location) {
        location.palletId = pallet._id;
        await location.save();
        pallet.locationId = location._id;
        pallet.locationCode = location.code;
      } else {
        pallet.locationCode = standard;
      }
    }

    const trigger =
      pallet.countFlag === "moved" ||
      pallet.countFlag === "store_override" ||
      pallet.countFlag === "discrepancy"
        ? pallet.countFlag
        : pallet.lastCountedAt
          ? "manual"
          : "due";

    const record = await CycleCount.create({
      companyId,
      palletId: pallet._id,
      externalId: pallet.externalId,
      countedAt: new Date(),
      countedByEmail: req.auth!.email || "",
      systemLocation,
      physicalLocation: pallet.locationCode || physicalLocation,
      result: match ? "match" : "discrepancy",
      trigger,
      adjustmentNote,
    });

    pallet.lastCountedAt = new Date();
    pallet.countFlag = "";
    pallet.countFlagNote = match ? "" : adjustmentNote;
    await pallet.save();

    res.status(201).json({
      count: record,
      message: match
        ? `${pallet.externalId} matches ${pallet.locationCode}`
        : `${pallet.externalId} adjusted to ${pallet.locationCode}. ${adjustmentNote}`,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
