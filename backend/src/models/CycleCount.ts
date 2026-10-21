import { Schema, model, type InferSchemaType, Types } from "mongoose";

const cycleCountSchema = new Schema(
  {
    companyId: { type: Schema.Types.ObjectId, ref: "Company", required: true, index: true },
    palletId: { type: Schema.Types.ObjectId, ref: "Pallet", required: true, index: true },
    externalId: { type: String, default: "" },
    countedAt: { type: Date, default: Date.now },
    countedByEmail: { type: String, default: "" },
    systemLocation: { type: String, default: "" },
    physicalLocation: { type: String, default: "" },
    result: { type: String, enum: ["match", "discrepancy"], required: true },
    trigger: {
      type: String,
      enum: ["due", "moved", "store_override", "discrepancy", "manual"],
      default: "manual",
    },
    adjustmentNote: { type: String, default: "" },
  },
  { timestamps: true }
);

export type CycleCountDoc = InferSchemaType<typeof cycleCountSchema> & { _id: Types.ObjectId };
export const CycleCount = model("CycleCount", cycleCountSchema);
