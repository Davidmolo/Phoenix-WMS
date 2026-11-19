import { Schema, model, type InferSchemaType, Types } from "mongoose";

const quoteLineSchema = new Schema(
  {
    rateKey: { type: String, required: true },
    billingType: {
      type: String,
      enum: ["contract", "crossdock", "rework", "other"],
      required: true,
    },
    invoiceType: {
      type: String,
      enum: ["base_rent", "handling", "ftl", "storage", "crossdock", "dwell", "accessorial", "other"],
      default: "other",
    },
    description: { type: String, required: true },
    qty: { type: Number, required: true },
    unitAmount: { type: Number, required: true },
    amount: { type: Number, required: true },
  },
  { _id: false }
);

const quoteSchema = new Schema(
  {
    companyId: { type: Schema.Types.ObjectId, ref: "Company", required: true, index: true },
    number: { type: String, required: true },
    status: {
      type: String,
      enum: ["draft", "sent", "accepted", "declined"],
      default: "draft",
      index: true,
    },
    /** Set when the quote is for someone already in Customers. Empty for a prospect. */
    customerId: { type: Schema.Types.ObjectId, ref: "Customer", default: null },
    prospectName: { type: String, default: "" },
    prospectEmail: { type: String, default: "" },
    notes: { type: String, default: "" },
    /** Copied onto the customer only if this quote is accepted as a contract account. */
    contractSqft: { type: Number, default: 0 },
    validUntil: { type: Date, default: null },
    lines: { type: [quoteLineSchema], default: [] },
    total: { type: Number, default: 0 },
    invoiceId: { type: Schema.Types.ObjectId, ref: "Invoice", default: null },
  },
  { timestamps: true }
);

quoteSchema.index({ companyId: 1, number: 1 }, { unique: true });

export type QuoteDoc = InferSchemaType<typeof quoteSchema> & { _id: Types.ObjectId };
export const Quote = model("Quote", quoteSchema);
