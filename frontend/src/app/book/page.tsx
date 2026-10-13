"use client";

import { FormEvent, useState } from "react";
import Image from "next/image";
import { Phone } from "lucide-react";
import { Alert, Button, Field, Input, Select } from "@/components/ui";

const API_BASE = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api").replace(/\/$/, "");

async function publicApi<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path.startsWith("/") ? path : `/${path}`}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options?.headers || {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error || `Request failed (${res.status})`);
  return data as T;
}

/**
 * Cesar/Darya Oct 12: public dock booking is OFF until the warehouse is ready.
 * This page is Request for information — emails Cesar; no confirmed slot.
 */
export default function PublicBookPage() {
  const [companyName, setCompanyName] = useState("");
  const [contactName, setContactName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [serviceInterest, setServiceInterest] = useState("crossdock");
  const [palletCount, setPalletCount] = useState("");
  const [origin, setOrigin] = useState("");
  const [destination, setDestination] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [done, setDone] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    setMsg("");
    try {
      const result = await publicApi<{ message: string }>("/public/bookings/inquiry", {
        method: "POST",
        body: JSON.stringify({
          companyName,
          contactName,
          phone,
          email,
          serviceInterest,
          palletCount: palletCount === "" ? null : Number(palletCount),
          origin,
          destination,
          message,
        }),
      });
      setDone(true);
      setMsg(result.message || "Thanks — we’ll be in touch.");
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "Could not send request");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-[linear-gradient(165deg,#f7f4ef_0%,#eef2f7_45%,#f7f4ef_100%)]">
      <header className="border-b border-border/80 bg-white/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-2.5">
            <Image src="/logo.png" alt="" width={40} height={40} className="h-9 w-9 object-contain" />
            <div className="leading-tight">
              <div className="font-display text-[12px] font-semibold tracking-[0.06em] text-navy uppercase">
                Phoenix <span className="text-accent">Cross Dock</span>
              </div>
              <div className="text-[10px] font-semibold tracking-wide text-muted uppercase">
                Request for information
              </div>
            </div>
          </div>
          <a
            href="tel:+16025550100"
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-white px-3 py-1.5 text-[12px] font-semibold text-navy"
          >
            <Phone className="h-3.5 w-3.5" />
            Call us
          </a>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
        {done ? (
          <div className="rounded-[var(--radius)] border border-border bg-white p-6 shadow-[var(--shadow-card)] sm:p-8">
            <div className="font-display text-2xl font-semibold text-navy">Request received.</div>
            <p className="mt-2 text-sm text-muted">
              {msg ||
                "Thanks — Cesar or the team will follow up by phone or email. Online dock booking will open when the warehouse is ready."}
            </p>
            <p className="mt-4 text-sm text-muted">
              Prefer to talk now? Call and leave a message — we return every call.
            </p>
          </div>
        ) : (
          <>
            <div className="mb-6">
              <h1 className="font-display m-0 text-2xl font-semibold tracking-tight text-navy sm:text-3xl">
                Tell us about your freight
              </h1>
              <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted">
                Online dock booking is temporarily paused while we finalize the warehouse. Send a
                request and we’ll call or email you — no confirmed appointment is created from this
                form.
              </p>
            </div>

            <Alert>{err}</Alert>
            {msg ? <Alert tone="success">{msg}</Alert> : null}

            <form
              onSubmit={onSubmit}
              className="space-y-4 rounded-[var(--radius)] border border-border bg-white p-5 shadow-[var(--shadow-card)] sm:p-6"
            >
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Company" required>
                  <Input
                    required
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    placeholder="Company name"
                  />
                </Field>
                <Field label="Your name" required>
                  <Input
                    required
                    value={contactName}
                    onChange={(e) => setContactName(e.target.value)}
                    placeholder="Contact name"
                  />
                </Field>
                <Field label="Phone" required>
                  <Input
                    required
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="Best number to reach you"
                  />
                </Field>
                <Field label="Email" required>
                  <Input
                    required
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@company.com"
                  />
                </Field>
                <Field label="Service interest">
                  <Select
                    value={serviceInterest}
                    onChange={(e) => setServiceInterest(e.target.value)}
                  >
                    <option value="crossdock">Crossdock</option>
                    <option value="drop_and_store">Drop and Store</option>
                    <option value="trailer_rework">Trailer Rework</option>
                    <option value="pickup">Pick-up</option>
                    <option value="other">Other / not sure</option>
                  </Select>
                </Field>
                <Field label="Approx. pallets" hint="Helps us plan — estimate is fine.">
                  <Input
                    inputMode="numeric"
                    value={palletCount}
                    onChange={(e) => setPalletCount(e.target.value.replace(/[^\d]/g, ""))}
                    placeholder="e.g. 10"
                  />
                </Field>
                <Field label="Origin">
                  <Input
                    value={origin}
                    onChange={(e) => setOrigin(e.target.value)}
                    placeholder="City / region"
                  />
                </Field>
                <Field label="Destination">
                  <Input
                    value={destination}
                    onChange={(e) => setDestination(e.target.value)}
                    placeholder="City / region"
                  />
                </Field>
              </div>
              <Field label="Message">
                <Input
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Timing, equipment, hazmat questions, etc."
                />
              </Field>
              <Button type="submit" loading={busy} disabled={!companyName || !contactName || !phone || !email}>
                Send request
              </Button>
            </form>
          </>
        )}
      </main>
    </div>
  );
}
