"use client";

import { FormEvent, useEffect, useState } from "react";
import { Barcode, Printer, Save, Truck } from "lucide-react";
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
import { openHtmlForPrint } from "@/lib/print";
import type { Pallet, Shipment } from "@/types";

type BolDoc = {
  bolNumber: string;
  totalWeightLbs: number;
  packageCount: number;
} | null;

type DetailResponse = {
  shipment: Shipment;
  pallets: Pallet[];
  bol: BolDoc;
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
  const isStaff = user?.role === "admin" || user?.role === "staff";
  const { data, error, loading, reload } = useApiQuery<DetailResponse>(
    shipmentId ? `/shipments/${shipmentId}` : null
  );
  const [printBusy, setPrintBusy] = useState(false);
  const [printErr, setPrintErr] = useState("");
  const [labelPallets, setLabelPallets] = useState<Pallet[] | null>(null);

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
  }, [shipment]);

  async function printBol() {
    if (!shipmentId) return;
    setPrintBusy(true);
    setPrintErr("");
    try {
      const html = await apiFetchHtml(`/shipments/${shipmentId}/bol`, token);
      openHtmlForPrint(html);
    } catch (ex) {
      setPrintErr(ex instanceof Error ? ex.message : "Could not open BOL");
    } finally {
      setPrintBusy(false);
    }
  }

  async function onSaveEdit(e: FormEvent) {
    e.preventDefault();
    if (!token || !shipmentId) return;
    setEditBusy(true);
    setEditErr("");
    setEditMsg("");
    try {
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
      setEditMsg("Shipment updated");
      invalidateApiCache();
      await reload();
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
            <Button
              type="button"
              size="sm"
              variant="secondary"
              icon={<Printer className="h-3.5 w-3.5" />}
              onClick={() => void printBol()}
              loading={printBusy}
              disabled={!shipment}
            >
              Print BOL
            </Button>
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

      {shipment ? (
        <>
          <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            <Stat label="Direction" value={titleCase(shipment.direction)} />
            <Stat label="Status" value={statusLabel(shipment.status)} />
            <Stat label="Service type" value={statusLabel(shipment.serviceType) || "—"} />
            <Stat label="BOL #" value={shipment.bolNumber || "—"} />
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
              <CardTitle>Route</CardTitle>
              <div className="mt-2 grid gap-2 text-sm text-muted sm:grid-cols-2">
                <div>
                  <span className="font-semibold text-text">Ship from: </span>
                  {shipment.shipFrom || "—"}
                </div>
                <div>
                  <span className="font-semibold text-text">Ship to: </span>
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

          {isStaff ? (
            <FormSection
              title="Edit shipment"
              description="Carrier / trailer / seal, route, weight, and status — Cesar modify."
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
