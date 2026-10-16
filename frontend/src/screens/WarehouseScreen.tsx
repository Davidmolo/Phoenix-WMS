"use client";

import { useMemo, useState } from "react";
import { Warehouse as WarehouseIcon } from "lucide-react";
import {
  Alert,
  Card,
  CardBody,
  CardTitle,
  PageHeader,
  SkeletonPage,
} from "@/components/ui";
import { useApiQuery } from "@/hooks/useApiQuery";
import { cn } from "@/lib/cn";
import type { Location, Warehouse } from "@/types";

const LANES = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
const COLUMNS = Array.from({ length: 20 }, (_, i) => i + 1);
const LEVELS = [5, 4, 3, 2, 1];

type SetupResponse = {
  warehouses: Warehouse[];
  warehouseId: string | null;
  locations: Location[];
  summary: {
    total: number;
    occupied: number;
    available: number;
    capacitySqft?: number;
    occupiedSqft?: number;
    availableSqft?: number;
  };
};

function bayCode(lane: string, column: number, level: number, spot: "A" | "B") {
  return `${lane}${String(column).padStart(2, "0")}-${level}${spot}`;
}

export default function WarehousePage() {
  const { data, error, loading } = useApiQuery<SetupResponse>("/locations/warehouse-setup");
  const [lane, setLane] = useState("A");
  const [selected, setSelected] = useState("A05-3B");

  const warehouse =
    data?.warehouses?.find((w) => w._id === data.warehouseId) || data?.warehouses?.[0];

  const occupied = useMemo(() => {
    const codes = new Set<string>();
    for (const loc of data?.locations ?? []) {
      if (loc.palletId) codes.add(loc.code);
    }
    return codes;
  }, [data]);

  const selectedParts = useMemo(() => {
    const match = selected.match(/^([A-Z])(\d{2})-(\d)([AB])$/);
    if (!match) return null;
    return {
      lane: match[1],
      column: match[2],
      level: match[3],
      spot: match[4],
      bay: `${match[1]}${match[2]}`,
      shelf: `${match[3]}${match[4]}`,
    };
  }, [selected]);

  if (loading) return <SkeletonPage variant="table" />;

  return (
    <>
      <PageHeader
        title="Warehouse setup"
        icon={<WarehouseIcon className="h-5 w-5" />}
        description={
          warehouse
            ? `${warehouse.name} · front view of each lane · column, level, and spot`
            : "Lane front view"
        }
      />
      <Alert>{error}</Alert>

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
          <CardTitle>Lane {lane} — front view</CardTitle>
          <p className="mt-1 mb-3 text-xs text-muted">
            Columns run across the top. Levels run from the floor (L1) up to L5. Each bay has two pallet spots, A and B.
          </p>
          <div className="mb-3 flex flex-wrap gap-1">
            {LANES.map((letter) => (
              <button
                key={letter}
                type="button"
                onClick={() => {
                  setLane(letter);
                  setSelected(`${letter}05-3B`);
                }}
                className={cn(
                  "h-8 w-8 rounded-md border text-xs font-bold",
                  letter === lane
                    ? "border-navy bg-navy text-white"
                    : "border-border bg-white text-navy hover:bg-surface-2"
                )}
              >
                {letter}
              </button>
            ))}
          </div>

          <div className="overflow-x-auto pb-2">
            <div className="inline-grid gap-1" style={{ gridTemplateColumns: "36px repeat(20, 56px)" }}>
              <div />
              {COLUMNS.map((column) => (
                <div key={column} className="text-center text-[10px] font-bold text-muted">
                  {String(column).padStart(2, "0")}
                </div>
              ))}
              {LEVELS.flatMap((level) => [
                <div key={`label-${level}`} className="flex items-center text-[11px] font-bold text-navy">
                  L{level}
                </div>,
                ...COLUMNS.map((column) => {
                    const spots = (["A", "B"] as const).map((spot) => bayCode(lane, column, level, spot));
                    return (
                      <div key={`${level}-${column}`} className="grid grid-cols-2 gap-0.5">
                        {spots.map((code) => {
                          const spot = code.slice(-1);
                          const shelf = `${level}${spot}`;
                          const taken = occupied.has(code);
                          return (
                            <button
                              key={code}
                              type="button"
                              title={code}
                              onClick={() => setSelected(code)}
                              className={cn(
                                "rounded border px-0.5 py-1 text-center leading-none",
                                taken
                                  ? "border-accent/50 bg-accent-bg text-accent-dark"
                                  : "border-border bg-surface-2 text-navy",
                                selected === code && "ring-2 ring-navy"
                              )}
                            >
                              <span className="block font-mono text-[8px] font-semibold">{lane}{String(column).padStart(2, "0")}</span>
                              <span className="mt-0.5 block font-mono text-[9px] font-bold">{shelf}</span>
                            </button>
                          );
                        })}
                      </div>
                    );
                  }),
              ])}
            </div>
          </div>

          {selectedParts ? (
            <div className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
              <p className="m-0">
                <span className="font-mono font-bold text-navy">{selectedParts.bay}</span>
                <span className="text-muted"> — lane {selectedParts.lane}, column {selectedParts.column}</span>
              </p>
              <p className="m-0">
                <span className="font-mono font-bold text-navy">{selectedParts.shelf}</span>
                <span className="text-muted"> — level {selectedParts.level}, spot {selectedParts.spot}</span>
              </p>
              <p className="m-0 sm:col-span-2">
                <span className="font-mono font-bold text-navy">{selected}</span>
                <span className="text-muted">
                  {" "}
                  is the full pallet position.
                  {occupied.has(selected) ? " Occupied." : " Open."}
                </span>
              </p>
              <p className="m-0 text-xs text-muted sm:col-span-2">
                L1 is the floor. L5 is the top beam. Spot A and spot B share that column and level.
              </p>
            </div>
          ) : null}
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
