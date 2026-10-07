import {
  BOOKING_DEFAULTS,
  BOOKING_SERVICE_TYPES,
  FAKE_DEMAND,
  getServiceType,
  type BookingServiceTypeId,
} from "../constants/booking";
import { Booking } from "../models/Booking";

export type SlotState = "available" | "booked" | "held" | "blocked" | "past";

export type SlotBookingInfo = {
  id: string;
  companyName: string;
  contactName: string;
  source: string;
  serviceType: string;
  serviceLabel: string;
  /** True when this booking belongs to the viewing customer (portal privacy). */
  isMine?: boolean;
};

export type DaySlot = {
  startIso: string;
  endIso: string;
  label: string;
  status: SlotState;
  bookedCount: number;
  capacity: number;
  bookingIds: string[];
  /** Present when this slot is the start of one or more bookings */
  bookings: SlotBookingInfo[];
};

export type CalendarDaySummary = {
  date: string;
  availableCount: number;
  bookedCount: number;
  /** Exact booking starts that day (any service) — for month dots */
  bookingStarts: number;
  /** For month dots: available | mixed | booked | empty */
  dot: "available" | "mixed" | "booked" | "none";
};

/** Build a Date in America/Phoenix wall time without external tz libs. */
export function phoenixLocalDate(
  year: number,
  monthIndex: number,
  day: number,
  hour = 0,
  minute = 0
): Date {
  // Phoenix is UTC-7 year-round (no DST)
  const utcMs = Date.UTC(year, monthIndex, day, hour + 7, minute, 0, 0);
  return new Date(utcMs);
}

export function parseDateKey(dateKey: string): { y: number; m: number; d: number } {
  const [y, m, d] = dateKey.split("-").map(Number);
  if (!y || !m || !d) throw new Error("Invalid date (use YYYY-MM-DD)");
  return { y, m: m - 1, d };
}

export function toDateKey(d: Date): string {
  // Format as Phoenix local YYYY-MM-DD
  const shifted = new Date(d.getTime() - 7 * 60 * 60 * 1000);
  const y = shifted.getUTCFullYear();
  const m = String(shifted.getUTCMonth() + 1).padStart(2, "0");
  const day = String(shifted.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function todayPhoenixKey(): string {
  return toDateKey(new Date());
}

function formatLabel(hour: number, minute: number): string {
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  const ampm = hour < 12 ? "AM" : "PM";
  return `${h12}:${String(minute).padStart(2, "0")} ${ampm}`;
}

function rangesOverlap(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart < bEnd && bStart < aEnd;
}

function sameInstant(a: Date, b: Date): boolean {
  return Math.abs(a.getTime() - b.getTime()) < 1000;
}

function serviceLabel(id: string): string {
  return getServiceType(id)?.label ?? id;
}

export function durationForService(serviceType: string): number {
  if (serviceType === "all") return BOOKING_DEFAULTS.defaultDurationMinutes;
  return getServiceType(serviceType)?.durationMinutes ?? BOOKING_DEFAULTS.defaultDurationMinutes;
}

export function dockUnitsForService(serviceType: string): number {
  if (serviceType === "all") return 1;
  return getServiceType(serviceType)?.dockUnits ?? 1;
}

export function capacityForService(_serviceType?: string): number {
  return BOOKING_DEFAULTS.totalDocks;
}

/**
 * Consecutive starts from open until a visit still finishes by close.
 * Step = visit length so Crossdock/Drop show 45-min blocks and Trailer shows
 * true 1-hour blocks (Cesar / Darya).
 */
export function generateSlotStarts(dateKey: string, durationMinutes: number): Date[] {
  const { y, m, d } = parseDateKey(dateKey);
  const { workdayStartHour, workdayEndHour } = BOOKING_DEFAULTS;
  const stepMinutes = Math.max(15, durationMinutes);
  const dayEnd = phoenixLocalDate(y, m, d, workdayEndHour, 0);
  const starts: Date[] = [];
  let cursor = phoenixLocalDate(y, m, d, workdayStartHour, 0);

  while (true) {
    const end = new Date(cursor.getTime() + durationMinutes * 60_000);
    if (end > dayEnd) break;
    starts.push(cursor);
    cursor = new Date(cursor.getTime() + stepMinutes * 60_000);
  }
  return starts;
}

/**
 * Stable hash → 0..1 for deterministic fake demand (same day always looks the same).
 */
function unitHash(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967296;
}

/**
 * Pocket pattern: busy / open / busy / busy / open / open (≈50%),
 * rotated by date so mornings aren’t wiped out and days look natural.
 * Then thinned to ~busyFraction so we stay in the 30–50% band.
 */
export function isFakeDemandBusy(
  dateKey: string,
  start: Date,
  intervalMinutes = BOOKING_DEFAULTS.slotIntervalMinutes
): boolean {
  if (!FAKE_DEMAND.enabled) return false;
  if (dateKey > FAKE_DEMAND.untilDateKey) return false;

  const step = Math.max(15, intervalMinutes);
  const shifted = new Date(start.getTime() - 7 * 60 * 60 * 1000);
  const minuteOfDay = shifted.getUTCHours() * 60 + shifted.getUTCMinutes();
  const slotIndex = Math.floor(
    (minuteOfDay - BOOKING_DEFAULTS.workdayStartHour * 60) / step
  );
  if (slotIndex < 0) return false;

  const rotate = Math.floor(unitHash(`${dateKey}:rot`) * 6);
  // David: pockets open throughout the day (not 8–12 all busy)
  const pattern = [1, 0, 1, 1, 0, 0];
  const inPocket = pattern[(slotIndex + rotate) % pattern.length] === 1;
  if (!inPocket) return false;

  // Keep overall closer to configured fraction
  const keep = unitHash(`${dateKey}:${minuteOfDay}`) < FAKE_DEMAND.busyFraction / 0.5;
  return keep;
}

type LeanBooking = {
  _id: { toString(): string };
  startsAt: Date;
  endsAt: Date;
  serviceType: string;
  status: string;
  companyName?: string;
  contactName?: string;
  source?: string;
  customerId?: { toString(): string } | string | null;
};

function toSlotBooking(
  b: LeanBooking,
  opts?: { privacy?: boolean; viewerCustomerId?: string | null }
): SlotBookingInfo {
  const viewerId = opts?.viewerCustomerId ? String(opts.viewerCustomerId) : "";
  const ownerId = b.customerId ? String(b.customerId) : "";
  const isMine = Boolean(viewerId && ownerId && viewerId === ownerId);
  const showIdentity = !opts?.privacy || isMine;

  return {
    id: showIdentity ? b._id.toString() : "",
    companyName: showIdentity ? b.companyName || (isMine ? "Your booking" : "Booking") : "",
    contactName: showIdentity ? b.contactName || "" : "",
    source: showIdentity ? b.source || "" : "",
    serviceType: b.serviceType,
    serviceLabel: serviceLabel(b.serviceType),
    isMine,
  };
}

export async function loadDayBookings(
  companyId: string,
  dateKey: string,
  warehouseId?: string | null,
  _source?: string | null
): Promise<LeanBooking[]> {
  const { y, m, d } = parseDateKey(dateKey);
  const dayStart = phoenixLocalDate(y, m, d, 0, 0);
  const dayEnd = phoenixLocalDate(y, m, d, 23, 59);

  const filter: Record<string, unknown> = {
    companyId,
    status: { $in: ["confirmed", "completed"] },
    startsAt: { $lt: dayEnd },
    endsAt: { $gt: dayStart },
  };
  if (warehouseId) filter.warehouseId = warehouseId;

  return Booking.find(filter)
    .select("startsAt endsAt serviceType status companyName contactName source customerId")
    .lean();
}

/**
 * Build the day grid for a service filter.
 * - booked: a matching booking starts here (or fake demand) → show as Reserved
 * - held/blocked: overlapping when dock capacity is full
 * - past / available
 *
 * Two doors: cross-dock uses both; other services use one.
 */
export function buildDaySlots(
  dateKey: string,
  serviceType: string,
  bookings: LeanBooking[],
  now = new Date(),
  sourceFilter?: string | null,
  privacy?: { enabled: boolean; viewerCustomerId?: string | null }
): DaySlot[] {
  const showAllServices = serviceType === "all";
  const duration = durationForService(serviceType);
  const capacity = BOOKING_DEFAULTS.totalDocks;
  const needed = dockUnitsForService(serviceType);
  const starts = generateSlotStarts(dateKey, duration);
  const privacyOpts = privacy?.enabled
    ? { privacy: true, viewerCustomerId: privacy.viewerCustomerId }
    : undefined;

  const byService = showAllServices
    ? bookings
    : bookings.filter((b) => b.serviceType === serviceType);

  const forBookedChips =
    sourceFilter && sourceFilter !== "all"
      ? byService.filter((b) => b.source === sourceFilter)
      : byService;

  return starts.map((start) => {
    const end = new Date(start.getTime() + duration * 60_000);

    const startingHere = forBookedChips.filter((b) => sameInstant(b.startsAt, start));

    const insideVisitHold = forBookedChips.filter(
      (b) => start.getTime() > b.startsAt.getTime() && start.getTime() < b.endsAt.getTime()
    );

    const overlappingService = byService.filter((b) =>
      rangesOverlap(start, end, b.startsAt, b.endsAt)
    );
    const overlappingAny = bookings.filter((b) =>
      rangesOverlap(start, end, b.startsAt, b.endsAt)
    );

    const occupiedByOtherSource =
      Boolean(sourceFilter && sourceFilter !== "all") &&
      byService.some(
        (b) =>
          b.source !== sourceFilter &&
          (sameInstant(b.startsAt, start) ||
            (start.getTime() > b.startsAt.getTime() && start.getTime() < b.endsAt.getTime()) ||
            rangesOverlap(start, end, b.startsAt, b.endsAt))
      );

    const doorsInUse = overlappingAny.reduce(
      (sum, b) => sum + dockUnitsForService(b.serviceType),
      0
    );
    const remaining = Math.max(0, capacity - doorsInUse);
    const fakeBusy = startingHere.length === 0 && isFakeDemandBusy(dateKey, start, duration);

    const slotBookings = startingHere.map((b) => toSlotBooking(b, privacyOpts));
    if (fakeBusy && privacy?.enabled) {
      slotBookings.push({
        id: "",
        companyName: "",
        contactName: "",
        source: "web",
        serviceType: showAllServices ? "crossdock" : serviceType,
        serviceLabel: serviceLabel(showAllServices ? "crossdock" : serviceType),
        isMine: false,
      });
    } else if (fakeBusy && !privacy?.enabled) {
      slotBookings.push({
        id: "",
        companyName: "Reserved",
        contactName: "",
        source: "admin",
        serviceType: showAllServices ? "crossdock" : serviceType,
        serviceLabel: serviceLabel(showAllServices ? "crossdock" : serviceType),
      });
    }

    let status: SlotState = "available";

    if (startingHere.length > 0 || fakeBusy) {
      status = "booked";
    } else if (occupiedByOtherSource || remaining < needed) {
      status = insideVisitHold.length > 0 ? "held" : "blocked";
    } else if (end <= now) {
      status = "past";
    }

    const shifted = new Date(start.getTime() - 7 * 60 * 60 * 1000);
    const hour = shifted.getUTCHours();
    const minute = shifted.getUTCMinutes();

    const idSource = startingHere.length ? startingHere : insideVisitHold;
    const bookingIds = privacy?.enabled
      ? idSource
          .filter((b) => {
            const ownerId = b.customerId ? String(b.customerId) : "";
            const viewerId = privacy.viewerCustomerId ? String(privacy.viewerCustomerId) : "";
            return Boolean(viewerId && ownerId && viewerId === ownerId);
          })
          .map((b) => b._id.toString())
      : idSource.map((b) => b._id.toString());

    return {
      startIso: start.toISOString(),
      endIso: end.toISOString(),
      label: formatLabel(hour, minute),
      status,
      bookedCount: startingHere.length || (fakeBusy ? 1 : insideVisitHold.length),
      capacity,
      bookingIds,
      bookings: slotBookings,
    };
  });
}

export async function monthCalendar(
  companyId: string,
  year: number,
  month1: number,
  serviceType: string,
  warehouseId?: string | null,
  sourceFilter?: string | null
): Promise<CalendarDaySummary[]> {
  const daysInMonth = new Date(Date.UTC(year, month1, 0)).getUTCDate();
  const monthStart = phoenixLocalDate(year, month1 - 1, 1, 0, 0);
  const monthEnd = phoenixLocalDate(year, month1 - 1, daysInMonth, 23, 59);

  const filter: Record<string, unknown> = {
    companyId,
    status: { $in: ["confirmed", "completed"] },
    startsAt: { $lt: monthEnd },
    endsAt: { $gt: monthStart },
  };
  if (warehouseId) filter.warehouseId = warehouseId;

  const bookings = await Booking.find(filter)
    .select("startsAt endsAt serviceType status companyName contactName source")
    .lean();
  const now = new Date();
  const out: CalendarDaySummary[] = [];

  for (let day = 1; day <= daysInMonth; day++) {
    const dateKey = `${year}-${String(month1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const dayBookings = bookings.filter((b) => toDateKey(b.startsAt) === dateKey);
    const slots = buildDaySlots(dateKey, serviceType, dayBookings, now, sourceFilter);
    const availableCount = slots.filter((s) => s.status === "available").length;
    const bookedSlotCount = slots.filter((s) => s.status === "booked").length;
    let matching = dayBookings;
    if (serviceType !== "all") matching = matching.filter((b) => b.serviceType === serviceType);
    if (sourceFilter && sourceFilter !== "all") {
      matching = matching.filter((b) => b.source === sourceFilter);
    }
    const fakeStarts = slots.filter((s) => s.status === "booked" && s.bookingIds.length === 0).length;
    const bookingStarts = matching.length + fakeStarts;
    let dot: CalendarDaySummary["dot"] = "none";
    if (availableCount > 0 && (bookingStarts > 0 || bookedSlotCount > 0)) dot = "mixed";
    else if (availableCount > 0) dot = "available";
    else if (bookingStarts > 0 || bookedSlotCount > 0) dot = "booked";
    out.push({
      date: dateKey,
      availableCount,
      bookedCount: Math.max(bookingStarts, bookedSlotCount),
      bookingStarts,
      dot,
    });
  }

  return out;
}

export function assertSlotOpen(
  slots: DaySlot[],
  startIso: string
): { ok: true; slot: DaySlot } | { ok: false; error: string } {
  const slot = slots.find((s) => s.startIso === startIso);
  if (!slot) return { ok: false, error: "That time is outside working hours" };
  if (slot.status === "past") return { ok: false, error: "That time has already passed" };
  if (slot.status === "booked") return { ok: false, error: "That slot is already booked" };
  if (slot.status === "held") {
    return { ok: false, error: "That time is reserved by another appointment" };
  }
  if (slot.status === "blocked") {
    return { ok: false, error: "That start would overlap another appointment" };
  }
  return { ok: true, slot };
}

export function bookingConfigPayload() {
  return {
    defaults: BOOKING_DEFAULTS,
    serviceTypes: BOOKING_SERVICE_TYPES.map((s) => ({ ...s })),
    fakeDemand: {
      enabled: FAKE_DEMAND.enabled,
      untilDateKey: FAKE_DEMAND.untilDateKey,
      busyFraction: FAKE_DEMAND.busyFraction,
    },
  };
}

export type { BookingServiceTypeId };
