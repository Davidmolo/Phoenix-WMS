import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth";
import { YardJob } from "../models/YardJob";
import { Shipment } from "../models/Shipment";
import { Customer } from "../models/Customer";
import { Company } from "../models/Company";
import { Accessorial } from "../models/Accessorial";
import { generateBolNumber } from "../services/bol";
import { createAndPushInvoice } from "../services/billingInvoice";
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
        const { resolveCompanyFees, crossdockPerPallet } = await import(
          "../services/customerFees"
        );
        const fees = resolveCompanyFees(company);
        const customerDoc = await Customer.findById(job.customerId).select(
          "crossdockPerPallet billingMethod"
        );
        const hours = Math.max(
          0.25,
          (job.endedAt.getTime() - job.startedAt.getTime()) / (1000 * 60 * 60)
        );

        let amount = 0;
        let description = "";
        let accType: "crossdock" | "trailer_rework" = "crossdock";

        if (job.type === "crossdock") {
          accType = "crossdock";
          const xdRate = crossdockPerPallet(customerDoc, fees);
          const perPallet = (job.palletCount || 0) * xdRate;
          const trailer = fees.crossDockPerTrailer ?? 425;
          const minimum = fees.crossDockMinimum ?? 150;
          amount = Math.max(minimum, perPallet > 0 ? perPallet : trailer);
          description = `Crossdock job — truck in ${job.truckNumberIn || "—"}${
            job.truckNumberOut ? ` / out ${job.truckNumberOut}` : ""
          } (${job.palletCount || 0} pallets)`;
        } else {
          // Cesar: rework = $65/hr with a 1-hour minimum
          accType = "trailer_rework";
          const rate = Number(fees.sortRelabelPerHour ?? 65);
          const minHours = Number(fees.trailerReworkMinimumHours ?? 1);
          const billableHours = Math.max(minHours, hours);
          amount = Math.round(billableHours * rate * 100) / 100;
          description = `Trailer rework — truck ${job.truckNumberIn || "—"} · ${billableHours.toFixed(2)} hrs @ $${rate}/hr${
            hours < minHours ? ` (${hours.toFixed(2)} hrs actual, ${minHours}h minimum)` : ""
          }`;
        }

        // Cesar: free detention window (default 2h / appointment length), then $90/hr
        const freeHours = Number(fees.detentionFreeHours ?? 2);
        const detentionRate = Number(fees.detentionPerHour ?? 90);
        const billableDetention = Math.max(0, hours - freeHours);
        const detentionAmount =
          billableDetention > 0
            ? Math.round(billableDetention * detentionRate * 100) / 100
            : 0;

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

        let detentionAcc = null;
        if (detentionAmount > 0) {
          detentionAcc = await Accessorial.create({
            companyId: job.companyId,
            customerId: job.customerId,
            shipmentId: job.expectedShipmentId || null,
            type: "detention",
            description: `Detention — ${billableDetention.toFixed(2)} hrs beyond ${freeHours}h free @ $${detentionRate}/hr`,
            amount: detentionAmount,
            date: job.endedAt,
          });
          job.chargeAmount = amount + detentionAmount;
        }

        // Cesar: job close → WMS invoice → push to QuickBooks (same-day due, idempotent)
        const lines: Array<{
          description: string;
          qty: number;
          unitAmount: number;
          amount: number;
          type: "crossdock" | "accessorial" | "other";
          shipmentId: string | null;
        }> = [
          {
            description,
            qty: 1,
            unitAmount: amount,
            amount,
            type: job.type === "crossdock" ? "crossdock" : "other",
            shipmentId: job.expectedShipmentId ? String(job.expectedShipmentId) : null,
          },
        ];
        if (detentionAcc) {
          lines.push({
            description: detentionAcc.description,
            qty: 1,
            unitAmount: detentionAmount,
            amount: detentionAmount,
            type: "accessorial",
            shipmentId: job.expectedShipmentId ? String(job.expectedShipmentId) : null,
          });
        }
        const billed = await createAndPushInvoice({
          companyId: String(job.companyId),
          customerId: String(job.customerId),
          wmsJobKey: `yard:${job._id}`,
          sourceType: "yard_job",
          sourceId: String(job._id),
          lines,
          periodStart: job.startedAt,
          periodEnd: job.endedAt,
          notes: `Auto from ${job.type} yard job · BOL ref ${generateBolNumber("YD")}`,
          // Cesar: crossdock + rework invoices are due same day
          termsDays: 0,
          accessorialIds: [String(acc._id), ...(detentionAcc ? [String(detentionAcc._id)] : [])],
        });
        // Attach BOL number onto linked expected shipment when present
        if (job.expectedShipmentId) {
          await Shipment.findByIdAndUpdate(job.expectedShipmentId, {
            $set: {
              bolNumber: generateBolNumber(),
              status: "completed",
              completedAt: job.endedAt,
              carrier: job.truckNumberIn || "",
              trailerNumber: job.truckNumberOut || job.truckNumberIn || "",
            },
          });
        }
        const invLabel = billed.invoice?.number || "pending";
        const qbNote = billed.push?.quickbooksId
          ? ` · QB ${billed.push.quickbooksId}`
          : billed.push?.error
            ? ` · QB push pending`
            : "";
        job.notes = `${job.notes || ""}${job.notes ? " · " : ""}Invoice ${invLabel}${qbNote}`.trim();
      }
    }

    if (status === "cancelled" || req.body.cancel) {
      job.status = "cancelled";
      if (!job.endedAt) job.endedAt = new Date();
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
