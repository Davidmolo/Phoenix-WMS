import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth";
import { Shipment } from "../models/Shipment";
import { Pallet } from "../models/Pallet";
import { Location } from "../models/Location";
import { Customer } from "../models/Customer";
import { User } from "../models/User";
import { Accessorial } from "../models/Accessorial";
import { Lpn } from "../models/Lpn";
import { nextPalletExternalId, createUniqueLpn } from "../services/ids";
import { splitClientReference } from "../services/palletSpace";
import { assignLocationGroups, slotsPerPallet } from "../services/locationAssign";
import { generateBolNumber } from "../services/bol";
import { invoiceInboundShipment } from "../services/billingInvoice";
import { paginationMeta, parsePagination } from "../utils/pagination";
import { ACTIVE_PALLET_STATUSES } from "../constants/palletStatus";
import {
  buildShipmentBolDocument,
  customerHasLienHold,
  isBolClosed,
  resolveInboundBolRefs,
} from "../services/bolWorkflow";
import shipmentBolRoutes from "./shipmentBol";

const SERVICE_TYPES = ["drop_and_store", "crossdock", "trailer_rework", "pickup"] as const;

const router = Router();
router.use(requireAuth);
router.use(shipmentBolRoutes);

router.get("/", async (req, res, next) => {
  try {
    const filter: Record<string, unknown> = { companyId: req.auth!.companyId };
    if (req.auth!.role === "customer") filter.customerId = req.auth!.customerId;
    else if (req.query.customerId) filter.customerId = req.query.customerId;
    if (req.query.direction) filter.direction = req.query.direction;
    if (req.query.status) filter.status = req.query.status;

    const { page, limit, skip } = parsePagination(req.query as Record<string, unknown>, {
      defaultLimit: 50,
      maxLimit: 200,
    });
    if (req.query.serviceType) filter.serviceType = req.query.serviceType;

    const [total, shipments] = await Promise.all([
      Shipment.countDocuments(filter),
      Shipment.find(filter)
        .populate("customerId", "name email")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
    ]);
    res.json({ shipments, ...paginationMeta(page, limit, total) });
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
      serviceType = "drop_and_store",
      palletCount = 1,
      carrier = "",
      trailerNumber = "",
      scheduledAt,
      notes = "",
      billAsFtl = false,
      poOrJob = "",
      poNumber = "",
      jobName = "",
      weightLbs = null,
    } = req.body;

    if (!warehouseId || !customerId) {
      res.status(400).json({ error: "warehouseId and customerId are required" });
      return;
    }
    if (!["inbound", "outbound"].includes(direction)) {
      res.status(400).json({ error: "direction must be inbound or outbound" });
      return;
    }
    const st = SERVICE_TYPES.includes(serviceType) ? serviceType : "drop_and_store";
    // Pickup is typically outbound; crossdock/rework/drop_and_store usually inbound
    const dir =
      st === "pickup" ? "outbound" : direction === "outbound" ? "outbound" : "inbound";

    const refs = splitClientReference(poOrJob || poNumber || jobName);

    const planned = Math.max(1, Math.min(200, Number(palletCount) || 1));
    const shipment = await Shipment.create({
      companyId: req.auth!.companyId,
      warehouseId,
      customerId,
      direction: dir,
      serviceType: st,
      status: "expected",
      carrier,
      trailerNumber,
      billAsFtl: Boolean(billAsFtl),
      scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
      jobName: refs.jobName,
      poNumber: refs.poNumber,
      weightLbs: weightLbs != null && weightLbs !== "" ? Number(weightLbs) : null,
      expectedPalletCount: planned,
      notes: notes || `Expected ${st.replace(/_/g, " ")} · ${planned} pallet(s)`,
      palletIds: [],
    });

    res.status(201).json({ shipment });
  } catch (err) {
    next(err);
  }
});

/** Build a walk-order pick list for outbound pallets (sorted by floor location). */
router.post("/pick-list", requireRole("admin", "staff"), async (req, res, next) => {
  try {
    const companyId = req.auth!.companyId;
    const { warehouseId, customerId, palletIds = [] } = req.body as {
      warehouseId?: string;
      customerId?: string;
      palletIds?: string[];
    };

    if (!Array.isArray(palletIds) || palletIds.length === 0) {
      res.status(400).json({ error: "palletIds are required" });
      return;
    }

    const filter: Record<string, unknown> = {
      _id: { $in: palletIds },
      companyId,
      status: { $in: ACTIVE_PALLET_STATUSES },
    };
    if (warehouseId) filter.warehouseId = warehouseId;
    if (customerId) filter.customerId = customerId;

    const pallets = await Pallet.find(filter)
      .populate("locationId", "code aisle row col type")
      .populate("customerId", "name");

    if (pallets.length === 0) {
      res.status(400).json({ error: "No shippable pallets found for pick list" });
      return;
    }

    type LocPop = { code?: string; aisle?: string; row?: number; col?: number; type?: string } | null;
    const lines = pallets
      .map((p, idx) => {
        const loc = p.locationId as unknown as LocPop;
        const customer = p.customerId as unknown as { name?: string } | null;
        return {
          seq: 0,
          palletId: String(p._id),
          externalId: p.externalId,
          status: p.status,
          description: p.description || "",
          jobName: p.jobName || "",
          poNumber: p.poNumber || "",
          sqft: p.sqft ?? null,
          customerName: customer?.name || "",
          locationCode: loc?.code || "UNASSIGNED",
          aisle: loc?.aisle || "",
          row: loc?.row ?? 999,
          col: loc?.col ?? 999,
          locationType: loc?.type || "",
          _idx: idx,
        };
      })
      .sort((a, b) => {
        if (a.row !== b.row) return a.row - b.row;
        if (a.col !== b.col) return a.col - b.col;
        return a.locationCode.localeCompare(b.locationCode);
      })
      .map((line, i) => {
        const { _idx, ...rest } = line;
        return { ...rest, seq: i + 1 };
      });

    res.json({
      generatedAt: new Date().toISOString(),
      warehouseId: warehouseId || null,
      customerId: customerId || null,
      palletCount: lines.length,
      lines,
    });
  } catch (err) {
    next(err);
  }
});

/** Staff edit / cancel / reschedule expected or in-progress shipments (Cesar modify). */
router.patch("/:id", requireRole("admin", "staff"), async (req, res, next) => {
  try {
    const shipment = await Shipment.findOne({
      _id: req.params.id,
      companyId: req.auth!.companyId,
    });
    if (!shipment) {
      res.status(404).json({ error: "Shipment not found" });
      return;
    }

    const {
      carrier,
      trailerNumber,
      sealNumber,
      scac,
      shipFrom,
      shipTo,
      thirdParty,
      notes,
      jobName,
      poNumber,
      scheduledAt,
      serviceType,
      status,
      weightLbs,
      billAsFtl,
    } = req.body;

    // Cesar: signed BOL is immutable — freight/party fields locked after close (use amendment)
    if (isBolClosed(shipment)) {
      const locked =
        carrier !== undefined ||
        trailerNumber !== undefined ||
        sealNumber !== undefined ||
        scac !== undefined ||
        shipFrom !== undefined ||
        shipTo !== undefined ||
        thirdParty !== undefined ||
        weightLbs !== undefined;
      if (locked) {
        res.status(400).json({
          error: "Signed BOL is immutable — create a BOL amendment to correct freight details",
          code: "BOL_LOCKED",
        });
        return;
      }
    }

    if (carrier !== undefined) shipment.carrier = String(carrier);
    if (trailerNumber !== undefined) shipment.trailerNumber = String(trailerNumber);
    if (sealNumber !== undefined) shipment.sealNumber = String(sealNumber);
    if (scac !== undefined) shipment.scac = String(scac);
    if (shipFrom !== undefined) shipment.shipFrom = String(shipFrom);
    if (shipTo !== undefined) shipment.shipTo = String(shipTo);
    if (thirdParty !== undefined) shipment.thirdParty = String(thirdParty);
    if (notes !== undefined) shipment.notes = String(notes);
    if (jobName !== undefined) shipment.jobName = String(jobName);
    if (poNumber !== undefined) shipment.poNumber = String(poNumber);
    if (billAsFtl !== undefined) shipment.billAsFtl = Boolean(billAsFtl);
    if (weightLbs !== undefined) {
      shipment.weightLbs =
        weightLbs === null || weightLbs === "" ? null : Number(weightLbs);
    }
    if (scheduledAt !== undefined) {
      shipment.scheduledAt = scheduledAt ? new Date(scheduledAt) : null;
    }
    if (serviceType !== undefined && SERVICE_TYPES.includes(serviceType)) {
      shipment.serviceType = serviceType;
    }
    if (status !== undefined) {
      const allowed = ["expected", "arrived", "in_progress", "completed", "cancelled"];
      if (!allowed.includes(String(status))) {
        res.status(400).json({ error: `status must be one of ${allowed.join(", ")}` });
        return;
      }
      shipment.status = status;
      if (status === "completed" && !shipment.completedAt) {
        shipment.completedAt = new Date();
      }
    }

    await shipment.save();
    const populated = await Shipment.findById(shipment._id).populate(
      "customerId",
      "name email phone"
    );
    res.json({ shipment: populated });
  } catch (err) {
    next(err);
  }
});

router.get("/:id", async (req, res, next) => {
  try {
    const shipment = await Shipment.findOne({
      _id: req.params.id,
      companyId: req.auth!.companyId,
    }).populate("customerId", "name email phone address contact quickbooksCustomerId");
    if (!shipment) {
      res.status(404).json({ error: "Shipment not found" });
      return;
    }
    if (
      req.auth!.role === "customer" &&
      String((shipment.customerId as { _id?: unknown })?._id || shipment.customerId) !==
        String(req.auth!.customerId)
    ) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    const pallets = await Pallet.find({ _id: { $in: shipment.palletIds } })
      .populate({ path: "locationId", select: "code aisle type" })
      .populate({ path: "secondaryLocationId", select: "code aisle type" });

    // Backfill snapshot codes so barcode reprints always show storage location
    for (const p of pallets) {
      const primary =
        p.locationId && typeof p.locationId === "object" && "code" in p.locationId
          ? String((p.locationId as { code?: string }).code || "")
          : "";
      const secondary =
        p.secondaryLocationId &&
        typeof p.secondaryLocationId === "object" &&
        "code" in p.secondaryLocationId
          ? String((p.secondaryLocationId as { code?: string }).code || "")
          : "";
      let dirty = false;
      if (primary && !p.locationCode) {
        p.locationCode = primary;
        dirty = true;
      }
      if (secondary && !p.secondaryLocationCode) {
        p.secondaryLocationCode = secondary;
        dirty = true;
      }
      if (dirty) await p.save();
    }

    const customer = shipment.customerId as unknown as {
      name?: string;
      _id?: unknown;
      quickbooksCustomerId?: string | null;
    } | null;
    const bol =
      shipment.bolNumber || pallets.length
        ? await buildShipmentBolDocument(shipment, pallets, customer)
        : null;
    const lien =
      customer?._id
        ? await customerHasLienHold(String(shipment.companyId), String(customer._id))
        : null;
    res.json({ shipment, pallets, bol, lien });
  } catch (err) {
    next(err);
  }
});

/**
 * Receive inbound pallets (Cesar flow):
 * 1) From expected or manual entry
 * 2) Location = next available (default) or chosen slots
 * 3) Status stays staged_for_store while labels print (location on barcode)
 * 4) Later: Store scan confirms putaway → stored
 * 5) Cesar: no inbound BOL — unload invoice posts on receive (not Close BOL)
 *
 * Body: { warehouseId, customerId, palletCount, locationMode?, locationIds?, expectedShipmentId?, ... }
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
      locationIds: bodyLocationIds = [],
      locationMode = "next_available",
      receiptKind = "pallet",
      parcelOversize = false,
      trackingNumber = "",
      receiptPhotos = [],
      expectedShipmentId = null,
      carrier = "",
      trailerNumber = "",
      ref = "",
      poNumber = "",
      jobName = "",
      poOrJob = "",
      dimLength,
      dimWidth,
      sqft,
      weightLbs = null,
      weightLbsEach = null,
      /** Cesar #9: optional per-pallet weights (same length as palletCount). */
      weightLbsByPallet = null,
      serviceType = "drop_and_store",
      shipFrom = "",
      shipTo = "",
      thirdParty = "",
      sealNumber = "",
      scac = "",
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
    const isParcel = receiptKind === "parcel";
    const footprint = isParcel
      ? { sqft: null as number | null, dimLength: null as number | null, dimWidth: null as number | null }
      : resolvePalletSqft({ sqft, dimLength, dimWidth });

    const count = Math.max(1, Math.min(50, Number(palletCount) || 1));
    const slotsEach = slotsPerPallet(footprint.dimLength, footprint.dimWidth);
    const perPalletWeightDefault =
      weightLbsEach != null && weightLbsEach !== ""
        ? Number(weightLbsEach)
        : weightLbs != null && weightLbs !== ""
          ? Number(weightLbs) / count
          : null;
    const weightList: Array<number | null> = Array.from({ length: count }, (_, i) => {
      if (Array.isArray(weightLbsByPallet) && weightLbsByPallet[i] != null && weightLbsByPallet[i] !== "") {
        const n = Number(weightLbsByPallet[i]);
        return Number.isFinite(n) ? n : null;
      }
      return perPalletWeightDefault != null && Number.isFinite(perPalletWeightDefault)
        ? perPalletWeightDefault
        : null;
    });
    const totalWeightFromList = weightList.reduce<number | null>((s, w) => {
      if (w == null) return s;
      return (s ?? 0) + w;
    }, null);

    let locationGroups: string[][];
    if (isParcel && locationMode !== "choose") {
      locationGroups = Array.from({ length: count }, () => [] as string[]);
    } else if (isParcel) {
      const ids = Array.isArray(bodyLocationIds) ? bodyLocationIds.map(String).filter(Boolean) : [];
      locationGroups = Array.from({ length: count }, (_, i) => (ids[i] ? [ids[i]] : []));
    } else {
      try {
        locationGroups = await assignLocationGroups({
          companyId,
          warehouseId,
          palletCount: count,
          slotsEach,
          preferredIds:
            locationMode === "choose" && Array.isArray(bodyLocationIds)
              ? bodyLocationIds.map(String)
              : [],
        });
      } catch (assignErr) {
        res.status(400).json({
          error: assignErr instanceof Error ? assignErr.message : "Could not assign locations",
        });
        return;
      }
    }

    const st = SERVICE_TYPES.includes(serviceType) ? serviceType : "drop_and_store";

    let shipment;
    if (expectedShipmentId) {
      shipment = await Shipment.findOne({
        _id: expectedShipmentId,
        companyId,
        direction: "inbound",
        status: "expected",
      });
      if (!shipment) {
        res.status(404).json({ error: "Expected inbound shipment not found" });
        return;
      }
      if (String(shipment.customerId) !== String(customerId)) {
        res.status(400).json({ error: "Customer does not match the expected shipment" });
        return;
      }
      const planned = Number(shipment.expectedPalletCount || 0);
      if (planned > 0 && count > planned && req.body.overReceipt !== true) {
        res.status(409).json({
          error: `Expected ${planned}. Receiving ${count} needs over-receipt confirmation.`,
        });
        return;
      }
      if (planned > 0 && count > planned) {
        shipment.notes = `${shipment.notes || ""}\nOver-receipt: received ${count}, expected ${planned}`.trim();
      }
      shipment.status = "in_progress";
      shipment.carrier = carrier || shipment.carrier;
      shipment.trailerNumber = trailerNumber || shipment.trailerNumber;
      shipment.billAsFtl = Boolean(billAsFtl);
      shipment.serviceType = shipment.serviceType || st;
      if (totalWeightFromList != null) {
        shipment.weightLbs = Math.round(totalWeightFromList * 100) / 100;
      }
      if (ref) shipment.notes = ref;
      await shipment.save();
    } else {
      shipment = await Shipment.create({
        companyId,
        warehouseId,
        customerId,
        direction: "inbound",
        serviceType: st,
        status: "in_progress",
        carrier,
        trailerNumber,
        sealNumber,
        scac,
        // Cesar: inbound is arriving — origin → Phoenix (not outbound-style route)
        shipFrom: shipFrom || customer.name,
        shipTo: shipTo || "Phoenix Cross Dock",
        thirdParty,
        billAsFtl: Boolean(billAsFtl),
        weightLbs:
          totalWeightFromList != null
            ? Math.round(totalWeightFromList * 100) / 100
            : null,
        notes: ref,
      });
    }

    const createdPallets = [];
    for (let i = 0; i < count; i++) {
      const externalId = await nextPalletExternalId(companyId);
      const group = locationGroups[i] || [];
      const locationId = group[0] || null;
      const secondaryLocationId = group[1] || null;

      const reservedLocs = [];
      for (const lid of group) {
        const loc = await Location.findOne({
          _id: lid,
          companyId,
          warehouseId,
          palletId: null,
        });
        if (!loc) {
          res.status(400).json({ error: `Location ${lid} is not available` });
          return;
        }
        reservedLocs.push(loc);
      }

      // Cesar: after receive + label print, remain Staged for Store (not stored yet)
      const pallet = await Pallet.create({
        companyId,
        warehouseId,
        customerId,
        locationId,
        secondaryLocationId,
        locationCode: reservedLocs[0]?.code || "",
        secondaryLocationCode: reservedLocs[1]?.code || "",
        externalId,
        status: isParcel ? "received" : locationId ? "staged_for_store" : "received",
        description:
          description ||
          (isParcel
            ? `Parcel ${carrier || ""} ${trackingNumber || ""}`.trim()
            : `Inbound receipt ${ref || shipment.id}`),
        poNumber: refs.poNumber,
        jobName: refs.jobName,
        dimLength: footprint.dimLength,
        dimWidth: footprint.dimWidth,
        sqft: footprint.sqft,
        weightLbs:
          weightList[i] != null ? Math.round(Number(weightList[i]) * 100) / 100 : null,
        ref,
        receiptKind: isParcel ? "parcel" : "pallet",
        parcelOversize: isParcel && Boolean(parcelOversize),
        receivedAt: new Date(),
      });

      if (locationId) {
        await Location.findByIdAndUpdate(locationId, { palletId: pallet._id });
      }
      if (secondaryLocationId) {
        await Location.findByIdAndUpdate(secondaryLocationId, { palletId: pallet._id });
      }

      // Optional single LPN per pallet for demo/ops labeling
      const lpn = await createUniqueLpn({
        companyId,
        warehouseId,
        customerId,
        palletId: pallet._id,
        palletIds: [pallet._id],
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

    // Billing accruals — invoiced on receive (Cesar: no inbound BOL).
    // Per-pallet from fee schedule except contract; admin override when set.
    const {
      resolveCompanyFees,
      isContractCustomer,
      unloadPerPallet,
      crossdockPerPallet,
      pickPerPalletRate,
    } = await import("../services/customerFees");
    const companyDoc = await (await import("../models/Company")).Company.findById(companyId);
    const fees = resolveCompanyFees(companyDoc);
    const service = String(shipment.serviceType || st || "drop_and_store");

    if (isContractCustomer(customer)) {
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
    } else if (service === "crossdock") {
      const rate = crossdockPerPallet(customer, fees);
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
    } else if (isParcel) {
      const per = pickPerPalletRate(
        customer.parcelReceivePerBox,
        Number(fees.parcelReceivePerBox ?? 0.75)
      );
      await Accessorial.create({
        companyId,
        customerId,
        shipmentId: shipment._id,
        type: "handling",
        description: `Parcel receiving — ${count} box(es) @ $${per}/box`,
        amount: Math.round(per * count * 100) / 100,
        date: new Date(),
      });
    } else {
      const per = unloadPerPallet(customer, fees);
      const minimum = Number(fees.unloadLoadMinimum ?? 125);
      const amount = Math.max(minimum, Math.round(per * count * 100) / 100);
      await Accessorial.create({
        companyId,
        customerId,
        shipmentId: shipment._id,
        type: "handling",
        description: `Inbound unload / handling — ${count} pallet(s) @ $${per}/plt (min $${minimum})`,
        amount,
        date: new Date(),
      });
    }

    shipment.status = "completed";
    shipment.completedAt = new Date();
    // Cesar: no inbound BOL — clear any leftover draft fields from Expected templates
    shipment.bolNumber = "";
    shipment.set("bol", undefined);
    shipment.receiptKind = isParcel ? "parcel" : "pallet";
    shipment.trackingNumber = String(trackingNumber || "");
    if (Array.isArray(receiptPhotos) && receiptPhotos.length) {
      const { saveDataUrlImage } = await import("../services/bolStorage");
      const paths: string[] = [];
      for (const dataUrl of receiptPhotos.slice(0, 8)) {
        if (typeof dataUrl !== "string" || !dataUrl.startsWith("data:image/")) continue;
        paths.push(
          saveDataUrlImage({
            shipmentId: String(shipment._id),
            dataUrl,
            prefix: "receipt",
          })
        );
      }
      shipment.receiptPhotoPaths = paths;
      if (paths.length) {
        await Pallet.updateMany(
          { _id: { $in: createdPallets.map((p) => p._id) } },
          { $set: { receiptPhotoPaths: paths } }
        );
      }
    }
    await shipment.save();

    let billing: {
      invoice: { number?: string } | null;
      created?: boolean;
      skipped?: string;
    } | null = null;
    try {
      const result = await invoiceInboundShipment({
        companyId: String(companyId),
        customerId: String(customerId),
        shipmentId: String(shipment._id),
        palletCount: count,
        carrier: shipment.carrier || carrier || "",
        completedAt: shipment.completedAt || new Date(),
      });
      billing = {
        invoice: result.invoice
          ? { number: (result.invoice as { number?: string }).number }
          : null,
        created: result.created,
        skipped: "skipped" in result ? String(result.skipped || "") : undefined,
      };
    } catch (billErr) {
      // Receive still succeeds — surface billing failure to ops
      billing = {
        invoice: null,
        created: false,
        skipped: billErr instanceof Error ? billErr.message : "invoice_failed",
      };
    }

    const pallets = await Pallet.find({ _id: { $in: createdPallets.map((p) => p._id) } })
      .populate({ path: "locationId", select: "code aisle type" })
      .populate({ path: "secondaryLocationId", select: "code aisle type" });

    const invNum = billing?.invoice && "number" in billing.invoice ? billing.invoice.number : null;
    res.status(201).json({
      shipment,
      pallets,
      slotsPerPallet: slotsEach,
      billing,
      nextStep: invNum
        ? `Unload invoiced as ${invNum}. Print labels, then Store scan to putaway.`
        : "Print labels, then Store scan to putaway. (No unload invoice — check billing method / rates.)",
    });
  } catch (err) {
    next(err);
  }
});

/**
 * Ship outbound pallets.
 * Body: { warehouseId, customerId?, palletIds?: string[], lpnId?: string, billAsFtl?, carrier?, weightLbs?, ... }
 * Cesar: pass lpnId to ship an entire staging plate in one scan.
 * customerId is optional when all selected pallets share one customer.
 */
router.post("/ship", requireRole("admin", "staff"), async (req, res, next) => {
  try {
    const companyId = req.auth!.companyId;
    const {
      warehouseId,
      customerId: bodyCustomerId,
      palletIds: bodyPalletIds = [],
      lpnId,
      billAsFtl = false,
      carrier = "",
      trailerNumber = "",
      sealNumber = "",
      scac = "",
      shipFrom = "",
      shipTo = "",
      thirdParty = "",
      weightLbs = null,
      notes = "",
      expectedShipmentId = null,
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

    if (!warehouseId || palletIds.length === 0) {
      res.status(400).json({ error: "warehouseId and palletIds (or lpnId) are required" });
      return;
    }

    const foundAny = await Pallet.find({
      _id: { $in: palletIds },
      companyId,
      status: { $in: ACTIVE_PALLET_STATUSES },
    });

    if (foundAny.length !== palletIds.length) {
      const foundIds = new Set(foundAny.map((p) => String(p._id)));
      const missing = palletIds.filter((id) => !foundIds.has(String(id)));
      res.status(400).json({
        error: `One or more pallets are missing or not shippable (${missing.length} of ${palletIds.length}). Only received / staged / stored pallets can ship.`,
      });
      return;
    }

    const customerIds = [...new Set(foundAny.map((p) => String(p.customerId)))];
    if (customerIds.length > 1) {
      res.status(400).json({
        error: "Selected pallets belong to multiple customers — ship one customer at a time.",
      });
      return;
    }

    const customerId = bodyCustomerId ? String(bodyCustomerId) : customerIds[0];
    if (String(customerIds[0]) !== String(customerId)) {
      res.status(400).json({
        error: "Selected pallets do not belong to the chosen customer. Clear the selection or pick that customer's pallets.",
      });
      return;
    }

    // Cesar: warehouseman's lien — outbound only. Admin may override with a reason on the shipment.
    const lien = await customerHasLienHold(String(companyId), String(customerId));
    const actor = await User.findById(req.auth!.userId).select("role email");
    const lienOverride = req.body.lienOverride === true && actor?.role === "admin";
    if (lien.hold && !lienOverride) {
      res.status(402).json({
        error: `Account past due ($${lien.balanceDue.toFixed(2)}) — cannot release freight until current. An admin can override this hold.`,
        code: "LIEN_HOLD",
        ...lien,
      });
      return;
    }
    const lienOverrideNote =
      lien.hold && lienOverride
        ? `Lien hold overridden by ${actor?.email || req.auth!.email || "admin"} · $${lien.balanceDue.toFixed(2)} past due`
        : "";

    const pallets = foundAny.filter((p) => String(p.customerId) === String(customerId));

    const customer = await Customer.findOne({ _id: customerId, companyId });
    const totalWeight =
      weightLbs != null && weightLbs !== ""
        ? Number(weightLbs)
        : pallets.reduce((s, p) => s + (Number(p.weightLbs) || 0), 0) || null;

    const inboundRefs = await resolveInboundBolRefs({
      companyId: String(companyId),
      customerId: String(customerId),
      palletIds: pallets.map((p) => p._id),
    });

    const shipment = await Shipment.create({
      companyId,
      warehouseId,
      customerId,
      direction: "outbound",
      serviceType: "pickup",
      status: "in_progress",
      carrier,
      trailerNumber,
      sealNumber,
      scac,
      shipFrom: shipFrom || "Phoenix Cross Dock",
      shipTo: shipTo || customer?.name || "",
      thirdParty,
      bolNumber: generateBolNumber(),
      weightLbs: totalWeight,
      billAsFtl: Boolean(billAsFtl),
      palletIds: pallets.map((p) => p._id),
      notes: [notes || (lpnId ? `Shipped via LPN ${lpnId}` : ""), lienOverrideNote]
        .filter(Boolean)
        .join("\n"),
      bol: {
        status: "open",
        refInboundBol: inboundRefs.refInboundBol,
        refInboundShipmentIds: inboundRefs.refInboundShipmentIds,
        timeReleased: new Date(),
      },
    });

    for (const p of pallets) {
      // Snapshot floor codes BEFORE freeing slots — labels/history keep last location after ship
      if (p.locationId && !p.locationCode) {
        const loc = await Location.findById(p.locationId).select("code");
        if (loc?.code) p.locationCode = loc.code;
      }
      if (p.secondaryLocationId && !p.secondaryLocationCode) {
        const loc = await Location.findById(p.secondaryLocationId).select("code");
        if (loc?.code) p.secondaryLocationCode = loc.code;
      }
      if (p.locationId) {
        await Location.findByIdAndUpdate(p.locationId, { palletId: null });
      }
      if (p.secondaryLocationId) {
        await Location.findByIdAndUpdate(p.secondaryLocationId, { palletId: null });
      }
      p.status = "staged_for_shipping";
      p.shippedAt = null;
      // Free live slot pointers; keep locationCode / secondaryLocationCode for reprints
      p.locationId = null;
      p.secondaryLocationId = null;
      await p.save();
    }

    const parcelBoxes = pallets.filter((p) => p.receiptKind === "parcel");
    if (parcelBoxes.length && customer) {
      const { resolveCompanyFees, pickPerPalletRate } = await import("../services/customerFees");
      const companyDoc = await (await import("../models/Company")).Company.findById(companyId);
      const fees = resolveCompanyFees(companyDoc);
      const outRate = pickPerPalletRate(
        customer.parcelOutboundPerBox,
        Number(fees.parcelOutboundPerBox ?? 0.5)
      );
      const boxDay = pickPerPalletRate(
        customer.parcelStoragePerBoxDay,
        Number(fees.parcelStoragePerBoxDay ?? 0.05)
      );
      const oversizeDay = pickPerPalletRate(
        customer.parcelOversizePerPalletDay,
        Number(fees.parcelOversizePerPalletDay ?? 1.65)
      );
      const now = Date.now();
      let storage = 0;
      for (const box of parcelBoxes) {
        const started = box.receivedAt ? new Date(box.receivedAt).getTime() : now;
        const days = Math.max(1, Math.ceil((now - started) / 86400000));
        storage += days * (box.parcelOversize ? oversizeDay : boxDay);
      }
      storage = Math.round(storage * 100) / 100;
      const outbound = Math.round(outRate * parcelBoxes.length * 100) / 100;
      await Accessorial.create({
        companyId,
        customerId,
        shipmentId: shipment._id,
        type: "handling",
        description: `Parcel outbound — ${parcelBoxes.length} box(es) @ $${outRate}/box`,
        amount: outbound,
        date: new Date(),
      });
      await Accessorial.create({
        companyId,
        customerId,
        shipmentId: shipment._id,
        type: "storage",
        description: `Parcel storage — ${parcelBoxes.length} box(es), actual days in the building`,
        amount: storage,
        date: new Date(),
      });
    }

    await Lpn.updateMany(
      {
        companyId,
        $or: [{ palletId: { $in: palletIds } }, { palletIds: { $in: palletIds } }],
      },
      { $set: { status: "staged" } }
    );

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
    if (!shipment.bol) shipment.set("bol", { status: "open" });
    shipment.bol.status = shipment.bol.status === "closed" ? "closed" : "open";
    shipment.bol.timeReleased = shipment.bol.timeReleased || new Date();
    await shipment.save();

    // Cesar audit: consuming Expected Outbound closes the appointment (like inbound receive)
    if (expectedShipmentId) {
      const expected = await Shipment.findOne({
        _id: expectedShipmentId,
        companyId,
        direction: "outbound",
        status: "expected",
      });
      if (expected && String(expected.customerId) === String(customerId)) {
        expected.status = "completed";
        expected.completedAt = new Date();
        expected.notes = `${expected.notes || ""}${expected.notes ? " · " : ""}Shipped as ${shipment.bolNumber || shipment._id}`.trim();
        await expected.save();
      }
    }

    // Cesar: invoice is created when BOL is closed (POST /shipments/:id/bol/close), not on ship alone
    const bol = await buildShipmentBolDocument(shipment, pallets, customer);

    res.status(201).json({
      shipment,
      pallets,
      bol,
      invoice: null,
      quickbooks: null,
      nextStep: "Close BOL (signatures + count verify) to create the QuickBooks invoice",
      lien,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
