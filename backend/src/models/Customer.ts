import { Schema, model, type InferSchemaType, Types } from "mongoose";

/**
 * billingMethod:
 * - pallet: flat per-pallet monthly storage + unload/load fees
 * - sqft: storage by pallet footprint × $/sqft
 * - contract: fixed monthly reserved space (e.g. SBA $7,500 / 2,500 SF)
 * - crossdock: bills from company fee schedule (ad hoc)
 */
const customerSchema = new Schema(
  {
    companyId: { type: Schema.Types.ObjectId, ref: "Company", required: true, index: true },
    name: { type: String, required: true, trim: true },
    contact: { type: String, default: "" },
    email: { type: String, default: "" },
    phone: { type: String, default: "" },
    address: { type: String, default: "" },
    billingMethod: {
      type: String,
      enum: ["pallet", "sqft", "contract", "crossdock"],
      default: "pallet",
    },
    // Per-pallet blanket rates (storage accounts)
    rateInside: { type: Number, default: 15 },
    rateOutside: { type: Number, default: 9.5 },
    unloadFee: { type: Number, default: 12 },
    loadFee: { type: Number, default: 12 },
    rateInsideSqft: { type: Number, default: 0.6 },
    rateOutsideSqft: { type: Number, default: 0.4 },
    // Contract (SBA)
    contractSqft: { type: Number, default: 0 },
    contractFee: { type: Number, default: 0 },
    /** Flat handling covering inbound+outbound together (SBA: $20). */
    contractHandlingPerPallet: { type: Number, default: null },
    /** Optional FTL flat in lieu of per-pallet handling (SBA: $520). */
    contractFtlRate: { type: Number, default: null },
    /** No dwell inside dedicated contract space (SBA agreement). */
    contractNoDwellInside: { type: Boolean, default: false },
    transportEnabled: { type: Boolean, default: false },
    transportInboundFee: { type: Number, default: 0 },
    transportOutboundFee: { type: Number, default: 0 },
    since: { type: Date, default: Date.now },
    active: { type: Boolean, default: true },
    /**
     * True after the customer sets a portal password from their invite email.
     * Customer listing only shows activated accounts.
     */
    portalActivated: { type: Boolean, default: false, index: true },
  },
  { timestamps: true }
);

customerSchema.index({ companyId: 1, name: 1 });

export type CustomerDoc = InferSchemaType<typeof customerSchema> & { _id: Types.ObjectId };
export const Customer = model("Customer", customerSchema);
