"use client";

import { AppShell } from "@/components/AppShell";
import {
  Alert,
  Card,
  CardBody,
  CardTitle,
  PageHeader,
  Spinner,
  CenteredState,
} from "@/components/ui";
import { useApiQuery } from "@/hooks/useApiQuery";
import { cn } from "@/lib/cn";
import type { Location, Warehouse } from "@/types";

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

export default function WarehousePage() {
  const { data, error, loading } = useApiQuery<SetupResponse>("/locations/warehouse-setup");

  if (loading) {
    return (
      <AppShell>
        <CenteredState>
          <Spinner />
        </CenteredState>
      </AppShell>
    );
  }

  const warehouse = data?.warehouses?.find((w) => w._id === data.warehouseId) || data?.warehouses?.[0];
  const locations = data?.locations ?? [];

  return (
    <AppShell>
      <PageHeader
        title="Warehouse setup"
        description={
          warehouse
            ? `${warehouse.name} · ${warehouse.sqft?.toLocaleString() ?? "—"} SF · ${warehouse.address || ""}`
            : "Floor locations"
        }
      />
      <Alert>{error}</Alert>

      <div className="mb-4 grid grid-cols-[repeat(auto-fit,minmax(140px,1fr))] gap-3">
        <Stat label="Total slots" value={data?.summary.total} />
        <Stat label="Occupied slots" value={data?.summary.occupied} />
        <Stat label="Open slots" value={data?.summary.available} />
        <Stat label="Capacity SF" value={data?.summary.capacitySqft} />
        <Stat label="Occupied SF" value={data?.summary.occupiedSqft} />
        <Stat label="Available SF" value={data?.summary.availableSqft} />
      </div>

      <Card>
        <CardBody>
          <CardTitle>Floor map</CardTitle>
          <p className="mt-1 mb-3 text-xs text-muted">Blue = occupied · Gray = open</p>
          <div className="grid grid-cols-8 gap-1.5 sm:grid-cols-8">
            {locations.map((loc) => {
              const occupied = Boolean(loc.palletId);
              return (
                <div
                  key={loc._id}
                  title={loc.code}
                  className={cn(
                    "flex aspect-square items-center justify-center rounded-md border text-[10px] font-semibold",
                    occupied
                      ? "border-accent/40 bg-accent-bg text-accent-dark"
                      : "border-border bg-surface-2 text-muted"
                  )}
                >
                  {loc.code.replace("W-", "")}
                </div>
              );
            })}
          </div>
        </CardBody>
      </Card>
    </AppShell>
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
