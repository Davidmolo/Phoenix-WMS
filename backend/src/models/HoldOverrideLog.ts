import { Schema, model, type InferSchemaType, Types } from "mongoose";

const holdOverrideLogSchema = new Schema(
  {
    companyId: { type: Schema.Types.ObjectId, ref: "Company", required: true, index: true },
    customerId: { type: Schema.Types.ObjectId, ref: "Customer", required: true, index: true },
    shipmentId: { type: Schema.Types.ObjectId, ref: "Shipment", default: null },
    userId: { type: Schema.Types.ObjectId, ref: "User", default: null },
    userEmail: { type: String, default: "" },
    reason: { type: String, required: true },
    holdCodes: { type: [String], default: [] },
  },
  { timestamps: true }
);

export type HoldOverrideLogDoc = InferSchemaType<typeof holdOverrideLogSchema> & { _id: Types.ObjectId };
export const HoldOverrideLog = model("HoldOverrideLog", holdOverrideLogSchema);