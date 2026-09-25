import { Schema, model, type InferSchemaType, Types } from "mongoose";

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
    carrier: { type: String, default: "" },
    trailerNumber: { type: String, default: "" },
    bolNumber: { type: String, default: "" },
    freightClass: { type: String, default: "" },
    equipment: { type: String, default: "" },
    /** When true, bill FTL flat instead of per-pallet handling (SBA option). */
    billAsFtl: { type: Boolean, default: false },
    ftlRateApplied: { type: Number, default: null },
    palletIds: [{ type: Schema.Types.ObjectId, ref: "Pallet" }],
    scheduledAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    notes: { type: String, default: "" },
  },
  { timestamps: true }
);

export type ShipmentDoc = InferSchemaType<typeof shipmentSchema> & { _id: Types.ObjectId };
export const Shipment = model("Shipment", shipmentSchema);
