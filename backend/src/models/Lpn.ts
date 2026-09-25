import { Schema, model, type InferSchemaType, Types } from "mongoose";

/**
 * LPN (License Plate Number)
 * - unit: one pallet (auto-created on receive)
 * - group: Cesar flow — many pallets staged under one scannable plate for outbound load
 */
const lpnSchema = new Schema(
  {
    companyId: { type: Schema.Types.ObjectId, ref: "Company", required: true, index: true },
    warehouseId: { type: Schema.Types.ObjectId, ref: "Warehouse", required: true },
    customerId: { type: Schema.Types.ObjectId, ref: "Customer", required: true },
    /** @deprecated prefer palletIds — kept for older unit LPNs */
    palletId: { type: Schema.Types.ObjectId, ref: "Pallet", default: null },
    palletIds: [{ type: Schema.Types.ObjectId, ref: "Pallet" }],
    code: { type: String, required: true },
    kind: { type: String, enum: ["unit", "group"], default: "unit" },
    sku: { type: String, default: "" },
    description: { type: String, default: "" },
    qty: { type: Number, default: 1 },
    uom: { type: String, default: "ea" },
    status: {
      type: String,
      enum: ["active", "staged", "shipped", "void"],
      default: "active",
    },
  },
  { timestamps: true }
);

lpnSchema.index({ companyId: 1, code: 1 }, { unique: true });

export type LpnDoc = InferSchemaType<typeof lpnSchema> & { _id: Types.ObjectId };
export const Lpn = model("Lpn", lpnSchema);
