"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { CalendarDays, ExternalLink, Globe, Phone, X } from "lucide-react";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  CardTitle,
  ChipGroup,
  Field,
  FormGrid,
  Input,
  PageHeader,
  Select,
  statusTone,
} from "@/components/ui";
import {
  BookingMonthCalendar,
  BookingSlotGrid,
  SERVICE_FILTER_OPTIONS,
  SERVICE_TYPE_OPTIONS,
  type CalendarDayDot,
  type DaySlot,
} from "@/components/BookingCalendar";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useApiQuery, invalidateApiCache } from "@/hooks/useApiQuery";
import { dateLabel } from "@/lib/format";
import { cn } from "@/lib/cn";
import { listQuery } from "@/lib/pagination";
import { BookingDisclaimer, durationLabelForService, durationMinutesForService } from "@/components/BookingDisclaimer";
import type { Booking } from "@/types";

type CalendarResponse = {
  year: number;
  month: number;
  today: string;
  serviceType: string;
  days: CalendarDayDot[];
  defaults: {
    workdayStartHour: number;
    workdayEndHour: number;
    slotIntervalMinutes: number;
    defaultDurationMinutes: number;
  };
};

type SlotsResponse = {
  date: string;
  slots: DaySlot[];
  nextAvailable: DaySlot | null;
};

function monthParts(dateKey: string) {
  const [y, m] = dateKey.split("-").map(Number);
  return { year: y, month: m };
}

function sourceLabel(source?: string) {
  if (source === "web") return "Website";
  if (source === "phone") return "Phone";
  if (source === "portal") return "Customer portal";
  if (source === "admin") return "Desk";
  return source || "—";
}

/**
 * Admin dock board — view / manage inbound bookings from the website (& phone).
 * Creating appointments happens on phoenixcrossdocks.com (prototype: /book), not here.
 */
export default function BookingsScreen() {
  const { token } = useAuth();
  const [serviceType, setServiceType] = useState("all");
  const [sourceFilter, setSourceFilter] = useState<"all" | "web" | "phone">("all");
  const [cursor, setCursor] = useState(() => {
    const n = new Date();
    return { year: n.getFullYear(), month: n.getMonth() + 1 };
  });
  const [selectedDate, setSelectedDate] = useState("");
  const [focusBookingId, setFocusBookingId] = useState<string | null>(null);
  const [phoneLogSlot, setPhoneLogSlot] = useState<DaySlot | null>(null);
  const [phoneService, setPhoneService] = useState("crossdock");
  const [companyName, setCompanyName] = useState("");
  const [contactName, setContactName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [notes, setNotes] = useState("");
  const [logging, setLogging] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [actionId, setActionId] = useState<string | null>(null);

  const calPath = `/bookings/calendar?year=${cursor.year}&month=${cursor.month}&serviceType=${encodeURIComponent(serviceType)}&source=${encodeURIComponent(sourceFilter)}`;
  const { data: cal, loading: calLoading, reload: reloadCal } = useApiQuery<CalendarResponse>(calPath);

  const today = cal?.today || "";
  useEffect(() => {
    if (!selectedDate && today) setSelectedDate(today);
  }, [today, selectedDate]);

  const slotsPath =
    selectedDate && token
      ? `/bookings/slots?date=${encodeURIComponent(selectedDate)}&serviceType=${encodeURIComponent(serviceType)}&source=${encodeURIComponent(sourceFilter)}`
      : null;
  const { data: slotsData, reload: reloadSlots } = useApiQuery<SlotsResponse>(slotsPath);

  const listPath = selectedDate
    ? listQuery("/bookings", {
        limit: 100,
        params: { date: selectedDate },
      })
    : null;
  const { data: listData, reload: reloadList } = useApiQuery<{ bookings: Booking[] }>(listPath);

  const upcomingPath = listQuery("/bookings", { limit: 50 });
  const { data: upcomingData, reload: reloadUpcoming } = useApiQuery<{ bookings: Booking[] }>(
    upcomingPath
  );

  const slots = slotsData?.slots ?? [];
  const dayBookings = useMemo(() => {
    let list = listData?.bookings ?? [];
    if (serviceType !== "all") {
      list = list.filter((b) => b.serviceType === serviceType);
    }
    if (sourceFilter !== "all") {
      list = list.filter((b) => b.source === sourceFilter);
    }
    return list;
  }, [listData, sourceFilter, serviceType]);

  const upcoming = useMemo(() => {
    const now = Date.now();
    return (upcomingData?.bookings ?? [])
      .filter((b) => b.status === "confirmed" && new Date(b.startsAt).getTime() >= now - 60 * 60_000)
      .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime())
      .slice(0, 8);
  }, [upcomingData]);

  const focused = useMemo(
    () => dayBookings.find((b) => b._id === focusBookingId) || dayBookings[0] || null,
    [dayBookings, focusBookingId]
  );

  useEffect(() => {
    setFocusBookingId(null);
    setPhoneLogSlot(null);
  }, [selectedDate, serviceType, sourceFilter]);

  function onSlotClick(slot: DaySlot) {
    if (slot.status === "booked" && slot.bookings?.[0]?.id) {
      setPhoneLogSlot(null);
      setFocusBookingId(slot.bookings[0].id);
      return;
    }
    if (slot.status === "available") {
      setFocusBookingId(null);
      setPhoneLogSlot(slot);
      if (serviceType !== "all") setPhoneService(serviceType);
    }
  }

  function closePhoneLog() {
    setPhoneLogSlot(null);
    setCompanyName("");
    setContactName("");
    setPhone("");
    setEmail("");
    setNotes("");
  }

  async function logPhoneBooking(e: FormEvent) {
    e.preventDefault();
    if (!token || !phoneLogSlot) return;
    setLogging(true);
    setErr("");
    setMsg("");
    try {
      const result = await api<{ booking: Booking }>("/bookings", {
        method: "POST",
        token,
        body: JSON.stringify({
          serviceType: phoneService,
          startsAt: phoneLogSlot.startIso,
          source: "phone",
          companyName,
          contactName,
          phone,
          email,
          notes: notes ? `Phone intake · ${notes}` : "Phone intake",
          createRequest: false,
        }),
      });
      setMsg(
        `Phone booking logged for ${companyName || "customer"} · ${phoneLogSlot.label} (source: Phone)`
      );
      closePhoneLog();
      setFocusBookingId(result.booking._id);
      setSourceFilter("all");
      invalidateApiCache("/bookings");
      await Promise.all([reloadCal(), reloadSlots(), reloadList(), reloadUpcoming()]);
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "Could not log phone booking");
    } finally {
      setLogging(false);
    }
  }

  async function setStatus(id: string, status: "cancelled" | "completed" | "confirmed" | "no_show") {
    if (!token) return;
    setActionId(id);
    setErr("");
    setMsg("");
    try {
      await api(`/bookings/${id}`, {
        method: "PATCH",
        token,
        body: JSON.stringify({ status }),
      });
      setMsg(
        status === "cancelled"
          ? "Appointment released — that time is open on the calendar again"
          : status === "completed"
            ? "Marked completed"
            : status === "no_show"
              ? "Marked no-show"
              : "Booking confirmed"
      );
      invalidateApiCache("/bookings");
      await Promise.all([reloadCal(), reloadSlots(), reloadList(), reloadUpcoming()]);
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "Update failed");
    } finally {
      setActionId(null);
    }
  }

  const duration = durationMinutesForService(serviceType === "all" ? "crossdock" : serviceType);
  const interval = cal?.defaults?.slotIntervalMinutes ?? 45;
  const visitLabel = durationLabelForService(serviceType === "all" ? "crossdock" : serviceType);
  const bookedStarts = slots.filter((s) => s.status === "booked").length;

  return (
    <div>
      <PageHeader
        title="Dock schedule"
        icon={<CalendarDays className="h-5 w-5" />}
        description={`Website bookings auto-tag as Website. Phone calls: click an open slot → Log phone booking (saved with source Phone). Filter Source → Phone to audit call-ins. Crossdock & Drop & Store 45 min · Trailer Rework 1 hour · 8 AM–6 PM.`}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="secondary"
              icon={<Phone className="h-3.5 w-3.5" />}
              onClick={() => {
                const open = slots.find((s) => s.status === "available");
                if (open) onSlotClick(open);
                else setErr("No open slot on this date — pick another day or service.");
              }}
            >
              Log phone booking
            </Button>
            <a
              href="/book"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-xs font-bold text-[var(--navy-deep)] hover:brightness-105"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Website form
            </a>
          </div>
        }
      />

      {msg ? (
        <Alert tone="success" className="mb-4">
          {msg}
        </Alert>
      ) : null}
      {err ? (
        <Alert tone="danger" className="mb-4">
          {err}
        </Alert>
      ) : null}

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <Card className="px-3 py-3" style={{ background: "var(--blend-kpi)" }}>
          <div className="text-[11px] font-semibold tracking-wide text-muted uppercase">Booked starts today</div>
          <div className="mt-1 font-display text-2xl font-semibold text-navy">{bookedStarts}</div>
        </Card>
        <Card className="px-3 py-3" style={{ background: "var(--blend-kpi)" }}>
          <div className="text-[11px] font-semibold tracking-wide text-muted uppercase">On this date</div>
          <div className="mt-1 font-display text-2xl font-semibold text-navy">{dayBookings.length}</div>
        </Card>
        <Card className="px-3 py-3" style={{ background: "var(--blend-kpi)" }}>
          <div className="text-[11px] font-semibold tracking-wide text-muted uppercase">Coming up</div>
          <div className="mt-1 font-display text-2xl font-semibold text-navy">{upcoming.length}</div>
        </Card>
      </div>

      <div className="mb-4 flex flex-wrap items-end gap-4">
        <ChipGroup
          label="Service"
          size="sm"
          options={[...SERVICE_FILTER_OPTIONS]}
          value={serviceType}
          onChange={setServiceType}
        />
        <ChipGroup
          label="Source"
          size="sm"
          options={[
            { id: "all" as const, label: "All" },
            { id: "web" as const, label: "Website" },
            { id: "phone" as const, label: "Phone" },
          ]}
          value={sourceFilter}
          onChange={setSourceFilter}
        />
      </div>

      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:gap-5">
        <div className="mx-auto w-full max-w-[340px] shrink-0 lg:mx-0 lg:w-[360px] xl:w-[380px]">
          <BookingMonthCalendar
            year={cursor.year}
            month={cursor.month}
            today={today}
            selectedDate={selectedDate}
            days={cal?.days ?? []}
            onSelectDate={(date) => {
              setSelectedDate(date);
              const parts = monthParts(date);
              if (parts.year !== cursor.year || parts.month !== cursor.month) setCursor(parts);
            }}
            onChangeMonth={(year, month) => setCursor({ year, month })}
          />
        </div>

        <Card className="min-w-0 flex-1 self-start" lift={false}>
          <CardBody className="space-y-4">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div>
                <CardTitle>
                  {selectedDate ? dateLabel(selectedDate + "T12:00:00") : "Pick a date"}
                </CardTitle>
                <p className="m-0 mt-1 text-xs text-muted">
                  <strong>Open</strong> = free · <strong>Reserved</strong> = taken · click a reserved
                  chip to open details. Source filter updates the grid and the list.
                </p>
                <BookingDisclaimer className="mt-2" />
              </div>
              {calLoading ? <span className="text-xs text-muted">Loading…</span> : null}
            </div>
            <BookingSlotGrid
              slots={slots}
              mode="manage"
              slotMinutes={duration}
              selectedStartIso={
                phoneLogSlot?.startIso ??
                (focused
                  ? slots.find((s) => s.bookings?.some((b) => b.id === focused._id))?.startIso ?? null
                  : null)
              }
              nextAvailableIso={null}
              onSelect={onSlotClick}
            />
          </CardBody>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-1 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
        <Card>
          <CardBody>
            <CardTitle>Appointments this day</CardTitle>
            <p className="mt-1 mb-3 text-xs text-muted">
              Website + phone requests land here for the dock office to confirm, complete, or cancel.
            </p>
            <div className="space-y-2">
              {dayBookings.length === 0 ? (
                <p className="m-0 text-sm text-muted">No appointments on this date.</p>
              ) : (
                dayBookings.map((b) => {
                  const active = focused?._id === b._id;
                  return (
                    <button
                      key={b._id}
                      type="button"
                      onClick={() => setFocusBookingId(b._id)}
                      className={cn(
                        "flex w-full flex-wrap items-start justify-between gap-2 rounded-lg border px-3 py-2.5 text-left transition",
                        active
                          ? "border-accent bg-accent-bg"
                          : "border-border hover:border-accent/50"
                      )}
                      style={active ? undefined : { background: "var(--blend-kpi)" }}
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold text-navy">
                            {new Date(b.startsAt).toLocaleTimeString("en-US", {
                              hour: "numeric",
                              minute: "2-digit",
                              timeZone: "America/Phoenix",
                            })}
                          </span>
                          <Badge tone={statusTone(b.status)}>{b.status}</Badge>
                          <Badge tone={b.source === "web" ? "accent" : "neutral"}>
                            {b.source === "web" ? (
                              <span className="inline-flex items-center gap-1">
                                <Globe className="h-3 w-3" /> Website
                              </span>
                            ) : b.source === "phone" ? (
                              <span className="inline-flex items-center gap-1">
                                <Phone className="h-3 w-3" /> Phone
                              </span>
                            ) : (
                              sourceLabel(b.source)
                            )}
                          </Badge>
                        </div>
                        <div className="mt-0.5 text-sm font-medium text-navy">
                          {b.companyName || "—"} · {b.contactName || "—"}
                        </div>
                        <div className="text-xs text-muted">
                          {SERVICE_TYPE_OPTIONS.find((s) => s.id === b.serviceType)?.label || b.serviceType}
                          {b.phone ? ` · ${b.phone}` : ""}
                          {b.email ? ` · ${b.email}` : ""}
                        </div>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardBody>
            {phoneLogSlot ? (
              <>
                <div className="flex items-start justify-between gap-2">
                  <CardTitle icon={<Phone className="h-4 w-4" />}>Log phone booking</CardTitle>
                  <button
                    type="button"
                    className="rounded-lg border border-border p-1.5 text-muted hover:bg-surface-2 hover:text-navy"
                    onClick={closePhoneLog}
                    aria-label="Close"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <p className="mt-1 mb-3 text-xs text-muted">
                  Staff intake for a call-in customer — saved as <strong>source: Phone</strong> so it stays
                  separate from website bookings. Not an admin self-booking.
                </p>
                <form onSubmit={logPhoneBooking} className="space-y-3">
                  <Field label="Slot">
                    <Input
                      readOnly
                      value={`${selectedDate} · ${phoneLogSlot.label}`}
                    />
                  </Field>
                  <Field label="Service *">
                    <Select
                      value={phoneService}
                      onChange={(e) => setPhoneService(e.target.value)}
                      required
                    >
                      {SERVICE_TYPE_OPTIONS.map((opt) => (
                        <option key={opt.id} value={opt.id}>
                          {opt.label}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <FormGrid>
                    <Field label="Company *">
                      <Input
                        required
                        value={companyName}
                        onChange={(e) => setCompanyName(e.target.value)}
                        placeholder="Caller company"
                      />
                    </Field>
                    <Field label="Contact *">
                      <Input
                        required
                        value={contactName}
                        onChange={(e) => setContactName(e.target.value)}
                        placeholder="Caller name"
                      />
                    </Field>
                    <Field label="Phone *">
                      <Input
                        required
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        placeholder="(623) …"
                      />
                    </Field>
                    <Field label="Email">
                      <Input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="Optional"
                      />
                    </Field>
                  </FormGrid>
                  <Field label="Call notes">
                    <Input
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Optional"
                    />
                  </Field>
                  <Button type="submit" loading={logging} icon={<Phone className="h-4 w-4" />}>
                    Save phone booking
                  </Button>
                </form>
              </>
            ) : (
              <>
            <CardTitle>Appointment detail</CardTitle>
            {!focused ? (
              <p className="mt-3 mb-0 text-sm text-muted">Select a booked slot or row to review it.</p>
            ) : (
              <div className="mt-3 space-y-3">
                <div>
                  <div className="text-[11px] font-semibold tracking-wide text-muted uppercase">When</div>
                  <div className="mt-0.5 font-semibold text-navy">
                    {dateLabel(focused.startsAt)} ·{" "}
                    {new Date(focused.startsAt).toLocaleTimeString("en-US", {
                      hour: "numeric",
                      minute: "2-digit",
                      timeZone: "America/Phoenix",
                    })}
                    {" – "}
                    {new Date(focused.endsAt).toLocaleTimeString("en-US", {
                      hour: "numeric",
                      minute: "2-digit",
                      timeZone: "America/Phoenix",
                    })}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] font-semibold tracking-wide text-muted uppercase">Customer</div>
                  <div className="mt-0.5 text-sm text-navy">
                    <div className="font-semibold">{focused.companyName || "—"}</div>
                    <div>{focused.contactName || "—"}</div>
                    <div className="text-muted">
                      {focused.phone || "—"} · {focused.email || "—"}
                    </div>
                  </div>
                </div>
                <div>
                  <div className="text-[11px] font-semibold tracking-wide text-muted uppercase">Service</div>
                  <div className="mt-0.5 text-sm text-navy">
                    {SERVICE_TYPE_OPTIONS.find((s) => s.id === focused.serviceType)?.label || focused.serviceType}
                    {" · "}
                    {sourceLabel(focused.source)}
                  </div>
                </div>
                {focused.notes ? (
                  <div>
                    <div className="text-[11px] font-semibold tracking-wide text-muted uppercase">Notes</div>
                    <p className="mt-0.5 mb-0 text-sm leading-relaxed text-muted">{focused.notes}</p>
                  </div>
                ) : null}

                <div className="rounded-lg border border-border bg-[var(--surface-2)] px-3 py-2 text-xs text-muted">
                  Crossdock &amp; Drop &amp; Store: <strong className="text-navy">45 min</strong> ·
                  Trailer Rework: <strong className="text-navy">1 hour</strong> (8 AM–6 PM), with about
                  15 minutes early or late for traffic.
                  {serviceType !== "all" ? (
                    <>
                      {" "}
                      Current filter: <strong className="text-navy">{visitLabel}</strong>.
                    </>
                  ) : null}
                </div>

                {focused.status === "confirmed" ? (
                  <div className="space-y-2 border-t border-border pt-4">
                    <div className="text-[11px] font-semibold tracking-wide text-muted uppercase">
                      Update appointment
                    </div>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      <Button
                        type="button"
                        size="sm"
                        className="w-full justify-center"
                        loading={actionId === focused._id}
                        onClick={() => setStatus(focused._id, "completed")}
                      >
                        Mark completed
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        className="w-full justify-center"
                        disabled={!!actionId}
                        onClick={() => setStatus(focused._id, "no_show")}
                      >
                        Mark no-show
                      </Button>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="w-full justify-center text-danger hover:bg-danger-bg hover:text-danger"
                      disabled={!!actionId}
                      onClick={() => {
                        if (
                          window.confirm(
                            `Release ${focused.companyName || "this"} appointment? The time will open again on the calendar.`
                          )
                        ) {
                          setStatus(focused._id, "cancelled");
                        }
                      }}
                    >
                      Release appointment
                    </Button>
                  </div>
                ) : (
                  <div className="border-t border-border pt-3">
                    <Badge tone={statusTone(focused.status)}>{focused.status}</Badge>
                  </div>
                )}
              </div>
            )}

            <div className="mt-6 border-t border-border pt-4">
              <div className="text-[11px] font-semibold tracking-wide text-muted uppercase">Upcoming</div>
              <div className="mt-2 space-y-1.5">
                {upcoming.length === 0 ? (
                  <p className="m-0 text-xs text-muted">No upcoming confirmed appointments.</p>
                ) : (
                  upcoming.map((b) => (
                    <div key={b._id} className="flex justify-between gap-2 text-xs text-navy">
                      <span className="truncate font-medium">
                        {new Date(b.startsAt).toLocaleString("en-US", {
                          month: "short",
                          day: "numeric",
                          hour: "numeric",
                          minute: "2-digit",
                          timeZone: "America/Phoenix",
                        })}{" "}
                        · {b.companyName}
                      </span>
                      <Badge tone="accent">{sourceLabel(b.source)}</Badge>
                    </div>
                  ))
                )}
              </div>
            </div>
              </>
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
