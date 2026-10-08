import { Schema, model, type InferSchemaType, Types } from "mongoose";

/**
 * Crossdock / Trailer Rework documentation (Cesar).
 * Starts from Expected inbound; records trucks + start/end; posts fee-schedule charge on complete.
 */
const yardJobSchema = new Schema(
  {
    companyId: { type: Schema.Types.ObjectId, ref: "Company", required: true, index: true },
    warehouseId: { type: Schema.Types.ObjectId, ref: "Warehouse", required: true, index: true },
    customerId: { type: Schema.Types.ObjectId, ref: "Customer", required: true, index: true },
    expectedShipmentId: { type: Schema.Types.ObjectId, ref: "Shipment", default: null },
    type: {
      type: String,
      enum: ["crossdock", "trailer_rework"],
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ["open", "in_progress", "completed", "cancelled"],
      default: "open",
      index: true,
    },
    truckNumberIn: { type: String, default: "" },
    truckNumberOut: { type: String, default: "" },
    startedAt: { type: Date, default: null },
    endedAt: { type: Date, default: null },
    palletCount: { type: Number, default: 0 },
    notes: { type: String, default: "" },
    chargeAmount: { type: Number, default: null },
    accessorialId: { type: Schema.Types.ObjectId, ref: "Accessorial", default: null },
    completedByEmail: { type: String, default: "" },
  },
  { timestamps: true }
);

export type YardJobDoc = InferSchemaType<typeof yardJobSchema> & { _id: Types.ObjectId };
export const YardJob = model("YardJob", yardJobSchema);
