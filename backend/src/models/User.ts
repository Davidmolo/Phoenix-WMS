import { Schema, model, type InferSchemaType, Types } from "mongoose";

const userSchema = new Schema(
  {
    companyId: { type: Schema.Types.ObjectId, ref: "Company", required: true, index: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    name: { type: String, required: true, trim: true },
    role: {
      type: String,
      enum: ["admin", "staff", "customer"],
      required: true,
      default: "staff",
    },
    customerId: { type: Schema.Types.ObjectId, ref: "Customer", default: null },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

userSchema.index({ companyId: 1, email: 1 }, { unique: true });

export type UserDoc = InferSchemaType<typeof userSchema> & { _id: Types.ObjectId };
export const User = model("User", userSchema);
