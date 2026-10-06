/**
 * Dock booking — Cesar / Darya (Oct 2, 2026):
 * 45-min slots, 8 AM–6 PM, same duration for every service,
 * ±15 min arrival buffer (disclaimer), two physical doors.
 * Cross-dock occupies both doors; trailer rework and drop & store occupy one.
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
    durationMinutes: 45,
    dockUnits: 1,
  },
  {
    id: "drop_and_store",
    label: "Drop and Store",
    durationMinutes: 45,
    dockUnits: 1,
  },
] as const;

export type BookingServiceTypeId = (typeof BOOKING_SERVICE_TYPES)[number]["id"];

export const BOOKING_DEFAULTS = {
  workdayStartHour: 8,
  workdayEndHour: 18,
  slotIntervalMinutes: 45,
  defaultDurationMinutes: 45,
  bufferMinutes: 15,
  timezone: "America/Phoenix",
  /** Physical doors on the dock */
  totalDocks: 2,
} as const;

/**
 * Marketing “fake demand” for the first ~2 months:
 * show ~30–50% of starts as busy (distributed pockets, not whole mornings).
 * Disable by setting enabled: false once real volume is high enough.
 */
export const FAKE_DEMAND = {
  enabled: true,
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
