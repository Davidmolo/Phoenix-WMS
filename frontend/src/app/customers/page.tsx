"use client";

import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { Alert, Badge, DataTable, PageHeader, type Column } from "@/components/ui";
import { useApiQuery } from "@/hooks/useApiQuery";
import { money } from "@/lib/format";
import type { Customer } from "@/types";

export default function CustomersPage() {
  const { data, error, loading } = useApiQuery<{ customers: Customer[] }>("/customers");

  const columns: Column<Customer>[] = [
    {
      key: "name",
      header: "Name",
      render: (c) => (
        <Link href={`/customers/${c._id}`} className="font-semibold text-accent-dark hover:underline">
          {c.name}
        </Link>
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
  ];

  return (
    <AppShell>
      <PageHeader
        title="Customers"
        description="Contract and rate profiles — open a customer for pallets, charges, and requests"
      />
      <Alert>{error}</Alert>
      <DataTable
        columns={columns}
        rows={data?.customers ?? []}
        rowKey={(c) => c._id}
        loading={loading}
        emptyTitle="No customers yet"
      />
    </AppShell>
  );
}
