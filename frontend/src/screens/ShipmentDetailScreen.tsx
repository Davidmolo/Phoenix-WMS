"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { Barcode, CheckCircle2, FilePenLine, Printer, Save, Truck } from "lucide-react";
import { BolDocumentConfirmModal } from "@/components/BolDocumentConfirmModal";
import { PalletLabelPreview } from "@/components/PalletLabelPreview";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  CardTitle,
  DataTable,
  Field,
  FormGrid,
  FormSection,
  Input,
  NumberInput,
  PageHeader,
  useDialog,
  Select,
  statusLabel,
  statusTone,
  type Column,
} from "@/components/ui";
import { api, apiFetchHtml } from "@/lib/api";
import { useApiQuery, invalidateApiCache } from "@/hooks/useApiQuery";
import { useAppNav } from "@/lib/appNav";
import { useAuth } from "@/lib/auth";
import { dateLabel, dateTimeLabel, titleCase } from "@/lib/format";
import {
  assessBolCompleteness,
  consumeBolFocusIntent,
  scrollToBolSection,
  setBolFocusIntent,
  type BolCompleteness,
} from "@/lib/bolGate";
import { openHtmlForPrint } from "@/lib/print";
import type { Pallet, Shipment } from "@/types";

type BolDoc = {
  bolNumber: string;
  totalWeightLbs: number;
  packageCount: number;
} | null;

type LienInfo = {
  hold: boolean;
  balanceDue?: number;
  count?: number;
} | null;

type DetailResponse = {
  shipment: Shipment;
  pallets: Pallet[];
  bol: BolDoc;
  lien?: LienInfo;
};

const STATUS_OPTIONS = ["expected", "arrived", "in_progress", "completed", "cancelled"] as const;

function customerNameOf(s?: Shipment) {
  if (s?.customerId && typeof s.customerId === "object") return s.customerId.name || "—";
  return "—";
}

function locationCodeOf(p: Pallet) {
  if (p.locationCode) {
    return p.secondaryLocationCode
      ? `${p.locationCode} + ${p.secondaryLocationCode}`
      : p.locationCode;
  }
  const primary =
    p.locationId && typeof p.locationId === "object" ? p.locationId.code || "" : "";
  const secondary =
    p.secondaryLocationId && typeof p.secondaryLocationId === "object"
      ? p.secondaryLocationId.code || ""
      : "";
  if (!primary && !secondary) return "—";
  return secondary ? `${primary || "—"} + ${secondary}` : primary || "—";
}

export default function ShipmentDetailScreen({ shipmentId }: { shipmentId: string }) {
  const { navigate } = useAppNav();
  const { token, user } = useAuth();
  const dialog = useDialog();
  const isStaff = user?.role === "admin" || user?.role === "staff";
  const isAdmin = user?.role === "admin";
  const { data, error, loading, reload } = useApiQuery<DetailResponse>(
    shipmentId ? `/shipments/${shipmentId}` : null
  );
  const [printBusy, setPrintBusy] = useState(false);
  const [printErr, setPrintErr] = useState("");
  const [labelPallets, setLabelPallets] = useState<Pallet[] | null>(null);
  const [bolGate, setBolGate] = useState<{
    action: "print" | "email";
    completeness: BolCompleteness;
  } | null>(null);

  const shipment = data?.shipment;
  const pallets = data?.pallets ?? [];

  // Staff edit form (Cesar modify) — synced whenever the loaded shipment changes.
  const [carrier, setCarrier] = useState("");
  const [trailerNumber, setTrailerNumber] = useState("");
  const [sealNumber, setSealNumber] = useState("");
  const [scac, setScac] = useState("");
  const [shipFrom, setShipFrom] = useState("");
  const [shipTo, setShipTo] = useState("");
  const [notes, setNotes] = useState("");
  const [weightLbs, setWeightLbs] = useState("");
  const [status, setStatus] = useState<string>("expected");
  const [editBusy, setEditBusy] = useState(false);
  const [editMsg, setEditMsg] = useState("");
  const [editErr, setEditErr] = useState("");

  // BOL workflow (Cesar brief)
  const [driverName, setDriverName] = useState("");
  const [truckNumber, setTruckNumber] = useState("");
  const [countVerified, setCountVerified] = useState(false);
  const [actualCount, setActualCount] = useState("");
  const [rewrapBanding, setRewrapBanding] = useState(false);
  const [condition, setCondition] = useState("No exceptions");
  const [exceptionNotes, setExceptionNotes] = useState("");
  const [refInboundBol, setRefInboundBol] = useState("");
  const [whName, setWhName] = useState("");
  const [drvName, setDrvName] = useState("");
  const [bolBusy, setBolBusy] = useState(false);
  const [lienOverride, setLienOverride] = useState(false);
  const [bolMsg, setBolMsg] = useState("");
  const [bolErr, setBolErr] = useState("");
  const photoInputRef = useRef<HTMLInputElement>(null);

  const bolClosed = shipment?.bol?.status === "closed";
  const lien = data?.lien;

  const bolServerKey = shipment
    ? JSON.stringify({
        driverName: shipment.bol?.driverName || "",
        truckNumber: shipment.bol?.truckNumber || "",
        countVerified: Boolean(shipment.bol?.countVerified),
        actualCount: shipment.bol?.actualCount != null ? String(shipment.bol.actualCount) : "",
        rewrapBanding: Boolean(shipment.bol?.rewrapBanding),
        condition: shipment.bol?.condition || "No exceptions",
        exceptionNotes: shipment.bol?.exceptionNotes || "",
        refInboundBol: shipment.bol?.refInboundBol || "",
      })
    : "";
  const appliedBolKey = useRef("");

  useEffect(() => {
    if (!shipment) return;
    setCarrier(shipment.carrier || "");
    setTrailerNumber(shipment.trailerNumber || "");
    setSealNumber(shipment.sealNumber || "");
    setScac(shipment.scac || "");
    setShipFrom(shipment.shipFrom || "");
    setShipTo(shipment.shipTo || "");
    setNotes(shipment.notes || "");
    setWeightLbs(shipment.weightLbs != null ? String(shipment.weightLbs) : "");
    setStatus(shipment.status || "expected");
    // Edit Shipment refetch must not wipe unsaved BOL typing.
    if (appliedBolKey.current === bolServerKey) return;
    appliedBolKey.current = bolServerKey;
    const bol = shipment.bol;
    setDriverName(bol?.driverName || "");
    setTruckNumber(bol?.truckNumber || "");
    setCountVerified(Boolean(bol?.countVerified));
    setActualCount(bol?.actualCount != null ? String(bol.actualCount) : "");
    setRewrapBanding(Boolean(bol?.rewrapBanding));
    setCondition(bol?.condition || "No exceptions");
    setExceptionNotes(bol?.exceptionNotes || "");
    setRefInboundBol(bol?.refInboundBol || "");
  }, [shipment, bolServerKey]);

  async function runPrintBol() {
    if (!shipmentId) return;
    setPrintBusy(true);
    setPrintErr("");
    try {
      const path = bolClosed
        ? `/shipments/${shipmentId}/bol/document`
        : `/shipments/${shipmentId}/bol`;
      const html = await apiFetchHtml(path, token);
      openHtmlForPrint(html);
    } catch (ex) {
      setPrintErr(ex instanceof Error ? ex.message : "Could not open BOL");
    } finally {
      setPrintBusy(false);
    }
  }

  async function printBol(opts?: { skipScroll?: boolean }) {
    if (!shipmentId || !shipment) return;
    if (!opts?.skipScroll) {
      scrollToBolSection();
    }
    const completeness = assessBolCompleteness(shipment);
    if (completeness.incomplete) {
      setBolGate({ action: "print", completeness });
      return;
    }
    await runPrintBol();
  }

  // Ops / list: Print BOL or Close BOL → land on Bill of Lading section (+ optional print gate)
  useEffect(() => {
    if (!shipment || !shipmentId) return;
    const intent = consumeBolFocusIntent(shipmentId);
    if (!intent) return;
    let ran = false;
    const t = window.setTimeout(() => {
      ran = true;
      scrollToBolSection();
      if (intent.print) {
        void printBol({ skipScroll: true });
      }
    }, 180);
    return () => {
      window.clearTimeout(t);
      // React Strict Mode remount — put the intent back if we never ran
      if (!ran) setBolFocusIntent(intent);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per shipment load with pending intent
  }, [shipment?._id, shipmentId]);

  const bolDraft = useRef({
    driverName: "",
    truckNumber: "",
    countVerified: false,
    actualCount: "",
    rewrapBanding: false,
    condition: "No exceptions",
    exceptionNotes: "",
    refInboundBol: "",
  });
  bolDraft.current = {
    driverName,
    truckNumber,
    countVerified,
    actualCount,
    rewrapBanding,
    condition,
    exceptionNotes,
    refInboundBol,
  };

  async function persistBolFields() {
    if (!token || !shipmentId || shipment?.bol?.status === "closed") return;
    const draft = bolDraft.current;
    await api(`/shipments/${shipmentId}/bol`, {
      method: "PATCH",
      token,
      body: JSON.stringify({
        driverName: draft.driverName,
        truckNumber: draft.truckNumber,
        countVerified: draft.countVerified,
        actualCount: draft.actualCount === "" ? null : Number(draft.actualCount),
        rewrapBanding: draft.rewrapBanding,
        condition: draft.condition,
        exceptionNotes: draft.exceptionNotes,
        refInboundBol: draft.refInboundBol,
      }),
    });
  }

  function holdScroll(run: () => Promise<void>) {
    const y = window.scrollY;
    const main = document.querySelector("main");
    const mainY = main instanceof HTMLElement ? main.scrollTop : 0;
    return run().finally(() => {
      const restore = () => {
        window.scrollTo(0, y);
        if (main instanceof HTMLElement) main.scrollTop = mainY;
      };
      restore();
      requestAnimationFrame(restore);
    });
  }

  async function saveBolFields() {
    if (!token || !shipmentId) return;
    setBolBusy(true);
    setBolErr("");
    setBolMsg("");
    try {
      await holdScroll(async () => {
        await persistBolFields();
        setBolMsg("BOL fields saved");
        invalidateApiCache();
        await reload();
      });
    } catch (ex) {
      setBolErr(ex instanceof Error ? ex.message : "Could not save BOL");
    } finally {
      setBolBusy(false);
    }
  }

  async function signRole(role: "driver" | "warehouse") {
    if (!token || !shipmentId) return;
    const name = role === "driver" ? drvName || driverName : whName;
    if (!name.trim()) {
      setBolErr(`Enter ${role === "driver" ? "driver" : "warehouse"} printed name before signing`);
      return;
    }
    setBolBusy(true);
    setBolErr("");
    setBolMsg("");
    try {
      await holdScroll(async () => {
        await api(`/shipments/${shipmentId}/bol/sign`, {
          method: "POST",
          token,
          body: JSON.stringify({ role, name: name.trim() }),
        });
        setBolMsg(`${role === "driver" ? "Driver" : "Warehouse"} signature captured`);
        invalidateApiCache();
        await reload();
      });
    } catch (ex) {
      setBolErr(ex instanceof Error ? ex.message : "Could not sign");
    } finally {
      setBolBusy(false);
    }
  }

  async function onPhotosSelected(files: FileList | null) {
    if (!files?.length || !token || !shipmentId) return;
    setBolBusy(true);
    setBolErr("");
    setBolMsg("");
    try {
      const photos: string[] = [];
      for (const file of Array.from(files)) {
        const dataUrl = await readFileAsDataUrl(file);
        photos.push(dataUrl);
      }
      await api(`/shipments/${shipmentId}/bol/photos`, {
        method: "POST",
        token,
        body: JSON.stringify({ photos }),
      });
      setBolMsg(`${photos.length} exception photo(s) uploaded`);
      invalidateApiCache();
      await reload();
    } catch (ex) {
      setBolErr(ex instanceof Error ? ex.message : "Could not upload photos");
    } finally {
      setBolBusy(false);
      if (photoInputRef.current) photoInputRef.current.value = "";
    }
  }

  async function closeBol() {
    if (!token || !shipmentId) return;
    setBolBusy(true);
    setBolErr("");
    setBolMsg("");
    try {
      const result = await api<{
        invoice?: { number?: string } | null;
        quickbooks?: { pushed?: boolean } | null;
      }>(`/shipments/${shipmentId}/bol/close`, {
        method: "POST",
        token,
        body: JSON.stringify({ createInvoice: true, lienOverride }),
      });
      const inv = result.invoice?.number ? ` · Invoice ${result.invoice.number}` : "";
      setBolMsg(`BOL closed and locked${inv}`);
      invalidateApiCache();
      await reload();
    } catch (ex) {
      setBolErr(ex instanceof Error ? ex.message : "Could not close BOL");
    } finally {
      setBolBusy(false);
    }
  }

  async function startAmend() {
    if (!token || !shipmentId) return;
    const reason = await dialog.prompt({
      title: "Start amendment",
      message: "Signed BOLs stay locked. A reason is required before the document can be signed again.",
      label: "Amendment reason",
      confirmLabel: "Start amendment",
    });
    if (!reason?.trim()) return;
    setBolBusy(true);
    setBolErr("");
    setBolMsg("");
    try {
      await api(`/shipments/${shipmentId}/bol/amend`, {
        method: "POST",
        token,
        body: JSON.stringify({ reason: reason.trim() }),
      });
      setBolMsg("Amendment started — re-sign both parties, then Close BOL again");
      invalidateApiCache();
      await reload();
    } catch (ex) {
      setBolErr(ex instanceof Error ? ex.message : "Could not amend");
    } finally {
      setBolBusy(false);
    }
  }

  async function onSaveEdit(e: FormEvent) {
    e.preventDefault();
    if (!token || !shipmentId) return;
    setEditBusy(true);
    setEditErr("");
    setEditMsg("");
    try {
      await holdScroll(async () => {
        await persistBolFields();
        await api(`/shipments/${shipmentId}`, {
          method: "PATCH",
          token,
          body: JSON.stringify({
            carrier,
            trailerNumber,
            sealNumber,
            scac,
            shipFrom,
            shipTo,
            notes,
            weightLbs: weightLbs === "" ? null : Number(weightLbs),
            status,
          }),
        });
        setEditMsg("Shipment updated. BOL fields were saved too.");
        invalidateApiCache();
        await reload();
      });
    } catch (ex) {
      setEditErr(ex instanceof Error ? ex.message : "Could not update shipment");
    } finally {
      setEditBusy(false);
    }
  }

  const palletCols: Column<Pallet>[] = [
    {
      key: "id",
      header: "Pallet",
      render: (p) => <span className="font-semibold">{p.externalId}</span>,
    },
    {
      key: "status",
      header: "Status",
      render: (p) => <Badge tone={statusTone(p.status)}>{statusLabel(p.status)}</Badge>,
    },
    {
      key: "loc",
      header: "Location",
      render: (p) => locationCodeOf(p),
    },
    { key: "job", header: "Job / PO", render: (p) => p.jobName || p.poNumber || "—" },
    {
      key: "weight",
      header: "Weight",
      render: (p) => (p.weightLbs != null ? `${p.weightLbs} lbs` : "—"),
    },
    { key: "sqft", header: "SF", render: (p) => (p.sqft != null ? p.sqft : "—") },
  ];

  return (
    <>
      <PageHeader
        title={loading ? "Shipment…" : `Shipment ${shipment?._id?.slice(-6) || ""}`}
        icon={<Truck className="h-5 w-5" />}
        description={
          shipment
            ? `${titleCase(shipment.direction)} · ${customerNameOf(shipment)} · ${statusLabel(shipment.status)}`
            : "Loading shipment detail"
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="secondary"
              icon={<Barcode className="h-3.5 w-3.5" />}
              onClick={() => setLabelPallets(pallets)}
              disabled={pallets.length === 0}
            >
              Print pallet barcodes
            </Button>
            {shipment?.direction === "outbound" || bolClosed ? (
              <Button
                type="button"
                size="sm"
                variant="secondary"
                icon={<Printer className="h-3.5 w-3.5" />}
                onClick={() => void printBol()}
                loading={printBusy}
                disabled={!shipment}
              >
                {bolClosed ? "Open signed BOL" : "Print BOL"}
              </Button>
            ) : null}
            <button
              type="button"
              onClick={() => navigate("/shipments")}
              className="text-sm font-semibold text-accent-dark hover:underline"
            >
              ← All shipments
            </button>
          </div>
        }
      />
      <Alert>{error || printErr}</Alert>
      {lien?.hold ? (
        <Alert tone="danger">
          Lien hold — account past due
          {lien.balanceDue != null ? ` ($${Number(lien.balanceDue).toFixed(2)})` : ""}. Outbound
          release and BOL close stay blocked until the account is current. Inbound receive is not
          held. An admin can override the block on Ship or Close BOL.
        </Alert>
      ) : null}

      {shipment ? (
        <>
          <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            <Stat label="Direction" value={titleCase(shipment.direction)} />
            <Stat label="Status" value={statusLabel(shipment.status)} />
            <Stat label="Service type" value={statusLabel(shipment.serviceType) || "—"} />
            {shipment.direction === "outbound" || shipment.bolNumber ? (
              <>
                <Stat label="BOL #" value={shipment.bolNumber || "—"} />
                <Stat
                  label="BOL status"
                  value={statusLabel(shipment.bol?.status || "draft")}
                />
              </>
            ) : (
              <Stat label="BOL" value="N/A (inbound)" />
            )}
            <Stat label="Carrier" value={shipment.carrier || "—"} />
            <Stat label="Trailer #" value={shipment.trailerNumber || "—"} />
            <Stat label="Seal #" value={shipment.sealNumber || "—"} />
            <Stat label="SCAC" value={shipment.scac || "—"} />
            <Stat label="Weight" value={shipment.weightLbs != null ? `${shipment.weightLbs} lbs` : "—"} />
            <Stat label="Pallets" value={pallets.length} />
            <Stat label="Completed" value={dateLabel(shipment.completedAt || shipment.createdAt)} />
            <Stat label="Scheduled" value={shipment.scheduledAt ? dateTimeLabel(shipment.scheduledAt) : "—"} />
          </div>

          <Card className="mb-5">
            <CardBody>
              <CardTitle>{shipment.direction === "inbound" ? "Receipt route" : "Route"}</CardTitle>
              <div className="mt-2 grid gap-2 text-sm text-muted sm:grid-cols-2">
                <div>
                  <span className="font-semibold text-text">
                    {shipment.direction === "inbound" ? "From: " : "Ship from: "}
                  </span>
                  {shipment.shipFrom || "—"}
                </div>
                <div>
                  <span className="font-semibold text-text">
                    {shipment.direction === "inbound" ? "To warehouse: " : "Ship to: "}
                  </span>
                  {shipment.shipTo || "—"}
                </div>
                <div>
                  <span className="font-semibold text-text">Third party: </span>
                  {shipment.thirdParty || "—"}
                </div>
                <div>
                  <span className="font-semibold text-text">Customer: </span>
                  {customerNameOf(shipment)}
                </div>
                <div className="sm:col-span-2">
                  <span className="font-semibold text-text">Notes: </span>
                  {shipment.notes || "—"}
                </div>
              </div>
            </CardBody>
          </Card>

          {shipment.direction === "inbound" && !bolClosed ? (
            <Card className="mb-5">
              <CardBody>
                <CardTitle>Inbound receipt</CardTitle>
                <p className="mt-2 mb-0 text-sm text-muted">
                  Cesar: inbound / Receive does not create a Bill of Lading. Unload charges invoice
                  when freight is received. Print pallet barcodes, then Store scan to putaway.
                </p>
              </CardBody>
            </Card>
          ) : isStaff ? (
            <div id="bol-section" className="mb-5 scroll-mt-4">
            <FormSection
              title="Bill of Lading"
              description={
                bolClosed
                  ? "Signed BOL is locked. Use amendment for corrections. Invoice created on close."
                  : "Verify count, capture signatures, attach exception photos, then Close BOL to invoice."
              }
              icon={<FilePenLine className="h-4 w-4" />}
            >

              <Alert>{bolErr}</Alert>
              {bolMsg ? <Alert tone="success">{bolMsg}</Alert> : null}
              {shipment.direction === "outbound" ? (
                <p className="mb-3 text-sm text-muted">
                  Ref inbound receipt / BOL:{" "}
                  <strong className="text-text">{shipment.bol?.refInboundBol || refInboundBol || "—"}</strong>
                </p>
              ) : null}
              <div className="mb-3 flex flex-wrap gap-2 text-xs">
                {(shipment.bol?.signatures || []).map((s) => (
                  <Badge key={s.role} tone="success">
                    {s.role}: {s.name}
                    {s.signedAt ? ` · ${dateTimeLabel(s.signedAt)}` : ""}
                  </Badge>
                ))}
                {(shipment.bol?.exceptionPhotoPaths?.length || 0) > 0 ? (
                  <Badge tone="accent">
                    {shipment.bol?.exceptionPhotoPaths?.length} exception photo(s)
                  </Badge>
                ) : null}
              </div>
              {!bolClosed ? (
                <>
                  <FormGrid cols={3}>
                    <Field label="Driver name">
                      <Input
                        value={driverName}
                        onChange={(e) => setDriverName(e.target.value)}
                        onBlur={() => void persistBolFields().catch(() => undefined)}
                      />
                    </Field>
                    <Field label="Truck #">
                      <Input
                        value={truckNumber}
                        onChange={(e) => setTruckNumber(e.target.value)}
                        onBlur={() => void persistBolFields().catch(() => undefined)}
                      />
                    </Field>
                    {shipment.direction === "outbound" ? (
                      <Field
                        label="Ref inbound receipt / BOL #"
                        hint="Inbound has no BOL — use receipt id or legacy BOL #."
                      >
                        <Input
                          value={refInboundBol}
                          onChange={(e) => setRefInboundBol(e.target.value)}
                          placeholder="Required on close"
                        />
                      </Field>
                    ) : null}
                    <Field label="Condition">
                      <Select value={condition} onChange={(e) => setCondition(e.target.value)}>
                        <option>No exceptions</option>
                        <option>Damage</option>
                        <option>Shortage</option>
                        <option>Overage</option>
                      </Select>
                    </Field>
                    <Field label="Actual count">
                      <NumberInput
                        value={actualCount}
                        onValueChange={setActualCount}
                        onBlur={() => void persistBolFields().catch(() => undefined)}
                      />
                    </Field>
                    <Field label="Exception notes">
                      <Input
                        value={exceptionNotes}
                        onChange={(e) => setExceptionNotes(e.target.value)}
                      />
                    </Field>
                  </FormGrid>
                  <div className="mt-3 flex flex-wrap items-center gap-4 text-sm">
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={countVerified}
                        onChange={(e) => setCountVerified(e.target.checked)}
                      />
                      Count verified
                    </label>
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={rewrapBanding}
                        onChange={(e) => setRewrapBanding(e.target.checked)}
                      />
                      Re-wrap / banding
                    </label>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button type="button" variant="secondary" loading={bolBusy} onClick={() => void saveBolFields()}>
                      Save BOL fields
                    </Button>
                    <input
                      ref={photoInputRef}
                      type="file"
                      accept="image/*"
                      multiple
                      className="hidden"
                      onChange={(e) => void onPhotosSelected(e.target.files)}
                    />
                    <Button
                      type="button"
                      variant="secondary"
                      loading={bolBusy}
                      onClick={() => photoInputRef.current?.click()}
                    >
                      Add exception photos
                    </Button>
                  </div>
                  <FormGrid cols={2} className="mt-4">
                    <Field label="Driver printed name (sign)">
                      <div className="flex gap-2">
                        <Input
                          value={drvName || driverName}
                          onChange={(e) => setDrvName(e.target.value)}
                          placeholder="Driver"
                        />
                        <Button type="button" loading={bolBusy} onClick={() => void signRole("driver")}>
                          Sign
                        </Button>
                      </div>
                    </Field>
                    <Field label="Warehouse printed name (sign)">
                      <div className="flex gap-2">
                        <Input value={whName} onChange={(e) => setWhName(e.target.value)} placeholder="Warehouse" />
                        <Button type="button" loading={bolBusy} onClick={() => void signRole("warehouse")}>
                          Sign
                        </Button>
                      </div>
                    </Field>
                  </FormGrid>
                  <div className="mt-4 space-y-3">
                    {isAdmin ? (
                      <label className="flex items-center gap-2 text-sm text-navy">
                        <input
                          type="checkbox"
                          checked={lienOverride}
                          onChange={(e) => setLienOverride(e.target.checked)}
                        />
                        Admin override — close this BOL even if the customer is past due
                      </label>
                    ) : null}
                    <Button
                      type="button"
                      loading={bolBusy}
                      icon={<CheckCircle2 className="h-4 w-4" />}
                      onClick={() => void closeBol()}
                    >
                      Close BOL → invoice
                    </Button>
                  </div>
                </>
              ) : (
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="secondary" loading={bolBusy} onClick={() => void printBol()}>
                    View signed document
                  </Button>
                  <Button type="button" variant="secondary" loading={bolBusy} onClick={() => void startAmend()}>
                    Start amendment
                  </Button>
                </div>
              )}
            </FormSection>
            </div>
          ) : (
            <div id="bol-section" className="mb-5 scroll-mt-4">
            <Card>
              <CardBody>
                <CardTitle>Bill of Lading</CardTitle>
                <p className="mt-2 text-sm text-muted">
                  Status: <strong>{statusLabel(shipment.bol?.status || "draft")}</strong>
                  {shipment.bol?.closedAt
                    ? ` · Closed ${dateTimeLabel(shipment.bol.closedAt)}`
                    : ""}
                </p>
                {bolClosed ? (
                  <div className="mt-3">
                    <Button type="button" size="sm" variant="secondary" onClick={() => void printBol()}>
                      View / print signed BOL
                    </Button>
                  </div>
                ) : (
                  <p className="mt-2 text-sm text-muted">Signed copy appears here after warehouse closes the BOL.</p>
                )}
              </CardBody>
            </Card>
            </div>
          )}

          {isStaff ? (
            <FormSection
              title="Edit shipment"
              description={
                bolClosed
                  ? "Freight fields locked after BOL close — use amendment."
                  : "Carrier / trailer / seal, route, weight, and status — Cesar modify."
              }
              icon={<Save className="h-4 w-4" />}
              className="mb-5"
            >
              <Alert>{editErr}</Alert>
              {editMsg ? <Alert tone="success">{editMsg}</Alert> : null}
              <form onSubmit={onSaveEdit} className="space-y-4">
                <FormGrid cols={3}>
                  <Field label="Carrier">
                    <Input value={carrier} onChange={(e) => setCarrier(e.target.value)} placeholder="Optional" />
                  </Field>
                  <Field label="Trailer #">
                    <Input
                      value={trailerNumber}
                      onChange={(e) => setTrailerNumber(e.target.value)}
                      placeholder="Optional"
                    />
                  </Field>
                  <Field label="Seal #">
                    <Input
                      value={sealNumber}
                      onChange={(e) => setSealNumber(e.target.value)}
                      placeholder="Optional"
                    />
                  </Field>
                  <Field label="SCAC">
                    <Input value={scac} onChange={(e) => setScac(e.target.value)} placeholder="Optional" />
                  </Field>
                  <Field label="Ship from">
                    <Input value={shipFrom} onChange={(e) => setShipFrom(e.target.value)} placeholder="Optional" />
                  </Field>
                  <Field label="Ship to">
                    <Input value={shipTo} onChange={(e) => setShipTo(e.target.value)} placeholder="Optional" />
                  </Field>
                  <Field label="Weight (lbs)">
                    <NumberInput
                      value={weightLbs}
                      onValueChange={setWeightLbs}
                      placeholder="Optional"
                    />
                  </Field>
                  <Field label="Status">
                    <Select value={status} onChange={(e) => setStatus(e.target.value)}>
                      {STATUS_OPTIONS.map((opt) => (
                        <option key={opt} value={opt}>
                          {statusLabel(opt)}
                        </option>
                      ))}
                    </Select>
                  </Field>
                </FormGrid>
                <Field label="Notes">
                  <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" />
                </Field>
                <Button type="submit" loading={editBusy} icon={<Save className="h-4 w-4" />}>
                  Save changes
                </Button>
              </form>
            </FormSection>
          ) : null}

          <div className="mb-5">
            <PageHeader title="Pallets" />
            <DataTable
              columns={palletCols}
              rows={pallets}
              rowKey={(p) => p._id}
              loading={loading}
              emptyTitle="No pallets on this shipment"
            />
          </div>
        </>
      ) : null}

      {labelPallets ? (
        <PalletLabelPreview pallets={labelPallets} onClose={() => setLabelPallets(null)} />
      ) : null}

      <BolDocumentConfirmModal
        open={Boolean(bolGate)}
        action={bolGate?.action ?? "print"}
        completeness={bolGate?.completeness ?? { incomplete: true, missing: [] }}
        onCancel={() => setBolGate(null)}
        onConfirm={() => {
          const next = bolGate?.action ?? "print";
          setBolGate(null);
          if (next === "print") void runPrintBol();
        }}
      />
    </>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <Card>
      <CardBody>
        <div className="text-[11px] font-semibold tracking-wide text-muted uppercase">{label}</div>
        <div className="mt-1 text-[15px] font-bold tabular-nums text-navy">{value}</div>
      </CardBody>
    </Card>
  );
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Could not read image"));
    reader.readAsDataURL(file);
  });
}
