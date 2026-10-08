import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth";
import { YardJob } from "../models/YardJob";
import { Shipment } from "../models/Shipment";
import { Customer } from "../models/Customer";
import { Company } from "../models/Company";
import { Accessorial } from "../models/Accessorial";
import { DEFAULT_FEE_SCHEDULE } from "../constants/feeSchedule";
import { paginationMeta, parsePagination } from "../utils/pagination";

const router = Router();
router.use(requireAuth);
router.use(requireRole("admin", "staff"));

router.get("/", async (req, res, next) => {
  try {
    const filter: Record<string, unknown> = { companyId: req.auth!.companyId };
    if (req.query.type) filter.type = req.query.type;
    if (req.query.status) filter.status = req.query.status;
    if (req.query.customerId) filter.customerId = req.query.customerId;

    const { page, limit, skip } = parsePagination(req.query as Record<string, unknown>, {
      defaultLimit: 50,
      maxLimit: 200,
    });
    const [total, jobs] = await Promise.all([
      YardJob.countDocuments(filter),
      YardJob.find(filter)
        .populate("customerId", "name billingMethod")
        .populate("expectedShipmentId", "direction status carrier trailerNumber notes")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
    ]);
    res.json({ jobs, ...paginationMeta(page, limit, total) });
  } catch (err) {
    next(err);
  }
});

/** Start a Crossdock or Trailer Rework job from Expected inbound (or manual). */
router.post("/", async (req, res, next) => {
  try {
    const companyId = req.auth!.companyId;
    const {
      warehouseId,
      customerId,
      type,
      expectedShipmentId = null,
      truckNumberIn = "",
      truckNumberOut = "",
      palletCount = 0,
      notes = "",
      startNow = true,
    } = req.body;

    if (!warehouseId || !customerId || !["crossdock", "trailer_rework"].includes(type)) {
      res.status(400).json({
        error: "warehouseId, customerId, and type (crossdock | trailer_rework) are required",
      });
      return;
    }

    const customer = await Customer.findOne({ _id: customerId, companyId });
    if (!customer) {
      res.status(404).json({ error: "Customer not found" });
      return;
    }

    let expected = null;
    if (expectedShipmentId) {
      expected = await Shipment.findOne({
        _id: expectedShipmentId,
        companyId,
        direction: "inbound",
      });
      if (!expected) {
        res.status(404).json({ error: "Expected inbound shipment not found" });
        return;
      }
    }

    const job = await YardJob.create({
      companyId,
      warehouseId,
      customerId,
      expectedShipmentId: expected?._id || null,
      type,
      status: startNow ? "in_progress" : "open",
      truckNumberIn: truckNumberIn || expected?.trailerNumber || "",
      truckNumberOut,
      startedAt: startNow ? new Date() : null,
      palletCount: Number(palletCount) || expected?.palletIds?.length || 0,
      notes,
    });

    res.status(201).json({ job });
  } catch (err) {
    next(err);
  }
});

router.patch("/:id", async (req, res, next) => {
  try {
    const job = await YardJob.findOne({ _id: req.params.id, companyId: req.auth!.companyId });
    if (!job) {
      res.status(404).json({ error: "Job not found" });
      return;
    }

    const {
      truckNumberIn,
      truckNumberOut,
      notes,
      palletCount,
      status,
      start,
      complete,
    } = req.body;

    if (truckNumberIn !== undefined) job.truckNumberIn = String(truckNumberIn);
    if (truckNumberOut !== undefined) job.truckNumberOut = String(truckNumberOut);
    if (notes !== undefined) job.notes = String(notes);
    if (palletCount !== undefined) job.palletCount = Number(palletCount) || 0;

    if (start || status === "in_progress") {
      job.status = "in_progress";
      if (!job.startedAt) job.startedAt = new Date();
    }

    if (complete || status === "completed") {
      if (!job.startedAt) job.startedAt = new Date();
      job.endedAt = new Date();
      job.status = "completed";
      job.completedByEmail = req.auth!.email || "";

      if (!job.accessorialId) {
        const company = await Company.findById(job.companyId);
        const fees = { ...DEFAULT_FEE_SCHEDULE, ...(company?.feeSchedule || {}) };
        const hours = Math.max(
          0.25,
          (job.endedAt.getTime() - job.startedAt.getTime()) / (1000 * 60 * 60)
        );

        let amount = 0;
        let description = "";
        let accType: "crossdock" | "trailer_rework" = "crossdock";

        if (job.type === "crossdock") {
          accType = "crossdock";
          const perPallet = (job.palletCount || 0) * (fees.crossDockPerPallet ?? 25);
          const trailer = fees.crossDockPerTrailer ?? 425;
          const minimum = fees.crossDockMinimum ?? 150;
          amount = Math.max(minimum, perPallet > 0 ? perPallet : trailer);
          description = `Crossdock job — truck in ${job.truckNumberIn || "—"}${
            job.truckNumberOut ? ` / out ${job.truckNumberOut}` : ""
          } (${job.palletCount || 0} pallets)`;
        } else {
          accType = "trailer_rework";
          amount = Math.round(hours * (fees.sortRelabelPerHour ?? 65) * 100) / 100;
          description = `Trailer rework — truck ${job.truckNumberIn || "—"} · ${hours.toFixed(2)} hrs @ fee schedule`;
        }

        const acc = await Accessorial.create({
          companyId: job.companyId,
          customerId: job.customerId,
          shipmentId: job.expectedShipmentId || null,
          type: accType,
          description,
          amount,
          date: job.endedAt,
        });
        job.chargeAmount = amount;
        job.accessorialId = acc._id;
      }
    }

    if (status === "cancelled") {
      job.status = "cancelled";
    }

    await job.save();
    const populated = await YardJob.findById(job._id)
      .populate("customerId", "name billingMethod")
      .populate("expectedShipmentId", "direction status carrier trailerNumber notes");
    res.json({ job: populated });
  } catch (err) {
    next(err);
  }
});

export default router;
