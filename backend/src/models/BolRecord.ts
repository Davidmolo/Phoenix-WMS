import { Schema, model, type InferSchemaType, Types } from "mongoose";

/**
 * Append-only signed BOL snapshot (Cesar: signed BOLs are immutable;
 * corrections are amendments, never edits).
 */
const signatureSchema = new Schema(
  {
    role: { type: String, enum: ["driver", "warehouse"], required: true },
    name: { type: String, required: true, trim: true },
    /** PNG/JPEG data URL or relative file path under uploads/ */
    imageDataUrl: { type: String, default: "" },
    signedAt: { type: Date, required: true },
  },
  { _id: false }
);

const bolRecordSchema = new Schema(
  {
    companyId: { type: Schema.Types.ObjectId, ref: "Company", required: true, index: true },
    shipmentId: { type: Schema.Types.ObjectId, ref: "Shipment", required: true, index: true },
    bolNumber: { type: String, required: true, index: true },
    kind: { type: String, enum: ["original", "amendment"], required: true },
    sequence: { type: Number, required: true, default: 1 },
    supersedesId: { type: Schema.Types.ObjectId, ref: "BolRecord", default: null },
    /** Frozen BolDocument JSON at close/amend time */
    documentJson: { type: Schema.Types.Mixed, required: true },
    /** Stored HTML document path (printable / save-as-PDF) */
    documentPath: { type: String, default: "" },
    signatures: { type: [signatureSchema], default: [] },
    exceptionPhotoPaths: { type: [String], default: [] },
    contentHash: { type: String, default: "" },
    amendmentReason: { type: String, default: "" },
    invoiceId: { type: Schema.Types.ObjectId, ref: "Invoice", default: null },
    createdByUserId: { type: Schema.Types.ObjectId, ref: "User", default: null },
    createdByEmail: { type: String, default: "" },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

bolRecordSchema.index({ shipmentId: 1, sequence: 1 }, { unique: true });

export type BolRecordDoc = InferSchemaType<typeof bolRecordSchema> & { _id: Types.ObjectId };
export const BolRecord = model("BolRecord", bolRecordSchema);
