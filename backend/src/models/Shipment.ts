import { Schema, model, type InferSchemaType, Types } from "mongoose";

/** Working BOL capture on the shipment until closed (Cesar brief). */
const bolSignatureSchema = new Schema(
  {
    role: { type: String, enum: ["driver", "warehouse"], required: true },
    name: { type: String, required: true, trim: true },
    imageDataUrl: { type: String, default: "" },
    signedAt: { type: Date, required: true },
  },
  { _id: false }
);

const bolWorkflowSchema = new Schema(
  {
    status: {
      type: String,
      enum: ["draft", "open", "closed"],
      default: "draft",
      index: true,
    },
    driverName: { type: String, default: "" },
    truckNumber: { type: String, default: "" },
    countVerified: { type: Boolean, default: null },
    actualCount: { type: Number, default: null },
    rewrapBanding: { type: Boolean, default: null },
    /** "No exceptions" | "Damage" | "Shortage" | "Overage" */
    condition: { type: String, default: "No exceptions" },
    exceptionNotes: { type: String, default: "" },
    billingFlags: { type: [String], default: [] },
    declaredValue: { type: String, default: "" },
    /** Outbound must reference inbound BOL(s) it pulls from */
    refInboundBol: { type: String, default: "" },
    refInboundShipmentIds: [{ type: Schema.Types.ObjectId, ref: "Shipment" }],
    timeReceived: { type: Date, default: null },
    timeReleased: { type: Date, default: null },
    signatures: { type: [bolSignatureSchema], default: [] },
    /** Relative paths under uploads/bol/... */
    exceptionPhotoPaths: { type: [String], default: [] },
    closedAt: { type: Date, default: null },
    closedByUserId: { type: Schema.Types.ObjectId, ref: "User", default: null },
    closedByEmail: { type: String, default: "" },
    currentRecordId: { type: Schema.Types.ObjectId, ref: "BolRecord", default: null },
    invoiceId: { type: Schema.Types.ObjectId, ref: "Invoice", default: null },
    documentPath: { type: String, default: "" },
  },
  { _id: false }
);

const shipmentSchema = new Schema(
  {
    companyId: { type: Schema.Types.ObjectId, ref: "Company", required: true, index: true },
    warehouseId: { type: Schema.Types.ObjectId, ref: "Warehouse", required: true },
    customerId: { type: Schema.Types.ObjectId, ref: "Customer", required: true },
    direction: { type: String, enum: ["inbound", "outbound"], required: true },
    status: {
      type: String,
      enum: ["expected", "arrived", "in_progress", "completed", "cancelled"],
      default: "expected",
    },
    /**
     * Appointment / job flavor (Cesar): drop_and_store | crossdock | trailer_rework | pickup.
     * Crossdock/rework do not hit long-term inventory the same way as drop & store.
     */
    serviceType: {
      type: String,
      enum: ["drop_and_store", "crossdock", "trailer_rework", "pickup", ""],
      default: "drop_and_store",
    },
    carrier: { type: String, default: "" },
    trailerNumber: { type: String, default: "" },
    bolNumber: { type: String, default: "" },
    sealNumber: { type: String, default: "" },
    scac: { type: String, default: "" },
    shipFrom: { type: String, default: "" },
    shipTo: { type: String, default: "" },
    thirdParty: { type: String, default: "" },
    /** Total weight for BOL (sum of pallet weights or declared). */
    weightLbs: { type: Number, default: null },
    freightClass: { type: String, default: "" },
    equipment: { type: String, default: "" },
    /** When true, bill FTL flat instead of per-pallet handling (SBA option). */
    billAsFtl: { type: Boolean, default: false },
    ftlRateApplied: { type: Number, default: null },
    palletIds: [{ type: Schema.Types.ObjectId, ref: "Pallet" }],
    /** Portal request that created this expected appointment (when approved). */
    requestId: { type: Schema.Types.ObjectId, ref: "Request", default: null },
    scheduledAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    notes: { type: String, default: "" },
    jobName: { type: String, default: "" },
    poNumber: { type: String, default: "" },
    /**
     * Planned pallet count for expected appointments (Booking → Expected → Receive/Ship).
     * Distinct from palletIds.length (actual pallets once received/shipped).
     */
    expectedPalletCount: { type: Number, default: null },
    /** Cesar BOL workflow — draft/open until signed close; then immutable via BolRecord */
    bol: { type: bolWorkflowSchema, default: () => ({}) },
  },
  { timestamps: true }
);

export type ShipmentDoc = InferSchemaType<typeof shipmentSchema> & { _id: Types.ObjectId };
export const Shipment = model("Shipment", shipmentSchema);
