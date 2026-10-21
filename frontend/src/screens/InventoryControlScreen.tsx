"use client";

import { FormEvent, useState } from "react";
import { ClipboardCheck } from "lucide-react";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  CardTitle,
  Field,
  FormSection,
  Input,
  PageHeader,
  SkeletonPage,
} from "@/components/ui";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useApiQuery, invalidateApiCache } from "@/hooks/useApiQuery";
import { dateLabel } from "@/lib/format";

type CountPallet = {
  _id: string;
  externalId: string;
  status: string;
  locationCode?: string;
  description?: string;
  lastCountedAt?: string | null;
  countFlag?: string;
  countFlagNote?: string;
  customerId?: string | { name?: string };
};

type CountRecord = {
  _id: string;
  externalId: string;
  countedAt: string;
  countedByEmail?: string;
  systemLocation?: string;
  physicalLocation?: string;
  result: string;
  trigger: string;
  adjustmentNote?: string;
};

type Dashboard = {
  cadenceDays: number;
  summary: { due: number; moved: number; storeOverrides: number; discrepancies: number };
  due: CountPallet[];
  moved: CountPallet[];
  storeOverrides: CountPallet[];
  discrepancies: CountPallet[];
  recent: CountRecord[];
};

function customerName(p: CountPallet) {
  if (p.customerId && typeof p.customerId === "object") return p.customerId.name || "—";
  return "—";
}

function FlagList({ title, rows, empty }: { title: string; rows: CountPallet[]; empty: string }) {
  return (
    <Card>
      <CardBody>
        <CardTitle>
          {title} ({rows.length})
        </CardTitle>
        {rows.length === 0 ? (
          <p className="mt-2 mb-0 text-sm text-muted">{empty}</p>
        ) : (
          <ul className="mt-3 mb-0 space-y-2 p-0">
            {rows.slice(0, 12).map((p) => (
              <li key={p._id} className="list-none text-sm">
                <span className="font-mono font-semibold text-navy">{p.externalId}</span>
                <span className="text-muted">
                  {" "}
                  · {customerName(p)} · {p.locationCode || "no location"}
                  {p.lastCountedAt ? ` · counted ${dateLabel(p.lastCountedAt)}` : " · never counted"}
                </span>
                {p.countFlagNote ? <div className="text-xs text-muted">{p.countFlagNote}</div> : null}
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}

export default function InventoryControlScreen() {
  const { token } = useAuth();
  const { data, error, loading, reload } = useApiQuery<Dashboard>("/cycle-counts/dashboard");
  const [palletCode, setPalletCode] = useState("");
  const [physicalLocation, setPhysicalLocation] = useState("");
  const [adjustmentNote, setAdjustmentNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [formErr, setFormErr] = useState("");

  async function onCount(e: FormEvent) {
    e.preventDefault();
    if (!token) return;
    setBusy(true);
    setFormErr("");
    setMessage("");
    try {
      const result = await api<{ message: string }>("/cycle-counts", {
        method: "POST",
        token,
        body: JSON.stringify({
          palletCode: palletCode.trim(),
          physicalLocation: physicalLocation.trim(),
          adjustmentNote: adjustmentNote.trim(),
        }),
      });
      setMessage(result.message || "Count recorded");
      setPalletCode("");
      setPhysicalLocation("");
      setAdjustmentNote("");
      invalidateApiCache();
      await reload();
    } catch (err) {
      setFormErr(err instanceof Error ? err.message : "Could not record the count");
    } finally {
      setBusy(false);
    }
  }

  if (loading && !data) return <SkeletonPage variant="table" />;

  const summary = data?.summary;

  return (
    <>
      <PageHeader
        title="Inventory control"
        icon={<ClipboardCheck className="h-5 w-5" />}
        description={
          data
            ? `Cycle count every ${data.cadenceDays} days. Moves and putaway overrides are flagged until someone counts them.`
            : "Cycle counts"
        }
      />
      <Alert>{error || formErr}</Alert>
      {message ? <Alert tone="success">{message}</Alert> : null}

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Due for count" value={summary?.due} />
        <Stat label="Moved" value={summary?.moved} />
        <Stat label="Putaway override" value={summary?.storeOverrides} />
        <Stat label="Open discrepancies" value={summary?.discrepancies} />
      </div>

      <FormSection
        title="Record a count"
        description="Scan the pallet, then scan the location it is physically in. If they differ, write what you changed."
        icon={<ClipboardCheck className="h-4 w-4" />}
        className="mb-4"
      >
        <form onSubmit={onCount} className="grid gap-4 sm:grid-cols-2">
          <Field label="Pallet" required>
            <Input value={palletCode} onChange={(e) => setPalletCode(e.target.value)} required />
          </Field>
          <Field label="Physical location" required hint="Example A1A-1">
            <Input
              value={physicalLocation}
              onChange={(e) => setPhysicalLocation(e.target.value)}
              required
            />
          </Field>
          <Field label="Adjustment note" hint="Required only when the physical location does not match the system.">
            <Input value={adjustmentNote} onChange={(e) => setAdjustmentNote(e.target.value)} />
          </Field>
          <div className="flex items-end">
            <Button type="submit" loading={busy}>
              Confirm count
            </Button>
          </div>
        </form>
      </FormSection>

      <div className="grid gap-4 lg:grid-cols-2">
        <FlagList title="Due" rows={data?.due ?? []} empty="Nothing is past the cycle-count date." />
        <FlagList title="Moved since last count" rows={data?.moved ?? []} empty="No moves waiting on a count." />
        <FlagList
          title="Stored in a different slot"
          rows={data?.storeOverrides ?? []}
          empty="No putaway overrides waiting on a count."
        />
        <Card>
          <CardBody>
            <CardTitle>Recent counts</CardTitle>
            {(data?.recent ?? []).length === 0 ? (
              <p className="mt-2 mb-0 text-sm text-muted">No counts recorded yet.</p>
            ) : (
              <ul className="mt-3 mb-0 space-y-2 p-0">
                {data?.recent.map((row) => (
                  <li key={row._id} className="list-none text-sm">
                    <span className="font-mono font-semibold text-navy">{row.externalId}</span>{" "}
                    <Badge tone={row.result === "match" ? "success" : "danger"}>{row.result}</Badge>
                    <span className="text-muted">
                      {" "}
                      · {row.systemLocation || "—"} → {row.physicalLocation || "—"} · {dateLabel(row.countedAt)}
                    </span>
                    {row.adjustmentNote ? <div className="text-xs text-muted">{row.adjustmentNote}</div> : null}
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>
    </>
  );
}

function Stat({ label, value }: { label: string; value?: number }) {
  return (
    <Card>
      <CardBody>
        <div className="text-[11px] font-semibold tracking-wide text-muted uppercase">{label}</div>
        <div className="mt-1 text-2xl font-bold tabular-nums">{value ?? "—"}</div>
      </CardBody>
    </Card>
  );
}
