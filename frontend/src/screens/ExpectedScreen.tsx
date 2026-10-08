"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { CalendarClock } from "lucide-react";
import {
  Alert,
  Badge,
  Button,
  DataTable,
  Field,
  FormGrid,
  FormSection,
  Input,
  PageHeader,
  SearchableSelect,
  Select,
  statusTone,
  type Column,
} from "@/components/ui";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useApiQuery, invalidateApiCache } from "@/hooks/useApiQuery";
import { dateLabel } from "@/lib/format";
import { listQuery, paginationFrom, type PaginationMeta } from "@/lib/pagination";
import type { Customer, Shipment, Warehouse } from "@/types";

type ShipmentsResponse = { shipments: Shipment[] } & PaginationMeta;

export default function ExpectedPage() {
  const { token } = useAuth();
  const { data: custData } = useApiQuery<{ customers: Customer[] }>("/customers?portal=all");
  const { data: whData } = useApiQuery<{ warehouses: Warehouse[] }>("/warehouses");
  const [inPage, setInPage] = useState(1);
  const [outPage, setOutPage] = useState(1);

  const inPath = useMemo(
    () =>
      listQuery("/shipments", {
        page: inPage,
        params: { status: "expected", direction: "inbound" },
      }),
    [inPage]
  );
  const outPath = useMemo(
    () =>
      listQuery("/shipments", {
        page: outPage,
        params: { status: "expected", direction: "outbound" },
      }),
    [outPage]
  );

  const { data: inData, reload: reloadIn } = useApiQuery<ShipmentsResponse>(inPath);
  const { data: outData, reload: reloadOut } = useApiQuery<ShipmentsResponse>(outPath);

  const warehouse = whData?.warehouses?.[0];
  const customers = custData?.customers ?? [];
  const [customerId, setCustomerId] = useState("");
  const [direction, setDirection] = useState<"inbound" | "outbound">("inbound");
  const [palletCount, setPalletCount] = useState(1);
  const [carrier, setCarrier] = useState("");
  const [poOrJob, setPoOrJob] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!customerId && customers[0]) setCustomerId(customers[0]._id);
  }, [customers, customerId]);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    if (!token || !warehouse || !customerId) return;
    setBusy(true);
    setErr("");
    setMsg("");
    try {
      await api("/shipments/expected", {
        method: "POST",
        token,
        body: JSON.stringify({
          warehouseId: warehouse._id,
          customerId,
          direction,
          palletCount,
          carrier,
          poOrJob,
          scheduledAt: scheduledAt || undefined,
          notes,
        }),
      });
      setMsg(`Expected ${direction} appointment created`);
      setNotes("");
      setPoOrJob("");
      if (direction === "inbound") setInPage(1);
      else setOutPage(1);
      invalidateApiCache();
      await Promise.all([reloadIn(), reloadOut()]);
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  function poJobLabel(s: Shipment) {
    const direct = (s.jobName || s.poNumber || "").trim();
    if (direct) return direct;
    const fromNotes = (s.notes || "").match(/PO\/Job:\s*([^·]+)/i);
    return fromNotes?.[1]?.trim() || "—";
  }

  const columns: Column<Shipment>[] = [
    {
      key: "status",
      header: "Status",
      render: (s) => <Badge tone={statusTone(s.status)}>{s.status}</Badge>,
    },
    {
      key: "ref",
      header: "PO / Job",
      render: (s) => poJobLabel(s),
    },
    { key: "carrier", header: "Carrier", render: (s) => s.carrier || "—" },
    { key: "notes", header: "Notes", render: (s) => s.notes || "—" },
    {
      key: "sched",
      header: "Scheduled",
      render: (s) => dateLabel(s.scheduledAt as string | undefined),
    },
  ];

  return (
    <>
        <PageHeader
          title="Expected inbound / outbound"
          icon={<CalendarClock className="h-5 w-5" />}
          description="Appointments before freight hits the dock — matches prototype Expected In/Out"
        />
        <Alert>{err}</Alert>
        {msg ? <Alert tone="info">{msg}</Alert> : null}

        <FormSection
          title="Schedule expected load"
          description="Book a bay before freight arrives."
          icon={<CalendarClock className="h-4 w-4" />}
          className="mb-6"
        >
          <form onSubmit={onCreate} className="space-y-4">
            <FormGrid>
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
              <Field label="Direction">
                <Select
                  value={direction}
                  onChange={(e) => setDirection(e.target.value as "inbound" | "outbound")}
                >
                  <option value="inbound">Inbound</option>
                  <option value="outbound">Outbound</option>
                </Select>
              </Field>
              <Field label="Pallet count (est.)">
                <Input
                  type="number"
                  min={1}
                  value={palletCount}
                  onChange={(e) => setPalletCount(Number(e.target.value))}
                />
              </Field>
              <Field label="Carrier">
                <Input value={carrier} onChange={(e) => setCarrier(e.target.value)} />
              </Field>
              <Field label="PO / Job">
                <Input
                  value={poOrJob}
                  onChange={(e) => setPoOrJob(e.target.value)}
                  placeholder="e.g. PO-12345 or site job name"
                />
              </Field>
              <Field label="Scheduled date">
                <Input
                  type="date"
                  value={scheduledAt}
                  onChange={(e) => setScheduledAt(e.target.value)}
                />
              </Field>
              <Field label="Notes">
                <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
              </Field>
            </FormGrid>
            <Button type="submit" loading={busy}>
              Create expected appointment
            </Button>
          </form>
        </FormSection>

        <div className="mb-6">
          <PageHeader title="Expected inbound" className="mb-4" />
          <DataTable
            columns={columns}
            rows={inData?.shipments ?? []}
            rowKey={(s) => s._id}
            emptyTitle="No expected inbound"
            pagination={paginationFrom(inData)}
            onPageChange={setInPage}
          />
        </div>

        <div>
          <PageHeader title="Expected outbound" className="mb-4" />
          <DataTable
            columns={columns}
            rows={outData?.shipments ?? []}
            rowKey={(s) => s._id}
            emptyTitle="No expected outbound"
            pagination={paginationFrom(outData)}
            onPageChange={setOutPage}
          />
        </div>
    </>
  );
}
