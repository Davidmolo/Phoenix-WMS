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
    inOutHandlingPerPallet: { type: Number, default: 14 },
    afterFreeDwellPerPalletDay: { type: Number, default: 10 },
    accountMinimumPallets: { type: Number, default: 15 },
    accountMinimumMonthlyFee: { type: Number, default: 300 },
    longTermStorageCapPct: { type: Number, default: 45 },
    sortRelabelPerHour: { type: Number, default: 65 },
    sortRelabelPerCase: { type: Number, default: 2 },
    afterHoursSurchargePct: { type: Number, default: 35 },
    noShowFee: { type: Number, default: 100 },
    detentionPerHour: { type: Number, default: 90 },
    detentionFreeHours: { type: Number, default: 2 },
    notes: { type: String, default: "" },
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
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export type CompanyDoc = InferSchemaType<typeof companySchema> & { _id: Types.ObjectId };
export const Company = model("Company", companySchema);
