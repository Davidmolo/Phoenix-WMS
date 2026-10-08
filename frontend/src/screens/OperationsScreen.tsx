"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  ArrowLeftRight,
  PackagePlus,
  Truck,
  Ruler,
  ClipboardList,
  ScanBarcode,
  MapPin,
} from "lucide-react";
import { PalletLabelPreview } from "@/components/PalletLabelPreview";
import { PickListModal, type PickListPayload } from "@/components/PickListModal";
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
  statusLabel,
  statusTone,
  type Column,
} from "@/components/ui";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useApiQuery, invalidateApiCache } from "@/hooks/useApiQuery";
import { dateLabel, money } from "@/lib/format";
import { listQuery, paginationFrom, type PaginationMeta } from "@/lib/pagination";
import { sqftFromInches } from "@/lib/palletSpace";
import type { Customer, DashboardKpis, Location, Pallet, Shipment, Warehouse } from "@/types";

export default function OperationsPage() {
  const { token } = useAuth();
  const [shipPage, setShipPage] = useState(1);
  const { data: custData } = useApiQuery<{ customers: Customer[] }>("/customers?portal=all");
  const { data: whData } = useApiQuery<{ warehouses: Warehouse[] }>("/warehouses");
  const { data: dashData, reload: reloadDash } = useApiQuery<{ kpis: DashboardKpis }>("/dashboard");
  const shipPath = useMemo(() => listQuery("/shipments", { page: shipPage }), [shipPage]);
  const { data: shipData, reload: reloadShipments, loading: shipsLoading } = useApiQuery<
    { shipments: Shipment[] } & PaginationMeta
  >(shipPath);
  const { data: palletData, reload: reloadPallets } = useApiQuery<{ pallets: Pallet[] }>(
    listQuery("/pallets", { limit: 200 })
  );

  const expectedPath = useMemo(
    () => listQuery("/shipments", { limit: 50, params: { status: "expected", direction: "inbound" } }),
    []
  );
  const { data: expectedData, reload: reloadExpected } = useApiQuery<
    { shipments: Shipment[] } & PaginationMeta
  >(expectedPath);

  const warehouse = whData?.warehouses?.[0];
  const customers = custData?.customers ?? [];
  const kpis = dashData?.kpis;

  const { data: locData, reload: reloadLocs } = useApiQuery<{ locations: Location[] }>(
    warehouse ? `/locations?warehouseId=${warehouse._id}&available=true` : null
  );

  const [customerId, setCustomerId] = useState("");
  const [expectedShipmentId, setExpectedShipmentId] = useState("");
  const [palletCount, setPalletCount] = useState(1);
  const [description, setDescription] = useState("");
  const [ref, setRef] = useState("");
  const [poOrJob, setPoOrJob] = useState("");
  const [dimLength, setDimLength] = useState(48);
  const [dimWidth, setDimWidth] = useState(48);
  const [billAsFtl, setBillAsFtl] = useState(false);
  const [carrier, setCarrier] = useState("");
  const [locationMode, setLocationMode] = useState<"next_available" | "choose">("next_available");
  const [chosenLocationIds, setChosenLocationIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [selectedShipIds, setSelectedShipIds] = useState<string[]>([]);
  const [labelPallets, setLabelPallets] = useState<Pallet[] | null>(null);
  const [pickList, setPickList] = useState<PickListPayload | null>(null);
  const [storePalletCode, setStorePalletCode] = useState("");
  const [storeLocationCode, setStoreLocationCode] = useState("");

  const selectedCustomer = useMemo(
    () => customers.find((c) => c._id === customerId),
    [customers, customerId]
  );
  const ftlRate = selectedCustomer?.contractFtlRate;

  const sqftEach = useMemo(() => sqftFromInches(dimLength, dimWidth), [dimLength, dimWidth]);
  const neededSqft = sqftEach * palletCount;
  const availableSqft = kpis?.availableSqft;
  const spaceTight = availableSqft != null && neededSqft > availableSqft;

  useEffect(() => {
    if (!customerId && customers[0]) setCustomerId(customers[0]._id);
  }, [customers, customerId]);

  useEffect(() => {
    if (!expectedShipmentId) return;
    const exp = (expectedData?.shipments ?? []).find((s) => s._id === expectedShipmentId);
    if (!exp) return;
    if (exp.customerId) {
      const cid = typeof exp.customerId === "string" ? exp.customerId : (exp.customerId as { _id?: string })._id;
      if (cid) setCustomerId(cid);
    }
    if (exp.carrier) setCarrier(exp.carrier);
    if (exp.poNumber || exp.jobName) setPoOrJob(exp.jobName || exp.poNumber || "");
  }, [expectedShipmentId, expectedData]);

  const activePallets = useMemo(
    () =>
      (palletData?.pallets ?? []).filter((p) =>
        ["received", "staged_for_store", "stored", "staged"].includes(p.status)
      ),
    [palletData]
  );

  const pendingStore = useMemo(
    () => (palletData?.pallets ?? []).filter((p) => p.status === "staged_for_store"),
    [palletData]
  );

  const shipableSelected = useMemo(
    () => activePallets.filter((p) => selectedShipIds.includes(p._id)),
    [activePallets, selectedShipIds]
  );

  const availableLocations = locData?.locations ?? [];

  async function onReceive(e: FormEvent) {
    e.preventDefault();
    if (!token || !warehouse || !customerId) return;
    if (locationMode === "choose" && chosenLocationIds.length < palletCount) {
      setError(`Choose ${palletCount} location(s) (selected ${chosenLocationIds.length}).`);
      return;
    }
    setBusy(true);
    setError("");
    setMessage("");
    try {
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
          locationMode,
          locationIds: locationMode === "choose" ? chosenLocationIds.slice(0, palletCount) : [],
          expectedShipmentId: expectedShipmentId || undefined,
        }),
      });
      setMessage(
        `Received ${result.pallets.length} pallet(s) · Staged for Store · print labels, then Store scan to put away`
      );
      setDescription("");
      setRef("");
      setExpectedShipmentId("");
      setChosenLocationIds([]);
      setLabelPallets(result.pallets);
      invalidateApiCache();
      await Promise.all([
        reloadShipments(),
        reloadPallets(),
        reloadLocs(),
        reloadDash(),
        reloadExpected(),
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Receive failed");
    } finally {
      setBusy(false);
    }
  }

  async function onStore(e: FormEvent) {
    e.preventDefault();
    if (!token || !storePalletCode.trim() || !storeLocationCode.trim()) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const result = await api<{ message: string }>("/pallets/store", {
        method: "POST",
        token,
        body: JSON.stringify({
          palletCode: storePalletCode.trim(),
          locationCode: storeLocationCode.trim(),
        }),
      });
      setMessage(result.message || "Pallet stored");
      setStorePalletCode("");
      setStoreLocationCode("");
      invalidateApiCache();
      await Promise.all([reloadPallets(), reloadLocs(), reloadDash()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Store failed");
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

  async function onGeneratePickList() {
    if (!token || selectedShipIds.length === 0) return;
    setBusy(true);
    setError("");
    try {
      const result = await api<PickListPayload>("/shipments/pick-list", {
        method: "POST",
        token,
        body: JSON.stringify({
          warehouseId: warehouse?._id,
          customerId: customerId || undefined,
          palletIds: selectedShipIds,
        }),
      });
      setPickList(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Pick list failed");
    } finally {
      setBusy(false);
    }
  }

  function toggleChosenLocation(id: string) {
    setChosenLocationIds((ids) => {
      if (ids.includes(id)) return ids.filter((x) => x !== id);
      if (ids.length >= palletCount) return [...ids.slice(1), id];
      return [...ids, id];
    });
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
      render: (s) => <Badge tone={statusTone(s.status)}>{statusLabel(s.status)}</Badge>,
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
        description="Receive → assign location → print label (Staged for Store) → scan Store + location to put away"
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
        <MiniStat label="Open slots" value={availableLocations.length} />
      </div>

      <div className="mb-6 grid gap-4 sm:gap-5 lg:grid-cols-2">
        <FormSection
          title="1. Receive inbound"
          description="From Expected or manual. Location goes on the barcode; status stays Staged for Store until putaway."
          icon={<PackagePlus className="h-4 w-4" />}
        >
          <form onSubmit={onReceive} className="space-y-4">
            <Field label="From Expected inbound" hint="Optional — use an Expected appointment.">
              <Select
                value={expectedShipmentId}
                onChange={(e) => setExpectedShipmentId(e.target.value)}
              >
                <option value="">Manual receive (no Expected)</option>
                {(expectedData?.shipments ?? []).map((s) => (
                  <option key={s._id} value={s._id}>
                    {(s.jobName || s.poNumber || s.notes || s._id.slice(-6)).slice(0, 48)} ·{" "}
                    {dateLabel(s.scheduledAt || s.createdAt)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Customer" required>
              <Select value={customerId} onChange={(e) => setCustomerId(e.target.value)} required>
                {customers.map((c) => (
                  <option key={c._id} value={c._id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="PO / Job name" required hint="Printed on the barcode label.">
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
                  onChange={(e) => {
                    const n = Number(e.target.value);
                    setPalletCount(n);
                    setChosenLocationIds((ids) => ids.slice(0, n));
                  }}
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
                <MapPin className="h-3.5 w-3.5 text-accent" />
                Location
              </div>
              <Field label="Assignment" hint="Next available is the default (Cesar).">
                <Select
                  value={locationMode}
                  onChange={(e) =>
                    setLocationMode(e.target.value as "next_available" | "choose")
                  }
                >
                  <option value="next_available">Next available (default)</option>
                  <option value="choose">Choose location(s)</option>
                </Select>
              </Field>
              {locationMode === "choose" ? (
                <div className="mt-3 max-h-40 space-y-1 overflow-y-auto rounded-lg border border-border bg-white p-2">
                  {availableLocations.length === 0 ? (
                    <p className="m-0 p-2 text-xs text-muted">No open locations.</p>
                  ) : (
                    availableLocations.map((loc) => (
                      <label
                        key={loc._id}
                        className="flex items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-surface-2"
                      >
                        <input
                          type="checkbox"
                          className="h-4 w-4 accent-[var(--accent)]"
                          checked={chosenLocationIds.includes(loc._id)}
                          onChange={() => toggleChosenLocation(loc._id)}
                        />
                        <span className="font-mono font-semibold">{loc.code}</span>
                        <span className="text-xs text-muted">
                          {loc.aisle} · {loc.type}
                        </span>
                      </label>
                    ))
                  )}
                  <p className="m-0 px-2 pt-1 text-[11px] text-muted">
                    Selected {chosenLocationIds.length} / {palletCount}
                  </p>
                </div>
              ) : (
                <p className="m-0 mt-2 text-xs text-muted">
                  Will reserve the next {palletCount} open slot
                  {palletCount === 1 ? "" : "s"} and print{" "}
                  {palletCount === 1 ? "it" : "them"} on the label
                  {palletCount === 1 ? "" : "s"}.
                </p>
              )}
            </div>

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
              Bill as FTL
              {ftlRate != null ? ` (${money(ftlRate)})` : ""} instead of per-pallet handling
            </CheckboxField>
            <Button type="submit" loading={busy} icon={<PackagePlus className="h-4 w-4" />}>
              Receive & print labels
            </Button>
          </form>
        </FormSection>

        <div className="space-y-4 sm:space-y-5">
          <FormSection
            title="2. Store (putaway)"
            description="Scan the pallet barcode, then scan the storage location. Job done."
            icon={<ScanBarcode className="h-4 w-4" />}
          >
            <form onSubmit={onStore} className="space-y-4">
              <Field label="Pallet barcode / ID" hint="Scan or type the pallet ID from the label.">
                <Input
                  value={storePalletCode}
                  onChange={(e) => setStorePalletCode(e.target.value)}
                  placeholder="e.g. PLT-20041"
                  autoComplete="off"
                  required
                />
              </Field>
              <Field label="Storage location" hint="Scan or type the bin code.">
                <Input
                  value={storeLocationCode}
                  onChange={(e) => setStoreLocationCode(e.target.value)}
                  placeholder="e.g. A-01-01"
                  autoComplete="off"
                  required
                />
              </Field>
              <Button type="submit" loading={busy} icon={<ScanBarcode className="h-4 w-4" />}>
                Confirm store
              </Button>
              {pendingStore.length > 0 ? (
                <div className="rounded-[var(--radius)] border border-border bg-surface-2/50 p-3">
                  <div className="mb-2 text-[11px] font-bold tracking-wide text-muted uppercase">
                    Waiting for Store ({pendingStore.length})
                  </div>
                  <ul className="m-0 max-h-36 list-none space-y-1 overflow-y-auto p-0 text-sm">
                    {pendingStore.slice(0, 20).map((p) => (
                      <li key={p._id} className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          className="font-mono font-semibold text-navy underline-offset-2 hover:underline"
                          onClick={() => {
                            setStorePalletCode(p.externalId);
                            const code =
                              typeof p.locationId === "object" && p.locationId?.code
                                ? p.locationId.code
                                : "";
                            if (code) setStoreLocationCode(code);
                          }}
                        >
                          {p.externalId}
                        </button>
                        <Badge tone="warning">{statusLabel(p.status)}</Badge>
                        <span className="text-xs text-muted">
                          {typeof p.locationId === "object" && p.locationId?.code
                            ? `→ ${p.locationId.code}`
                            : "No slot"}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </form>
          </FormSection>

          <FormSection
            title="Ship outbound"
            description="Select pallets, generate a pick list, then ship."
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
                      <Badge tone={statusTone(p.status)}>{statusLabel(p.status)}</Badge>
                      <span className="text-xs text-muted">
                        {typeof p.locationId === "object" && p.locationId?.code
                          ? p.locationId.code
                          : "No slot"}
                        {" · "}
                        {p.jobName || p.poNumber || "—"}
                        {p.sqft != null ? ` · ${p.sqft} SF` : ""}
                      </span>
                    </label>
                  ))
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  loading={busy}
                  disabled={shipableSelected.length === 0}
                  icon={<ClipboardList className="h-4 w-4" />}
                  onClick={onGeneratePickList}
                >
                  Pick list ({selectedShipIds.length})
                </Button>
                <Button
                  type="submit"
                  loading={busy}
                  disabled={selectedShipIds.length === 0}
                  icon={<Truck className="h-4 w-4" />}
                >
                  Ship selected ({selectedShipIds.length})
                </Button>
              </div>
            </form>
          </FormSection>
        </div>
      </div>

      <PageHeader title="Recent shipments" className="mb-4" />
      <DataTable
        columns={shipColumns}
        rows={shipData?.shipments ?? []}
        rowKey={(s) => s._id}
        loading={shipsLoading}
        emptyTitle="No shipments yet"
        emptyDescription="Receive your first inbound load above."
        pagination={paginationFrom(shipData)}
        onPageChange={setShipPage}
      />

      {labelPallets ? (
        <PalletLabelPreview pallets={labelPallets} onClose={() => setLabelPallets(null)} />
      ) : null}
      {pickList ? <PickListModal list={pickList} onClose={() => setPickList(null)} /> : null}
    </>
  );
}

function MiniStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div
      className="rounded-[var(--radius)] border border-border px-3 py-2.5 shadow-[var(--shadow)] transition duration-200 ease-out hover:-translate-y-0.5 hover:shadow-[var(--shadow-card)]"
      style={{ background: "var(--blend-kpi)" }}
    >
      <div className="text-[10px] font-bold tracking-[0.06em] text-muted uppercase">{label}</div>
      <div className="mt-1 text-[15px] font-bold tabular-nums text-navy">{value}</div>
    </div>
  );
}
