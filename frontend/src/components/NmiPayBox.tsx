"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { mountNmiPayments } from "@nmipayments/nmi-pay";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Alert } from "@/components/ui";

type Config = { ready: boolean; tokenizationKey: string; sandbox: boolean };

const paymentMethods: Array<"card" | "ach"> = ["card", "ach"];

export type PayRow = { label: string; value: string; emphasize?: boolean };

export function usd(amount: number) {
  return amount.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

export default function NmiPayBox({
  amount,
  rows,
  note,
  invoiceIds,
  bookingBody,
  onPaid,
}: {
  amount: number;
  rows: PayRow[];
  note: string;
  invoiceIds?: string[];
  bookingBody?: Record<string, unknown>;
  onPaid: (message: string) => void;
}) {
  const { token } = useAuth();
  const [config, setConfig] = useState<Config | null>(null);
  const [err, setErr] = useState("");
  const due = usd(amount);
  const onPaidRef = useRef(onPaid);
  onPaidRef.current = onPaid;
  const hostRef = useRef<HTMLDivElement>(null);
  const payRef = useRef<(event: { token: string }) => Promise<true | string>>(async () => "Payment is still loading.");
  const pay = useCallback(
    async (event: { token: string }) => {
      if (!token) return "Sign in again before paying.";
      setErr("");
      try {
        if (bookingBody) {
          const result = await api<{ quote?: { balanceLater?: number } }>("/payments/booking", {
            method: "POST",
            token,
            body: JSON.stringify({ ...bookingBody, paymentToken: event.token }),
          });
          const left = Number(result.quote?.balanceLater || 0);
          onPaidRef.current(
            left
              ? `Booking confirmed. ${due} was paid. ${usd(left)} is still due at the dock or on the invoice.`
              : "Booking confirmed."
          );
          return true;
        }
        const result = await api<{ amount: number }>("/payments/invoices", {
          method: "POST",
          token,
          body: JSON.stringify({ invoiceIds, paymentToken: event.token }),
        });
        onPaidRef.current(`Paid ${usd(result.amount)} in full. Those invoices are closed.`);
        return true;
      } catch (ex) {
        const message = ex instanceof Error ? ex.message : "Payment failed";
        setErr(message);
        return message;
      }
    },
    [token, bookingBody, invoiceIds, due]
  );
  payRef.current = pay;

  useEffect(() => {
    const host = hostRef.current;
    if (!host || !config?.ready || !config.tokenizationKey) return;
    const widget = mountNmiPayments(host, {
      tokenizationKey: config.tokenizationKey,
      layout: "multiLine",
      paymentMethods,
      expressCheckoutConfig: { amount: amount.toFixed(2), currency: "USD" },
      payButtonText: `Pay ${due} now`,
      onPay: (event) => payRef.current(event),
    });
    return () => widget.destroy();
  }, [amount, config?.ready, config?.tokenizationKey, due]);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    api<Config>("/payments/config", { token })
      .then((row) => {
        if (!cancelled) setConfig(row);
      })
      .catch((ex) => {
        if (!cancelled) setErr(ex instanceof Error ? ex.message : "Payment is not available");
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  return (
    <div className="rounded-2xl border border-border bg-white p-4 shadow-[var(--shadow)] sm:p-6">
      <h2 className="font-display m-0 text-[13px] font-semibold tracking-[0.1em] text-navy uppercase">
        Amount due
      </h2>
      <dl className="mt-4 mb-0 divide-y divide-border">
        {rows.map((row) => (
          <div key={row.label} className="flex items-baseline justify-between gap-4 py-2.5">
            <dt className={`m-0 text-sm ${row.emphasize ? "font-semibold text-navy" : "text-muted"}`}>
              {row.label}
            </dt>
            <dd className={`m-0 text-sm ${row.emphasize ? "text-lg font-bold text-navy" : "font-medium text-navy"}`}>
              {row.value}
            </dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 mb-4 text-sm leading-relaxed text-muted">{note}</p>
      {err ? (
        <Alert tone="danger" className="mb-4">
          {err}
        </Alert>
      ) : null}
      {!config ? <p className="m-0 text-sm text-muted">Loading the card form…</p> : null}
      {config && (!config.ready || !config.tokenizationKey) ? (
        <Alert>Card and bank payments are not configured on this server yet.</Alert>
      ) : null}
      <div ref={hostRef} className={config?.ready && config.tokenizationKey ? "" : "hidden"} />
      {config?.sandbox ? (
        <p className="mt-3 mb-0 text-xs text-muted">Sandbox only. This card is not charged real money.</p>
      ) : null}
    </div>
  );
}
