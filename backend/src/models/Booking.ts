import { Schema, model, type InferSchemaType, Types } from "mongoose";
import {
  BOOKING_SERVICE_TYPES,
  BOOKING_SOURCES,
  BOOKING_STATUSES,
} from "../constants/booking";

const serviceIds = BOOKING_SERVICE_TYPES.map((s) => s.id);

const bookingSchema = new Schema(
  {
    companyId: { type: Schema.Types.ObjectId, ref: "Company", required: true, index: true },
    warehouseId: { type: Schema.Types.ObjectId, ref: "Warehouse", default: null, index: true },
    customerId: { type: Schema.Types.ObjectId, ref: "Customer", default: null, index: true },
    requestId: { type: Schema.Types.ObjectId, ref: "Request", default: null },

    serviceType: { type: String, enum: serviceIds, required: true, index: true },
    /** Slot start (local wall-clock stored as UTC Date for the Phoenix day). */
    startsAt: { type: Date, required: true, index: true },
    endsAt: { type: Date, required: true, index: true },
    durationMinutes: { type: Number, required: true, default: 45 },

    status: {
      type: String,
      enum: BOOKING_STATUSES,
      default: "confirmed",
      index: true,
    },
    source: {
      type: String,
      enum: BOOKING_SOURCES,
      required: true,
      index: true,
    },

    companyName: { type: String, default: "", trim: true },
    contactName: { type: String, default: "", trim: true },
    phone: { type: String, default: "", trim: true },
    email: { type: String, default: "", trim: true },
    notes: { type: String, default: "" },
    /** Optional freight hints from website form */
    freight: {
      trailerNumber: { type: String, default: "" },
      palletCount: { type: Number, default: null },
      weightLbs: { type: Number, default: null },
      details: { type: String, default: "" },
    },
  },
  { timestamps: true }
);

bookingSchema.index({ companyId: 1, startsAt: 1, status: 1 });
bookingSchema.index({ companyId: 1, serviceType: 1, startsAt: 1 });

export type BookingDoc = InferSchemaType<typeof bookingSchema> & { _id: Types.ObjectId };
export const Booking = model("Booking", bookingSchema);
