"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  ArrowLeftRight,
  PackagePlus,
  Truck,
  Ruler,
} from "lucide-react";
import { PalletLabelPreview } from "@/components/PalletLabelPreview";
import {
  Alert,
  Badge,
  Button,
  CheckboxField,
  DataTable,
  Field,
  FormGrid,
  FormSection,
  Input,
  PageHeader,
  Select,
  statusTone,
  type Column,
} from "@/components/ui";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useApiQuery, invalidateApiCache } from "@/hooks/useApiQuery";
import { dateLabel } from "@/lib/format";
import { sqftFromInches } from "@/lib/palletSpace";
import type { Customer, DashboardKpis, Location, Pallet, Shipment, Warehouse } from "@/types";

export default function OperationsPage() {
  const { token } = useAuth();
  const { data: custData } = useApiQuery<{ customers: Customer[] }>("/customers");
  const { data: whData } = useApiQuery<{ warehouses: Warehouse[] }>("/warehouses");
  const { data: dashData, reload: reloadDash } = useApiQuery<{ kpis: DashboardKpis }>("/dashboard");
  const { data: shipData, reload: reloadShipments, loading: shipsLoading } = useApiQuery<{
    shipments: Shipment[];
  }>("/shipments");
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
  const spaceTight = availableSqft != null && neededSqft > availableSqft;

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
      invalidateApiCache();
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
      invalidateApiCache();
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
    <>
        <PageHeader
          title="Receive / Ship"
          icon={<ArrowLeftRight className="h-5 w-5" />}
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

      <div className="mb-5 grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
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

        <div className="mb-6 grid gap-4 sm:gap-5 lg:grid-cols-2">
          <FormSection
            title="Receive inbound"
            description="Scan-ready labels print after receive."
            icon={<PackagePlus className="h-4 w-4" />}
          >
            <form onSubmit={onReceive} className="space-y-4">
              <Field label="Customer" required>
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
              </Field>
              <Field
                label="PO / Job name"
                required
                hint="One reference used on labels and billing."
              >
                <Input
                  value={poOrJob}
                  onChange={(e) => setPoOrJob(e.target.value)}
                  placeholder="One reference — PO or job name"
                  required
                />
              </Field>
              <FormGrid>
                <Field label="Pallet count">
                  <Input
                    type="number"
                    min={1}
                    max={20}
                    value={palletCount}
                    onChange={(e) => setPalletCount(Number(e.target.value))}
                  />
                </Field>
                <Field label="Carrier">
                  <Input
                    value={carrier}
                    onChange={(e) => setCarrier(e.target.value)}
                    placeholder="Optional"
                  />
                </Field>
              </FormGrid>
              <div className="rounded-[var(--radius)] border border-border bg-surface-2/50 p-3.5">
                <div className="mb-3 flex items-center gap-2 text-[11px] font-bold tracking-[0.06em] text-navy uppercase">
                  <Ruler className="h-3.5 w-3.5 text-accent" />
                  Pallet footprint
                </div>
                <FormGrid cols={3}>
                  <Field label="Length (in)">
                    <Input
                      type="number"
                      min={1}
                      value={dimLength}
                      onChange={(e) => setDimLength(Number(e.target.value))}
                    />
                  </Field>
                  <Field label="Width (in)">
                    <Input
                      type="number"
                      min={1}
                      value={dimWidth}
                      onChange={(e) => setDimWidth(Number(e.target.value))}
                    />
                  </Field>
                  <Field label="Sq ft / pallet" hint={`Load total ~${neededSqft} SF`}>
                    <Input value={sqftEach} readOnly />
                  </Field>
                </FormGrid>
              </div>
              <FormGrid>
                <Field label="Reference / BOL">
                  <Input value={ref} onChange={(e) => setRef(e.target.value)} />
                </Field>
                <Field label="Description">
                  <Input value={description} onChange={(e) => setDescription(e.target.value)} />
                </Field>
              </FormGrid>
              <CheckboxField checked={billAsFtl} onChange={setBillAsFtl}>
                Bill as FTL ($520) instead of per-pallet handling
              </CheckboxField>
              <Button type="submit" loading={busy} icon={<PackagePlus className="h-4 w-4" />}>
                Receive pallets
              </Button>
            </form>
          </FormSection>

          <FormSection
            title="Ship outbound"
            description="Select staged or stored pallets to load out."
            icon={<Truck className="h-4 w-4" />}
          >
            <form onSubmit={onShip} className="space-y-4">
              <div className="max-h-64 space-y-1 overflow-y-auto rounded-[var(--radius)] border border-border bg-surface-2/50 p-2">
                {activePallets.length === 0 ? (
                  <p className="m-0 p-3 text-sm text-muted">No active pallets to ship.</p>
                ) : (
                  activePallets.map((p) => (
                    <label
                      key={p._id}
                      className="flex flex-wrap items-center gap-2.5 rounded-lg px-2.5 py-2.5 text-sm transition-colors hover:bg-surface"
                    >
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-border accent-[var(--accent)]"
                        checked={selectedShipIds.includes(p._id)}
                        onChange={(e) => {
                          setSelectedShipIds((ids) =>
                            e.target.checked ? [...ids, p._id] : ids.filter((id) => id !== p._id)
                          );
                        }}
                      />
                      <span className="font-semibold text-navy">{p.externalId}</span>
                      <Badge tone={statusTone(p.status)}>{p.status}</Badge>
                      <span className="text-xs text-muted">
                        {p.jobName || p.poNumber || "—"}
                        {p.sqft != null ? ` · ${p.sqft} SF` : ""}
                      </span>
                    </label>
                  ))
                )}
              </div>
              <Button
                type="submit"
                loading={busy}
                disabled={selectedShipIds.length === 0}
                icon={<Truck className="h-4 w-4" />}
              >
                Ship selected ({selectedShipIds.length})
              </Button>
            </form>
          </FormSection>
        </div>

        <PageHeader title="Recent shipments" className="mb-4" />
        <DataTable
          columns={shipColumns}
          rows={shipData?.shipments ?? []}
          rowKey={(s) => s._id}
          loading={shipsLoading}
          emptyTitle="No shipments yet"
          emptyDescription="Receive your first inbound load above."
        />

        {labelPallet ? (
          <PalletLabelPreview pallet={labelPallet} onClose={() => setLabelPallet(null)} />
        ) : null}
    </>
  );
}

function MiniStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div
      className="rounded-[var(--radius)] border border-border px-3 py-2.5 shadow-[var(--shadow)]"
      style={{ background: "var(--blend-kpi)" }}
    >
      <div className="text-[10px] font-bold tracking-[0.06em] text-muted uppercase">{label}</div>
      <div className="mt-1 text-[15px] font-bold tabular-nums text-navy">{value}</div>
    </div>
  );
}
