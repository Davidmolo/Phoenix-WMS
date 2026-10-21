import { Schema, model, type InferSchemaType, Types } from "mongoose";

/** Company-level published rate card (Phoenix Cross Dock ad hoc). */
const feeScheduleSchema = new Schema(
  {
    crossDockPerPallet: { type: Number, default: 25 },
    crossDockFreeDwellHours: { type: Number, default: 48 },
    crossDockPerTrailer: { type: Number, default: 425 },
    crossDockMinimum: { type: Number, default: 150 },
    unloadLoadMinimum: { type: Number, default: 125 },
    unloadLoadPerPallet: { type: Number, default: 14 },
    unloadLoadPerTrailer: { type: Number, default: 200 },
    handStackPerHour: { type: Number, default: 65 },
    floorStoragePerPalletMo: { type: Number, default: 20 },
    rackStoragePerPalletMo: { type: Number, default: 26 },
    parcelStoragePerBoxDay: { type: Number, default: 0.05 },
    parcelReceivePerBox: { type: Number, default: 0.75 },
    parcelOutboundPerBox: { type: Number, default: 0.5 },
    parcelOversizePerPalletDay: { type: Number, default: 1.65 },
    inOutHandlingPerPallet: { type: Number, default: 14 },
    afterFreeDwellPerPalletDay: { type: Number, default: 10 },
    accountMinimumPallets: { type: Number, default: 15 },
    accountMinimumMonthlyFee: { type: Number, default: 300 },
    longTermStorageCapPct: { type: Number, default: 45 },
    sortRelabelPerHour: { type: Number, default: 65 },
    /** Trailer rework: bill at least this many hours (Cesar: 1 hr min @ $65/hr). */
    trailerReworkMinimumHours: { type: Number, default: 1 },
    sortRelabelPerCase: { type: Number, default: 2 },
    afterHoursSurchargePct: { type: Number, default: 35 },
    noShowFee: { type: Number, default: 100 },
    detentionPerHour: { type: Number, default: 90 },
    detentionFreeHours: { type: Number, default: 2 },
    notes: { type: String, default: "" },
  },
  { _id: false }
);

/**
 * Map WMS fee/line types → QuickBooks Item Id (preferred) or Item Name.
 * Cesar: handling, storage, overage, re-wrap, crossdock, detention, etc.
 */
const quickbooksItemMapSchema = new Schema(
  {
    handling: { type: String, default: "" },
    storage: { type: String, default: "" },
    overage: { type: String, default: "" },
    rewrap: { type: String, default: "" },
    crossdock: { type: String, default: "" },
    detention: { type: String, default: "" },
    ftl: { type: String, default: "" },
    dwell: { type: String, default: "" },
    accessorial: { type: String, default: "" },
    other: { type: String, default: "" },
    /** Fallback QBO Item Id/Name when a type is unmapped (default Services). */
    defaultItem: { type: String, default: "Services" },
  },
  { _id: false }
);

const companySchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    legalName: { type: String, trim: true },
    city: { type: String, default: "Phoenix, AZ" },
    address: { type: String, default: "" },
    feeSchedule: { type: feeScheduleSchema, default: null },
    quickbooksItemMap: { type: quickbooksItemMapSchema, default: () => ({}) },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export type CompanyDoc = InferSchemaType<typeof companySchema> & { _id: Types.ObjectId };
export const Company = model("Company", companySchema);
