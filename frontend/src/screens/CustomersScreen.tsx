"use client";

import { FormEvent, useState } from "react";
import { Printer, Users } from "lucide-react";
import { BillingReportModal } from "@/components/BillingReportModal";
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
  type Column,
} from "@/components/ui";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useApiQuery, invalidateApiCache } from "@/hooks/useApiQuery";
import { useAppNav } from "@/lib/appNav";
import { money } from "@/lib/format";
import type { Customer } from "@/types";

export default function CustomersPage() {
  const { navigate } = useAppNav();
  const { token } = useAuth();
  const { data, error, loading, reload } = useApiQuery<{ customers: Customer[] }>(
    "/customers?portal=activated"
  );
  const [reportCustomer, setReportCustomer] = useState<Customer | null>(null);
  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  const columns: Column<Customer>[] = [
    {
      key: "name",
      header: "Name",
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
      key: "billing",
      header: "Billing",
      render: (c) => <Badge tone="accent">{c.billingMethod}</Badge>,
    },
    {
      key: "contract",
      header: "Contract",
      render: (c) =>
        c.billingMethod === "contract"
          ? `${money(c.contractFee)}/mo · ${c.contractSqft ?? 0} SF`
          : "—",
    },
    {
      key: "handling",
      header: "Handling",
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
      render: (c) => c.email || "—",
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
          Print / export
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
          `Invite emailed to ${email}. They appear in this list after setting a password.`
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
        description="Invite by email — the customer sets a password, then appears in this list"
      />
      <Alert>{error || err}</Alert>
      {msg ? <Alert tone="info">{msg}</Alert> : null}

      <FormSection
        title="Invite new customer"
        description="We email a link to set their portal password. No public signup."
        className="mb-6"
      >
        <form onSubmit={onCreate} className="space-y-4">
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

      <DataTable
        columns={columns}
        rows={data?.customers ?? []}
        rowKey={(c) => c._id}
        loading={loading}
        emptyTitle="No activated customers yet"
        emptyDescription="Invited customers appear here after they set a password from the email link."
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
