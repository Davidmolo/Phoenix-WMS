import { Schema, model, type InferSchemaType, Types } from "mongoose";

const invoiceLineSchema = new Schema(
  {
    description: { type: String, required: true },
    qty: { type: Number, default: 1 },
    unitAmount: { type: Number, required: true },
    amount: { type: Number, required: true },
    type: {
      type: String,
      enum: [
        "base_rent",
        "handling",
        "ftl",
        "storage",
        "crossdock",
        "dwell",
        "accessorial",
        "other",
      ],
      default: "other",
    },
    palletId: { type: Schema.Types.ObjectId, ref: "Pallet", default: null },
    shipmentId: { type: Schema.Types.ObjectId, ref: "Shipment", default: null },
  },
  { _id: false }
);

const invoiceSchema = new Schema(
  {
    companyId: { type: Schema.Types.ObjectId, ref: "Company", required: true, index: true },
    customerId: { type: Schema.Types.ObjectId, ref: "Customer", required: true, index: true },
    number: { type: String, required: true },
    periodStart: { type: Date, required: true },
    periodEnd: { type: Date, required: true },
    status: {
      type: String,
      enum: ["draft", "sent", "paid", "void", "past_due"],
      default: "draft",
    },
    lines: { type: [invoiceLineSchema], default: [] },
    subtotal: { type: Number, default: 0 },
    /** Full invoice amount (QuickBooks TotalAmt). */
    total: { type: Number, default: 0 },
    /**
     * Amount still owed (QuickBooks Balance).
     * Often lower than total after partial payments — not the same as invoice total.
     */
    balanceDue: { type: Number, default: null },
    dueDate: { type: Date, default: null },
    notes: { type: String, default: "" },
    quickbooksId: { type: String, default: null, index: true },
  },
  { timestamps: true }
);

invoiceSchema.index({ companyId: 1, number: 1 }, { unique: true });
invoiceSchema.index(
  { companyId: 1, quickbooksId: 1 },
  { unique: true, partialFilterExpression: { quickbooksId: { $type: "string" } } }
);

export type InvoiceDoc = InferSchemaType<typeof invoiceSchema> & { _id: Types.ObjectId };
export const Invoice = model("Invoice", invoiceSchema);
