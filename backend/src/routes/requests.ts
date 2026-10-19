import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth";
import { Request as WhRequest } from "../models/Request";
import { Shipment } from "../models/Shipment";
import { Warehouse } from "../models/Warehouse";
import { paginationMeta, parsePagination } from "../utils/pagination";

const router = Router();

router.use(requireAuth);

router.get("/", async (req, res, next) => {
  try {
    const filter: Record<string, unknown> = { companyId: req.auth!.companyId };
    if (req.auth!.role === "customer") filter.customerId = req.auth!.customerId;
    else if (req.query.customerId) filter.customerId = req.query.customerId;
    if (req.query.status) filter.status = req.query.status;

    const { page, limit, skip } = parsePagination(req.query as Record<string, unknown>, {
      defaultLimit: 50,
      maxLimit: 200,
    });
    const [total, requests] = await Promise.all([
      WhRequest.countDocuments(filter),
      WhRequest.find(filter)
        .populate("customerId", "name billingMethod")
        .sort({ dateRequested: -1 })
        .skip(skip)
        .limit(limit),
    ]);
    res.json({ requests, ...paginationMeta(page, limit, total) });
  } catch (err) {
    next(err);
  }
});

router.post("/", async (req, res, next) => {
  try {
    const customerId =
      req.auth!.role === "customer" ? req.auth!.customerId : req.body.customerId;
    if (!customerId) {
      res.status(400).json({ error: "customerId required" });
      return;
    }
    const abnormalPallets = Boolean(req.body.abnormalPallets);
    const abnormalPalletSize = abnormalPallets
      ? String(req.body.abnormalPalletSize || "").trim()
      : "";
    if (abnormalPallets && !abnormalPalletSize) {
      res.status(400).json({ error: "Please describe the abnormal pallet size(s)." });
      return;
    }

    const request = await WhRequest.create({
      ...req.body,
      companyId: req.auth!.companyId,
      customerId,
      abnormalPallets,
      abnormalPalletSize,
      dateRequested: new Date(),
    });
    const populated = await WhRequest.findById(request._id).populate(
      "customerId",
      "name billingMethod"
    );
    try {
      const { sendWarehouseRequestEmail } = await import("../services/mail");
      const customerName =
        populated?.customerId && typeof populated.customerId === "object"
          ? String((populated.customerId as { name?: string }).name || "Customer")
          : "Customer";
      await sendWarehouseRequestEmail({
        customerName,
        type: String(request.type || "Request"),
        qty: Number(request.qty) || 1,
        ref: request.ref || request.jobName || request.poNumber || "",
        notes: request.notes || "",
      });
    } catch (mailErr) {
      console.error("[requests] notify email failed", mailErr);
    }
    res.status(201).json({ request: populated });
  } catch (err) {
    next(err);
  }
});

/**
 * Approve / update request.
 * On approve: auto-create Expected inbound/outbound so dock can receive from Expected tab
 * (Cesar: portal request → admin approve → expected inbound).
 */
router.patch("/:id", requireRole("admin", "staff"), async (req, res, next) => {
  try {
    const companyId = req.auth!.companyId;
    const existing = await WhRequest.findOne({ _id: req.params.id, companyId });
    if (!existing) {
      res.status(404).json({ error: "Request not found" });
      return;
    }

    const prevStatus = existing.status;
    const nextStatus = req.body.status ?? existing.status;

    Object.assign(existing, {
      ...req.body,
      // prevent wiping identity fields
      companyId: existing.companyId,
      customerId: existing.customerId,
    });
    await existing.save();

    let expectedShipment = null;

    if (prevStatus !== "approved" && nextStatus === "approved") {
      const warehouse =
        (existing.warehouseId
          ? await Warehouse.findById(existing.warehouseId)
          : null) ||
        (await Warehouse.findOne({ companyId, active: true }).sort({ name: 1 }));

      if (warehouse) {
        const direction = existing.type === "Outbound" ? "outbound" : "inbound";
        const poJob = existing.jobName || existing.poNumber || existing.ref || "";
        const already = await Shipment.findOne({
          companyId,
          requestId: existing._id,
          status: "expected",
        });
        if (!already) {
          const planned = Math.max(1, Number(existing.palletCount || existing.qty) || 1);
          expectedShipment = await Shipment.create({
            companyId,
            warehouseId: warehouse._id,
            customerId: existing.customerId,
            direction,
            status: "expected",
            requestId: existing._id,
            scheduledAt: existing.scheduledDate || null,
            jobName: existing.jobName || poJob,
            poNumber: existing.poNumber || poJob,
            expectedPalletCount: planned,
            notes: [
              `From portal request ${existing.type}`,
              poJob ? `PO/Job: ${poJob}` : null,
              `${planned} pallet(s)`,
              existing.abnormalPallets
                ? `Abnormal size: ${existing.abnormalPalletSize || "yes"}`
                : null,
              existing.notes || null,
            ]
              .filter(Boolean)
              .join(" · "),
            palletIds: [],
          });
          existing.status = "scheduled";
          await existing.save();
        } else {
          expectedShipment = already;
        }
      }
    }

    res.json({ request: existing, expectedShipment });
  } catch (err) {
    next(err);
  }
});

export default router;
