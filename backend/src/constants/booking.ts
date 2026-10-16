/**
 * Dock booking — Cesar / Darya requirements:
 * - Hours: 8 AM–6 PM (America/Phoenix)
 * - Arrival flexibility: ±15 minutes (disclaimer only)
 * - Two physical doors
 * - Crossdock: 45 min, uses BOTH doors
 * - Drop & Store (stock): 45 min, uses ONE door
 * - Trailer Rework: 1 hour (60 min), uses ONE door
 * Slot start grid matches each service’s visit length (45 or 60), so Trailer
 * shows as true 1-hour blocks (8–9, 9–10, …).
 */

export const BOOKING_SERVICE_TYPES = [
  {
    id: "crossdock",
    label: "Crossdock",
    durationMinutes: 45,
    /** Doors this job occupies at once (inbound + outbound trucks). */
    dockUnits: 2,
  },
  {
    id: "trailer_rework",
    label: "Trailer Rework",
    durationMinutes: 60,
    dockUnits: 1,
  },
  {
    id: "drop_and_store",
    label: "Drop and Store",
    durationMinutes: 45,
    dockUnits: 1,
  },
  {
    id: "pickup",
    label: "Pick-up",
    durationMinutes: 45,
    dockUnits: 1,
  },
] as const;

export type BookingServiceTypeId = (typeof BOOKING_SERVICE_TYPES)[number]["id"];

export const BOOKING_DEFAULTS = {
  workdayStartHour: 8,
  workdayEndHour: 18,
  /**
   * Fallback start-grid step when service is "all".
   * Per-service grids use that service’s durationMinutes (45 or 60).
   */
  slotIntervalMinutes: 45,
  defaultDurationMinutes: 45,
  bufferMinutes: 15,
  timezone: "America/Phoenix",
  /** Physical doors on the dock */
  totalDocks: 2,
} as const;

/**
 * Marketing “fake demand” painted empty starts as Reserved.
 * Oct 16 audit (#18): the dock board showed those chips with no appointment,
 * a 0 “on this date” count, and a dead click. Real bookings only.
 */
export const FAKE_DEMAND = {
  enabled: false,
  untilDateKey: "2026-11-30",
  busyFraction: 0.4,
} as const;

export const BOOKING_SOURCES = ["web", "phone", "admin", "portal"] as const;
export type BookingSource = (typeof BOOKING_SOURCES)[number];

export const BOOKING_STATUSES = ["confirmed", "cancelled", "completed", "no_show"] as const;
export type BookingStatus = (typeof BOOKING_STATUSES)[number];

export function getServiceType(id: string) {
  return BOOKING_SERVICE_TYPES.find((s) => s.id === id) ?? null;
}
