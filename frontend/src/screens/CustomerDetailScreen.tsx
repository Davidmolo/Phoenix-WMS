"use client";

import { useState } from "react";
import {
  Alert,
  Badge,
  Button,
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
import { Mail, Printer } from "lucide-react";
import { BillingReportModal } from "@/components/BillingReportModal";
import { useApiQuery, invalidateApiCache } from "@/hooks/useApiQuery";
import { useAuth } from "@/lib/auth";
import { useAppNav } from "@/lib/appNav";
import { dateLabel, money } from "@/lib/format";
import { listQuery, paginationFrom, type PaginationMeta } from "@/lib/pagination";
import { api } from "@/lib/api";
import type { Customer, Invoice, Pallet, WhRequest } from "@/types";

type Charge = { _id: string; description: string; amount: number; type: string; date: string };

type DetailResponse = {
  customer: Customer;
  portal?: {
    email: string;
    name: string;
    active: boolean;
    invitePending: boolean;
    inviteSentAt?: string | null;
    inviteExpiresAt?: string | null;
  } | null;
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

export default function CustomerDetailPage({ customerId }: { customerId: string }) {
  const { navigate } = useAppNav();
  const { token } = useAuth();
  const { data, error, loading, reload } = useApiQuery<DetailResponse>(
    customerId ? `/customers/${customerId}` : null
  );
  const [invPage, setInvPage] = useState(1);
  // Same register as Billing — not the embedded (possibly stale) customer payload
  const invPath = customerId
    ? listQuery("/invoices", { page: invPage, params: { customerId } })
    : null;
  const { data: invData, loading: invLoading } = useApiQuery<
    { invoices: Invoice[] } & PaginationMeta
  >(invPath);
  const [showReport, setShowReport] = useState(false);

  const c = data?.customer;
  const invoices = invData?.invoices ?? [];
  const [inviteBusy, setInviteBusy] = useState(false);
  const [inviteMsg, setInviteMsg] = useState("");
  const [inviteErr, setInviteErr] = useState("");
  const [inviteUrl, setInviteUrl] = useState("");

  async function sendPortalInvite() {
    if (!token || !c) return;
    setInviteBusy(true);
    setInviteErr("");
    setInviteMsg("");
    setInviteUrl("");
    try {
      const result = await api<{ inviteUrl: string; email: string; message?: string }>(
        `/customers/${c._id}/invite`,
        {
          method: "POST",
          token,
          body: JSON.stringify({ email: c.email, name: c.contact || c.name }),
        }
      );
      setInviteUrl("");
      setInviteMsg(
        result.message ||
          `Invite emailed to ${result.email}. They appear in Customers after setting a password.`
      );
      invalidateApiCache(`/customers/${c._id}`);
      await reload();
    } catch (ex) {
      setInviteErr(ex instanceof Error ? ex.message : "Invite failed");
    } finally {
      setInviteBusy(false);
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
    <>
        <PageHeader
          title={loading ? "Customer…" : c?.name || "Customer"}
          description={c ? `${c.contact || "—"} · ${c.email || "—"}` : "Loading account detail"}
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant="secondary"
                icon={<Mail className="h-3.5 w-3.5" />}
                onClick={() => void sendPortalInvite()}
                loading={inviteBusy}
                disabled={!c}
              >
                {data?.portal?.invitePending ? "Resend portal invite" : "Send portal invite"}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                icon={<Printer className="h-3.5 w-3.5" />}
                onClick={() => setShowReport(true)}
                disabled={!c}
              >
                Print / export
              </Button>
              <button
                type="button"
                onClick={() => navigate("/customers")}
                className="text-sm font-semibold text-accent-dark hover:underline"
              >
                ← All customers
              </button>
            </div>
          }
        />
        <Alert>{error || inviteErr}</Alert>
        {inviteMsg ? <Alert tone="info">{inviteMsg}</Alert> : null}
        {inviteUrl ? (
          <Alert tone="info">
            Invite link:{" "}
            <a href={inviteUrl} className="break-all font-semibold text-navy underline">
              {inviteUrl}
            </a>
            {" · "}
            <a
              href={`mailto:${c?.email || ""}?subject=${encodeURIComponent("Phoenix Cross Dock portal access")}&body=${encodeURIComponent(`Set your customer portal password here:\n${inviteUrl}\n\nThis link expires in 7 days.`)}`}
              className="font-semibold text-navy underline"
            >
              Open email
            </a>
          </Alert>
        ) : null}

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
                    {c.contractNoDwellInside ? "Yes (per contract)" : "—"}
                  </div>
                  <div>
                    <span className="font-semibold text-text">Portal: </span>
                    {data?.portal?.invitePending
                      ? "Invite sent — waiting for password"
                      : data?.portal
                        ? "Active login"
                        : "Not invited"}
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

            <div className="mb-5">
              <PageHeader title="Invoices" description="Same register as Billing for this customer" />
              <DataTable
                columns={[
                  {
                    key: "number",
                    header: "Number",
                    render: (inv: Invoice) => <span className="font-semibold">{inv.number}</span>,
                  },
                  {
                    key: "period",
                    header: "Period",
                    render: (inv: Invoice) =>
                      `${dateLabel(inv.periodStart)} – ${dateLabel(inv.periodEnd)}`,
                  },
                  {
                    key: "status",
                    header: "Status",
                    render: (inv: Invoice) => (
                      <Badge tone={statusTone(inv.status)}>{inv.status}</Badge>
                    ),
                  },
                  {
                    key: "total",
                    header: "Total",
                    render: (inv: Invoice) => money(inv.total),
                  },
                ]}
                rows={invoices}
                rowKey={(inv) => inv._id}
                loading={invLoading}
                emptyTitle="No invoices for this customer"
                emptyDescription="Invoices appear here after QuickBooks sync (same list as Billing)."
                pagination={paginationFrom(invData)}
                onPageChange={setInvPage}
              />
            </div>
          </>
        ) : null}

      {showReport && c ? (
        <BillingReportModal customer={c} onClose={() => setShowReport(false)} />
      ) : null}
    </>
  );
}
