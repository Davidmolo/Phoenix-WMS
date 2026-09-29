import { Schema, model, type InferSchemaType, Types } from "mongoose";

const warehouseSchema = new Schema(
  {
    companyId: { type: Schema.Types.ObjectId, ref: "Company", required: true, index: true },
    name: { type: String, required: true },
    city: { type: String, default: "Phoenix, AZ" },
    address: { type: String, default: "" },
    sqft: { type: Number, default: null },
    storageMode: { type: String, enum: ["floor", "rack", "mixed"], default: "mixed" },
    /** Editable floor-map grid — scale rows/cols as the building grows. */
    mapLayout: {
      rows: { type: Number, default: 5, min: 1, max: 40 },
      cols: { type: Number, default: 8, min: 1, max: 40 },
    },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export type WarehouseDoc = InferSchemaType<typeof warehouseSchema> & { _id: Types.ObjectId };
export const Warehouse = model("Warehouse", warehouseSchema);
