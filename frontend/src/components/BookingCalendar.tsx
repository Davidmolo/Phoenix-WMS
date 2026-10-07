"use client";

import { useMemo } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/cn";

export type CalendarDayDot = {
  date: string;
  availableCount: number;
  bookedCount: number;
  dot: "available" | "mixed" | "booked" | "none";
};

export type DaySlot = {
  startIso: string;
  endIso: string;
  label: string;
  status: "available" | "booked" | "held" | "blocked" | "past";
  bookedCount: number;
  capacity: number;
  bookings?: Array<{
    id: string;
    companyName: string;
    contactName: string;
    source: string;
    serviceType: string;
    serviceLabel: string;
    isMine?: boolean;
  }>;
};

const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

function monthLabel(year: number, month: number) {
  return new Date(year, month - 1, 1).toLocaleString("en-US", {
    month: "long",
    year: "numeric",
  });
}

function daysInMonth(year: number, month: number) {
  return new Date(year, month, 0).getDate();
}

function firstWeekday(year: number, month: number) {
  return new Date(year, month - 1, 1).getDay();
}

export function BookingMonthCalendar({
  year,
  month,
  today,
  selectedDate,
  days,
  onSelectDate,
  onChangeMonth,
}: {
  year: number;
  month: number;
  today: string;
  selectedDate: string;
  days: CalendarDayDot[];
  onSelectDate: (date: string) => void;
  onChangeMonth: (year: number, month: number) => void;
}) {
  const byDate = useMemo(() => {
    const map = new Map<string, CalendarDayDot>();
    for (const d of days) map.set(d.date, d);
    return map;
  }, [days]);

  const cells = useMemo(() => {
    const total = daysInMonth(year, month);
    const start = firstWeekday(year, month);
    const out: Array<{ key: string; date?: string; dayNum?: number }> = [];
    for (let i = 0; i < start; i++) out.push({ key: `e-${i}` });
    for (let day = 1; day <= total; day++) {
      const date = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      out.push({ key: date, date, dayNum: day });
    }
    return out;
  }, [year, month]);

  function prev() {
    if (month === 1) onChangeMonth(year - 1, 12);
    else onChangeMonth(year, month - 1);
  }
  function next() {
    if (month === 12) onChangeMonth(year + 1, 1);
    else onChangeMonth(year, month + 1);
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-white shadow-[var(--shadow)]">
      <div className="flex items-center justify-between gap-2 border-b border-border bg-[linear-gradient(180deg,#fbfcfd_0%,#ffffff_100%)] px-3 py-2.5">
        <button
          type="button"
          className="rounded-lg p-1.5 text-navy transition hover:bg-surface-2"
          onClick={prev}
          aria-label="Previous month"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <div className="font-display text-[13px] font-semibold tracking-[0.06em] text-navy uppercase">
          {monthLabel(year, month)}
        </div>
        <button
          type="button"
          className="rounded-lg p-1.5 text-navy transition hover:bg-surface-2"
          onClick={next}
          aria-label="Next month"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      <div className="p-3">
        <div className="mb-1 grid grid-cols-7 gap-0.5 text-center text-[10px] font-bold tracking-[0.08em] text-faint uppercase">
          {WEEKDAYS.map((d) => (
            <div key={d} className="py-1">
              {d}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1">
          {cells.map((cell) => {
            if (!cell.date || cell.dayNum == null) {
              return <div key={cell.key} className="h-10" />;
            }
            const info = byDate.get(cell.date);
            const selected = selectedDate === cell.date;
            const isToday = today === cell.date;
            const hasDot = info && info.dot !== "none";

            return (
              <button
                key={cell.key}
                type="button"
                onClick={() => onSelectDate(cell.date!)}
                className={cn(
                  "relative flex h-10 flex-col items-center justify-center rounded-xl text-[13px] font-semibold transition duration-150",
                  selected &&
                    "bg-navy text-white shadow-[0_6px_16px_-8px_rgba(30,46,62,0.55)]",
                  !selected && isToday && "bg-accent-bg text-navy ring-1 ring-accent/35",
                  !selected && !isToday && "text-navy hover:bg-surface-2"
                )}
              >
                <span className="leading-none">{cell.dayNum}</span>
                {hasDot ? (
                  <span
                    className={cn(
                      "mt-1 block h-1 w-1 rounded-full",
                      selected && "bg-accent",
                      !selected && info?.dot === "available" && "bg-[var(--success)]",
                      !selected &&
                        (info?.dot === "mixed" || info?.dot === "booked") &&
                        "bg-accent-dark"
                    )}
                  />
                ) : (
                  <span className="mt-1 block h-1 w-1" />
                )}
              </button>
            );
          })}
        </div>

        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 border-t border-border/70 pt-2.5 text-[10px] font-medium text-muted">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--success)]" /> Open day
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-accent-dark" /> Bookings
          </span>
        </div>
      </div>
    </div>
  );
}

function slotStatusLabel(
  slot: DaySlot,
  opts: { isNext: boolean; selected: boolean; mode: "book" | "manage" }
) {
  if (slot.status === "available") {
    if (opts.selected || opts.isNext) return "Next open";
    return "Open";
  }
  if (slot.status === "booked") {
    const primary = slot.bookings?.[0];
    if (opts.mode === "manage" && primary?.companyName && primary.companyName !== "Reserved") {
      return primary.companyName;
    }
    if (primary?.isMine) return "Yours";
    return "Reserved";
  }
  if (slot.status === "held" || slot.status === "blocked") return "Reserved";
  if (slot.status === "past") return "—";
  return "Reserved";
}

/**
 * Service slot grid — visit length is per Cesar/Darya (45 min or 1 hour).
 */
export function BookingSlotGrid({
  slots,
  selectedStartIso,
  nextAvailableIso,
  onSelect,
  mode = "book",
  slotMinutes = 45,
}: {
  slots: DaySlot[];
  selectedStartIso: string | null;
  nextAvailableIso?: string | null;
  onSelect: (slot: DaySlot) => void;
  mode?: "book" | "manage";
  slotMinutes?: number;
}) {
  const reservedCount = useMemo(
    () =>
      slots.filter((s) => s.status === "booked" || s.status === "held" || s.status === "blocked")
        .length,
    [slots]
  );
  const openCount = useMemo(() => slots.filter((s) => s.status === "available").length, [slots]);
  const durationText = slotMinutes >= 60 ? "1 hour slots" : "45 min slots";

  if (!slots.length) {
    return <p className="m-0 text-sm text-muted">No slots for this day.</p>;
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-white shadow-[var(--shadow)]">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-[linear-gradient(180deg,#fbfcfd_0%,#ffffff_100%)] px-3.5 py-2.5">
        <p className="m-0 text-[12px] font-medium text-muted">
          <span className="font-semibold text-navy">{openCount}</span> open
          {reservedCount > 0 ? (
            <>
              {" "}
              · <span className="font-semibold text-navy">{reservedCount}</span> reserved
            </>
          ) : null}
          <span className="font-semibold text-navy"> · {durationText}</span>
        </p>
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] font-bold tracking-[0.06em] text-muted uppercase">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full border border-border bg-white shadow-sm" /> Open
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-navy/80" /> Reserved
          </span>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 p-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-4 xl:grid-cols-5">
        {slots.map((slot) => {
          const selected = selectedStartIso === slot.startIso;
          const isNext = nextAvailableIso === slot.startIso;
          const clickable =
            slot.status === "available" || (mode === "manage" && slot.status === "booked");
          const primary = slot.bookings?.[0];
          const label = slotStatusLabel(slot, { isNext, selected, mode });
          const isReserved =
            slot.status === "booked" || slot.status === "held" || slot.status === "blocked";

          return (
            <button
              key={slot.startIso}
              type="button"
              disabled={!clickable}
              onClick={() => clickable && onSelect(slot)}
              title={
                slot.status === "booked" && primary?.companyName
                  ? `${slot.label} · ${primary.companyName}`
                  : `${slot.label} · ${label}`
              }
              className={cn(
                "group relative min-h-[3.1rem] overflow-hidden rounded-xl border px-2.5 py-2 text-left transition duration-200 ease-out",
                slot.status === "past" &&
                  "cursor-default border-transparent bg-transparent text-faint/50",
                isReserved &&
                  !selected &&
                  "cursor-default border-navy/10 border-l-[3px] border-l-navy/45 bg-[linear-gradient(160deg,#f3f5f8_0%,#eef1f5_100%)] text-navy",
                isReserved &&
                  mode === "manage" &&
                  slot.status === "booked" &&
                  "cursor-pointer hover:-translate-y-0.5 hover:border-navy/25 hover:shadow-[var(--shadow)]",
                slot.status === "available" &&
                  !selected &&
                  "border-border/80 bg-white text-navy hover:-translate-y-0.5 hover:border-accent/70 hover:bg-[#fffCF5] hover:shadow-[var(--shadow)]",
                slot.status === "available" &&
                  selected &&
                  "border-accent bg-accent text-[var(--navy-deep)] shadow-[var(--shadow-button)]",
                isNext &&
                  !selected &&
                  slot.status === "available" &&
                  "border-accent/50 ring-2 ring-accent/25"
              )}
            >
              <div
                className={cn(
                  "text-[13px] font-semibold tabular-nums leading-none tracking-tight",
                  slot.status === "past" && "font-medium"
                )}
              >
                {slot.label}
              </div>
              <div
                className={cn(
                  "mt-1.5 truncate text-[10px] font-bold tracking-[0.05em] uppercase",
                  selected && slot.status === "available"
                    ? "text-[var(--navy-deep)]/70"
                    : isReserved
                      ? "text-navy/55"
                      : "text-muted"
                )}
              >
                {label}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export const SERVICE_TYPE_OPTIONS = [
  { id: "crossdock", label: "Crossdock · 45 min" },
  { id: "trailer_rework", label: "Trailer Rework · 1 hour" },
  { id: "drop_and_store", label: "Drop and Store · 45 min" },
] as const;

export const SERVICE_FILTER_OPTIONS = [
  { id: "all", label: "All services" },
  ...SERVICE_TYPE_OPTIONS,
] as const;
