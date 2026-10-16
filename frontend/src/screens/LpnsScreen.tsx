"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { ScanBarcode } from "lucide-react";
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
  statusTone,
  type Column,
} from "@/components/ui";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useApiQuery, invalidateApiCache } from "@/hooks/useApiQuery";
import type { Customer, Lpn, Pallet, Warehouse } from "@/types";
import { listQuery, paginationFrom, type PaginationMeta } from "@/lib/pagination";
import { downloadCsv } from "@/lib/csv";

type LpnRow = Lpn & {
  kind?: string;
  palletIds?: Array<string | { _id: string; externalId?: string; status?: string }>;
};

type LpnsResponse = { lpns: LpnRow[] } & PaginationMeta;

export default function LpnsPage() {
  const { token } = useAuth();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const lpnsPath = useMemo(
    () => listQuery("/lpns", { page, params: { q: search.trim() || undefined } }),
    [page, search]
  );
  const { data, error, loading, reload } = useApiQuery<LpnsResponse>(lpnsPath);
  const { data: custData } = useApiQuery<{ customers: Customer[] }>("/customers?portal=all");
  const { data: whData } = useApiQuery<{ warehouses: Warehouse[] }>("/warehouses");
  const [customerId, setCustomerId] = useState("");
  const openGroupsPath = useMemo(
    () =>
      customerId
        ? listQuery("/lpns", {
            limit: 200,
            params: { kind: "group", customerId },
          })
        : null,
    [customerId]
  );
  const { data: openGroupData } = useApiQuery<LpnsResponse>(openGroupsPath);
  const palletPath = useMemo(
    () =>
      listQuery("/pallets", {
        limit: 200,
        params: { customerId: customerId || undefined },
      }),
    [customerId]
  );
  const { data: palletData, reload: reloadPallets } = useApiQuery<{ pallets: Pallet[] }>(palletPath);
  const warehouse = whData?.warehouses?.[0];
  const customers = custData?.customers ?? [];
  const [selected, setSelected] = useState<string[]>([]);
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!customerId && customers[0]) setCustomerId(customers[0]._id);
  }, [customers, customerId]);

  const takenPalletIds = useMemo(() => {
    const ids = new Set<string>();
    for (const lpn of openGroupData?.lpns ?? []) {
      if (lpn.status === "shipped" || lpn.status === "void") continue;
      for (const p of lpn.palletIds || []) {
        ids.add(typeof p === "string" ? p : p._id);
      }
    }
    return ids;
  }, [openGroupData]);

  const stageable = useMemo(
    () =>
      (palletData?.pallets ?? []).filter(
        (p) =>
          p.customerId === customerId &&
          ["received", "staged_for_store", "stored", "staged"].includes(p.status) &&
          !takenPalletIds.has(p._id)
      ),
    [palletData, customerId, takenPalletIds]
  );

  async function onCreateGroup(e: FormEvent) {
    e.preventDefault();
    if (!token || !warehouse || !customerId) return;
    setBusy(true);
    setErr("");
    setMsg("");
    try {
      const result = await api<{ lpn: LpnRow }>("/lpns/group", {
        method: "POST",
        token,
        body: JSON.stringify({
          warehouseId: warehouse._id,
          customerId,
          palletIds: selected,
          description,
        }),
      });
      setMsg(
        `Staging LPN ${result.lpn.code} created with ${selected.length} pallets — scan once to load`
      );
      setSelected([]);
      setDescription("");
      invalidateApiCache();
      await Promise.all([reload(), reloadPallets()]);
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "Failed to create LPN");
    } finally {
      setBusy(false);
    }
  }

  async function shipLpn(lpn: LpnRow) {
    if (!token || !warehouse || !customerId) return;
    setBusy(true);
    setErr("");
    setMsg("");
    try {
      await api("/shipments/ship", {
        method: "POST",
        token,
        body: JSON.stringify({
          warehouseId: warehouse._id,
          customerId: lpn.customerId || customerId,
          lpnId: lpn._id,
        }),
      });
      setMsg(`Shipped all pallets on ${lpn.code}`);
      invalidateApiCache();
      await Promise.all([reload(), reloadPallets()]);
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "Ship failed");
    } finally {
      setBusy(false);
    }
  }

  const columns: Column<LpnRow>[] = [
    {
      key: "code",
      header: "LPN",
      render: (l) => <span className="font-semibold font-mono">{l.code}</span>,
    },
    {
      key: "kind",
      header: "Kind",
      render: (l) => <Badge tone="accent">{l.kind || "unit"}</Badge>,
    },
    {
      key: "status",
      header: "Status",
      render: (l) => <Badge tone={statusTone(l.status)}>{l.status}</Badge>,
    },
    {
      key: "qty",
      header: "Pallets",
      render: (l) => l.qty,
    },
    {
      key: "pallets",
      header: "Contents",
      render: (l) => {
        const ids = (l.palletIds || [])
          .map((p) => (typeof p === "string" ? p.slice(-6) : p.externalId || p._id.slice(-6)))
          .slice(0, 6);
        return ids.length ? ids.join(", ") : "—";
      },
    },
    {
      key: "description",
      header: "Description",
      render: (l) => l.description || "—",
    },
    {
      key: "actions",
      header: "Actions",
      render: (l) =>
        l.kind === "group" && l.status !== "shipped" ? (
          <Button size="sm" loading={busy} onClick={() => shipLpn(l)}>
            Ship plate
          </Button>
        ) : (
          "—"
        ),
    },
  ];

  return (
    <>
        <PageHeader
          title="LPNs"
          icon={<ScanBarcode className="h-5 w-5" />}
          description="License plates — a pallet on an open staging plate cannot be added to another until that plate ships or is voided"
          actions={
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={(data?.lpns ?? []).length === 0}
              onClick={() =>
                downloadCsv(
                  "lpns.csv",
                  ["LPN", "Kind", "Status", "Pallets", "Description"],
                  (data?.lpns ?? []).map((l) => [
                    l.code,
                    l.kind || "unit",
                    l.status,
                    l.qty,
                    l.description || "",
                  ])
                )
              }
            >
              Export CSV
            </Button>
          }
        />
        <div className="mb-4 max-w-sm">
          <Field label="Search">
            <Input
              type="search"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="LPN code or description…"
            />
          </Field>
        </div>
        <Alert>{error || err}</Alert>
        {msg ? <Alert tone="info">{msg}</Alert> : null}

        <FormSection
          title="Build staging LPN"
          description="Example: pallets from different inbound loads going out on one trailer — one plate, one scan."
          icon={<ScanBarcode className="h-4 w-4" />}
          className="mb-6"
        >
          <form onSubmit={onCreateGroup} className="space-y-4">
            <FormGrid>
              <Field label="Customer">
                <SearchableSelect
                  value={customerId}
                  onChange={setCustomerId}
                  options={customers.map((c) => ({
                    value: c._id,
                    label: c.name,
                    keywords: c.email,
                  }))}
                  placeholder="Search customer…"
                  searchPlaceholder="Search by name or email…"
                />
              </Field>
              <Field label="Notes">
                <Input
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Optional — e.g. Outbound trailer staging"
                />
              </Field>
            </FormGrid>
            <div className="max-h-48 space-y-1 overflow-y-auto rounded-[var(--radius)] border border-border bg-surface-2/50 p-2">
              {stageable.length === 0 ? (
                <p className="m-0 p-2 text-sm text-muted">No active pallets for this customer.</p>
              ) : (
                stageable.map((p) => (
                  <label
                    key={p._id}
                    className="flex flex-wrap items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-surface"
                  >
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-[var(--accent)]"
                      checked={selected.includes(p._id)}
                      onChange={(e) =>
                        setSelected((ids) =>
                          e.target.checked ? [...ids, p._id] : ids.filter((id) => id !== p._id)
                        )
                      }
                    />
                    <span className="font-semibold text-navy">{p.externalId}</span>
                    <Badge tone={statusTone(p.status)}>{p.status}</Badge>
                    <span className="text-xs text-muted">{p.jobName || p.poNumber || "—"}</span>
                  </label>
                ))
              )}
            </div>
            <Button type="submit" loading={busy} disabled={selected.length < 2}>
              Create staging LPN ({selected.length} pallets)
            </Button>
          </form>
        </FormSection>

        <DataTable
          columns={columns}
          rows={data?.lpns ?? []}
          rowKey={(l) => l._id}
          loading={loading}
          emptyTitle="No LPNs yet"
          emptyDescription="Receive pallets or build a staging plate above."
          pagination={paginationFrom(data)}
          onPageChange={setPage}
        />
    </>
  );
}
