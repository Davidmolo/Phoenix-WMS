import { Schema, model, type InferSchemaType, Types } from "mongoose";

const palletSchema = new Schema(
  {
    companyId: { type: Schema.Types.ObjectId, ref: "Company", required: true, index: true },
    warehouseId: { type: Schema.Types.ObjectId, ref: "Warehouse", required: true, index: true },
    customerId: { type: Schema.Types.ObjectId, ref: "Customer", required: true, index: true },
    locationId: { type: Schema.Types.ObjectId, ref: "Location", default: null },
    /** Second adjacent slot when footprint exceeds 48×48 (Cesar oversized putaway). */
    secondaryLocationId: { type: Schema.Types.ObjectId, ref: "Location", default: null },
    /** Snapshot codes for labels (survive populate gaps / UI reprint). */
    locationCode: { type: String, default: "" },
    secondaryLocationCode: { type: String, default: "" },
    externalId: { type: String, required: true }, // human-readable e.g. PLT-20001
    status: {
      type: String,
      // staged_for_store = received + label printed, awaiting putaway scan (Cesar receiving flow)
      enum: ["expected", "received", "staged_for_store", "stored", "staged", "staged_for_shipping", "shipped", "void"],
      default: "received",
      index: true,
    },
    description: { type: String, default: "" },
    weightLbs: { type: Number, default: null },
    sqft: { type: Number, default: null },
    dimLength: { type: Number, default: null },
    dimWidth: { type: Number, default: null },
    dimHeight: { type: Number, default: null },
    poNumber: { type: String, default: "" },
    jobName: { type: String, default: "" },
    ref: { type: String, default: "" },
    receivedAt: { type: Date, default: null },
    shippedAt: { type: Date, default: null },
    customRateInside: { type: Number, default: null },
    customRateOutside: { type: Number, default: null },
    lpnIds: [{ type: Schema.Types.ObjectId, ref: "Lpn" }],
    notes: { type: String, default: "" },
    receiptKind: { type: String, enum: ["pallet", "parcel"], default: "pallet" },
    parcelOversize: { type: Boolean, default: false },
    receiptPhotoPaths: { type: [String], default: [] },
    lastCountedAt: { type: Date, default: null },
    /** due is computed. moved / store_override / discrepancy are set by the workflow. */
    countFlag: {
      type: String,
      enum: ["", "moved", "store_override", "discrepancy"],
      default: "",
    },
    countFlagNote: { type: String, default: "" },
  },
  { timestamps: true }
);

palletSchema.index({ companyId: 1, externalId: 1 }, { unique: true });

export type PalletDoc = InferSchemaType<typeof palletSchema> & { _id: Types.ObjectId };
export const Pallet = model("Pallet", palletSchema);
