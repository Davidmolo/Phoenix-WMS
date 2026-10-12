"use client";

import { useEffect, useMemo, useState } from "react";
import { Warehouse as WarehouseIcon, Pencil, Save } from "lucide-react";
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
  SkeletonPage,
} from "@/components/ui";
import { api } from "@/lib/api";
import { useApiQuery, invalidateApiCache } from "@/hooks/useApiQuery";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/cn";
import type { Location, Warehouse } from "@/types";

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

type Placement = { locationId: string; row: number; col: number };

export default function WarehousePage() {
  const { token } = useAuth();
  const { data, error, loading, reload } = useApiQuery<SetupResponse>("/locations/warehouse-setup");

  const warehouse =
    data?.warehouses?.find((w) => w._id === data.warehouseId) || data?.warehouses?.[0];

  const [editing, setEditing] = useState(false);
  const [rows, setRows] = useState(5);
  const [cols, setCols] = useState(8);
  const [placements, setPlacements] = useState<Placement[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!data) return;
    const r = data.mapLayout?.rows ?? 5;
    const c = data.mapLayout?.cols ?? 8;
    setRows(r);
    setCols(c);
    setPlacements(
      (data.locations ?? []).map((l) => ({
        locationId: l._id,
        row: l.row,
        col: l.col,
      }))
    );
    setSelectedId(null);
  }, [data]);

  const locById = useMemo(() => {
    const map = new Map<string, Location>();
    for (const l of data?.locations ?? []) map.set(l._id, l);
    return map;
  }, [data]);

  const cellMap = useMemo(() => {
    const map = new Map<string, Placement>();
    for (const p of placements) {
      if (p.row >= 0 && p.col >= 0 && p.row < rows && p.col < cols) {
        map.set(`${p.row}:${p.col}`, p);
      }
    }
    return map;
  }, [placements, rows, cols]);

  function beginEdit() {
    setEditing(true);
    setMsg("");
    setErr("");
  }

  function cancelEdit() {
    setEditing(false);
    setSelectedId(null);
    setErr("");
    if (data) {
      setRows(data.mapLayout?.rows ?? 5);
      setCols(data.mapLayout?.cols ?? 8);
      setPlacements(
        (data.locations ?? []).map((l) => ({
          locationId: l._id,
          row: l.row,
          col: l.col,
        }))
      );
    }
  }

  function onCellClick(row: number, col: number) {
    if (!editing) return;
    const key = `${row}:${col}`;
    const existing = cellMap.get(key);

    if (selectedId) {
      // Move selected slot onto this cell (swap if occupied)
      setPlacements((prev) => {
        const next = prev.map((p) => ({ ...p }));
        const moving = next.find((p) => p.locationId === selectedId);
        if (!moving) return prev;
        if (existing) {
          const other = next.find((p) => p.locationId === existing.locationId);
          if (other) {
            other.row = moving.row;
            other.col = moving.col;
          }
        }
        moving.row = row;
        moving.col = col;
        return next;
      });
      setSelectedId(null);
      return;
    }

    if (existing) {
      setSelectedId(existing.locationId);
    }
  }

  async function saveLayout() {
    if (!token || !warehouse) return;
    setErr("");

    // Defensive: two different slots can never share one cell. The click/swap logic above
    // shouldn't allow this, but catch it client-side before it ever reaches the server.
    const cellOwner = new Map<string, string>(); // "row:col" -> locationId
    const collisions = new Set<string>();
    for (const p of placements) {
      const key = `${p.row}:${p.col}`;
      const owner = cellOwner.get(key);
      if (owner && owner !== p.locationId) {
        const a = locById.get(owner)?.code || owner;
        const b = locById.get(p.locationId)?.code || p.locationId;
        collisions.add(`${a} / ${b} → cell ${key}`);
      }
      cellOwner.set(key, p.locationId);
    }
    if (collisions.size > 0) {
      setErr(
        `Two slots are placed on the same cell — move one before saving: ${[...collisions].join(", ")}`
      );
      return;
    }

    // Non-blocking heads-up: sequential "W-N" floor codes stay fixed when you move a slot,
    // so a gap usually means a slot was removed by shrinking the grid earlier.
    const wNumbers = (data?.locations ?? [])
      .map((l) => {
        const m = String(l.code).match(/^W-(\d+)$/);
        return m ? Number(m[1]) : null;
      })
      .filter((n): n is number => n != null)
      .sort((a, b) => a - b);
    let gapNote = "";
    for (let i = 1; i < wNumbers.length; i++) {
      if (wNumbers[i] !== wNumbers[i - 1] + 1) {
        gapNote = ` Note: floor codes skip from W-${wNumbers[i - 1]} to W-${wNumbers[i]} — numbers stay fixed when slots move, so this clears up as you expand.`;
        break;
      }
    }

    setBusy(true);
    setMsg("");
    try {
      await api("/locations/map-layout", {
        method: "PUT",
        token,
        body: JSON.stringify({
          warehouseId: warehouse._id,
          rows,
          cols,
          placements,
        }),
      });
      setMsg(`Saved ${rows}×${cols} floor map.${gapNote}`);
      setEditing(false);
      setSelectedId(null);
      invalidateApiCache();
      await reload();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Save failed");
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
            ? `${warehouse.name} · ${warehouse.sqft?.toLocaleString() ?? "—"} SF · ${warehouse.address || ""}`
            : "Floor locations"
        }
        actions={
          editing ? (
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={cancelEdit} disabled={busy}>
                Cancel
              </Button>
              <Button
                onClick={saveLayout}
                loading={busy}
                icon={<Save className="h-4 w-4" />}
              >
                Save layout
              </Button>
            </div>
          ) : (
            <Button
              variant="secondary"
              onClick={beginEdit}
              icon={<Pencil className="h-4 w-4" />}
            >
              Customize map
            </Button>
          )
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

      {editing ? (
        <Card className="mb-4">
          <CardBody>
            <CardTitle>Grid size</CardTitle>
            <p className="mt-1 mb-3 text-xs text-muted">
              Grow rows/cols as you add floor space. Expanding fills empty cells with new slots.
              Select a slot, then click another cell to move or swap it.
            </p>
            <FormGrid cols={2}>
              <Field label="Rows">
                <Input
                  type="number"
                  min={1}
                  max={40}
                  value={rows}
                  onChange={(e) => setRows(Math.max(1, Math.min(40, Number(e.target.value) || 1)))}
                />
              </Field>
              <Field label="Columns">
                <Input
                  type="number"
                  min={1}
                  max={40}
                  value={cols}
                  onChange={(e) => setCols(Math.max(1, Math.min(40, Number(e.target.value) || 1)))}
                />
              </Field>
            </FormGrid>
          </CardBody>
        </Card>
      ) : null}

      <Card lift={false}>
        <CardBody>
          <CardTitle>Floor map · {rows}×{cols}</CardTitle>
          <p className="mt-1 mb-3 text-xs text-muted">
            {editing
              ? selectedId
                ? `Moving ${locById.get(selectedId)?.code ?? "slot"} — click a target cell`
                : "Click a slot to select, then click a cell to place it"
              : "Gold = occupied · Gray = open"}
          </p>
          <div
            className="grid gap-1.5"
            style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
          >
            {Array.from({ length: rows * cols }, (_, i) => {
              const row = Math.floor(i / cols);
              const col = i % cols;
              const placement = cellMap.get(`${row}:${col}`);
              const loc = placement ? locById.get(placement.locationId) : undefined;
              const occupied = Boolean(loc?.palletId);
              const selected = placement?.locationId === selectedId;
              const isEmpty = !placement;

              return (
                <button
                  key={`${row}-${col}`}
                  type="button"
                  disabled={!editing}
                  title={loc?.code || (editing ? `Empty ${row + 1},${col + 1}` : undefined)}
                  onClick={() => onCellClick(row, col)}
                  className={cn(
                    "flex aspect-square items-center justify-center rounded-md border text-[10px] font-semibold transition-colors",
                    isEmpty && "border-dashed border-border bg-white text-muted",
                    !isEmpty && occupied && "border-accent/40 bg-accent-bg text-accent-dark",
                    !isEmpty && !occupied && "border-border bg-surface-2 text-muted",
                    selected && "ring-2 ring-accent ring-offset-1",
                    editing && "cursor-pointer hover:border-accent"
                  )}
                >
                  {loc ? loc.code.replace(/^W-/, "") : editing ? "·" : ""}
                </button>
              );
            })}
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
