import { Schema, model, type InferSchemaType, Types } from "mongoose";

const lpnSchema = new Schema(
  {
    companyId: { type: Schema.Types.ObjectId, ref: "Company", required: true, index: true },
    warehouseId: { type: Schema.Types.ObjectId, ref: "Warehouse", required: true },
    customerId: { type: Schema.Types.ObjectId, ref: "Customer", required: true },
    palletId: { type: Schema.Types.ObjectId, ref: "Pallet", default: null },
    code: { type: String, required: true },
    sku: { type: String, default: "" },
    description: { type: String, default: "" },
    qty: { type: Number, default: 1 },
    uom: { type: String, default: "ea" },
    status: { type: String, enum: ["active", "shipped", "void"], default: "active" },
  },
  { timestamps: true }
);

lpnSchema.index({ companyId: 1, code: 1 }, { unique: true });

export type LpnDoc = InferSchemaType<typeof lpnSchema> & { _id: Types.ObjectId };
export const Lpn = model("Lpn", lpnSchema);
