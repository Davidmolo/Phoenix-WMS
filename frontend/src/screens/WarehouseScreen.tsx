"use client";

import { useEffect, useMemo, useState } from "react";
import { Warehouse as WarehouseIcon } from "lucide-react";
import {
  Alert,
  Button,
  Card,
  CardBody,
  CardTitle,
  Field,
  FormGrid,
  Input,
  PageHeader,
  Select,
  SkeletonPage,
} from "@/components/ui";
import { api } from "@/lib/api";
import { useApiQuery, invalidateApiCache } from "@/hooks/useApiQuery";
import { useAuth } from "@/lib/auth";
import type { Location, Warehouse } from "@/types";

const LANES = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

type SetupResponse = {
  warehouses: Warehouse[];
  warehouseId: string | null;
  locations: Location[];
  mapLayout?: { rows: number; cols: number };
  summary: {
    total: number;
    occupied: number;
    available: number;
    capacitySqft?: number;
    occupiedSqft?: number;
    availableSqft?: number;
  };
};

function laneIndex(letter: string) {
  const i = letter.toUpperCase().charCodeAt(0) - 65;
  return i >= 0 && i < 26 ? i : 0;
}

function codesFor(lane: string, levels: number, spotB: boolean) {
  const out: string[] = [];
  for (let level = 1; level <= levels; level++) {
    out.push(`${lane}${level}A`);
    if (spotB) out.push(`${lane}${level}B`);
  }
  return out;
}

export default function WarehousePage() {
  const { token } = useAuth();
  const { data, error, loading, reload } = useApiQuery<SetupResponse>("/locations/warehouse-setup");

  const warehouse =
    data?.warehouses?.find((w) => w._id === data.warehouseId) || data?.warehouses?.[0];

  const [lane, setLane] = useState("A");
  const [levels, setLevels] = useState("1");
  const [spotB, setSpotB] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  const locations = data?.locations ?? [];

  useEffect(() => {
    const here = locations.filter((l) => (l.aisle || "A") === lane || l.row === laneIndex(lane));
    if (!here.length) {
      setLevels("1");
      setSpotB(false);
      return;
    }
    setLevels(String(Math.min(5, Math.max(1, ...here.map((l) => l.level || 1)))));
    setSpotB(here.some((l) => (l.spot || 1) === 2));
  }, [lane, data]);

  const levelCount = Math.min(5, Math.max(1, Number(levels) || 1));
  const preview = codesFor(lane, levelCount, spotB);

  const rows = useMemo(() => {
    return [...locations].sort((a, b) => {
      const laneCmp = (a.aisle || "").localeCompare(b.aisle || "");
      if (laneCmp) return laneCmp;
      if ((a.level || 1) !== (b.level || 1)) return (a.level || 1) - (b.level || 1);
      return (a.spot || 1) - (b.spot || 1);
    });
  }, [locations]);

  async function saveLane() {
    if (!token || !warehouse) return;
    setBusy(true);
    setErr("");
    setMsg("");
    try {
      const result = await api<{ heldElsewhere?: string[] }>("/locations/stack", {
        method: "PUT",
        token,
        body: JSON.stringify({
          warehouseId: warehouse._id,
          row: laneIndex(lane),
          col: 0,
          levels: levelCount,
          spots: spotB ? ["A", "B"] : ["A"],
        }),
      });
      const held = result.heldElsewhere?.length
        ? ` Occupied positions still on the old grid: ${result.heldElsewhere.join(", ")}.`
        : "";
      setMsg(`Lane ${lane} saved as ${preview.join(", ")}.${held}`);
      invalidateApiCache();
      await reload();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not save lane");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return <SkeletonPage variant="table" />;
  }

  return (
    <>
      <PageHeader
        title="Warehouse setup"
        icon={<WarehouseIcon className="h-5 w-5" />}
        description={
          warehouse
            ? `${warehouse.name} · ${warehouse.sqft?.toLocaleString() ?? "—"} SF · each slot is Lane × Level × Spot`
            : "Lane, level, and spot"
        }
      />
      <Alert>{error || err}</Alert>
      {msg ? <Alert tone="info">{msg}</Alert> : null}

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-[repeat(auto-fit,minmax(140px,1fr))]">
        <Stat label="Total slots" value={data?.summary.total} />
        <Stat label="Occupied slots" value={data?.summary.occupied} />
        <Stat label="Open slots" value={data?.summary.available} />
        <Stat label="Capacity SF" value={data?.summary.capacitySqft} />
        <Stat label="Occupied SF" value={data?.summary.occupiedSqft} />
        <Stat label="Available SF" value={data?.summary.availableSqft} />
      </div>

      <Card className="mb-4">
        <CardBody>
          <CardTitle>Lane structure</CardTitle>
          <p className="mt-1 mb-3 text-xs text-muted">
            A slot is a lane (A–Z), a level (1–5), and a spot (A or B on that level). A1A is lane A,
            level 1, spot A. Saving a lane replaces the flat numbered grid for that lane.
          </p>
          <FormGrid cols={3}>
            <Field label="Lane">
              <Select value={lane} onChange={(e) => setLane(e.target.value)}>
                {LANES.map((letter) => (
                  <option key={letter} value={letter}>
                    Lane {letter}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Levels">
              <Input
                type="number"
                min={1}
                max={5}
                value={levels}
                onChange={(e) => setLevels(e.target.value)}
              />
            </Field>
            <Field label="Spots">
              <label className="flex h-[34px] items-center gap-2 text-sm text-navy">
                <input type="checkbox" checked disabled />
                A
                <input
                  type="checkbox"
                  className="ml-3"
                  checked={spotB}
                  onChange={(e) => setSpotB(e.target.checked)}
                />
                B
              </label>
            </Field>
          </FormGrid>
          <p className="mt-3 mb-3 font-mono text-sm text-navy">{preview.join("  ·  ")}</p>
          <Button type="button" loading={busy} onClick={() => void saveLane()}>
            Save lane {lane}
          </Button>
        </CardBody>
      </Card>

      <Card lift={false}>
        <CardBody>
          <CardTitle>Locations</CardTitle>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[520px] border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-border text-[10px] font-semibold tracking-wide text-muted uppercase">
                  <th className="py-1.5 pr-3">Code</th>
                  <th className="py-1.5 pr-3">Lane</th>
                  <th className="py-1.5 pr-3">Level</th>
                  <th className="py-1.5 pr-3">Spot</th>
                  <th className="py-1.5">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((loc) => (
                  <tr key={loc._id} className="border-b border-border/60">
                    <td className="py-1.5 pr-3 font-mono font-semibold text-navy">{loc.code}</td>
                    <td className="py-1.5 pr-3">{loc.aisle || "—"}</td>
                    <td className="py-1.5 pr-3">{loc.level ?? 1}</td>
                    <td className="py-1.5 pr-3">{(loc.spot || 1) === 2 ? "B" : "A"}</td>
                    <td className="py-1.5">{loc.palletId ? "Occupied" : "Open"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardBody>
      </Card>
    </>
  );
}

function Stat({ label, value }: { label: string; value?: number }) {
  return (
    <Card>
      <CardBody>
        <div className="text-[11px] font-semibold tracking-wide text-muted uppercase">{label}</div>
        <div className="mt-1 text-2xl font-bold tabular-nums">
          {value != null ? value.toLocaleString() : "—"}
        </div>
      </CardBody>
    </Card>
  );
}
