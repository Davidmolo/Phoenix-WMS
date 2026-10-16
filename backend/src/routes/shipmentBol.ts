import { Router, type Request } from "express";
import { requireRole } from "../middleware/auth";
import { Shipment } from "../models/Shipment";
import { Pallet } from "../models/Pallet";
import { BolRecord } from "../models/BolRecord";
import { bolHtml } from "../services/bol";
import {
  addBolSignature,
  addExceptionPhotos,
  amendBol,
  buildShipmentBolDocument,
  closeBol,
  customerHasLienHold,
  isBolClosed,
  patchBolFields,
} from "../services/bolWorkflow";
import { readUploadFile } from "../services/bolStorage";

const router = Router();

async function loadOwnedShipment(req: Request) {
  const shipment = await Shipment.findOne({
    _id: req.params.id,
    companyId: req.auth!.companyId,
  });
  if (!shipment) return { error: "Shipment not found" as const, status: 404 as const };
  if (
    req.auth!.role === "customer" &&
    String(shipment.customerId) !== String(req.auth!.customerId)
  ) {
    return { error: "Forbidden" as const, status: 403 as const };
  }
  return { shipment };
}

/** Cesar: inbound/Receive never creates a BOL — only outbound uses BOL workflow. */
function inboundBolBlocked(shipment: InstanceType<typeof Shipment>) {
  if (shipment.direction !== "inbound") return null;
  // Allow viewing a legacy closed inbound BOL document if one already exists
  if (isBolClosed(shipment) && shipment.bol?.documentPath) return null;
  return "Inbound receipts do not use a Bill of Lading. Unload is invoiced when freight is received.";
}

/** Lien / past-due hold for a customer (staff + that customer). */
router.get("/billing-hold/:customerId", async (req, res, next) => {
  try {
    const customerId = String(req.params.customerId);
    if (req.auth!.role === "customer" && String(req.auth!.customerId) !== customerId) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    const hold = await customerHasLienHold(req.auth!.companyId, customerId);
    res.json(hold);
  } catch (err) {
    next(err);
  }
});

/** List immutable BOL records for a shipment. */
router.get("/:id/bol/records", requireRole("admin", "staff", "customer"), async (req, res, next) => {
  try {
    const loaded = await loadOwnedShipment(req);
    if ("error" in loaded && loaded.error) {
      res.status(loaded.status).json({ error: loaded.error });
      return;
    }
    const records = await BolRecord.find({ shipmentId: loaded.shipment!._id }).sort({
      sequence: 1,
    });
    res.json({ records, bol: loaded.shipment!.bol });
  } catch (err) {
    next(err);
  }
});

/** Download stored signed BOL HTML document (print / save as PDF). */
router.get("/:id/bol/document", requireRole("admin", "staff", "customer"), async (req, res, next) => {
  try {
    const loaded = await loadOwnedShipment(req);
    if ("error" in loaded && loaded.error) {
      res.status(loaded.status).json({ error: loaded.error });
      return;
    }
    const shipment = loaded.shipment!;
    const seq = req.query.sequence ? Number(req.query.sequence) : null;
    let path = shipment.bol?.documentPath || "";
    if (seq) {
      const rec = await BolRecord.findOne({ shipmentId: shipment._id, sequence: seq });
      if (!rec?.documentPath) {
        res.status(404).json({ error: "BOL document not found" });
        return;
      }
      path = rec.documentPath;
    }
    if (!path) {
      res.status(404).json({
        error: "No signed BOL document yet — close the BOL first",
      });
      return;
    }
    const html = readUploadFile(path).toString("utf8");
    res.setHeader(
      "Content-Disposition",
      `inline; filename="BOL-${shipment.bolNumber || shipment._id}.html"`
    );
    res.type("html").send(html);
  } catch (err) {
    next(err);
  }
});

/** Update draft/open BOL capture fields (blocked when closed). */
router.patch("/:id/bol", requireRole("admin", "staff"), async (req, res, next) => {
  try {
    const loaded = await loadOwnedShipment(req);
    if ("error" in loaded && loaded.error) {
      res.status(loaded.status).json({ error: loaded.error });
      return;
    }
    const blocked = inboundBolBlocked(loaded.shipment!);
    if (blocked) {
      res.status(400).json({ error: blocked });
      return;
    }
    try {
      const shipment = await patchBolFields(loaded.shipment!, req.body || {});
      res.json({ shipment, bol: shipment.bol });
    } catch (e) {
      res.status(400).json({ error: e instanceof Error ? e.message : "Could not update BOL" });
    }
  } catch (err) {
    next(err);
  }
});

/** Capture electronic signature + timestamp. */
router.post("/:id/bol/sign", requireRole("admin", "staff"), async (req, res, next) => {
  try {
    const loaded = await loadOwnedShipment(req);
    if ("error" in loaded && loaded.error) {
      res.status(loaded.status).json({ error: loaded.error });
      return;
    }
    const blocked = inboundBolBlocked(loaded.shipment!);
    if (blocked) {
      res.status(400).json({ error: blocked });
      return;
    }
    try {
      const shipment = await addBolSignature(loaded.shipment!, {
        role: req.body.role === "driver" ? "driver" : "warehouse",
        name: String(req.body.name || ""),
        imageDataUrl: req.body.imageDataUrl || req.body.signatureDataUrl || "",
        signedAt: req.body.signedAt,
      });
      res.json({ shipment, bol: shipment.bol });
    } catch (e) {
      res.status(400).json({ error: e instanceof Error ? e.message : "Could not sign BOL" });
    }
  } catch (err) {
    next(err);
  }
});

/** Add exception photos (data URLs). Required before close when condition is exception. */
router.post("/:id/bol/photos", requireRole("admin", "staff"), async (req, res, next) => {
  try {
    const loaded = await loadOwnedShipment(req);
    if ("error" in loaded && loaded.error) {
      res.status(loaded.status).json({ error: loaded.error });
      return;
    }
    const blocked = inboundBolBlocked(loaded.shipment!);
    if (blocked) {
      res.status(400).json({ error: blocked });
      return;
    }
    const urls = Array.isArray(req.body.photos)
      ? req.body.photos.map(String)
      : req.body.dataUrl
        ? [String(req.body.dataUrl)]
        : [];
    if (!urls.length) {
      res.status(400).json({ error: "photos[] data URLs required" });
      return;
    }
    try {
      const shipment = await addExceptionPhotos(loaded.shipment!, urls);
      res.json({
        shipment,
        bol: shipment.bol,
        photoCount: shipment.bol?.exceptionPhotoPaths?.length || 0,
      });
    } catch (e) {
      res.status(400).json({ error: e instanceof Error ? e.message : "Could not save photos" });
    }
  } catch (err) {
    next(err);
  }
});

/**
 * Close BOL — validates count, signatures, exception photos; freezes immutable record;
 * stores HTML document; creates/pushes QB invoice (Cesar: close BOL → invoice).
 */
router.post("/:id/bol/close", requireRole("admin", "staff"), async (req, res, next) => {
  try {
    const loaded = await loadOwnedShipment(req);
    if ("error" in loaded && loaded.error) {
      res.status(loaded.status).json({ error: loaded.error });
      return;
    }
    const shipment = loaded.shipment!;
    const blocked = inboundBolBlocked(shipment);
    if (blocked) {
      res.status(400).json({ error: blocked });
      return;
    }

    // Lien hold — do not release / close-out billable release when past due
    if (shipment.direction === "outbound") {
      const hold = await customerHasLienHold(
        String(shipment.companyId),
        String(shipment.customerId)
      );
      const lienOverride = req.body.lienOverride === true && req.auth!.role === "admin";
      if (hold.hold && !lienOverride) {
        res.status(402).json({
          error: `Account past due ($${hold.balanceDue.toFixed(2)}) — warehouseman's lien: cannot close outbound BOL until current. An admin can override this hold. Inbound receive is not held.`,
          code: "LIEN_HOLD",
          ...hold,
        });
        return;
      }
      if (hold.hold && lienOverride) {
        const note = `Lien hold overridden by ${req.auth!.email || "admin"} · $${hold.balanceDue.toFixed(2)} past due`;
        shipment.notes = shipment.notes ? `${shipment.notes}\n${note}` : note;
        await shipment.save();
      }
    }

    try {
      const result = await closeBol({
        shipment,
        userId: req.auth!.userId,
        userEmail: req.auth!.email || "",
        createInvoice: req.body.createInvoice !== false,
      });
      res.json({
        ok: true,
        shipment: result.shipment,
        bol: result.shipment.bol,
        record: result.record,
        invoice: result.billing?.invoice || null,
        quickbooks: result.billing?.push || null,
      });
    } catch (e) {
      res.status(400).json({ error: e instanceof Error ? e.message : "Could not close BOL" });
    }
  } catch (err) {
    next(err);
  }
});

/** Start amendment after close (re-open capture; re-sign + close again). */
router.post("/:id/bol/amend", requireRole("admin", "staff"), async (req, res, next) => {
  try {
    const loaded = await loadOwnedShipment(req);
    if ("error" in loaded && loaded.error) {
      res.status(loaded.status).json({ error: loaded.error });
      return;
    }
    const blocked = inboundBolBlocked(loaded.shipment!);
    if (blocked) {
      res.status(400).json({ error: blocked });
      return;
    }
    try {
      const result = await amendBol({
        shipment: loaded.shipment!,
        reason: String(req.body.reason || ""),
        userId: req.auth!.userId,
        userEmail: req.auth!.email || "",
        patch: req.body.patch || undefined,
      });
      res.json(result);
    } catch (e) {
      res.status(400).json({ error: e instanceof Error ? e.message : "Could not amend BOL" });
    }
  } catch (err) {
    next(err);
  }
});

/** Printable live BOL HTML (draft or closed). Prefer /document for signed copy. */
router.get("/:id/bol", requireRole("admin", "staff", "customer"), async (req, res, next) => {
  try {
    const loaded = await loadOwnedShipment(req);
    if ("error" in loaded && loaded.error) {
      res.status(loaded.status).json({ error: loaded.error });
      return;
    }
    const shipment = loaded.shipment!;
    const blocked = inboundBolBlocked(shipment);
    if (blocked) {
      res.status(400).json({ error: blocked });
      return;
    }
    // If closed and file exists, serve frozen document
    if (isBolClosed(shipment) && shipment.bol?.documentPath) {
      try {
        const html = readUploadFile(shipment.bol.documentPath).toString("utf8");
        res.type("html").send(html);
        return;
      } catch {
        /* fall through to live rebuild */
      }
    }
    const pallets = await Pallet.find({ _id: { $in: shipment.palletIds } });
    await shipment.populate("customerId", "name quickbooksCustomerId");
    const customer = shipment.customerId as unknown as {
      name?: string;
      _id?: unknown;
      quickbooksCustomerId?: string | null;
    } | null;
    const doc = await buildShipmentBolDocument(shipment, pallets, customer);
    if (!shipment.bolNumber) {
      await shipment.save();
    }
    res.type("html").send(bolHtml(doc));
  } catch (err) {
    next(err);
  }
});

export default router;
