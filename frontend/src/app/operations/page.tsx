"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { PalletLabelPreview } from "@/components/PalletLabelPreview";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  CardTitle,
  DataTable,
  Input,
  Label,
  PageHeader,
  Select,
  statusTone,
  type Column,
} from "@/components/ui";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useApiQuery } from "@/hooks/useApiQuery";
import { dateLabel } from "@/lib/format";
import { sqftFromInches } from "@/lib/palletSpace";
import type { Customer, DashboardKpis, Location, Pallet, Shipment, Warehouse } from "@/types";

export default function OperationsPage() {
  const { token } = useAuth();
  const { data: custData } = useApiQuery<{ customers: Customer[] }>("/customers");
  const { data: whData } = useApiQuery<{ warehouses: Warehouse[] }>("/warehouses");
  const { data: dashData, reload: reloadDash } = useApiQuery<{ kpis: DashboardKpis }>("/dashboard");
  const { data: shipData, reload: reloadShipments } = useApiQuery<{ shipments: Shipment[] }>(
    "/shipments"
  );
  const { data: palletData, reload: reloadPallets } = useApiQuery<{ pallets: Pallet[] }>("/pallets");

  const warehouse = whData?.warehouses?.[0];
  const customers = custData?.customers ?? [];
  const sba = customers.find((c) => c.billingMethod === "contract") || customers[0];
  const kpis = dashData?.kpis;

  const { data: locData, reload: reloadLocs } = useApiQuery<{ locations: Location[] }>(
    warehouse ? `/locations?warehouseId=${warehouse._id}&available=true` : null
  );

  const [customerId, setCustomerId] = useState("");
  const [palletCount, setPalletCount] = useState(1);
  const [description, setDescription] = useState("");
  const [ref, setRef] = useState("");
  const [poOrJob, setPoOrJob] = useState("");
  const [dimLength, setDimLength] = useState(48);
  const [dimWidth, setDimWidth] = useState(48);
  const [billAsFtl, setBillAsFtl] = useState(false);
  const [carrier, setCarrier] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [selectedShipIds, setSelectedShipIds] = useState<string[]>([]);
  const [labelPallet, setLabelPallet] = useState<Pallet | null>(null);

  const sqftEach = useMemo(() => sqftFromInches(dimLength, dimWidth), [dimLength, dimWidth]);
  const neededSqft = sqftEach * palletCount;
  const availableSqft = kpis?.availableSqft;
  const spaceTight =
    availableSqft != null && neededSqft > availableSqft;

  useEffect(() => {
    if (sba && !customerId) setCustomerId(sba._id);
  }, [sba, customerId]);

  const activePallets = useMemo(
    () =>
      (palletData?.pallets ?? []).filter((p) =>
        ["received", "stored", "staged"].includes(p.status)
      ),
    [palletData]
  );

  async function onReceive(e: FormEvent) {
    e.preventDefault();
    if (!token || !warehouse || !customerId) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const available = locData?.locations ?? [];
      const locationIds = available.slice(0, palletCount).map((l) => l._id);
      const result = await api<{ shipment: Shipment; pallets: Pallet[] }>("/shipments/receive", {
        method: "POST",
        token,
        body: JSON.stringify({
          warehouseId: warehouse._id,
          customerId,
          palletCount,
          description,
          ref,
          poOrJob,
          dimLength,
          dimWidth,
          sqft: sqftEach,
          billAsFtl,
          carrier,
          locationIds,
        }),
      });
      setMessage(
        `Received ${result.pallets.length} pallet(s) · ${sqftEach} SF each · labels ready`
      );
      setDescription("");
      setRef("");
      if (result.pallets[0]) setLabelPallet(result.pallets[0]);
      await Promise.all([reloadShipments(), reloadPallets(), reloadLocs(), reloadDash()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Receive failed");
    } finally {
      setBusy(false);
    }
  }

  async function onShip(e: FormEvent) {
    e.preventDefault();
    if (!token || !warehouse || !customerId || selectedShipIds.length === 0) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const result = await api<{ shipment: Shipment }>("/shipments/ship", {
        method: "POST",
        token,
        body: JSON.stringify({
          warehouseId: warehouse._id,
          customerId,
          palletIds: selectedShipIds,
          billAsFtl,
          carrier,
        }),
      });
      setMessage(`Shipped ${selectedShipIds.length} pallet(s) — ${result.shipment._id.slice(-6)}`);
      setSelectedShipIds([]);
      await Promise.all([reloadShipments(), reloadPallets(), reloadLocs(), reloadDash()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ship failed");
    } finally {
      setBusy(false);
    }
  }

  const shipColumns: Column<Shipment>[] = [
    {
      key: "dir",
      header: "Direction",
      render: (s) => <Badge tone="accent">{s.direction}</Badge>,
    },
    {
      key: "status",
      header: "Status",
      render: (s) => <Badge tone={statusTone(s.status)}>{s.status}</Badge>,
    },
    {
      key: "pallets",
      header: "Pallets",
      render: (s) => s.palletIds?.length ?? 0,
    },
    {
      key: "ftl",
      header: "FTL",
      render: (s) => (s.billAsFtl ? "Yes" : "—"),
    },
    {
      key: "when",
      header: "Completed",
      render: (s) => dateLabel(s.completedAt || s.createdAt),
    },
  ];

  return (
    <AppShell>
      <PageHeader
        title="Receive / Ship"
        description="Inbound posts contract handling. Capture PO/Job + pallet footprint for space tracking and labels."
      />
      <Alert>{error}</Alert>
      {message ? <Alert tone="info">{message}</Alert> : null}
      {spaceTight ? (
        <Alert>
          This receipt needs ~{neededSqft} SF but only {availableSqft} SF is available in the
          warehouse. You can still receive, but capacity is tight.
        </Alert>
      ) : null}

      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MiniStat
          label="Capacity"
          value={kpis?.capacitySqft != null ? `${kpis.capacitySqft.toLocaleString()} SF` : "…"}
        />
        <MiniStat
          label="Occupied"
          value={kpis?.occupiedSqft != null ? `${kpis.occupiedSqft.toLocaleString()} SF` : "…"}
        />
        <MiniStat
          label="Available"
          value={kpis?.availableSqft != null ? `${kpis.availableSqft.toLocaleString()} SF` : "…"}
        />
        <MiniStat label="Open slots" value={locData?.locations?.length ?? "…"} />
      </div>

      <div className="mb-6 grid gap-5 lg:grid-cols-2">
        <Card>
          <CardBody className="p-5">
            <CardTitle>Receive inbound</CardTitle>
            <form onSubmit={onReceive} className="mt-4 space-y-4">
              <div>
                <Label>Customer</Label>
                <Select
                  value={customerId}
                  onChange={(e) => setCustomerId(e.target.value)}
                  required
                >
                  {customers.map((c) => (
                    <option key={c._id} value={c._id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label>PO / Job name</Label>
                <Input
                  value={poOrJob}
                  onChange={(e) => setPoOrJob(e.target.value)}
                  placeholder="One reference — PO or job name"
                  required
                />
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <Label>Pallet count</Label>
                  <Input
                    type="number"
                    min={1}
                    max={20}
                    value={palletCount}
                    onChange={(e) => setPalletCount(Number(e.target.value))}
                  />
                </div>
                <div>
                  <Label>Carrier</Label>
                  <Input
                    value={carrier}
                    onChange={(e) => setCarrier(e.target.value)}
                    placeholder="Optional"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div>
                  <Label>Length (in)</Label>
                  <Input
                    type="number"
                    min={1}
                    value={dimLength}
                    onChange={(e) => setDimLength(Number(e.target.value))}
                  />
                </div>
                <div>
                  <Label>Width (in)</Label>
                  <Input
                    type="number"
                    min={1}
                    value={dimWidth}
                    onChange={(e) => setDimWidth(Number(e.target.value))}
                  />
                </div>
                <div>
                  <Label>Sq ft / pallet</Label>
                  <Input value={sqftEach} readOnly className="bg-surface-2" />
                </div>
              </div>
              <p className="m-0 text-xs text-muted">
                Standard 48″×48″ = 16 SF. This load uses ~{neededSqft} SF.
              </p>
              <div>
                <Label>Reference / BOL</Label>
                <Input value={ref} onChange={(e) => setRef(e.target.value)} />
              </div>
              <div>
                <Label>Description</Label>
                <Input value={description} onChange={(e) => setDescription(e.target.value)} />
              </div>
              <label className="flex items-start gap-2.5 text-sm leading-snug text-muted">
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 rounded border-border"
                  checked={billAsFtl}
                  onChange={(e) => setBillAsFtl(e.target.checked)}
                />
                Bill as FTL ($520) instead of per-pallet handling
              </label>
              <Button type="submit" loading={busy}>
                Receive pallets
              </Button>
            </form>
          </CardBody>
        </Card>

        <Card>
          <CardBody className="p-5">
            <CardTitle>Ship outbound</CardTitle>
            <form onSubmit={onShip} className="mt-4 space-y-4">
              <div className="max-h-56 space-y-1 overflow-y-auto rounded-lg border border-border bg-surface-2/50 p-2">
                {activePallets.length === 0 ? (
                  <p className="m-0 p-2 text-sm text-muted">No active pallets to ship.</p>
                ) : (
                  activePallets.map((p) => (
                    <label
                      key={p._id}
                      className="flex flex-wrap items-center gap-2.5 rounded-md px-2.5 py-2 text-sm hover:bg-surface"
                    >
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-border"
                        checked={selectedShipIds.includes(p._id)}
                        onChange={(e) => {
                          setSelectedShipIds((ids) =>
                            e.target.checked ? [...ids, p._id] : ids.filter((id) => id !== p._id)
                          );
                        }}
                      />
                      <span className="font-semibold">{p.externalId}</span>
                      <Badge tone={statusTone(p.status)}>{p.status}</Badge>
                      <span className="text-xs text-muted">
                        {p.jobName || p.poNumber || "—"}
                        {p.sqft != null ? ` · ${p.sqft} SF` : ""}
                      </span>
                    </label>
                  ))
                )}
              </div>
              <Button type="submit" loading={busy} disabled={selectedShipIds.length === 0}>
                Ship selected ({selectedShipIds.length})
              </Button>
            </form>
          </CardBody>
        </Card>
      </div>

      <PageHeader title="Recent shipments" className="mb-4" />
      <DataTable
        columns={shipColumns}
        rows={shipData?.shipments ?? []}
        rowKey={(s) => s._id}
        emptyTitle="No shipments yet"
        emptyDescription="Receive your first inbound load above."
      />

      {labelPallet ? (
        <PalletLabelPreview pallet={labelPallet} onClose={() => setLabelPallet(null)} />
      ) : null}
    </AppShell>
  );
}

function MiniStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-[var(--radius)] border border-border bg-surface px-3 py-2.5 shadow-[var(--shadow)]">
      <div className="text-[10px] font-semibold tracking-wide text-muted uppercase">{label}</div>
      <div className="mt-1 text-[15px] font-bold tabular-nums text-navy">{value}</div>
    </div>
  );
}
