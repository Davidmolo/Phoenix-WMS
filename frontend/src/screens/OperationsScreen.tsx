"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  PackagePlus,
  Printer,
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
  NumberInput,
  PageHeader,
  SearchableSelect,
  Select,
  statusLabel,
  statusTone,
  type Column,
} from "@/components/ui";
import { api, apiFetchHtml } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useAppNav } from "@/lib/appNav";
import { useApiQuery, invalidateApiCache } from "@/hooks/useApiQuery";
import { dateLabel, money } from "@/lib/format";
import { openHtmlForPrint } from "@/lib/print";
import { listQuery, paginationFrom, type PaginationMeta } from "@/lib/pagination";
import { sqftFromInches } from "@/lib/palletSpace";
import { customerIdOfShipment, expectedPalletCountOf } from "@/lib/expectedPrefill";
import type { Customer, DashboardKpis, Location, Pallet, Shipment, Warehouse } from "@/types";

/** Pallet.customerId comes back as a plain id string from most endpoints, but can be
 * a populated object on a few routes — normalize so filters/sync logic always work. */
function customerIdOf(p: Pallet): string {
  if (typeof p.customerId === "string") return p.customerId;
  return p.customerId?._id || "";
}

function locationCodeOf(loc?: Pallet["locationId"] | null, fallback = ""): string {
  if (fallback) return fallback;
  if (loc && typeof loc === "object") return loc.code || "—";
  return "—";
}

export type OpsMode = "all" | "receive" | "store" | "ship";

export default function OperationsPage({ mode = "all" }: { mode?: OpsMode }) {
  const { token } = useAuth();
  const { navigate } = useAppNav();
  const showReceive = mode === "all" || mode === "receive";
  const showStore = mode === "all" || mode === "store";
  const showShip = mode === "all" || mode === "ship";
  const title =
    mode === "receive"
      ? "Receive inbound"
      : mode === "store"
        ? "Store / Putaway"
        : mode === "ship"
          ? "Ship outbound"
          : "Receive / Store / Ship";
  const pageDescription =
    mode === "receive"
      ? "From Expected or manual — location on barcode, then Close BOL to invoice unload."
      : mode === "store"
        ? "Scan pallet barcode, then scan storage location. Hands-free Enter between fields."
        : mode === "ship"
          ? "From Expected outbound or select pallets — pick list, ship, then Close BOL to invoice load."
          : "Receive → assign location → print label → Store scan → Ship. Close BOL to invoice.";
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
  const expectedOutPath = useMemo(
    () => listQuery("/shipments", { limit: 50, params: { status: "expected", direction: "outbound" } }),
    []
  );
  const { data: expectedOutData, reload: reloadExpectedOut } = useApiQuery<
    { shipments: Shipment[] } & PaginationMeta
  >(expectedOutPath);

  const warehouse = whData?.warehouses?.[0];
  const customers = custData?.customers ?? [];
  const kpis = dashData?.kpis;

  const { data: locData, reload: reloadLocs } = useApiQuery<{ locations: Location[] }>(
    warehouse ? `/locations?warehouseId=${warehouse._id}&available=true` : null
  );

  const [customerId, setCustomerId] = useState("");
  const [expectedShipmentId, setExpectedShipmentId] = useState("");
  const [palletCountStr, setPalletCountStr] = useState("1");
  const palletCount = Math.min(50, Math.max(1, Number(palletCountStr) || 1));
  const [description, setDescription] = useState("");
  const [ref, setRef] = useState("");
  const [poOrJob, setPoOrJob] = useState("");
  const [dimLengthStr, setDimLengthStr] = useState("48");
  const [dimWidthStr, setDimWidthStr] = useState("48");
  const dimLength = Number(dimLengthStr) || 48;
  const dimWidth = Number(dimWidthStr) || 48;
  const [weightLbsEach, setWeightLbsEach] = useState("");
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
  const [bolInfo, setBolInfo] = useState<{ id: string; bolNumber: string } | null>(null);

  // Ship-specific carrier/trailer/BOL fields — separate from the Receive form above
  const [shipCarrier, setShipCarrier] = useState("");
  const [shipTrailerNumber, setShipTrailerNumber] = useState("");
  const [shipSealNumber, setShipSealNumber] = useState("");
  const [shipTo, setShipTo] = useState("");
  const [shipWeightLbs, setShipWeightLbs] = useState("");
  const [expectedOutboundId, setExpectedOutboundId] = useState("");

  const selectedCustomer = useMemo(
    () => customers.find((c) => c._id === customerId),
    [customers, customerId]
  );
  const ftlRate = selectedCustomer?.contractFtlRate;

  const sqftEach = useMemo(() => sqftFromInches(dimLength, dimWidth), [dimLength, dimWidth]);
  const neededSqft = sqftEach * palletCount;
  const availableSqft = kpis?.availableSqft;
  const spaceTight = availableSqft != null && neededSqft > availableSqft;

  /** Cesar: anything over 48" on a side needs 2 adjacent floor slots. */
  const needsDualSlot = dimLength > 48 || dimWidth > 48;
  const slotsEach = needsDualSlot ? 2 : 1;
  const slotsNeeded = palletCount * slotsEach;

  useEffect(() => {
    if (!customerId && customers[0]) setCustomerId(customers[0]._id);
  }, [customers, customerId]);

  // Cesar audit: selecting Expected must pre-fill every field it has data for
  useEffect(() => {
    if (!expectedShipmentId) return;
    const exp = (expectedData?.shipments ?? []).find((s) => s._id === expectedShipmentId);
    if (!exp) return;
    const cid = customerIdOfShipment(exp);
    if (cid) setCustomerId(cid);
    if (exp.carrier) setCarrier(exp.carrier);
    if (exp.poNumber || exp.jobName) setPoOrJob(exp.jobName || exp.poNumber || "");
    const planned = expectedPalletCountOf(exp);
    if (planned != null) setPalletCountStr(String(planned));
    if (exp.weightLbs != null && exp.weightLbs !== undefined) {
      const each = planned && planned > 0 ? Number(exp.weightLbs) / planned : Number(exp.weightLbs);
      if (Number.isFinite(each) && each > 0) setWeightLbsEach(String(Math.round(each * 100) / 100));
    }
    if (exp.notes) setRef(exp.notes);
    if (exp.billAsFtl) setBillAsFtl(true);
  }, [expectedShipmentId, expectedData]);

  // Cesar audit: Expected Outbound → Ship pre-fill (selector was missing entirely)
  useEffect(() => {
    if (!expectedOutboundId) return;
    const exp = (expectedOutData?.shipments ?? []).find((s) => s._id === expectedOutboundId);
    if (!exp) return;
    const cid = customerIdOfShipment(exp);
    if (cid) setCustomerId(cid);
    if (exp.carrier) setShipCarrier(exp.carrier);
    if (exp.trailerNumber) setShipTrailerNumber(exp.trailerNumber);
    if (exp.sealNumber) setShipSealNumber(exp.sealNumber);
    if (exp.shipTo) setShipTo(exp.shipTo);
    if (exp.weightLbs != null) setShipWeightLbs(String(exp.weightLbs));
  }, [expectedOutboundId, expectedOutData]);

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

  /** Only this customer's pallets are shippable at once — matches the backend's single-customer rule. */
  const shipPallets = useMemo(
    () => (customerId ? activePallets.filter((p) => customerIdOf(p) === customerId) : activePallets),
    [activePallets, customerId]
  );

  const shipableSelected = useMemo(
    () => activePallets.filter((p) => selectedShipIds.includes(p._id)),
    [activePallets, selectedShipIds]
  );

  // If pallets were pre-selected (e.g. leftover from a prior filter) make sure the
  // chosen customer always matches what's actually checked.
  useEffect(() => {
    if (selectedShipIds.length === 0) return;
    const first = activePallets.find((p) => p._id === selectedShipIds[0]);
    if (!first) return;
    const cid = customerIdOf(first);
    if (cid && cid !== customerId) setCustomerId(cid);
    // customerId intentionally omitted — this effect only reacts to selection changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedShipIds, activePallets]);

  // Cesar: total weight defaults to sum of selected pallet weights
  useEffect(() => {
    if (selectedShipIds.length === 0) {
      setShipWeightLbs("");
      return;
    }
    const sum = activePallets
      .filter((p) => selectedShipIds.includes(p._id))
      .reduce((s, p) => s + (Number(p.weightLbs) || 0), 0);
    setShipWeightLbs(sum > 0 ? String(Math.round(sum * 100) / 100) : "");
  }, [selectedShipIds, activePallets]);

  const availableLocations = locData?.locations ?? [];

  async function printBol(shipmentId: string) {
    setError("");
    try {
      const html = await apiFetchHtml(`/shipments/${shipmentId}/bol`, token);
      openHtmlForPrint(html);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not open BOL");
    }
  }

  async function onReceive(e: FormEvent) {
    e.preventDefault();
    if (!token || !warehouse || !customerId) return;
    if (locationMode === "choose" && chosenLocationIds.length < slotsNeeded) {
      setError(`Choose ${slotsNeeded} location(s) (selected ${chosenLocationIds.length}).`);
      return;
    }
    setBusy(true);
    setError("");
    setMessage("");
    setBolInfo(null);
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
          weightLbsEach: weightLbsEach === "" ? undefined : Number(weightLbsEach),
          billAsFtl,
          carrier,
          locationMode,
          locationIds: locationMode === "choose" ? chosenLocationIds.slice(0, slotsNeeded) : [],
          expectedShipmentId: expectedShipmentId || undefined,
        }),
      });
      const labelCount = result.pallets.reduce(
        (n, p) => n + (p.secondaryLocationId ? 2 : 1),
        0
      );
      setMessage(
        `Received ${result.pallets.length} pallet(s) · Staged for Store · ${labelCount} barcode label(s) — print labels, then open shipment to Close BOL (signatures → invoice)`
      );
      if (result.shipment?.bolNumber) {
        setBolInfo({ id: result.shipment._id, bolNumber: result.shipment.bolNumber });
      }
      setDescription("");
      setRef("");
      setExpectedShipmentId("");
      setWeightLbsEach("");
      setPalletCountStr("1");
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
    if (!token || !warehouse || selectedShipIds.length === 0) return;
    const staged = shipPallets.filter(
      (p) => selectedShipIds.includes(p._id) && p.status === "staged_for_store"
    );
    if (staged.length > 0) {
      const ok = window.confirm(
        `${staged.length} selected pallet(s) are still Staged for Store (never putaway-confirmed).\n\nShip them anyway? (Same-day turn / informal cross-dock.)`
      );
      if (!ok) return;
    }

    setBusy(true);
    setError("");
    setMessage("");
    setBolInfo(null);
    try {
      const result = await api<{ shipment: Shipment; nextStep?: string }>(
        "/shipments/ship",
        {
          method: "POST",
          token,
          body: JSON.stringify({
            warehouseId: warehouse._id,
            customerId: customerId || undefined,
            palletIds: selectedShipIds,
            billAsFtl,
            carrier: shipCarrier,
            trailerNumber: shipTrailerNumber,
            sealNumber: shipSealNumber,
            shipTo: shipTo || undefined,
            weightLbs: shipWeightLbs === "" ? undefined : Number(shipWeightLbs),
            expectedShipmentId: expectedOutboundId || undefined,
          }),
        }
      );
      setMessage(
        `Shipped ${selectedShipIds.length} pallet(s) — ${result.shipment._id.slice(-6)}${
          result.shipment.bolNumber ? ` · BOL ${result.shipment.bolNumber}` : ""
        }. Close BOL on the shipment to create the QuickBooks invoice.`
      );
      if (result.shipment?.bolNumber) {
        setBolInfo({ id: result.shipment._id, bolNumber: result.shipment.bolNumber });
      }
      setSelectedShipIds([]);
      setShipCarrier("");
      setShipTrailerNumber("");
      setShipSealNumber("");
      setShipTo("");
      setShipWeightLbs("");
      setExpectedOutboundId("");
      invalidateApiCache();
      await Promise.all([
        reloadShipments(),
        reloadPallets(),
        reloadLocs(),
        reloadDash(),
        reloadExpectedOut(),
      ]);
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
      if (ids.length >= slotsNeeded) return [...ids.slice(1), id];
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
      key: "customer",
      header: "Customer",
      render: (s) => (s.customerId && typeof s.customerId === "object" ? s.customerId.name || "—" : "—"),
    },
    {
      key: "bol",
      header: "BOL #",
      render: (s) => s.bolNumber || "—",
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

  const headerIcon =
    mode === "store" ? (
      <ScanBarcode className="h-5 w-5" />
    ) : mode === "ship" ? (
      <Truck className="h-5 w-5" />
    ) : (
      <PackagePlus className="h-5 w-5" />
    );

  /** Split pages use full width; combined "all" keeps a 2-column ops board. */
  const opsLayoutClass =
    mode === "all"
      ? "mb-6 grid gap-4 sm:gap-5 lg:grid-cols-2"
      : mode === "store"
        ? "mb-6 grid gap-4 sm:gap-5 lg:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]"
        : "mb-6 w-full";

  return (
    <>
      <PageHeader title={title} icon={headerIcon} description={pageDescription} />
      <Alert>{error}</Alert>
      {message ? <Alert tone="info">{message}</Alert> : null}
      {bolInfo ? (
        <Alert tone="success">
          <div className="flex flex-wrap items-center gap-3">
            <span>
              BOL <strong>{bolInfo.bolNumber}</strong> opened — sign &amp; close on shipment detail
              to invoice.
            </span>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              icon={<Printer className="h-3.5 w-3.5" />}
              onClick={() => printBol(bolInfo.id)}
            >
              Print BOL draft
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => navigate(`/shipments/${bolInfo.id}`)}
            >
              Close BOL →
            </Button>
          </div>
        </Alert>
      ) : null}
      {showReceive && spaceTight ? (
        <Alert>
          This receipt needs ~{neededSqft} SF but only {availableSqft} SF is available in the
          warehouse. You can still receive, but capacity is tight.
        </Alert>
      ) : null}

      {(showReceive || showStore) ? (
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
      ) : null}

      <div className={opsLayoutClass}>
        {showReceive ? (
        <FormSection
          title="Receive inbound"
          description="From Expected or manual. Location goes on the barcode; status stays Staged for Store until putaway. Unload invoices when you Close BOL."
          icon={<PackagePlus className="h-4 w-4" />}
          className={mode === "receive" ? "w-full" : undefined}
        >
          <form onSubmit={onReceive} className="space-y-4">
            <FormGrid cols={mode === "receive" ? 3 : 2}>
              <Field label="From Expected inbound" hint="Optional — type to search Expected loads.">
                <SearchableSelect
                  value={expectedShipmentId}
                  onChange={setExpectedShipmentId}
                  options={(expectedData?.shipments ?? []).map((s) => {
                    const cust =
                      s.customerId && typeof s.customerId === "object"
                        ? s.customerId.name || ""
                        : "";
                    const planned = expectedPalletCountOf(s);
                    const ref = (s.jobName || s.poNumber || s.notes || s._id.slice(-6)).slice(0, 40);
                    return {
                      value: s._id,
                      label: `${cust ? `${cust} · ` : ""}${ref}${planned ? ` · ${planned} plt` : ""} · ${dateLabel(s.scheduledAt || s.createdAt)}`,
                      keywords: `${cust} ${s.carrier || ""} ${s.trailerNumber || ""}`,
                    };
                  })}
                  allowEmpty
                  emptyOptionLabel="Manual receive (no Expected)"
                  placeholder="Search Expected…"
                  searchPlaceholder="Search PO, job, notes…"
                />
              </Field>
              <Field label="Customer" required>
                <SearchableSelect
                  value={customerId}
                  onChange={setCustomerId}
                  options={customers.map((c) => ({
                    value: c._id,
                    label: c.name,
                    keywords: c.email,
                  }))}
                  required
                  placeholder="Search customer…"
                  searchPlaceholder="Search by name or email…"
                />
              </Field>
              <Field label="PO / Job name" required hint="Printed on the barcode label.">
                <Input
                  value={poOrJob}
                  onChange={(e) => setPoOrJob(e.target.value)}
                  placeholder="One reference — PO or job name"
                  required
                />
              </Field>
              <Field label="Pallet count">
                <NumberInput
                  decimal={false}
                  value={palletCountStr}
                  onValueChange={(v) => {
                    setPalletCountStr(v);
                    const n = Math.min(50, Math.max(1, Number(v) || 1));
                    setChosenLocationIds((ids) => ids.slice(0, n * slotsEach));
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
              <Field label="Reference / BOL">
                <Input value={ref} onChange={(e) => setRef(e.target.value)} />
              </Field>
            </FormGrid>

            <div
              className={
                mode === "receive"
                  ? "grid gap-3 sm:gap-4 lg:grid-cols-2"
                  : "space-y-4"
              }
            >
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
                  <div className="mt-3 max-h-48 space-y-1 overflow-y-auto rounded-lg border border-border bg-white p-2 sm:max-h-56">
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
                      Selected {chosenLocationIds.length} / {slotsNeeded}
                      {needsDualSlot ? " (2 adjacent slots per oversized pallet)" : ""}
                    </p>
                  </div>
                ) : (
                  <p className="m-0 mt-2 text-xs text-muted">
                    Will reserve the next {slotsNeeded} open slot{slotsNeeded === 1 ? "" : "s"} and
                    print the label{palletCount === 1 ? "" : "s"}.
                    {needsDualSlot
                      ? ` Oversized footprint — each pallet reserves 2 adjacent slots.`
                      : ""}
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
                    <NumberInput
                      decimal={false}
                      value={dimLengthStr}
                      onValueChange={setDimLengthStr}
                    />
                  </Field>
                  <Field label="Width (in)">
                    <NumberInput
                      decimal={false}
                      value={dimWidthStr}
                      onValueChange={setDimWidthStr}
                    />
                  </Field>
                  <Field label="Sq ft / pallet" hint={`Load total ~${neededSqft} SF`}>
                    <Input value={sqftEach} readOnly />
                  </Field>
                </FormGrid>
                {needsDualSlot ? (
                  <p className="m-0 mt-2 text-xs font-semibold text-accent-dark">
                    Over 48″ on a side — each pallet needs 2 adjacent floor slots.
                  </p>
                ) : null}
                <div className="mt-3">
                  <Field
                    label="Weight / pallet (lbs)"
                    hint="Optional — used on the BOL and pallet label. Leave blank if unknown."
                  >
                    <NumberInput
                      value={weightLbsEach}
                      onValueChange={setWeightLbsEach}
                      placeholder="Optional"
                    />
                  </Field>
                </div>
              </div>
            </div>

            <FormGrid cols={mode === "receive" ? 2 : 2}>
              <Field label="Description">
                <Input value={description} onChange={(e) => setDescription(e.target.value)} />
              </Field>
              <div className="flex flex-col justify-end gap-3 pb-0.5">
                <CheckboxField checked={billAsFtl} onChange={setBillAsFtl}>
                  Bill as FTL
                  {ftlRate != null ? ` (${money(ftlRate)})` : ""} instead of per-pallet handling
                </CheckboxField>
              </div>
            </FormGrid>
            <Button type="submit" loading={busy} icon={<PackagePlus className="h-4 w-4" />}>
              Receive & print labels
            </Button>
          </form>
        </FormSection>
        ) : null}

        {showStore ? (
          <FormSection
            title="Store (putaway)"
            description="Scan the pallet barcode, then scan the storage location. Job done."
            icon={<ScanBarcode className="h-4 w-4" />}
          >
            <form onSubmit={onStore} className="space-y-4">
              <FormGrid cols={mode === "store" ? 2 : 1}>
                <Field label="Pallet barcode / ID" hint="Scan or type the pallet ID from the label.">
                  <Input
                    value={storePalletCode}
                    onChange={(e) => setStorePalletCode(e.target.value)}
                    placeholder="e.g. PLT-20041"
                    autoComplete="off"
                    required
                    className="font-mono text-base sm:text-lg"
                  />
                </Field>
                <Field label="Storage location" hint="Scan or type the bin code.">
                  <Input
                    value={storeLocationCode}
                    onChange={(e) => setStoreLocationCode(e.target.value)}
                    placeholder="e.g. A-01-01"
                    autoComplete="off"
                    required
                    className="font-mono text-base sm:text-lg"
                  />
                </Field>
              </FormGrid>
              <Button type="submit" loading={busy} icon={<ScanBarcode className="h-4 w-4" />}>
                Confirm store
              </Button>
            </form>
          </FormSection>
        ) : null}

        {showStore && mode === "store" ? (
          <FormSection
            title={`Waiting for Store (${pendingStore.length})`}
            description="Tap a pallet to fill the scan fields. Hands-free: scan pallet → Enter → scan location → Enter."
            icon={<ClipboardList className="h-4 w-4" />}
          >
            {pendingStore.length === 0 ? (
              <p className="m-0 text-sm text-muted">No pallets staged for putaway.</p>
            ) : (
              <ul className="m-0 max-h-[min(28rem,55vh)] list-none space-y-1 overflow-y-auto p-0 text-sm">
                {pendingStore.map((p) => (
                  <li key={p._id}>
                    <button
                      type="button"
                      className="flex w-full flex-wrap items-center gap-2 rounded-lg border border-transparent px-2.5 py-2.5 text-left hover:border-border hover:bg-surface-2"
                      onClick={() => {
                        setStorePalletCode(p.externalId);
                        const code = locationCodeOf(p.locationId, p.locationCode);
                        if (code && code !== "—") setStoreLocationCode(code);
                      }}
                    >
                      <span className="font-mono font-semibold text-navy">{p.externalId}</span>
                      <Badge tone="warning">{statusLabel(p.status)}</Badge>
                      <span className="text-xs text-muted">
                        {locationCodeOf(p.locationId, p.locationCode) !== "—"
                          ? `→ ${locationCodeOf(p.locationId, p.locationCode)}`
                          : "No slot"}
                        {p.secondaryLocationId || p.secondaryLocationCode
                          ? ` + ${locationCodeOf(p.secondaryLocationId, p.secondaryLocationCode)}`
                          : ""}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </FormSection>
        ) : null}

        {showStore && mode === "all" && pendingStore.length > 0 ? (
          <div className="rounded-[var(--radius)] border border-border bg-surface-2/50 p-3 lg:col-span-2">
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
                      const code = locationCodeOf(p.locationId, p.locationCode);
                      if (code && code !== "—") setStoreLocationCode(code);
                    }}
                  >
                    {p.externalId}
                  </button>
                  <Badge tone="warning">{statusLabel(p.status)}</Badge>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {showShip ? (
          <FormSection
            title="Ship outbound"
            description="From Expected outbound or select pallets, generate a pick list, then ship. Load invoices when you Close BOL."
            icon={<Truck className="h-4 w-4" />}
            className={mode === "ship" || mode === "all" ? "w-full lg:col-span-2" : undefined}
          >
            <form onSubmit={onShip} className="space-y-4">
              <FormGrid cols={mode === "ship" ? 2 : 1}>
                <Field
                  label="From Expected outbound"
                  hint="Optional — pre-fills customer / carrier / trailer / weight and closes the appointment on ship."
                >
                  <SearchableSelect
                    value={expectedOutboundId}
                    onChange={setExpectedOutboundId}
                    options={(expectedOutData?.shipments ?? []).map((s) => {
                      const cust =
                        s.customerId && typeof s.customerId === "object"
                          ? s.customerId.name || ""
                          : "";
                      const planned = expectedPalletCountOf(s);
                      const ref = (s.jobName || s.poNumber || s.notes || s._id.slice(-6)).slice(0, 40);
                      return {
                        value: s._id,
                        label: `${cust ? `${cust} · ` : ""}${ref}${planned ? ` · ${planned} plt` : ""} · ${dateLabel(s.scheduledAt || s.createdAt)}`,
                        keywords: `${cust} ${s.carrier || ""} ${s.trailerNumber || ""}`,
                      };
                    })}
                    allowEmpty
                    emptyOptionLabel="Manual ship (no Expected)"
                    placeholder="Search Expected outbound…"
                    searchPlaceholder="Search PO, job, notes…"
                  />
                </Field>
                <Field label="Customer filter" hint="Limits the pallet list to one account.">
                  <SearchableSelect
                    value={customerId}
                    onChange={setCustomerId}
                    options={customers.map((c) => ({
                      value: c._id,
                      label: c.name,
                      keywords: c.email,
                    }))}
                    allowEmpty
                    emptyOptionLabel="All customers (select carefully)"
                    placeholder="Search customer…"
                    searchPlaceholder="Search by name or email…"
                  />
                </Field>
              </FormGrid>
              {customerId ? (
                <p className="m-0 text-xs text-muted">
                  Showing <strong className="text-navy">{selectedCustomer?.name || "selected customer"}</strong>
                  &rsquo;s pallets only ({shipPallets.length} available).
                </p>
              ) : null}
              <div
                className={
                  mode === "ship"
                    ? "max-h-[min(22rem,50vh)] space-y-1 overflow-y-auto rounded-[var(--radius)] border border-border bg-surface-2/50 p-2 sm:max-h-[min(28rem,55vh)]"
                    : "max-h-64 space-y-1 overflow-y-auto rounded-[var(--radius)] border border-border bg-surface-2/50 p-2"
                }
              >
                {shipPallets.length === 0 ? (
                  <p className="m-0 p-3 text-sm text-muted">No active pallets to ship for this filter.</p>
                ) : (
                  <div className={mode === "ship" ? "grid gap-1 sm:grid-cols-2 xl:grid-cols-3" : ""}>
                    {shipPallets.map((p) => (
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
                          {locationCodeOf(p.locationId, p.locationCode)}
                          {p.secondaryLocationId || p.secondaryLocationCode
                            ? ` + ${locationCodeOf(p.secondaryLocationId, p.secondaryLocationCode)}`
                            : ""}
                          {" · "}
                          {p.jobName || p.poNumber || "—"}
                          {p.sqft != null ? ` · ${p.sqft} SF` : ""}
                          {p.weightLbs != null ? ` · ${p.weightLbs} lbs` : ""}
                        </span>
                      </label>
                    ))}
                  </div>
                )}
              </div>

              <FormGrid cols={mode === "ship" ? 3 : 2}>
                <Field label="Carrier">
                  <Input
                    value={shipCarrier}
                    onChange={(e) => setShipCarrier(e.target.value)}
                    placeholder="Optional"
                  />
                </Field>
                <Field label="Trailer #">
                  <Input
                    value={shipTrailerNumber}
                    onChange={(e) => setShipTrailerNumber(e.target.value)}
                    placeholder="Optional"
                  />
                </Field>
                <Field label="Seal #">
                  <Input
                    value={shipSealNumber}
                    onChange={(e) => setShipSealNumber(e.target.value)}
                    placeholder="Optional"
                  />
                </Field>
                <Field label="Ship to" hint="Defaults to the customer on file.">
                  <Input
                    value={shipTo}
                    onChange={(e) => setShipTo(e.target.value)}
                    placeholder="Optional"
                  />
                </Field>
                <Field label="Total weight (lbs)" hint="Optional — defaults to the sum of pallet weights.">
                  <NumberInput
                    value={shipWeightLbs}
                    onValueChange={setShipWeightLbs}
                    placeholder="Optional"
                  />
                </Field>
              </FormGrid>

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
        ) : null}
      </div>

      {showShip ? (
        <>
          <PageHeader title="Recent shipments" className="mb-4" />
          <DataTable
            columns={shipColumns}
            rows={shipData?.shipments ?? []}
            rowKey={(s) => s._id}
            loading={shipsLoading}
            onRowClick={(s) => navigate(`/shipments/${s._id}`)}
            emptyTitle="No shipments yet"
            emptyDescription="Receive your first inbound load above."
            pagination={paginationFrom(shipData)}
            onPageChange={setShipPage}
          />
        </>
      ) : null}

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
