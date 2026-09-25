import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth";
import { Shipment } from "../models/Shipment";
import { Pallet } from "../models/Pallet";
import { Location } from "../models/Location";
import { Customer } from "../models/Customer";
import { Accessorial } from "../models/Accessorial";
import { Lpn } from "../models/Lpn";
import { nextPalletExternalId, nextLpnCode } from "../services/ids";

const router = Router();
router.use(requireAuth);

router.get("/", async (req, res, next) => {
  try {
    const filter: Record<string, unknown> = { companyId: req.auth!.companyId };
    if (req.auth!.role === "customer") filter.customerId = req.auth!.customerId;
    else if (req.query.customerId) filter.customerId = req.query.customerId;
    if (req.query.direction) filter.direction = req.query.direction;
    if (req.query.status) filter.status = req.query.status;

    const shipments = await Shipment.find(filter).sort({ createdAt: -1 }).limit(200);
    res.json({ shipments });
  } catch (err) {
    next(err);
  }
});

/** Create an expected inbound/outbound appointment (prototype Expected In/Out). */
router.post("/expected", requireRole("admin", "staff"), async (req, res, next) => {
  try {
    const {
      warehouseId,
      customerId,
      direction = "inbound",
      palletCount = 1,
      carrier = "",
      trailerNumber = "",
      scheduledAt,
      notes = "",
      billAsFtl = false,
    } = req.body;

    if (!warehouseId || !customerId) {
      res.status(400).json({ error: "warehouseId and customerId are required" });
      return;
    }
    if (!["inbound", "outbound"].includes(direction)) {
      res.status(400).json({ error: "direction must be inbound or outbound" });
      return;
    }

    const shipment = await Shipment.create({
      companyId: req.auth!.companyId,
      warehouseId,
      customerId,
      direction,
      status: "expected",
      carrier,
      trailerNumber,
      billAsFtl: Boolean(billAsFtl),
      scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
      notes: notes || `Expected ${direction} · ${palletCount} pallet(s)`,
      palletIds: [],
    });

    res.status(201).json({ shipment });
  } catch (err) {
    next(err);
  }
});

router.get("/:id", async (req, res, next) => {
  try {
    const shipment = await Shipment.findOne({
      _id: req.params.id,
      companyId: req.auth!.companyId,
    });
    if (!shipment) {
      res.status(404).json({ error: "Shipment not found" });
      return;
    }
    if (
      req.auth!.role === "customer" &&
      String(shipment.customerId) !== String(req.auth!.customerId)
    ) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    const pallets = await Pallet.find({ _id: { $in: shipment.palletIds } });
    res.json({ shipment, pallets });
  } catch (err) {
    next(err);
  }
});

/**
 * Receive inbound pallets into the warehouse.
 * Body: { warehouseId, customerId, palletCount, description?, billAsFtl?, locationIds?, carrier?, ref? }
 */
router.post("/receive", requireRole("admin", "staff"), async (req, res, next) => {
  try {
    const companyId = req.auth!.companyId;
    const {
      warehouseId,
      customerId,
      palletCount = 1,
      description = "",
      billAsFtl = false,
      locationIds = [],
      carrier = "",
      trailerNumber = "",
      ref = "",
      poNumber = "",
      jobName = "",
      poOrJob = "",
      dimLength,
      dimWidth,
      sqft,
    } = req.body;

    if (!warehouseId || !customerId) {
      res.status(400).json({ error: "warehouseId and customerId are required" });
      return;
    }

    const customer = await Customer.findOne({ _id: customerId, companyId });
    if (!customer) {
      res.status(404).json({ error: "Customer not found" });
      return;
    }

    const { resolvePalletSqft, splitClientReference } = await import("../services/palletSpace");
    const refs = splitClientReference(poOrJob || poNumber || jobName);
    const footprint = resolvePalletSqft({ sqft, dimLength, dimWidth });

    const count = Math.max(1, Math.min(50, Number(palletCount) || 1));
    const shipment = await Shipment.create({
      companyId,
      warehouseId,
      customerId,
      direction: "inbound",
      status: "in_progress",
      carrier,
      trailerNumber,
      billAsFtl: Boolean(billAsFtl),
      notes: ref,
    });

    const createdPallets = [];
    for (let i = 0; i < count; i++) {
      const externalId = await nextPalletExternalId(companyId);
      const locationId = locationIds[i] || null;

      if (locationId) {
        const loc = await Location.findOne({
          _id: locationId,
          companyId,
          warehouseId,
          palletId: null,
        });
        if (!loc) {
          res.status(400).json({ error: `Location ${locationId} is not available` });
          return;
        }
      }

      const pallet = await Pallet.create({
        companyId,
        warehouseId,
        customerId,
        locationId,
        externalId,
        status: locationId ? "stored" : "received",
        description: description || `Inbound receipt ${ref || shipment.id}`,
        poNumber: refs.poNumber,
        jobName: refs.jobName,
        dimLength: footprint.dimLength,
        dimWidth: footprint.dimWidth,
        sqft: footprint.sqft,
        ref,
        receivedAt: new Date(),
      });

      if (locationId) {
        await Location.findByIdAndUpdate(locationId, { palletId: pallet._id });
      }

      // Optional single LPN per pallet for demo/ops labeling
      const lpn = await Lpn.create({
        companyId,
        warehouseId,
        customerId,
        palletId: pallet._id,
        palletIds: [pallet._id],
        code: await nextLpnCode(companyId),
        kind: "unit",
        description: pallet.description,
        qty: 1,
        status: "active",
      });
      pallet.lpnIds = [lpn._id];
      await pallet.save();

      createdPallets.push(pallet);
      shipment.palletIds.push(pallet._id);
    }

    // Billing: SBA contract handling or FTL
    if (customer.billingMethod === "contract") {
      if (billAsFtl && customer.contractFtlRate) {
        shipment.ftlRateApplied = customer.contractFtlRate;
        await Accessorial.create({
          companyId,
          customerId,
          shipmentId: shipment._id,
          type: "ftl",
          description: `FTL inbound handling — ${carrier || "load"} (${count} pallets)`,
          amount: customer.contractFtlRate,
          date: new Date(),
        });
      } else if (customer.contractHandlingPerPallet) {
        // $20 flat covers IN+OUT together — charge once on inbound
        for (const p of createdPallets) {
          await Accessorial.create({
            companyId,
            customerId,
            palletId: p._id,
            shipmentId: shipment._id,
            type: "handling",
            description: `Contract handling (IN+OUT) — ${p.externalId}`,
            amount: customer.contractHandlingPerPallet,
            date: new Date(),
          });
        }
      }
    } else if (customer.billingMethod === "crossdock") {
      // Company fee schedule applied on invoice generation; post placeholder crossdock charge
      const company = await (await import("../models/Company")).Company.findById(companyId);
      const rate = company?.feeSchedule?.crossDockPerPallet ?? 25;
      for (const p of createdPallets) {
        await Accessorial.create({
          companyId,
          customerId,
          palletId: p._id,
          shipmentId: shipment._id,
          type: "crossdock",
          description: `Cross-dock fee — ${p.externalId}`,
          amount: rate,
          date: new Date(),
        });
      }
    }

    shipment.status = "completed";
    shipment.completedAt = new Date();
    await shipment.save();

    res.status(201).json({ shipment, pallets: createdPallets });
  } catch (err) {
    next(err);
  }
});

/**
 * Ship outbound pallets.
 * Body: { warehouseId, customerId, palletIds?: string[], lpnId?: string, billAsFtl?, carrier? }
 * Cesar: pass lpnId to ship an entire staging plate in one scan.
 */
router.post("/ship", requireRole("admin", "staff"), async (req, res, next) => {
  try {
    const companyId = req.auth!.companyId;
    const {
      warehouseId,
      customerId,
      palletIds: bodyPalletIds = [],
      lpnId,
      billAsFtl = false,
      carrier = "",
      trailerNumber = "",
    } = req.body;

    let palletIds: string[] = Array.isArray(bodyPalletIds) ? [...bodyPalletIds] : [];

    if (lpnId) {
      const lpn = await Lpn.findOne({ _id: lpnId, companyId });
      if (!lpn) {
        res.status(404).json({ error: "LPN not found" });
        return;
      }
      const fromLpn = new Set<string>();
      if (lpn.palletId) fromLpn.add(String(lpn.palletId));
      for (const id of lpn.palletIds || []) fromLpn.add(String(id));
      palletIds = [...fromLpn];
    }

    if (!warehouseId || !customerId || palletIds.length === 0) {
      res.status(400).json({ error: "warehouseId, customerId, and palletIds (or lpnId) are required" });
      return;
    }

    const pallets = await Pallet.find({
      _id: { $in: palletIds },
      companyId,
      customerId,
      status: { $in: ["received", "stored", "staged"] },
    });

    if (pallets.length !== palletIds.length) {
      res.status(400).json({ error: "One or more pallets are missing or not shippable" });
      return;
    }

    const shipment = await Shipment.create({
      companyId,
      warehouseId,
      customerId,
      direction: "outbound",
      status: "in_progress",
      carrier,
      trailerNumber,
      billAsFtl: Boolean(billAsFtl),
      palletIds: pallets.map((p) => p._id),
      notes: lpnId ? `Shipped via LPN ${lpnId}` : "",
    });

    for (const p of pallets) {
      if (p.locationId) {
        await Location.findByIdAndUpdate(p.locationId, { palletId: null });
      }
      p.status = "shipped";
      p.shippedAt = new Date();
      p.locationId = null;
      await p.save();
    }

    await Lpn.updateMany(
      {
        companyId,
        $or: [{ palletId: { $in: palletIds } }, { palletIds: { $in: palletIds } }],
      },
      { $set: { status: "shipped" } }
    );

    const customer = await Customer.findOne({ _id: customerId, companyId });
    if (customer?.billingMethod === "contract" && billAsFtl && customer.contractFtlRate) {
      // If they already paid per-pallet on inbound, FTL on outbound is unusual;
      // only post when explicitly requested and no prior handling on these pallets.
      shipment.ftlRateApplied = customer.contractFtlRate;
      await Accessorial.create({
        companyId,
        customerId,
        shipmentId: shipment._id,
        type: "ftl",
        description: `FTL outbound handling — ${carrier || "load"}`,
        amount: customer.contractFtlRate,
        date: new Date(),
      });
    }

    shipment.status = "completed";
    shipment.completedAt = new Date();
    await shipment.save();

    res.status(201).json({ shipment, pallets });
  } catch (err) {
    next(err);
  }
});

export default router;
