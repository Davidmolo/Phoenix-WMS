import { Schema, model, type InferSchemaType, Types } from "mongoose";

const warehouseSchema = new Schema(
  {
    companyId: { type: Schema.Types.ObjectId, ref: "Company", required: true, index: true },
    name: { type: String, required: true },
    city: { type: String, default: "Phoenix, AZ" },
    address: { type: String, default: "" },
    sqft: { type: Number, default: null },
    storageMode: { type: String, enum: ["floor", "rack", "mixed"], default: "mixed" },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export type WarehouseDoc = InferSchemaType<typeof warehouseSchema> & { _id: Types.ObjectId };
export const Warehouse = model("Warehouse", warehouseSchema);
