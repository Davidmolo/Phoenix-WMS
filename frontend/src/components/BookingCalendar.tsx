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
    <div
      className="h-full rounded-[var(--radius-lg)] border border-border p-3 shadow-[var(--shadow)] transition duration-200 ease-out hover:-translate-y-0.5 hover:shadow-[var(--shadow-card)] sm:p-4"
      style={{ background: "var(--blend-card)" }}
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <button
          type="button"
          className="rounded-lg border border-border p-2 text-navy hover:bg-surface-2"
          onClick={prev}
          aria-label="Previous month"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <div className="font-display text-sm font-semibold tracking-wide text-navy uppercase">
          {monthLabel(year, month)}
        </div>
        <button
          type="button"
          className="rounded-lg border border-border p-2 text-navy hover:bg-surface-2"
          onClick={next}
          aria-label="Next month"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      <div className="mb-1.5 grid grid-cols-7 gap-1 text-center text-[10px] font-semibold tracking-wide text-muted uppercase">
        {WEEKDAYS.map((d) => (
          <div key={d} className="py-1">
            {d}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {cells.map((cell) => {
          if (!cell.date || cell.dayNum == null) {
            return <div key={cell.key} className="h-12" />;
          }
          const summary = byDate.get(cell.date);
          const isSelected = cell.date === selectedDate;
          const isToday = cell.date === today;
          const isPast = cell.date < today;
          // One indicator only — two dots collide in narrow month grids
          const dotTone =
            !summary || summary.dot === "none"
              ? null
              : summary.dot === "available"
                ? "available"
                : "booked";

          return (
            <button
              key={cell.key}
              type="button"
              disabled={isPast}
              onClick={() => onSelectDate(cell.date!)}
              className={cn(
                "flex h-12 flex-col items-center justify-center gap-1 rounded-lg px-0.5 text-xs transition",
                isPast && "cursor-not-allowed text-muted/40",
                !isPast && "hover:bg-accent-bg",
                isSelected && "bg-accent text-[var(--navy-deep)] hover:bg-accent",
                !isSelected && isToday && "ring-1 ring-accent"
              )}
            >
              <span className="leading-none font-semibold tabular-nums">{cell.dayNum}</span>
              <span className="flex h-1.5 shrink-0 items-center justify-center" aria-hidden>
                {dotTone ? (
                  <span
                    className={cn(
                      "block h-1.5 w-1.5 rounded-full",
                      isSelected
                        ? "bg-[var(--navy-deep)]"
                        : dotTone === "available"
                          ? "bg-[var(--success)]"
                          : "bg-[var(--warning)]"
                    )}
                  />
                ) : (
                  <span className="block h-1.5 w-1.5" />
                )}
              </span>
            </button>
          );
        })}
      </div>

      <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1.5 text-[11px] text-muted">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-[var(--success)]" /> Open day
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-[var(--warning)]" /> Has bookings
        </span>
      </div>
    </div>
  );
}

type SlotBlock =
  | { kind: "visit"; start: DaySlot; held: DaySlot[]; key: string }
  | { kind: "single"; slot: DaySlot; key: string };

/** Group consecutive booked + following held chips into one visit block (~50 min). */
function groupSlotBlocks(slots: DaySlot[]): SlotBlock[] {
  const blocks: SlotBlock[] = [];
  let i = 0;
  while (i < slots.length) {
    const slot = slots[i];
    if (slot.status === "booked") {
      const held: DaySlot[] = [];
      let j = i + 1;
      while (j < slots.length && slots[j].status === "held") {
        held.push(slots[j]);
        j += 1;
      }
      blocks.push({ kind: "visit", start: slot, held, key: slot.startIso });
      i = j;
      continue;
    }
    blocks.push({ kind: "single", slot, key: slot.startIso });
    i += 1;
  }
  return blocks;
}

export function BookingSlotGrid({
  slots,
  selectedStartIso,
  nextAvailableIso,
  onSelect,
  mode = "book",
}: {
  slots: DaySlot[];
  selectedStartIso: string | null;
  nextAvailableIso?: string | null;
  onSelect: (slot: DaySlot) => void;
  /** book = customer pick open slots; manage = staff can open booked visits */
  mode?: "book" | "manage";
}) {
  const blocks = useMemo(() => groupSlotBlocks(slots), [slots]);
  const visitCount = blocks.filter((b) => b.kind === "visit").length;

  if (!slots.length) {
    return <p className="m-0 text-sm text-muted">No slots for this day.</p>;
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="m-0 text-xs leading-relaxed text-muted">
          {visitCount > 0 ? (
            <>
              <span className="font-semibold text-navy">{visitCount}</span> dock visit
              {visitCount === 1 ? "" : "s"} · each start holds ~50 min
            </>
          ) : (
            <>15-min start times · each visit holds ~50 minutes · 2 doors</>
          )}
        </p>
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] font-semibold uppercase tracking-wide text-muted">
          <span className="inline-flex items-center gap-1">
            <span className="h-2 w-2 rounded-sm bg-[var(--warning-bg)] ring-1 ring-[rgba(218,142,11,0.5)]" />{" "}
            Booked
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="h-2 w-2 rounded-sm border border-dashed border-border bg-[var(--surface-2)]" />{" "}
            Held (~50m)
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="h-2 w-2 rounded-sm bg-muted/25" /> Unavailable
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="h-2 w-2 rounded-sm border border-border bg-white" /> Open
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-3 xl:grid-cols-4">
        {blocks.map((block) => {
          if (block.kind === "visit") {
            const { start, held } = block;
            const primary = start.bookings?.[0];
            const selected = selectedStartIso === start.startIso;
            const canClick = mode === "manage" || start.status === "available";
            const endLabel = held.length ? held[held.length - 1].label : null;

            return (
              <button
                key={block.key}
                type="button"
                disabled={!canClick}
                onClick={() => canClick && onSelect(start)}
                title={
                  primary?.companyName
                    ? `${primary.companyName} · ${start.label}–~50 min · ${primary.serviceLabel}`
                    : `${start.label} · Booked (~50 min)`
                }
                className={cn(
                  "col-span-1 flex flex-col overflow-hidden rounded-xl border text-left transition",
                  mode === "manage" && "sm:col-span-2",
                  selected
                    ? "border-accent shadow-[var(--shadow-button)] ring-2 ring-accent/40"
                    : primary?.isMine
                      ? "border-accent/50"
                      : "border-[rgba(218,142,11,0.4)]",
                  canClick ? "cursor-pointer hover:border-accent" : "cursor-default"
                )}
              >
                <div className="flex items-stretch gap-0 bg-[var(--warning-bg)]">
                  <div className="w-1.5 shrink-0 bg-accent" />
                  <div className="min-w-0 flex-1 px-3 py-2.5">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
                      <span className="font-semibold tabular-nums text-navy">{start.label}</span>
                      <span className="text-[10px] font-bold tracking-wide text-[var(--warning)] uppercase">
                        {primary?.isMine ? "Your booking · ~50 min" : "Booked · ~50 min"}
                      </span>
                    </div>
                    {primary?.companyName ? (
                      <div className="mt-1 min-w-0">
                        <div className="truncate text-sm font-medium text-navy">{primary.companyName}</div>
                        <div className="truncate text-[11px] text-muted">
                          {primary.serviceLabel}
                          {primary.contactName ? ` · ${primary.contactName}` : ""}
                        </div>
                      </div>
                    ) : (
                      <div className="mt-1 text-[11px] text-muted">Reserved on the dock</div>
                    )}
                  </div>
                </div>
                {held.length > 0 ? (
                  <div className="flex items-center gap-2 border-t border-dashed border-[rgba(218,142,11,0.35)] bg-[var(--surface-2)] px-3 py-2">
                    <span className="h-px flex-1 bg-border" />
                    <span className="shrink-0 text-[10px] font-semibold tracking-wide text-muted uppercase">
                      Held through {endLabel}
                    </span>
                    <span className="h-px flex-1 bg-border" />
                  </div>
                ) : null}
              </button>
            );
          }

          const slot = block.slot;
          const selected = selectedStartIso === slot.startIso;
          const isNext = nextAvailableIso === slot.startIso;
          const clickable =
            slot.status === "available" || (mode === "manage" && slot.status === "booked");

          return (
            <button
              key={block.key}
              type="button"
              disabled={!clickable}
              onClick={() => clickable && onSelect(slot)}
              className={cn(
                "min-h-[3.25rem] rounded-xl border px-3 py-2.5 text-left text-sm transition",
                slot.status === "past" &&
                  "cursor-not-allowed border-transparent bg-transparent text-muted/40",
                slot.status === "held" &&
                  "cursor-not-allowed border-dashed border-border bg-[var(--surface-2)] text-muted",
                slot.status === "blocked" &&
                  "cursor-not-allowed border-border/60 bg-[rgba(43,66,87,0.06)] text-muted",
                slot.status === "available" &&
                  !selected &&
                  "border-border bg-white text-navy transition duration-200 hover:-translate-y-0.5 hover:border-accent hover:bg-accent-bg hover:shadow-[var(--shadow)]",
                slot.status === "available" &&
                  selected &&
                  "border-accent bg-accent text-[var(--navy-deep)] shadow-[var(--shadow-button)]",
                isNext &&
                  !selected &&
                  slot.status === "available" &&
                  "ring-2 ring-accent/50 ring-offset-1"
              )}
            >
              <div className="font-semibold tabular-nums leading-tight">{slot.label}</div>
              <div
                className={cn(
                  "mt-0.5 text-[10px] font-semibold tracking-wide uppercase",
                  selected && slot.status === "available"
                    ? "text-[var(--navy-deep)]/75"
                    : "text-muted"
                )}
              >
                {slot.status === "available"
                  ? isNext || selected
                    ? "Next open"
                    : "Open"
                  : slot.status === "held"
                    ? "Held"
                    : slot.status === "blocked"
                      ? "Unavailable"
                      : slot.status}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export const SERVICE_TYPE_OPTIONS = [
  { id: "crossdock", label: "Crossdock" },
  { id: "trailer_rework", label: "Trailer Rework" },
  { id: "drop_and_store", label: "Drop and Store" },
] as const;

export const SERVICE_FILTER_OPTIONS = [
  { id: "all", label: "All services" },
  ...SERVICE_TYPE_OPTIONS,
] as const;
