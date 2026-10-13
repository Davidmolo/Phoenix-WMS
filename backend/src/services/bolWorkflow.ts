import crypto from "crypto";
import { Types } from "mongoose";
import { BolRecord } from "../models/BolRecord";
import { Invoice } from "../models/Invoice";
import { Pallet } from "../models/Pallet";
import { Shipment } from "../models/Shipment";
import {
  buildBolDocument,
  bolHtml,
  generateBolNumber,
  type BolDocument,
} from "./bol";
import { saveBolHtmlDocument, saveDataUrlImage } from "./bolStorage";
import { invoiceInboundShipment, invoiceOutboundShipment } from "./billingInvoice";

export type BolSignatureInput = {
  role: "driver" | "warehouse";
  name: string;
  imageDataUrl?: string;
  signedAt?: string | Date;
};

function ensureBol(shipment: InstanceType<typeof Shipment>) {
  if (!shipment.bol) {
    shipment.set("bol", {
      status: "draft",
      signatures: [],
      exceptionPhotoPaths: [],
      billingFlags: [],
      refInboundShipmentIds: [],
    });
  }
  if (!shipment.bol.status) shipment.bol.status = "draft";
  return shipment.bol;
}

export function isBolClosed(shipment: InstanceType<typeof Shipment>) {
  return String(shipment.bol?.status || "") === "closed";
}

/** Cesar lien: block release when customer has past-due open balance in WMS (from QB sync). */
export async function customerHasLienHold(companyId: string, customerId: string) {
  const pastDue = await Invoice.find({
    companyId,
    customerId,
    status: "past_due",
    balanceDue: { $gt: 0 },
  })
    .select("number balanceDue dueDate")
    .limit(10)
    .lean();
  const balanceDue = pastDue.reduce((s, i) => s + (Number(i.balanceDue) || 0), 0);
  return {
    hold: pastDue.length > 0,
    count: pastDue.length,
    balanceDue,
    invoices: pastDue.map((i) => ({
      number: i.number,
      balanceDue: i.balanceDue,
      dueDate: i.dueDate,
    })),
  };
}

/** Resolve inbound BOL #s for outbound pallets (same customer warehouse history). */
export async function resolveInboundBolRefs(opts: {
  companyId: string;
  customerId: string;
  palletIds: Array<string | Types.ObjectId>;
}) {
  const inbound = await Shipment.find({
    companyId: opts.companyId,
    customerId: opts.customerId,
    direction: "inbound",
    bolNumber: { $nin: ["", null] },
    palletIds: { $in: opts.palletIds },
  })
    .select("_id bolNumber")
    .lean();

  // Fallback: any completed inbound that shares pallet ids (if expected path updated palletIds)
  let rows = inbound;
  if (!rows.length) {
    rows = await Shipment.find({
      companyId: opts.companyId,
      customerId: opts.customerId,
      direction: "inbound",
      status: "completed",
      bolNumber: { $nin: ["", null] },
      palletIds: { $in: opts.palletIds },
    })
      .select("_id bolNumber")
      .lean();
  }

  const bols = [...new Set(rows.map((r) => String(r.bolNumber || "")).filter(Boolean))];
  return {
    refInboundBol: bols.join(", "),
    refInboundShipmentIds: rows.map((r) => r._id),
  };
}

export async function buildShipmentBolDocument(
  shipment: InstanceType<typeof Shipment>,
  pallets: Array<{
    externalId: string;
    description?: string;
    weightLbs?: number | null;
    poNumber?: string;
    jobName?: string;
  }>,
  customer?: { name?: string; _id?: unknown; quickbooksCustomerId?: string | null } | null
): Promise<BolDocument> {
  const bol = ensureBol(shipment);
  if (!shipment.bolNumber) {
    shipment.bolNumber = generateBolNumber();
  }
  return buildBolDocument({
    bolNumber: shipment.bolNumber,
    direction: shipment.direction,
    dateTime: bol.closedAt || shipment.completedAt || shipment.scheduledAt || shipment.createdAt,
    wmsJobId: String(shipment._id),
    serviceType: shipment.serviceType,
    appointmentSlot: shipment.scheduledAt
      ? new Date(shipment.scheduledAt).toLocaleString("en-US", {
          timeZone: "America/Phoenix",
          dateStyle: "medium",
          timeStyle: "short",
        })
      : "",
    refInboundBol: bol.refInboundBol || "",
    carrier: shipment.carrier,
    driverName: bol.driverName || "",
    truckNumber: bol.truckNumber || "",
    trailerNumber: shipment.trailerNumber,
    sealNumber: shipment.sealNumber,
    scac: shipment.scac,
    shipFrom: shipment.shipFrom || "Phoenix Arizona Cross Dock LLC",
    shipTo: shipment.shipTo || customer?.name || "",
    thirdParty: shipment.thirdParty,
    customerName: customer?.name || "",
    customerAccountId:
      customer?.quickbooksCustomerId || (customer?._id ? String(customer._id) : ""),
    declaredValue: bol.declaredValue || "",
    countVerified: bol.countVerified ?? null,
    actualCount: bol.actualCount ?? null,
    rewrapBanding: bol.rewrapBanding ?? null,
    condition: bol.condition || "No exceptions",
    exceptionNotes: bol.exceptionNotes || "",
    timeReceived: bol.timeReceived || (shipment.direction === "inbound" ? shipment.completedAt : null),
    timeReleased: bol.timeReleased || (shipment.direction === "outbound" ? shipment.completedAt : null),
    billingFlags: bol.billingFlags || [],
    notes: shipment.notes,
    pallets,
    signatures: (bol.signatures || []).map((s) => ({
      role: s.role as "driver" | "warehouse",
      name: s.name,
      imageDataUrl: s.imageDataUrl || "",
      signedAt: s.signedAt,
    })),
    exceptionPhotoPaths: bol.exceptionPhotoPaths || [],
  });
}

export async function patchBolFields(
  shipment: InstanceType<typeof Shipment>,
  body: Record<string, unknown>
) {
  if (isBolClosed(shipment)) {
    throw new Error("Signed BOL is immutable — create an amendment instead");
  }
  const bol = ensureBol(shipment);
  if (bol.status === "draft") bol.status = "open";

  const str = (k: string) => (body[k] !== undefined ? String(body[k] ?? "").trim() : undefined);
  const boolOrNull = (k: string) => {
    if (body[k] === undefined) return undefined;
    if (body[k] === null || body[k] === "") return null;
    return Boolean(body[k]);
  };
  const numOrNull = (k: string) => {
    if (body[k] === undefined) return undefined;
    if (body[k] === null || body[k] === "") return null;
    const n = Number(body[k]);
    return Number.isFinite(n) ? n : null;
  };

  const driverName = str("driverName");
  if (driverName !== undefined) bol.driverName = driverName;
  const truckNumber = str("truckNumber");
  if (truckNumber !== undefined) bol.truckNumber = truckNumber;
  const condition = str("condition");
  if (condition !== undefined) bol.condition = condition || "No exceptions";
  const exceptionNotes = str("exceptionNotes");
  if (exceptionNotes !== undefined) bol.exceptionNotes = exceptionNotes;
  const declaredValue = str("declaredValue");
  if (declaredValue !== undefined) bol.declaredValue = declaredValue;
  const refInboundBol = str("refInboundBol");
  if (refInboundBol !== undefined) bol.refInboundBol = refInboundBol;

  const cv = boolOrNull("countVerified");
  if (cv !== undefined) bol.countVerified = cv as boolean | null;
  const rw = boolOrNull("rewrapBanding");
  if (rw !== undefined) bol.rewrapBanding = rw as boolean | null;
  const ac = numOrNull("actualCount");
  if (ac !== undefined) bol.actualCount = ac;

  if (Array.isArray(body.billingFlags)) {
    bol.billingFlags = body.billingFlags.map(String);
  }
  if (body.timeReceived !== undefined) {
    bol.timeReceived = body.timeReceived ? new Date(String(body.timeReceived)) : null;
  }
  if (body.timeReleased !== undefined) {
    bol.timeReleased = body.timeReleased ? new Date(String(body.timeReleased)) : null;
  }

  // Allow syncing carrier fields from BOL panel
  if (body.carrier !== undefined) shipment.carrier = String(body.carrier || "");
  if (body.trailerNumber !== undefined) shipment.trailerNumber = String(body.trailerNumber || "");
  if (body.sealNumber !== undefined) shipment.sealNumber = String(body.sealNumber || "");
  if (body.scac !== undefined) shipment.scac = String(body.scac || "");
  if (body.shipFrom !== undefined) shipment.shipFrom = String(body.shipFrom || "");
  if (body.shipTo !== undefined) shipment.shipTo = String(body.shipTo || "");

  await shipment.save();
  return shipment;
}

export async function addBolSignature(
  shipment: InstanceType<typeof Shipment>,
  input: BolSignatureInput
) {
  if (isBolClosed(shipment)) {
    throw new Error("Signed BOL is immutable — create an amendment instead");
  }
  const bol = ensureBol(shipment);
  if (bol.status === "draft") bol.status = "open";

  const role = input.role === "driver" ? "driver" : "warehouse";
  const name = String(input.name || "").trim();
  if (!name) throw new Error("Printed name is required for signature");

  let imageDataUrl = String(input.imageDataUrl || "");
  if (imageDataUrl.startsWith("data:image")) {
    const rel = saveDataUrlImage({
      shipmentId: String(shipment._id),
      dataUrl: imageDataUrl,
      prefix: `sig-${role}`,
    });
    // Keep a small marker path in imageDataUrl field so HTML can load via API
    imageDataUrl = `upload:${rel}`;
  }

  const signedAt = input.signedAt ? new Date(input.signedAt) : new Date();
  const nextSigs: Array<{
    role: "driver" | "warehouse";
    name: string;
    imageDataUrl: string;
    signedAt: Date;
  }> = [...(bol.signatures || [])]
    .filter((s) => s.role !== role)
    .map((s) => ({
      role: s.role as "driver" | "warehouse",
      name: s.name,
      imageDataUrl: s.imageDataUrl || "",
      signedAt: s.signedAt instanceof Date ? s.signedAt : new Date(s.signedAt),
    }));
  nextSigs.push({ role, name, imageDataUrl, signedAt });
  shipment.set("bol.signatures", nextSigs);
  await shipment.save();
  return shipment;
}

export async function addExceptionPhotos(
  shipment: InstanceType<typeof Shipment>,
  dataUrls: string[]
) {
  if (isBolClosed(shipment)) {
    throw new Error("Signed BOL is immutable — create an amendment instead");
  }
  const bol = ensureBol(shipment);
  if (bol.status === "draft") bol.status = "open";
  const paths = [...(bol.exceptionPhotoPaths || [])];
  for (const url of dataUrls) {
    const rel = saveDataUrlImage({
      shipmentId: String(shipment._id),
      dataUrl: url,
      prefix: "exception",
    });
    paths.push(rel);
  }
  shipment.set("bol.exceptionPhotoPaths", paths);
  await shipment.save();
  return shipment;
}

function hasException(condition: string) {
  const c = String(condition || "").toLowerCase();
  return c.includes("damage") || c.includes("shortage") || c.includes("overage");
}

export async function closeBol(opts: {
  shipment: InstanceType<typeof Shipment>;
  userId?: string | null;
  userEmail?: string;
  createInvoice?: boolean;
}) {
  const { shipment } = opts;
  if (isBolClosed(shipment)) {
    throw new Error("BOL is already closed");
  }
  const bol = ensureBol(shipment);
  if (!shipment.bolNumber) shipment.bolNumber = generateBolNumber();

  if (bol.countVerified !== true) {
    throw new Error("Count must be verified before closing the BOL");
  }
  const roles = new Set((bol.signatures || []).map((s) => s.role));
  if (!roles.has("driver") || !roles.has("warehouse")) {
    throw new Error("Driver and warehouse signatures are required to close the BOL");
  }
  if (hasException(bol.condition || "") && (bol.exceptionPhotoPaths || []).length === 0) {
    throw new Error("Exception photos are required when condition is Damage, Shortage, or Overage");
  }
  if (shipment.direction === "outbound" && !String(bol.refInboundBol || "").trim()) {
    // Try auto-resolve once more
    const refs = await resolveInboundBolRefs({
      companyId: String(shipment.companyId),
      customerId: String(shipment.customerId),
      palletIds: shipment.palletIds || [],
    });
    bol.refInboundBol = refs.refInboundBol;
    bol.refInboundShipmentIds = refs.refInboundShipmentIds as Types.ObjectId[];
    if (!bol.refInboundBol) {
      throw new Error("Outbound BOL must reference the inbound BOL # it pulls from");
    }
  }

  const pallets = await Pallet.find({ _id: { $in: shipment.palletIds } });
  const customerPop = await shipment.populate("customerId", "name quickbooksCustomerId");
  const customer = customerPop.customerId as unknown as {
    name?: string;
    _id?: unknown;
    quickbooksCustomerId?: string | null;
  } | null;

  if (!bol.timeReceived && shipment.direction === "inbound") {
    bol.timeReceived = shipment.completedAt || new Date();
  }
  if (!bol.timeReleased && shipment.direction === "outbound") {
    bol.timeReleased = shipment.completedAt || new Date();
  }

  const doc = await buildShipmentBolDocument(shipment, pallets, customer);
  const html = bolHtml(doc);
  const priorCount = await BolRecord.countDocuments({ shipmentId: shipment._id });
  const sequence = priorCount + 1;
  const documentPath = saveBolHtmlDocument({
    shipmentId: String(shipment._id),
    bolNumber: shipment.bolNumber,
    html,
    sequence,
  });
  const contentHash = crypto.createHash("sha256").update(html).digest("hex");

  const record = await BolRecord.create({
    companyId: shipment.companyId,
    shipmentId: shipment._id,
    bolNumber: shipment.bolNumber,
    kind: sequence === 1 ? "original" : "amendment",
    sequence,
    supersedesId: bol.currentRecordId || null,
    documentJson: doc,
    documentPath,
    signatures: bol.signatures || [],
    exceptionPhotoPaths: bol.exceptionPhotoPaths || [],
    contentHash,
    createdByUserId: opts.userId || null,
    createdByEmail: opts.userEmail || "",
  });

  bol.status = "closed";
  bol.closedAt = new Date();
  bol.closedByUserId = opts.userId ? new Types.ObjectId(opts.userId) : null;
  bol.closedByEmail = opts.userEmail || "";
  bol.currentRecordId = record._id;
  bol.documentPath = documentPath;

  let billing: {
    invoice: { _id?: Types.ObjectId; number?: string } | null;
    push: unknown;
    created?: boolean;
    skipped?: string;
  } | null = null;
  if (opts.createInvoice !== false) {
    billing = await invoiceFromClosedBol(shipment);
    if (billing?.invoice?._id) {
      bol.invoiceId = billing.invoice._id as Types.ObjectId;
      record.invoiceId = billing.invoice._id as Types.ObjectId;
      await record.save();
    }
  }

  await shipment.save();
  return { shipment, record, document: doc, html, billing };
}

/** Amendment after close — new immutable record; does not reopen edit of original. */
export async function amendBol(opts: {
  shipment: InstanceType<typeof Shipment>;
  reason: string;
  userId?: string | null;
  userEmail?: string;
  patch?: Record<string, unknown>;
}) {
  const { shipment } = opts;
  if (!isBolClosed(shipment)) {
    throw new Error("Close the BOL before creating an amendment");
  }
  const reason = String(opts.reason || "").trim();
  if (!reason) throw new Error("Amendment reason is required");

  const bol = ensureBol(shipment);
  // Temporarily allow field patch for amendment content only
  bol.status = "open";
  shipment.set("bol.signatures", []);
  if (opts.patch) await patchBolFields(shipment, opts.patch);
  bol.status = "open";
  bol.exceptionNotes = `${bol.exceptionNotes || ""}${bol.exceptionNotes ? "\n" : ""}AMENDMENT: ${reason}`.trim();
  await shipment.save();
  return {
    shipment,
    message:
      "Amendment started — update fields, capture both signatures (and photos if exception), then Close BOL again.",
  };
}

async function invoiceFromClosedBol(shipment: InstanceType<typeof Shipment>) {
  const palletCount = (shipment.palletIds || []).length || 1;
  if (shipment.direction === "outbound") {
    return invoiceOutboundShipment({
      companyId: String(shipment.companyId),
      customerId: String(shipment.customerId),
      shipmentId: String(shipment._id),
      palletCount,
      carrier: shipment.carrier || "",
      billAsFtl: Boolean(shipment.billAsFtl),
      completedAt: shipment.completedAt || new Date(),
    });
  }

  // Cesar: pallet / crossdock inbound — invoice on BOL close (unload + any open accessorials)
  return invoiceInboundShipment({
    companyId: String(shipment.companyId),
    customerId: String(shipment.customerId),
    shipmentId: String(shipment._id),
    palletCount,
    carrier: shipment.carrier || "",
    completedAt: shipment.completedAt || new Date(),
  });
}
