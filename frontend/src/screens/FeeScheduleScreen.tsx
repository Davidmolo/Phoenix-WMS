"use client";

import { Receipt } from "lucide-react";
import {
  Alert,
  Card,
  CardBody,
  PageHeader,
  SkeletonTable,
} from "@/components/ui";
import { useApiQuery } from "@/hooks/useApiQuery";
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
  { key: "handStackPerHour", label: "Hand-stack (/hr)", money: true },
  { key: "sortRelabelPerHour", label: "Sort / relabel (/hr)", money: true },
  { key: "sortRelabelPerCase", label: "Sort / relabel (/case)", money: true },
  { key: "afterHoursSurchargePct", label: "After-hours surcharge (%)" },
  { key: "noShowFee", label: "No-show fee", money: true },
  { key: "detentionPerHour", label: "Detention (/hr)", money: true },
  { key: "detentionFreeHours", label: "Detention free hours" },
];

export default function FeeSchedulePage() {
  const { data, error, loading } = useApiQuery<{
    companyName: string;
    feeSchedule: FeeSchedule | null;
    source?: string;
  }>("/company/fee-schedule");

  const fs = data?.feeSchedule;

  return (
    <>
        <PageHeader
          title="Fee Schedule"
          icon={<Receipt className="h-5 w-5" />}
          description={
            data?.companyName
              ? `${data.companyName} published rates — ad hoc / overflow (non-contract)`
              : "Company published rate card"
          }
        />

        {error ? (
          <Alert>
            {error}. If you reseeded the database, sign out and sign in again so your session picks up
            the new company.
          </Alert>
        ) : null}

        <Alert tone="info">
          Contract customers bill from their signed agreement (base rent, handling, FTL). Overflow
          outside dedicated contract square footage uses this company fee schedule.
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
                            {display}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
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
