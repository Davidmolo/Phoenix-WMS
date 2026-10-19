import { Schema, model, type InferSchemaType, Types } from "mongoose";

/**
 * billingMethod = primary account type (storage vs contract, etc.).
 * Cesar Oct 14: every customer may use Drop & Store / Crossdock / Rework —
 * billingMethod does not gate which jobs they can run. Per-pallet ops charges
 * come from the company fee schedule unless contract (or admin override > 0).
 */
const customerSchema = new Schema(
  {
    companyId: { type: Schema.Types.ObjectId, ref: "Company", required: true, index: true },
    name: { type: String, required: true, trim: true },
    contact: { type: String, default: "" },
    /** Billing email. QuickBooks invoices use this one address. */
    email: { type: String, default: "" },
    phone: { type: String, default: "" },
    /**
     * People who can be invited to the customer portal.
     * Each email is a separate login. QuickBooks is not updated from this list.
     */
    contacts: {
      type: [
        new Schema(
          {
            name: { type: String, default: "" },
            email: { type: String, default: "" },
            phone: { type: String, default: "" },
            /** Invoice and QuickBooks email. Only one contact should be primary. */
            primary: { type: Boolean, default: false },
          },
          { _id: false }
        ),
      ],
      default: [],
    },
    address: { type: String, default: "" },
    billingMethod: {
      type: String,
      enum: ["pallet", "sqft", "contract", "crossdock", "rework"],
      default: "pallet",
    },
    // Admin overrides — null/0 = use company fee schedule (Cesar)
    rateInside: { type: Number, default: null },
    rateOutside: { type: Number, default: null },
    unloadFee: { type: Number, default: null },
    loadFee: { type: Number, default: null },
    rateInsideSqft: { type: Number, default: null },
    rateOutsideSqft: { type: Number, default: null },
    /** Optional override for crossdock $/pallet; null = schedule. */
    crossdockPerPallet: { type: Number, default: null },
    /**
     * Service mix — independent of billingMethod.
     * Drop & Store, Crossdock, and Rework can all be on for one customer.
     */
    serviceDropStore: { type: Boolean, default: true },
    serviceCrossdock: { type: Boolean, default: true },
    serviceRework: { type: Boolean, default: true },
    /** Rework $/hr override. Null = company fee schedule (default $65). */
    reworkHourlyRate: { type: Number, default: null },
    /** Rework minimum hours override. Null = schedule (default 1). */
    reworkMinimumHours: { type: Number, default: null },
    // Contract (SBA) — monthly on the 1st, Net 30
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
    /** QuickBooks Customer.Id when linked/imported from QBO */
    quickbooksCustomerId: { type: String, default: null, index: true },
    /**
     * Where this customer record originated.
     * Survives unlink/clear of quickbooksCustomerId so UI Source stays accurate.
     */
    source: {
      type: String,
      enum: ["wms", "quickbooks"],
      default: "wms",
      index: true,
    },
    /**
     * Cesar audit: test / throwaway accounts — WMS invoices still create,
     * but QuickBooks push is skipped so production QBO stays clean.
     */
    testAccount: { type: Boolean, default: false, index: true },
  },
  { timestamps: true }
);

customerSchema.index({ companyId: 1, name: 1 });

export type CustomerDoc = InferSchemaType<typeof customerSchema> & { _id: Types.ObjectId };
export const Customer = model("Customer", customerSchema);
