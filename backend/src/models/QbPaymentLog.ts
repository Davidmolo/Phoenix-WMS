import { Schema, model, type InferSchemaType, Types } from "mongoose";

const qbPaymentLogSchema = new Schema(
  {
    companyId: { type: Schema.Types.ObjectId, ref: "Company", required: true, index: true },
    invoiceId: { type: Schema.Types.ObjectId, ref: "Invoice", required: true, index: true },
    quickbooksId: { type: String, default: "" },
    balanceBefore: { type: Number, default: null },
    balanceAfter: { type: Number, default: null },
    statusBefore: { type: String, default: "" },
    statusAfter: { type: String, default: "" },
    source: { type: String, enum: ["sync", "webhook"], default: "sync" },
  },
  { timestamps: true }
);

export type QbPaymentLogDoc = InferSchemaType<typeof qbPaymentLogSchema> & { _id: Types.ObjectId };
export const QbPaymentLog = model("QbPaymentLog", qbPaymentLogSchema);