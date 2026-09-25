"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import {
  Alert,
  Badge,
  Card,
  CardBody,
  CardTitle,
  DataTable,
  KpiCard,
  KpiGrid,
  PageHeader,
  statusTone,
  type Column,
} from "@/components/ui";
import { useApiQuery } from "@/hooks/useApiQuery";
import { dateLabel, money } from "@/lib/format";
import type { Customer, Invoice, Pallet, WhRequest } from "@/types";

type Charge = { _id: string; description: string; amount: number; type: string; date: string };

type DetailResponse = {
  customer: Customer;
  summary: {
    activePallets: number;
    unbilledTotal: number;
    unbilledCount: number;
    openRequests: number;
  };
  pallets: Pallet[];
  unbilledCharges: Charge[];
  requests: WhRequest[];
  invoices: Invoice[];
};

export default function CustomerDetailPage() {
  const params = useParams<{ id: string }>();
  const { data, error, loading } = useApiQuery<DetailResponse>(
    params.id ? `/customers/${params.id}` : null
  );

  const c = data?.customer;

  const palletCols: Column<Pallet>[] = [
    {
      key: "id",
      header: "Pallet",
      render: (p) => <span className="font-semibold">{p.externalId}</span>,
    },
    {
      key: "status",
      header: "Status",
      render: (p) => <Badge tone={statusTone(p.status)}>{p.status}</Badge>,
    },
    { key: "job", header: "Job", render: (p) => p.jobName || "—" },
    { key: "po", header: "PO", render: (p) => p.poNumber || "—" },
    { key: "recv", header: "Received", render: (p) => dateLabel(p.receivedAt) },
  ];

  const chargeCols: Column<Charge>[] = [
    { key: "desc", header: "Description", render: (x) => x.description },
    { key: "type", header: "Type", render: (x) => <Badge>{x.type}</Badge> },
    { key: "amt", header: "Amount", render: (x) => money(x.amount) },
    { key: "date", header: "Date", render: (x) => dateLabel(x.date) },
  ];

  const reqCols: Column<WhRequest>[] = [
    { key: "type", header: "Type", render: (r) => <Badge tone="accent">{r.type}</Badge> },
    {
      key: "status",
      header: "Status",
      render: (r) => <Badge tone={statusTone(r.status)}>{r.status}</Badge>,
    },
    { key: "qty", header: "Qty", render: (r) => r.qty },
    { key: "ref", header: "Ref", render: (r) => r.ref || "—" },
  ];

  return (
    <AppShell>
      <PageHeader
        title={loading ? "Customer…" : c?.name || "Customer"}
        description={c ? `${c.contact || "—"} · ${c.email || "—"}` : "Loading account detail"}
        actions={
          <Link href="/customers" className="text-sm font-semibold text-accent-dark hover:underline">
            ← All customers
          </Link>
        }
      />
      <Alert>{error}</Alert>

      {c ? (
        <>
          <KpiGrid>
            <KpiCard label="Billing method" value={c.billingMethod} />
            <KpiCard
              label="Contract"
              value={c.billingMethod === "contract" ? money(c.contractFee) : "—"}
              hint={c.contractSqft ? `${c.contractSqft.toLocaleString()} SF reserved` : undefined}
            />
            <KpiCard
              label="Handling"
              value={
                c.contractHandlingPerPallet != null ? money(c.contractHandlingPerPallet) : "—"
              }
              hint={c.contractFtlRate ? `FTL ${money(c.contractFtlRate)}` : undefined}
            />
            <KpiCard label="Active pallets" value={data?.summary.activePallets} />
            <KpiCard
              label="Unbilled charges"
              value={money(data?.summary.unbilledTotal)}
              hint={`${data?.summary.unbilledCount ?? 0} lines`}
            />
            <KpiCard label="Open requests" value={data?.summary.openRequests} />
          </KpiGrid>

          <Card className="mb-5">
            <CardBody>
              <CardTitle>Account</CardTitle>
              <div className="mt-2 grid gap-2 text-sm text-muted sm:grid-cols-2">
                <div>
                  <span className="font-semibold text-text">Address: </span>
                  {c.address || "—"}
                </div>
                <div>
                  <span className="font-semibold text-text">Phone: </span>
                  {c.phone || "—"}
                </div>
                <div>
                  <span className="font-semibold text-text">No dwell in dedicated SF: </span>
                  {c.contractNoDwellInside ? "Yes (per SBA agreement)" : "—"}
                </div>
                <div>
                  <span className="font-semibold text-text">Customer since: </span>
                  {dateLabel(c.since)}
                </div>
              </div>
            </CardBody>
          </Card>

          <div className="mb-5">
            <PageHeader title="Pallets" />
            <DataTable
              columns={palletCols}
              rows={data?.pallets ?? []}
              rowKey={(p) => p._id}
              emptyTitle="No pallets for this customer"
            />
          </div>

          <div className="mb-5">
            <PageHeader title="Unbilled charges" />
            <DataTable
              columns={chargeCols}
              rows={data?.unbilledCharges ?? []}
              rowKey={(x) => x._id}
              emptyTitle="No open charges"
            />
          </div>

          <div className="mb-5">
            <PageHeader title="Requests" />
            <DataTable
              columns={reqCols}
              rows={data?.requests ?? []}
              rowKey={(r) => r._id}
              emptyTitle="No requests"
            />
          </div>
        </>
      ) : null}
    </AppShell>
  );
}
