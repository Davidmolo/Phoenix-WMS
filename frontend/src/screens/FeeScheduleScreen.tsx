"use client";

import { FormEvent, useEffect, useState } from "react";
import { Pencil, Receipt, Save } from "lucide-react";
import {
  Alert,
  Button,
  Card,
  CardBody,
  NumberInput,
  PageHeader,
  SkeletonTable,
} from "@/components/ui";
import { api } from "@/lib/api";
import { useApiQuery, invalidateApiCache } from "@/hooks/useApiQuery";
import { useAuth } from "@/lib/auth";
import { money } from "@/lib/format";

type FeeSchedule = Record<string, number | string | null | undefined>;

const RATE_ROWS: Array<{ key: string; label: string; hint?: string; money?: boolean }> = [
  { key: "crossDockPerPallet", label: "Cross-dock per pallet", hint: "Dry · includes free dwell", money: true },
  { key: "crossDockFreeDwellHours", label: "Free dwell (hours)" },
  { key: "afterFreeDwellPerPalletDay", label: "Dwell after free period (/pallet/day)", money: true },
  { key: "crossDockPerTrailer", label: "Per-trailer simple transfer", money: true },
  { key: "crossDockMinimum", label: "Appointment / minimum", money: true },
  { key: "unloadLoadMinimum", label: "Unload/load minimum (one direction)", money: true },
  { key: "unloadLoadPerPallet", label: "Unload/load per pallet", money: true },
  { key: "unloadLoadPerTrailer", label: "Unload/load per trailer cap", money: true },
  { key: "floorStoragePerPalletMo", label: "Floor storage (/pallet/mo)", money: true },
  { key: "rackStoragePerPalletMo", label: "Rack storage (/pallet/mo)", money: true },
  {
    key: "parcelStoragePerBoxDay",
    label: "Parcel storage (/box/day)",
    hint: "Billed for each day the box is in the building, when it ships. Default $0.05.",
    money: true,
  },
  { key: "parcelReceivePerBox", label: "Parcel receiving (/box)", hint: "Default $0.75", money: true },
  { key: "parcelOutboundPerBox", label: "Parcel outbound (/box)", hint: "Default $0.50", money: true },
  {
    key: "parcelOversizePerPalletDay",
    label: "Oversize parcel (/pallet position/day)",
    hint: "A box that takes a full pallet spot. Default $1.65.",
    money: true,
  },
  { key: "handStackPerHour", label: "Hand-stack (/hr)", money: true },
  {
    key: "sortRelabelPerHour",
    label: "Trailer rework / sort-relabel (/hr)",
    hint: "Cesar: $65/hr",
    money: true,
  },
  {
    key: "trailerReworkMinimumHours",
    label: "Trailer rework minimum (hours)",
    hint: "Billed hours never go below this (default 1)",
  },
  { key: "sortRelabelPerCase", label: "Sort / relabel (/case)", money: true },
  { key: "afterHoursSurchargePct", label: "After-hours surcharge (%)" },
  { key: "noShowFee", label: "No-show fee", money: true },
  { key: "detentionPerHour", label: "Detention (/hr)", money: true },
  { key: "detentionFreeHours", label: "Detention free hours" },
];

export default function FeeSchedulePage() {
  const { user, token } = useAuth();
  const isAdmin = user?.role === "admin";
  const { data, error, loading, reload } = useApiQuery<{
    companyName: string;
    feeSchedule: FeeSchedule | null;
    source?: string;
  }>("/company/fee-schedule");

  const fs = data?.feeSchedule;

  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!fs || editing) return;
    const next: Record<string, string> = {};
    for (const row of RATE_ROWS) {
      const raw = fs[row.key];
      next[row.key] = raw == null ? "" : String(raw);
    }
    setForm(next);
  }, [fs, editing]);

  function beginEdit() {
    if (!fs) return;
    const next: Record<string, string> = {};
    for (const row of RATE_ROWS) {
      const raw = fs[row.key];
      next[row.key] = raw == null ? "" : String(raw);
    }
    setForm(next);
    setEditing(true);
    setMsg("");
    setErr("");
  }

  function cancelEdit() {
    setEditing(false);
    setErr("");
  }

  async function runContractBilling() {
    if (!token) return;
    setBusy(true);
    setErr("");
    setMsg("");
    try {
      const result = await api<{ created?: number; period?: string }>("/contract-monthly/run", {
        method: "POST",
        token,
      });
      setMsg(
        `Contract invoices for ${result.period || "this month"}: ${result.created ?? 0} created. The same job runs automatically on the 1st (Net 30).`
      );
      invalidateApiCache();
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "Could not run contract billing");
    } finally {
      setBusy(false);
    }
  }

  async function onSave(e: FormEvent) {
    e.preventDefault();
    if (!token) return;
    setBusy(true);
    setErr("");
    setMsg("");
    try {
      const payload: Record<string, number> = {};
      for (const row of RATE_ROWS) {
        const raw = form[row.key];
        if (raw === undefined || raw.trim() === "") continue;
        const n = Number(raw);
        if (Number.isFinite(n)) payload[row.key] = n;
      }
      await api("/company/fee-schedule", {
        method: "PATCH",
        token,
        body: JSON.stringify(payload),
      });
      setMsg("Fee schedule saved");
      setEditing(false);
      invalidateApiCache("/company/fee-schedule");
      await reload();
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
        <PageHeader
          title="Fee Schedule"
          icon={<Receipt className="h-5 w-5" />}
          description={
            data?.companyName
              ? `${data.companyName} — fallback rates when customer unload/load is blank. Cadence: Pallet = BOL close (in/out); Crossdock/Rework job = instant; Contract = monthly.`
              : "Company published rate card"
          }
          actions={
            isAdmin && fs ? (
              editing ? (
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="secondary" onClick={cancelEdit} disabled={busy}>
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    form="fee-schedule-form"
                    loading={busy}
                    icon={<Save className="h-4 w-4" />}
                  >
                    Save
                  </Button>
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="secondary" loading={busy} onClick={() => void runContractBilling()}>
                    Run contract billing
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={beginEdit}
                    icon={<Pencil className="h-4 w-4" />}
                  >
                    Edit rates
                  </Button>
                </div>
              )
            ) : undefined
          }
        />

        {error ? (
          <Alert>
            {error}. If you reseeded the database, sign out and sign in again so your session picks up
            the new company.
          </Alert>
        ) : null}
        {msg ? <Alert tone="success">{msg}</Alert> : null}
        {err ? <Alert>{err}</Alert> : null}

        <Alert tone="info">
          Contract accounts recur on the 1st of each month, Net 30 (idempotent — running it again this month will not double-bill). Crossdock and Rework invoice when the job ends. Pallet storage still bills with the BOL, not on a calendar.
          {data?.source ? (
            <>
              {" "}
              <span className="font-semibold">Source:</span> {data.source}
            </>
          ) : null}
        </Alert>

        {loading ? (
          <SkeletonTable cols={2} rows={8} />
        ) : !fs ? (
          <Alert>No fee schedule on file for this company.</Alert>
        ) : (
          <Card>
            <CardBody className="overflow-hidden p-0">
              <form id="fee-schedule-form" onSubmit={onSave}>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[520px] border-collapse text-[13.5px]">
                    <thead>
                      <tr className="bg-surface-2 text-left">
                        <th className="px-4 py-3 text-xs font-semibold tracking-wide text-muted uppercase">
                          Rate
                        </th>
                        <th className="w-36 px-4 py-3 text-right text-xs font-semibold tracking-wide text-muted uppercase sm:w-44">
                          Value
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {RATE_ROWS.map((row) => {
                        const raw = fs[row.key];
                        const display =
                          raw == null || raw === ""
                            ? "—"
                            : row.money
                              ? money(Number(raw))
                              : String(raw);
                        return (
                          <tr key={row.key} className="border-t border-border">
                            <td className="px-4 py-3.5">
                              <div className="font-semibold text-text">{row.label}</div>
                              {row.hint ? (
                                <div className="mt-0.5 text-xs text-muted">{row.hint}</div>
                              ) : null}
                            </td>
                            <td className="px-4 py-3.5 text-right font-semibold tabular-nums text-text">
                              {editing ? (
                                <NumberInput
                                  className="text-right"
                                  value={form[row.key] ?? ""}
                                  onValueChange={(v) =>
                                    setForm((f) => ({ ...f, [row.key]: v }))
                                  }
                                />
                              ) : (
                                display
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </form>
              {fs.notes ? (
                <div className="border-t border-border bg-surface-2 px-4 py-3 text-xs leading-relaxed text-muted">
                  {String(fs.notes)}
                </div>
              ) : null}
            </CardBody>
          </Card>
        )}
    </>
  );
}
