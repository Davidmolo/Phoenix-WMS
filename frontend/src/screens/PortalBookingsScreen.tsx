"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { CalendarDays, CheckCircle2 } from "lucide-react";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  CardTitle,
  ChipGroup,
  Field,
  Input,
  PageHeader,
  statusTone,
} from "@/components/ui";
import {
  BookingMonthCalendar,
  BookingSlotGrid,
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
import { BookingDisclaimer } from "@/components/BookingDisclaimer";
import type { Booking, Customer } from "@/types";

type CalendarResponse = {
  year: number;
  month: number;
  today: string;
  days: CalendarDayDot[];
};

type SlotsResponse = {
  date: string;
  slots: DaySlot[];
  nextAvailable: DaySlot | null;
};

const ROLE_OPTIONS = ["Carrier", "Shipper", "Broker", "Receiver"] as const;

type ProfileFields = {
  name: string;
  contact: string;
  email: string;
  phone: string;
};

function missingProfileFields(p: ProfileFields): Array<keyof ProfileFields> {
  const missing: Array<keyof ProfileFields> = [];
  if (!p.name.trim()) missing.push("name");
  if (!p.contact.trim()) missing.push("contact");
  if (!p.email.trim()) missing.push("email");
  if (!p.phone.trim()) missing.push("phone");
  return missing;
}

function labelForField(key: keyof ProfileFields) {
  switch (key) {
    case "name":
      return "company name";
    case "contact":
      return "contact name";
    case "email":
      return "email";
    case "phone":
      return "phone";
  }
}

function StepHeading({ n, title }: { n: number; title: string }) {
  return (
    <div className="mb-5 flex items-center gap-3">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-navy text-[12px] font-bold text-white sm:h-9 sm:w-9 sm:text-[13px]">
        {n}
      </span>
      <div className="min-w-0 flex-1 border-b border-border pb-2.5">
        <h2 className="font-display m-0 text-[12px] font-semibold tracking-[0.1em] text-navy uppercase sm:text-[13px]">
          {title}
        </h2>
      </div>
    </div>
  );
}

/**
 * Customer portal booking — same streamlined form as public /book (David Oct 1),
 * with Paddock-style hover/color treatment. Profile lives in the sidebar nav.
 */
export default function PortalBookingsScreen() {
  const { token, user } = useAuth();
  const [serviceType, setServiceType] = useState("crossdock");
  const [role, setRole] = useState<(typeof ROLE_OPTIONS)[number]>("Carrier");
  const [cursor, setCursor] = useState(() => {
    const n = new Date();
    return { year: n.getFullYear(), month: n.getMonth() + 1 };
  });
  const [selectedDate, setSelectedDate] = useState("");
  const [selectedSlot, setSelectedSlot] = useState<DaySlot | null>(null);

  const [trailerType, setTrailerType] = useState("");
  const [loadType, setLoadType] = useState("");
  const [palletCount, setPalletCount] = useState("");
  const [origin, setOrigin] = useState("");
  const [destination, setDestination] = useState("");
  const [notes, setNotes] = useState("");

  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  const customerPath = user?.customerId ? `/customers/${user.customerId}` : null;
  const { data: customerPayload, loading: customerLoading } = useApiQuery<{ customer: Customer }>(
    customerPath
  );
  const customer = customerPayload?.customer;

  const profileSnapshot = useMemo<ProfileFields>(
    () => ({
      name: (customer?.name || "").trim(),
      contact: (customer?.contact || "").trim(),
      email: (customer?.email || "").trim(),
      phone: (customer?.phone || "").trim(),
    }),
    [customer]
  );

  const missing = useMemo(() => missingProfileFields(profileSnapshot), [profileSnapshot]);
  const profileComplete = missing.length === 0;

  const account = useMemo(
    () => ({
      companyName: profileSnapshot.name,
      contactName: profileSnapshot.contact,
      email: profileSnapshot.email,
      phone: profileSnapshot.phone,
    }),
    [profileSnapshot]
  );

  const calPath = `/bookings/calendar?year=${cursor.year}&month=${cursor.month}&serviceType=${encodeURIComponent(serviceType)}`;
  const { data: cal, reload: reloadCal } = useApiQuery<CalendarResponse>(calPath);
  const today = cal?.today || "";

  useEffect(() => {
    if (!selectedDate && today) setSelectedDate(today);
  }, [today, selectedDate]);

  const slotsPath = selectedDate
    ? `/bookings/slots?date=${encodeURIComponent(selectedDate)}&serviceType=${encodeURIComponent(serviceType)}`
    : null;
  const { data: slotsData, reload: reloadSlots, loading: slotsLoading } = useApiQuery<SlotsResponse>(slotsPath);

  const { data: mineData, reload: reloadMine } = useApiQuery<{ bookings: Booking[] }>(
    listQuery("/bookings", { limit: 50 })
  );

  // Keep previous slots on screen while a new day loads (avoids full flash/re-render)
  const [slots, setSlots] = useState<DaySlot[]>([]);
  const nextAvailable = slotsData?.nextAvailable ?? null;
  const openSlots = useMemo(() => slots.filter((s) => s.status === "available").length, [slots]);

  useEffect(() => {
    if (!slotsData?.slots) return;
    setSlots(slotsData.slots);
    setSelectedSlot((prev) => {
      const stillOpen = prev
        ? slotsData.slots.find((s) => s.startIso === prev.startIso && s.status === "available")
        : null;
      return stillOpen ?? slotsData.nextAvailable ?? null;
    });
  }, [slotsData]);

  const myBookings = useMemo(() => {
    return (mineData?.bookings ?? [])
      .filter((b) => b.status === "confirmed" || b.status === "completed")
      .sort((a, b) => new Date(b.startsAt).getTime() - new Date(a.startsAt).getTime())
      .slice(0, 12);
  }, [mineData]);

  function resetFreight() {
    setTrailerType("");
    setLoadType("");
    setPalletCount("");
    setOrigin("");
    setDestination("");
    setNotes("");
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!token || !selectedSlot) return;
    if (!profileComplete) {
      setErr("Please update your profile first before booking.");
      return;
    }
    setBusy(true);
    setErr("");
    setMsg("");
    try {
      const freightNotes = [
        `Role: ${role}`,
        trailerType ? `Trailer: ${trailerType}` : null,
        loadType ? `Load: ${loadType}` : null,
        origin ? `Origin: ${origin}` : null,
        destination ? `Destination: ${destination}` : null,
        notes || null,
      ]
        .filter(Boolean)
        .join(" · ");

      await api("/bookings", {
        method: "POST",
        token,
        body: JSON.stringify({
          serviceType,
          startsAt: selectedSlot.startIso,
          source: "portal",
          companyName: account.companyName,
          contactName: account.contactName,
          email: account.email,
          phone: account.phone,
          notes: freightNotes,
          freight: {
            trailerNumber: trailerType || undefined,
            palletCount: palletCount ? Number(palletCount) : undefined,
            details: freightNotes,
          },
          createRequest: true,
        }),
      });
      setMsg(
        `You’re booked for ${selectedDate} · ${selectedSlot.label}. Bay and gate instructions will follow by email.`
      );
      resetFreight();
      setSelectedSlot(null);
      invalidateApiCache("/bookings");
      await Promise.all([reloadCal(), reloadSlots(), reloadMine()]);
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "Could not submit booking");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Book a bay"
        icon={<CalendarDays className="h-5 w-5" />}
        description="Same booking flow as the website — 45-min slots, 8 AM–6 PM. Your account info comes from Profile."
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

      {!user?.customerId ? (
        <Alert tone="danger" className="mb-4">
          This login is not linked to a customer account. Ask the dock office to connect your portal
          user before booking.
        </Alert>
      ) : null}

      {customerLoading && !customer ? (
        <p className="mb-4 text-sm text-muted">Loading your profile…</p>
      ) : null}

      {!profileComplete && customer ? (
        <Alert tone="info" className="mb-4">
          Please update your profile first before booking. Missing:{" "}
          <strong>{missing.map(labelForField).join(", ")}</strong>.
        </Alert>
      ) : null}

      {profileComplete ? (
        <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_300px] xl:grid-cols-[minmax(0,1fr)_320px]">
          <form onSubmit={onSubmit} className="space-y-4 sm:space-y-5">
            <section className="rounded-2xl border border-border bg-white p-4 shadow-[var(--shadow)] transition duration-200 ease-out hover:-translate-y-0.5 hover:shadow-[var(--shadow-card)] sm:p-6">
              <StepHeading n={1} title="Who's booking" />
              <p className="mt-0 mb-4 text-sm text-muted">
                Booking as <strong className="text-navy">{account.companyName}</strong>
                {account.contactName ? ` · ${account.contactName}` : ""}
                {account.email ? ` · ${account.email}` : ""}
              </p>
              <ChipGroup label="You are the" options={[...ROLE_OPTIONS]} value={role} onChange={setRole} />
            </section>

            <section className="rounded-2xl border border-border bg-white p-4 shadow-[var(--shadow)] sm:p-6">
              <StepHeading n={2} title="The appointment" />
              <ChipGroup
                label="Service needed *"
                options={[...SERVICE_TYPE_OPTIONS]}
                value={serviceType}
                onChange={setServiceType}
              />

              <div className="mt-5 sm:mt-6">
                <div className="mb-1 text-[11px] font-bold tracking-[0.07em] text-navy uppercase">
                  Requested date & time *
                </div>
                <p className="mb-3 mt-0 text-xs text-muted sm:mb-4">
                  45-min slots · {openSlots} open on selected day
                  {slotsLoading ? " · updating…" : ""}
                </p>
                <BookingDisclaimer className="mb-3 sm:mb-4" />

                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:gap-5">
                  <div className="mx-auto w-full max-w-[340px] shrink-0 lg:mx-0 lg:w-[340px]">
                    <BookingMonthCalendar
                      year={cursor.year}
                      month={cursor.month}
                      today={today}
                      selectedDate={selectedDate}
                      days={cal?.days ?? []}
                      onSelectDate={(date) => {
                        setSelectedDate(date);
                        const [y, m] = date.split("-").map(Number);
                        if (y !== cursor.year || m !== cursor.month) setCursor({ year: y, month: m });
                      }}
                      onChangeMonth={(year, month) => setCursor({ year, month })}
                    />
                  </div>
                  <div
                    className={cn(
                      "min-w-0 flex-1 self-start transition-opacity duration-150",
                      slotsLoading && "opacity-60"
                    )}
                  >
                    <BookingSlotGrid
                      slots={slots}
                      mode="book"
                      slotMinutes={45}
                      selectedStartIso={selectedSlot?.startIso ?? null}
                      nextAvailableIso={nextAvailable?.startIso}
                      onSelect={(slot) => {
                        if (slot.status === "available") setSelectedSlot(slot);
                      }}
                    />
                    {selectedSlot ? (
                      <div className="mt-3 flex items-center gap-3 rounded-xl border border-navy/10 bg-navy px-3.5 py-3 text-sm text-white">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent text-[11px] font-bold text-[var(--navy-deep)]">
                          ✓
                        </span>
                        <div className="min-w-0">
                          <div className="text-[10px] font-bold tracking-[0.08em] text-white/65 uppercase">
                            Selected slot
                          </div>
                          <div className="font-semibold">
                            {selectedDate} · {selectedSlot.label}
                          </div>
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            </section>

            <section className="rounded-2xl border border-border bg-white p-4 shadow-[var(--shadow)] transition duration-200 ease-out hover:-translate-y-0.5 hover:shadow-[var(--shadow-card)] sm:p-6">
              <StepHeading n={3} title="The freight" />
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Trailer type">
                  <Input
                    value={trailerType}
                    onChange={(e) => setTrailerType(e.target.value)}
                    placeholder="e.g. 53' dry van"
                  />
                </Field>
                <Field label="Load type">
                  <Input
                    value={loadType}
                    onChange={(e) => setLoadType(e.target.value)}
                    placeholder="e.g. Palletized retail"
                  />
                </Field>
                <Field label="Pallets / pieces">
                  <Input
                    type="number"
                    min={0}
                    value={palletCount}
                    onChange={(e) => setPalletCount(e.target.value)}
                  />
                </Field>
                <Field label="Origin (city, state)">
                  <Input
                    value={origin}
                    onChange={(e) => setOrigin(e.target.value)}
                    placeholder="e.g. Ontario, CA"
                  />
                </Field>
                <Field label="Destination (city, state)" className="sm:col-span-2">
                  <Input
                    value={destination}
                    onChange={(e) => setDestination(e.target.value)}
                    placeholder="e.g. Phoenix, AZ"
                  />
                </Field>
              </div>
            </section>

            <section className="rounded-2xl border border-border bg-white p-4 shadow-[var(--shadow)] transition duration-200 ease-out hover:-translate-y-0.5 hover:shadow-[var(--shadow-card)] sm:p-6">
              <StepHeading n={4} title="Anything else" />
              <Field label="Special handling or notes">
                <textarea
                  className="min-h-[88px] w-full rounded-[var(--radius)] border border-border bg-white px-3 py-2.5 text-sm text-navy outline-none transition focus:border-accent"
                  rows={3}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="PO, BOL, load number, gate codes, appointment constraints…"
                />
              </Field>
              <p className="mt-3 mb-4 text-xs leading-relaxed text-muted">
                Submitting books your time slot. You’ll get bay and gate instructions by email.
              </p>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <p className="m-0 text-sm text-muted">
                  {selectedSlot ? (
                    <>
                      Booking{" "}
                      <strong className="text-navy">
                        {selectedDate} · {selectedSlot.label}
                      </strong>
                    </>
                  ) : (
                    "Select an open time to continue"
                  )}
                </p>
                <Button
                  type="submit"
                  disabled={!selectedSlot}
                  loading={busy}
                  icon={<CheckCircle2 className="h-4 w-4" />}
                  className="transition duration-200 hover:-translate-y-0.5"
                >
                  Submit dock request →
                </Button>
              </div>
            </section>
          </form>

          <aside className="hidden space-y-3 lg:sticky lg:top-20 lg:block lg:self-start">
            <div className="rounded-2xl border border-border bg-white p-5 shadow-[var(--shadow)] transition duration-200 ease-out hover:-translate-y-0.5 hover:shadow-[var(--shadow-card)]">
              <h3 className="font-display m-0 text-[12px] font-semibold tracking-[0.1em] text-navy uppercase">
                What happens next
              </h3>
              <ol className="mt-3.5 mb-0 list-decimal space-y-2.5 pl-4 text-[13.5px] leading-relaxed text-muted">
                <li>You book your time slot and get a confirmed bay with gate instructions.</li>
                <li>Driver checks in and backs into the assigned bay.</li>
                <li>Freight is scanned in and out; BOL / POD logged.</li>
              </ol>
            </div>
            <div className="rounded-2xl border border-border bg-white p-5 shadow-[var(--shadow)] transition duration-200 ease-out hover:-translate-y-0.5 hover:shadow-[var(--shadow-card)]">
              <h3 className="font-display m-0 text-[12px] font-semibold tracking-[0.1em] text-navy uppercase">
                We can&apos;t take
              </h3>
              <ul className="mt-3.5 mb-0 list-disc space-y-1.5 pl-4 text-[13.5px] text-muted">
                <li>Temperature-controlled / reefer</li>
                <li>Hazmat or regulated materials</li>
              </ul>
            </div>
            <div className="rounded-2xl border border-border bg-navy p-5 text-[13.5px] text-white/80 transition duration-200 ease-out hover:-translate-y-0.5 hover:shadow-[var(--shadow-card)]">
              <div className="text-[10px] font-bold tracking-[0.1em] text-accent uppercase">Hours</div>
              <div className="mt-1 font-semibold text-white">8:00 AM – 6:00 PM daily</div>
              <div className="mt-4 text-[10px] font-bold tracking-[0.1em] text-accent uppercase">Location</div>
              <div className="mt-1 font-semibold text-white">3550 W Clarendon Ave #5</div>
              <div>Phoenix, AZ 85019</div>
            </div>
          </aside>
        </div>
      ) : null}

      <details className="mt-4 rounded-2xl border border-border bg-white p-4 lg:hidden">
        <summary className="cursor-pointer font-display text-sm font-semibold tracking-wide text-navy uppercase">
          What happens next & limits
        </summary>
        <div className="mt-3 space-y-3 text-sm text-muted">
          <p className="m-0">
            Book your slot (confirmed) → driver checks in → scans + BOL/POD. We don&apos;t take
            reefer or hazmat. Hours 8 AM–6 PM · Clarendon #5.
          </p>
        </div>
      </details>

      <Card className="mt-5 transition duration-200 hover:-translate-y-0.5 hover:shadow-[var(--shadow-card)]">
        <CardBody>
          <CardTitle>Your appointments</CardTitle>
          <div className="mt-3 space-y-2">
            {myBookings.length === 0 ? (
              <p className="m-0 text-sm text-muted">No dock appointments yet.</p>
            ) : (
              myBookings.map((b) => (
                <div
                  key={b._id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border px-3 py-2.5 transition hover:border-accent/40"
                  style={{ background: "var(--blend-kpi)" }}
                >
                  <div>
                    <div className="font-semibold text-navy">
                      {dateLabel(b.startsAt)} ·{" "}
                      {new Date(b.startsAt).toLocaleTimeString("en-US", {
                        hour: "numeric",
                        minute: "2-digit",
                        timeZone: "America/Phoenix",
                      })}
                    </div>
                    <div className="text-xs text-muted">
                      {SERVICE_TYPE_OPTIONS.find((s) => s.id === b.serviceType)?.label ||
                        b.serviceType}
                    </div>
                  </div>
                  <Badge tone={statusTone(b.status)}>{b.status}</Badge>
                </div>
              ))
            )}
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
