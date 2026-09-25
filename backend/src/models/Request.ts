import { Schema, model, type InferSchemaType, Types } from "mongoose";

const requestSchema = new Schema(
  {
    companyId: { type: Schema.Types.ObjectId, ref: "Company", required: true, index: true },
    customerId: { type: Schema.Types.ObjectId, ref: "Customer", required: true, index: true },
    warehouseId: { type: Schema.Types.ObjectId, ref: "Warehouse", default: null },
    type: { type: String, enum: ["Inbound", "Outbound"], required: true },
    status: {
      type: String,
      enum: ["pending", "approved", "scheduled", "completed", "cancelled"],
      default: "pending",
      index: true,
    },
    qty: { type: Number, default: 1 },
    palletCount: { type: Number, default: 1 },
    ref: { type: String, default: "" },
    jobName: { type: String, default: "" },
    poNumber: { type: String, default: "" },
    deliveryAddress: { type: String, default: "" },
    notes: { type: String, default: "" },
    dateRequested: { type: Date, default: Date.now },
    scheduledDate: { type: Date, default: null },
  },
  { timestamps: true }
);

export type RequestDoc = InferSchemaType<typeof requestSchema> & { _id: Types.ObjectId };
export const Request = model("Request", requestSchema);
