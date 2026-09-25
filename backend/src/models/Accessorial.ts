import { Schema, model, type InferSchemaType, Types } from "mongoose";

/** One-off / handling charges that roll into invoices. */
const accessorialSchema = new Schema(
  {
    companyId: { type: Schema.Types.ObjectId, ref: "Company", required: true, index: true },
    customerId: { type: Schema.Types.ObjectId, ref: "Customer", required: true, index: true },
    palletId: { type: Schema.Types.ObjectId, ref: "Pallet", default: null },
    shipmentId: { type: Schema.Types.ObjectId, ref: "Shipment", default: null },
    type: {
      type: String,
      enum: ["handling", "ftl", "crossdock", "dwell", "storage", "accessorial", "other"],
      default: "handling",
    },
    description: { type: String, required: true },
    amount: { type: Number, required: true },
    date: { type: Date, default: Date.now },
    invoiceId: { type: Schema.Types.ObjectId, ref: "Invoice", default: null },
  },
  { timestamps: true }
);

export type AccessorialDoc = InferSchemaType<typeof accessorialSchema> & { _id: Types.ObjectId };
export const Accessorial = model("Accessorial", accessorialSchema);
