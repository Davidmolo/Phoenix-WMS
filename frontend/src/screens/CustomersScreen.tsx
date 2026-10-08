"use client";

import { FormEvent, useMemo, useState } from "react";
import { Printer, Users } from "lucide-react";
import { BillingReportModal } from "@/components/BillingReportModal";
import {
  Alert,
  Badge,
  Button,
  ChipGroup,
  DataTable,
  Field,
  FormGrid,
  FormSection,
  Input,
  PageHeader,
  type Column,
} from "@/components/ui";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useApiQuery, invalidateApiCache } from "@/hooks/useApiQuery";
import { useAppNav } from "@/lib/appNav";
import { money } from "@/lib/format";
import type { Customer } from "@/types";

type PortalFilter = "all" | "active" | "invite_sent" | "not_invited";

function portalStatusOf(c: Customer): "active" | "invite_sent" | "not_invited" {
  if (c.portalStatus) return c.portalStatus;
  if (c.portalActivated) return "active";
  if (c.invitePending) return "invite_sent";
  return "not_invited";
}

export default function CustomersPage() {
  const { navigate } = useAppNav();
  const { token } = useAuth();
  const [portalFilter, setPortalFilter] = useState<PortalFilter>("all");
  const { data, error, loading, reload } = useApiQuery<{ customers: Customer[] }>(
    "/customers?portal=all"
  );
  const [reportCustomer, setReportCustomer] = useState<Customer | null>(null);
  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  const allCustomers = data?.customers ?? [];
  const counts = useMemo(() => {
    let active = 0;
    let inviteSent = 0;
    let notInvited = 0;
    for (const c of allCustomers) {
      const s = portalStatusOf(c);
      if (s === "active") active += 1;
      else if (s === "invite_sent") inviteSent += 1;
      else notInvited += 1;
    }
    return { active, inviteSent, notInvited, total: allCustomers.length };
  }, [allCustomers]);

  const customers = useMemo(() => {
    if (portalFilter === "all") return allCustomers;
    return allCustomers.filter((c) => portalStatusOf(c) === portalFilter);
  }, [allCustomers, portalFilter]);

  const columns: Column<Customer>[] = [
    {
      key: "name",
      header: "Company",
      render: (c) => (
        <button
          type="button"
          onClick={() => navigate(`/customers/${c._id}`)}
          className="font-semibold text-accent-dark hover:underline"
        >
          {c.name}
        </button>
      ),
    },
    {
      key: "portal",
      header: "Portal",
      className: "w-[1%] whitespace-nowrap",
      render: (c) => {
        const status = portalStatusOf(c);
        if (status === "active")
          return (
            <Badge tone="success" title="They set a portal password">
              Onboarded
            </Badge>
          );
        if (status === "invite_sent")
          return (
            <Badge tone="warning" title="Invite emailed — waiting for them to set a password">
              Invite sent
            </Badge>
          );
        return (
          <Badge tone="neutral" title="No portal invite has been sent yet">
            Not invited
          </Badge>
        );
      },
    },
    {
      key: "billing",
      header: "Billing",
      className: "w-[1%] whitespace-nowrap",
      render: (c) => (
        <Badge tone="accent" className="capitalize">
          {c.billingMethod}
        </Badge>
      ),
    },
    {
      key: "contract",
      header: "Contract",
      className: "whitespace-nowrap",
      render: (c) =>
        c.billingMethod === "contract"
          ? `${money(c.contractFee)}/mo · ${c.contractSqft ?? 0} SF`
          : "—",
    },
    {
      key: "handling",
      header: "Handling",
      className: "whitespace-nowrap",
      render: (c) =>
        c.contractHandlingPerPallet != null
          ? `${money(c.contractHandlingPerPallet)}/pallet${
              c.contractFtlRate ? ` · FTL ${money(c.contractFtlRate)}` : ""
            }`
          : "—",
    },
    {
      key: "email",
      header: "Email",
      className: "max-w-[12rem]",
      render: (c) => (
        <span className="block truncate" title={c.email || undefined}>
          {c.email || "—"}
        </span>
      ),
    },
    {
      key: "source",
      header: "Source",
      className: "w-[1%] whitespace-nowrap",
      render: (c) =>
        c.quickbooksCustomerId ? (
          <span className="text-[11px] text-muted">QuickBooks</span>
        ) : (
          <span className="text-[11px] text-muted">WMS</span>
        ),
    },
    {
      key: "report",
      header: "Report",
      render: (c) => (
        <Button
          type="button"
          size="sm"
          variant="secondary"
          icon={<Printer className="h-3.5 w-3.5" />}
          onClick={(e) => {
            e.stopPropagation();
            setReportCustomer(c);
          }}
        >
          Print
        </Button>
      ),
    },
  ];

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    if (!token) return;
    setBusy(true);
    setErr("");
    setMsg("");
    try {
      const result = await api<{ customer: Customer; message?: string }>("/customers", {
        method: "POST",
        token,
        body: JSON.stringify({ name, contact, email, phone }),
      });
      setMsg(
        result.message ||
          `Invite emailed to ${email}. Status stays “Invite sent” until they set a password.`
      );
      setName("");
      setContact("");
      setEmail("");
      setPhone("");
      invalidateApiCache("/customers");
      await reload();
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "Could not save customer");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Customers"
        icon={<Users className="h-5 w-5" />}
        description="All companies — invite for portal access, or synced from QuickBooks. Click a name for billing rates."
      />
      <Alert>{error || err}</Alert>
      {msg ? <Alert tone="info">{msg}</Alert> : null}

      <FormSection
        title="Invite new customer"
        description="Email a link to set their portal password. They appear below immediately as Invite pending."
        className="mb-4"
      >
        <form onSubmit={onCreate} className="space-y-3">
          <FormGrid>
            <Field label="Company name" required>
              <Input required value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
            <Field label="Contact name">
              <Input value={contact} onChange={(e) => setContact(e.target.value)} />
            </Field>
            <Field label="Email" required hint="Invite is sent to this inbox.">
              <Input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </Field>
            <Field label="Phone">
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
            </Field>
          </FormGrid>
          <Button type="submit" loading={busy} disabled={!name.trim() || !email.trim()}>
            Create & email invite
          </Button>
        </form>
      </FormSection>

      <div className="mb-3">
        <ChipGroup
          label="Show"
          size="sm"
          options={[
            { id: "all", label: `All · ${counts.total}` },
            { id: "active", label: `Onboarded · ${counts.active}` },
            { id: "invite_sent", label: `Invite sent · ${counts.inviteSent}` },
            { id: "not_invited", label: `Not invited · ${counts.notInvited}` },
          ]}
          value={portalFilter}
          onChange={(id) => setPortalFilter(id as PortalFilter)}
        />
      </div>

      <DataTable
        columns={columns}
        rows={customers}
        rowKey={(c) => c._id}
        loading={loading}
        emptyTitle="No customers yet"
        emptyDescription="Create & email an invite, or Sync invoices from QuickBooks to pull customers in."
      />
      {reportCustomer ? (
        <BillingReportModal
          customer={reportCustomer}
          onClose={() => setReportCustomer(null)}
        />
      ) : null}
    </>
  );
}
