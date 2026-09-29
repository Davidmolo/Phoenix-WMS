"use client";

import { FileText, Users } from "lucide-react";
import { Alert, Badge, Button, DataTable, PageHeader, type Column } from "@/components/ui";
import { useApiQuery } from "@/hooks/useApiQuery";
import { useAppNav } from "@/lib/appNav";
import { setBillingCustomerId } from "@/lib/billingNav";
import { money } from "@/lib/format";
import type { Customer } from "@/types";

export default function CustomersPage() {
  const { navigate } = useAppNav();
  const { data, error, loading } = useApiQuery<{ customers: Customer[] }>("/customers");

  function goGenerateInvoice(customerId: string) {
    setBillingCustomerId(customerId);
    navigate("/billing");
  }

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
      key: "invoice",
      header: "Invoice",
      render: (c) => (
        <Button
          type="button"
          size="sm"
          variant="secondary"
          icon={<FileText className="h-3.5 w-3.5" />}
          onClick={(e) => {
            e.stopPropagation();
            goGenerateInvoice(c._id);
          }}
        >
          Generate
        </Button>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Customers"
        icon={<Users className="h-5 w-5" />}
        description="Open a customer for detail, or generate their monthly invoice from this list"
      />
      <Alert>{error}</Alert>
      <DataTable
        columns={columns}
        rows={data?.customers ?? []}
        rowKey={(c) => c._id}
        loading={loading}
        emptyTitle="No customers yet"
      />
    </>
  );
}
