import { Schema, model, type InferSchemaType, Types } from "mongoose";

/**
 * One QuickBooks Online connection per Phoenix company.
 * Tokens stay in Mongo — never in the frontend or git.
 */
const quickBooksConnectionSchema = new Schema(
  {
    companyId: {
      type: Schema.Types.ObjectId,
      ref: "Company",
      required: true,
      unique: true,
      index: true,
    },
    realmId: { type: String, required: true },
    accessToken: { type: String, required: true },
    refreshToken: { type: String, required: true },
    accessTokenExpiresAt: { type: Date, required: true },
    refreshTokenExpiresAt: { type: Date, default: null },
    connectedByEmail: { type: String, default: "" },
    lastSyncAt: { type: Date, default: null },
    lastSyncSummary: { type: String, default: "" },
    environment: { type: String, enum: ["sandbox", "production"], default: "sandbox" },
  },
  { timestamps: true }
);

export type QuickBooksConnectionDoc = InferSchemaType<typeof quickBooksConnectionSchema> & {
  _id: Types.ObjectId;
};
export const QuickBooksConnection = model("QuickBooksConnection", quickBooksConnectionSchema);
