/**
 * Dock booking defaults — aligned with David (Oct 1, 2026):
 * 15-min start grid, ~50 min visit, 2 doors, temporary fake demand.
 */

export const BOOKING_SERVICE_TYPES = [
  {
    id: "crossdock",
    label: "Crossdock",
    durationMinutes: 50,
    capacity: 2,
  },
  {
    id: "trailer_rework",
    label: "Trailer Rework",
    durationMinutes: 50,
    capacity: 2,
  },
  {
    id: "drop_and_store",
    label: "Drop and Store",
    durationMinutes: 50,
    capacity: 2,
  },
] as const;

export type BookingServiceTypeId = (typeof BOOKING_SERVICE_TYPES)[number]["id"];

export const BOOKING_DEFAULTS = {
  /** Local warehouse day window */
  workdayStartHour: 8,
  workdayEndHour: 20,
  /** Grid of start times offered on the calendar */
  slotIntervalMinutes: 15,
  /** Visit length (~45–60 min per David) */
  defaultDurationMinutes: 50,
  timezone: "America/Phoenix",
  /** Two dock doors — overlapping starts OK until both are busy */
  sharedDockCapacity: 2,
} as const;

/**
 * Marketing “fake demand” for the first ~2 months:
 * show ~30–50% of starts as busy (distributed pockets, not whole mornings).
 * Disable by setting enabled: false once real volume is high enough.
 */
export const FAKE_DEMAND = {
  enabled: true,
  /** Inclusive end date (Phoenix) — after this, no synthetic busy slots */
  untilDateKey: "2026-11-30",
  /** Target fraction of day starts marked busy (roughly 30–50%) */
  busyFraction: 0.4,
} as const;

export const BOOKING_SOURCES = ["web", "phone", "admin", "portal"] as const;
export type BookingSource = (typeof BOOKING_SOURCES)[number];

export const BOOKING_STATUSES = ["confirmed", "cancelled", "completed", "no_show"] as const;
export type BookingStatus = (typeof BOOKING_STATUSES)[number];

export function getServiceType(id: string) {
  return BOOKING_SERVICE_TYPES.find((s) => s.id === id) ?? null;
}
