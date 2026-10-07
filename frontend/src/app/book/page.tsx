"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { Phone } from "lucide-react";
import {
  BookingMonthCalendar,
  BookingSlotGrid,
  SERVICE_TYPE_OPTIONS,
  type CalendarDayDot,
  type DaySlot,
} from "@/components/BookingCalendar";
import { Alert, Button, ChipGroup, Field, Input } from "@/components/ui";
import { BookingDisclaimer, durationLabelForService, durationMinutesForService } from "@/components/BookingDisclaimer";
import { cn } from "@/lib/cn";

const API_BASE = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api").replace(/\/$/, "");

async function publicApi<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path.startsWith("/") ? path : `/${path}`}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options?.headers || {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data as T;
}

const ROLE_OPTIONS = ["Carrier", "Shipper", "Broker", "Receiver"] as const;

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
 * Website booking prototype — mirrors phoenixcrossdocks.com/booking
 * with Calendly-style slots. Tuned for mobile → desktop showcase.
 */
export default function PublicBookPage() {
  const [serviceType, setServiceType] = useState("crossdock");
  const [role, setRole] = useState<(typeof ROLE_OPTIONS)[number]>("Carrier");

  const [cursor, setCursor] = useState(() => {
    const n = new Date();
    return { year: n.getFullYear(), month: n.getMonth() + 1 };
  });
  const [today, setToday] = useState("");
  const [selectedDate, setSelectedDate] = useState("");
  const [days, setDays] = useState<CalendarDayDot[]>([]);
  const [slots, setSlots] = useState<DaySlot[]>([]);
  const [nextAvailable, setNextAvailable] = useState<DaySlot | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<DaySlot | null>(null);

  const [companyName, setCompanyName] = useState("");
  const [contactName, setContactName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");

  const [trailerType, setTrailerType] = useState("");
  const [loadType, setLoadType] = useState("");
  const [palletCount, setPalletCount] = useState("");
  const [origin, setOrigin] = useState("");
  const [destination, setDestination] = useState("");
  const [notes, setNotes] = useState("");
  const [smsAlerts, setSmsAlerts] = useState(false);
  const [smsPromo, setSmsPromo] = useState(false);

  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Only blank the calendar on the first load — month/service changes refresh in place
      if (!days.length) setLoading(true);
      try {
        const cal = await publicApi<{ today: string; days: CalendarDayDot[] }>(
          `/public/bookings/calendar?year=${cursor.year}&month=${cursor.month}&serviceType=${encodeURIComponent(serviceType)}`
        );
        if (cancelled) return;
        setToday(cal.today);
        setDays(cal.days);
        setSelectedDate((prev) => {
          if (prev && cal.days.some((d) => d.date === prev)) return prev;
          return cal.today;
        });
      } catch (ex) {
        if (!cancelled) setErr(ex instanceof Error ? ex.message : "Could not load calendar");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [cursor.year, cursor.month, serviceType]);

  useEffect(() => {
    if (!selectedDate) return;
    let cancelled = false;
    (async () => {
      setSlotsLoading(true);
      try {
        const data = await publicApi<{ slots: DaySlot[]; nextAvailable: DaySlot | null }>(
          `/public/bookings/slots?date=${encodeURIComponent(selectedDate)}&serviceType=${encodeURIComponent(serviceType)}`
        );
        if (cancelled) return;
        setSlots(data.slots);
        setNextAvailable(data.nextAvailable);
        setSelectedSlot((prev) => {
          if (prev && data.slots.some((s) => s.startIso === prev.startIso && s.status === "available")) {
            return data.slots.find((s) => s.startIso === prev.startIso) ?? data.nextAvailable;
          }
          return data.nextAvailable;
        });
      } catch (ex) {
        if (!cancelled) setErr(ex instanceof Error ? ex.message : "Could not load slots");
      } finally {
        if (!cancelled) setSlotsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedDate, serviceType]);

  const openSlots = useMemo(() => slots.filter((s) => s.status === "available").length, [slots]);
  const visitMinutes = durationMinutesForService(serviceType);
  const visitLabel = durationLabelForService(serviceType);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!selectedSlot) {
      setErr("Please pick an available time slot");
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

      const result = await publicApi<{ message: string }>("/public/bookings", {
        method: "POST",
        body: JSON.stringify({
          serviceType,
          startsAt: selectedSlot.startIso,
          companyName,
          contactName,
          phone,
          email,
          notes: freightNotes,
          freight: {
            trailerNumber: trailerType || undefined,
            palletCount: palletCount ? Number(palletCount) : undefined,
            details: freightNotes,
          },
        }),
      });
      setMsg(result.message || "You’re booked — check your email for bay and gate instructions.");
      setDone(true);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "Booking failed");
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <main className="grid min-h-screen place-items-center px-4 py-10" style={{ background: "var(--gradient-warm), var(--bg)" }}>
        <div className="w-full max-w-md rounded-2xl border border-border bg-white p-6 text-center shadow-[var(--shadow-card)] sm:p-8">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-accent-bg text-accent">
            ✓
          </div>
          <div className="font-display text-2xl font-semibold text-navy">You’re booked.</div>
          <p className="mt-3 text-sm leading-relaxed text-muted">
            {msg ||
              "Your time slot is confirmed. You’ll get bay and gate instructions by email — usually right away."}
          </p>
          <a href="tel:+16232880077" className="mt-4 inline-block text-sm font-semibold text-accent">
            (623) 288-0077
          </a>
          <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
            <Button
              type="button"
              variant="secondary"
              className="w-full sm:w-auto"
              onClick={() => {
                setDone(false);
                setMsg("");
                window.location.reload();
              }}
            >
              Book another bay
            </Button>
            <a
              href="https://phoenixcrossdocks.com/"
              className="inline-flex w-full items-center justify-center rounded-[var(--radius)] border border-border px-4 py-2.5 text-sm font-semibold text-navy sm:w-auto"
            >
              Back to site
            </a>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen pb-[calc(5.5rem+env(safe-area-inset-bottom))] lg:pb-12" style={{ background: "var(--gradient-warm), var(--bg)" }}>
      <header className="sticky top-0 z-30 border-b border-border/70 bg-white/95 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <a href="https://phoenixcrossdocks.com/" className="flex min-w-0 items-center gap-2.5">
            <Image src="/logo.png" alt="" width={36} height={36} className="h-8 w-8 rounded-md object-contain sm:h-9 sm:w-9" />
            <span className="font-display truncate text-[11px] font-semibold tracking-wide text-navy uppercase sm:text-[13px]">
              Phoenix <span className="text-accent">Cross Dock</span>
            </span>
          </a>
          <div className="flex shrink-0 items-center gap-2">
            <a
              href="tel:+16232880077"
              className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-border bg-white px-2.5 text-xs font-semibold text-navy sm:px-3 sm:text-sm"
            >
              <Phone className="h-3.5 w-3.5 text-accent" />
              <span className="hidden sm:inline">(623) 288-0077</span>
              <span className="sm:hidden">Call</span>
            </a>
            <a
              href="https://phoenixcrossdocks.com/"
              className="hidden h-10 items-center rounded-xl border border-border px-3 text-xs font-semibold text-navy hover:bg-surface-2 sm:inline-flex"
            >
              Back to site
            </a>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-4 pt-4 sm:px-6 sm:pt-8">
        <p className="m-0 text-xs text-muted">
          <a href="https://phoenixcrossdocks.com/" className="hover:text-navy">
            Home
          </a>{" "}
          / Book a dock
        </p>

        <div className="mt-2 max-w-2xl sm:mt-3">
          <div className="flex items-center gap-2 text-[11px] font-semibold tracking-[0.14em] text-accent uppercase">
            <span className="inline-block h-4 w-0.5 rounded-full bg-accent" />
            Dock appointment
          </div>
          <h1 className="font-display mt-2.5 mb-0 text-[1.75rem] font-semibold leading-[1.15] tracking-tight text-navy sm:text-[2.35rem]">
            Book a bay.
          </h1>
          <p className="mt-2.5 mb-0 max-w-xl text-sm leading-relaxed text-muted sm:text-[15px]">
            Pick an open {visitLabel} slot between 8 AM and 6 PM. Your booking is confirmed when you
            submit.
          </p>
        </div>

        {/* Compact stats — one row on all sizes below lg */}
        <div className="mt-4 flex divide-x divide-border overflow-hidden rounded-xl border border-border bg-white shadow-[var(--shadow)] lg:hidden">
          <div className="min-w-0 flex-1 px-3 py-2.5 sm:px-4">
            <div className="text-[9px] font-bold tracking-wide text-accent uppercase sm:text-[10px]">Hours</div>
            <div className="mt-0.5 truncate text-xs font-semibold text-navy sm:text-sm">8 AM – 6 PM</div>
          </div>
          <div className="min-w-0 flex-1 px-3 py-2.5 sm:px-4">
            <div className="text-[9px] font-bold tracking-wide text-accent uppercase sm:text-[10px]">Open</div>
            <div className="mt-0.5 truncate text-xs font-semibold text-navy sm:text-sm">{openSlots} slots</div>
          </div>
          <div className="min-w-0 flex-1 px-3 py-2.5 sm:px-4">
            <div className="text-[9px] font-bold tracking-wide text-accent uppercase sm:text-[10px]">Where</div>
            <div className="mt-0.5 truncate text-xs font-semibold text-navy sm:text-sm">Clarendon #5</div>
          </div>
        </div>

        <div className="mt-5 grid items-start gap-5 lg:mt-6 lg:grid-cols-[minmax(0,1fr)_300px] lg:gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
          <form id="dock-book-form" onSubmit={onSubmit} className="space-y-4 sm:space-y-6">
            {err ? <Alert tone="danger">{err}</Alert> : null}

            <section className="rounded-2xl border border-border bg-white p-4 shadow-[var(--shadow)] transition duration-200 ease-out hover:-translate-y-0.5 hover:shadow-[var(--shadow-card)] sm:p-6">
              <StepHeading n={1} title="Who's booking" />
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Company" required>
                  <Input required value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
                </Field>
                <Field label="Contact name" required>
                  <Input required value={contactName} onChange={(e) => setContactName(e.target.value)} />
                </Field>
                <Field label="Email" required>
                  <Input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
                </Field>
                <Field label="Phone" required>
                  <Input required value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(623)" />
                </Field>
              </div>
              <div className="mt-4">
                <ChipGroup label="You are the" options={[...ROLE_OPTIONS]} value={role} onChange={setRole} />
              </div>
            </section>

            <section className="rounded-2xl border border-border bg-white p-4 shadow-[var(--shadow)] sm:p-6">
              <StepHeading n={2} title="The appointment" />
              <div className="space-y-4">
                <ChipGroup
                  label="Service needed *"
                  options={[...SERVICE_TYPE_OPTIONS]}
                  value={serviceType}
                  onChange={setServiceType}
                />
              </div>

              <div className="mt-5 sm:mt-6">
                <div className="mb-1 text-[11px] font-bold tracking-[0.07em] text-navy uppercase">
                  Requested date & time *
                </div>
                <p className="mb-3 mt-0 text-xs text-muted sm:mb-4">
                  {visitLabel} slots · {openSlots} open on selected day
                  {slotsLoading ? " · updating…" : ""}
                </p>
                <BookingDisclaimer className="mb-3 sm:mb-4" />

                {loading && !days.length ? (
                  <p className="text-sm text-muted">Loading calendar…</p>
                ) : (
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:gap-5">
                    <div className="mx-auto w-full max-w-[340px] shrink-0 lg:mx-0 lg:w-[340px]">
                      <BookingMonthCalendar
                        year={cursor.year}
                        month={cursor.month}
                        today={today}
                        selectedDate={selectedDate}
                        days={days}
                        onSelectDate={setSelectedDate}
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
                        slotMinutes={visitMinutes}
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
                )}
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
                  <Input value={origin} onChange={(e) => setOrigin(e.target.value)} placeholder="e.g. Ontario, CA" />
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
              <p className="mt-3 mb-3 text-xs leading-relaxed text-muted">
                Submitting books your time slot. You’ll get bay and gate instructions by email.
              </p>
              <label className="mb-2 flex gap-2.5 text-xs leading-relaxed text-muted">
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 shrink-0"
                  checked={smsAlerts}
                  onChange={(e) => setSmsAlerts(e.target.checked)}
                />
                <span>
                  SMS alerts for account / verification. Msg &amp; data rates may apply. Reply STOP to opt out.
                </span>
              </label>
              <label className="flex gap-2.5 text-xs leading-relaxed text-muted">
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 shrink-0"
                  checked={smsPromo}
                  onChange={(e) => setSmsPromo(e.target.checked)}
                />
                <span>Promotional SMS about dock availability. Msg &amp; data rates may apply.</span>
              </label>

              <div className="mt-6 hidden lg:block">
                <Button type="submit" loading={busy} disabled={!selectedSlot} className="w-full sm:w-auto">
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
      </div>

      {/* Sticky mobile / tablet CTA */}
      <div
        className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-white/95 p-3 backdrop-blur-md lg:hidden"
        style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
      >
        <div className="mx-auto flex max-w-6xl items-center gap-3">
          <div className="min-w-0 flex-1 text-xs text-muted">
            {selectedSlot ? (
              <>
                <span className="block truncate font-semibold text-navy">
                  {selectedDate} · {selectedSlot.label}
                </span>
                <span>{visitLabel} dock slot</span>
              </>
            ) : (
              <span>Select an open time above</span>
            )}
          </div>
          <Button
            type="submit"
            form="dock-book-form"
            loading={busy}
            disabled={!selectedSlot}
            className="shrink-0"
          >
            Submit →
          </Button>
        </div>
      </div>
    </main>
  );
}
