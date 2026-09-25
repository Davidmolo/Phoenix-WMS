import { Schema, model, type InferSchemaType, Types } from "mongoose";

const locationSchema = new Schema(
  {
    companyId: { type: Schema.Types.ObjectId, ref: "Company", required: true, index: true },
    warehouseId: { type: Schema.Types.ObjectId, ref: "Warehouse", required: true, index: true },
    code: { type: String, required: true },
    aisle: { type: String, default: "" },
    type: { type: String, enum: ["inside", "outside"], default: "inside" },
    level: { type: Number, default: 1 },
    spot: { type: Number, default: 1 },
    floorOnly: { type: Boolean, default: true },
    palletId: { type: Schema.Types.ObjectId, ref: "Pallet", default: null },
    row: { type: Number, default: 0 },
    col: { type: Number, default: 0 },
  },
  { timestamps: true }
);

locationSchema.index({ warehouseId: 1, code: 1 }, { unique: true });

export type LocationDoc = InferSchemaType<typeof locationSchema> & { _id: Types.ObjectId };
export const Location = model("Location", locationSchema);
