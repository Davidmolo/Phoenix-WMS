"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { ClipboardList } from "lucide-react";
import {
  Alert,
  Badge,
  Button,
  DataTable,
  Field,
  FormGrid,
  FormSection,
  Input,
  Modal,
  NumberInput,
  PageHeader,
  SearchableSelect,
  Select,
  useDialog,
  type Column,
} from "@/components/ui";
import { api, apiFetchHtml } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useApiQuery, invalidateApiCache } from "@/hooks/useApiQuery";
import { dateLabel, money } from "@/lib/format";
import { listQuery, paginationFrom, type PaginationMeta } from "@/lib/pagination";
import { openHtmlForPrint } from "@/lib/print";
import type { Customer, Quote, QuoteLine } from "@/types";

type Rate = {
  key: string;
  billingType: QuoteLine["billingType"];
  label: string;
  custom?: boolean;
  unitAmount: number;
  minQty: number;
};

const GROUPS: Array<[QuoteLine["billingType"], string]> = [
  ["contract", "Contract"],
  ["crossdock", "Crossdock"],
  ["rework", "Rework"],
  ["other", "Other"],
];

function customerIdOf(quote: Quote) {
  if (!quote.customerId) return "";
  return typeof quote.customerId === "string" ? quote.customerId : quote.customerId._id;
}

function whoName(quote: Quote) {
  if (quote.customerId && typeof quote.customerId === "object") return quote.customerId.name || "Customer";
  return quote.prospectName || "Prospect";
}

function dateInput(value?: string | null) {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toISOString().slice(0, 10);
}

export default function QuotesPage() {
  const dialog = useDialog();
  const { token } = useAuth();
  const [page, setPage] = useState(1);
  const path = useMemo(() => listQuery("/quotes", { page }), [page]);
  const { data, error, loading, reload } = useApiQuery<{ quotes: Quote[] } & PaginationMeta>(path);
  const { data: custData } = useApiQuery<{ customers: Customer[] }>("/customers?portal=all");

  const [customerId, setCustomerId] = useState("");
  const [prospectName, setProspectName] = useState("");
  const [prospectEmail, setProspectEmail] = useState("");
  const [notes, setNotes] = useState("");
  const [validUntil, setValidUntil] = useState("");
  const [contractSqft, setContractSqft] = useState("");
  const [lines, setLines] = useState<QuoteLine[]>([]);
  const [rateKey, setRateKey] = useState("crossDockPerPallet");
  const [qtyStr, setQtyStr] = useState("1");
  const [unitStr, setUnitStr] = useState("");
  const [customLabel, setCustomLabel] = useState("");
  const [customType, setCustomType] = useState<QuoteLine["billingType"]>("other");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [openQuote, setOpenQuote] = useState<Quote | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  const catalogPath = customerId ? `/quotes/catalog?customerId=${customerId}` : "/quotes/catalog";
  const { data: catalogData } = useApiQuery<{ rates: Rate[] }>(catalogPath);
  const rates = catalogData?.rates ?? [];
  const selectedRate = rates.find((rate) => rate.key === rateKey) || rates[0];
  const hasContract = lines.some((line) => line.billingType === "contract") || selectedRate?.billingType === "contract";

  const selectedKey = selectedRate?.key;
  const selectedUnit = selectedRate?.unitAmount;
  const selectedMin = selectedRate?.minQty || 1;
  useEffect(() => {
    if (!selectedKey) return;
    setUnitStr(String(selectedUnit ?? 0));
    setQtyStr(String(selectedMin > 1 ? selectedMin : 1));
  }, [selectedKey, selectedUnit, selectedMin]);

  const customers = custData?.customers ?? [];
  const customerOptions = useMemo(
    () => customers.map((customer) => ({ value: customer._id, label: customer.name, keywords: customer.email || "" })),
    [customers]
  );

  function resetForm() {
    setEditingId(null);
    setCustomerId("");
    setProspectName("");
    setProspectEmail("");
    setNotes("");
    setValidUntil("");
    setContractSqft("");
    setLines([]);
    setCustomLabel("");
    setQtyStr("1");
  }

  function addLine() {
    if (!selectedRate) return;
    const qty = Math.max(selectedRate.minQty || 1, Number(qtyStr));
    const unit = unitStr === "" ? selectedRate.unitAmount : Number(unitStr);
    if (!Number.isFinite(qty) || qty <= 0) {
      setErr("Enter a quantity");
      return;
    }
    if (!Number.isFinite(unit)) {
      setErr("Enter a rate");
      return;
    }
    if (selectedRate.key === "custom" && !customLabel.trim()) {
      setErr("Custom lines need a description");
      return;
    }
    const billingType = selectedRate.key === "custom" ? customType : selectedRate.billingType;
    const description = selectedRate.key === "custom" ? customLabel.trim() : selectedRate.label;
    const amount = Math.round(qty * unit * 100) / 100;
    setLines((prev) => [
      ...prev,
      { rateKey: selectedRate.key, billingType, description, qty, unitAmount: unit, amount },
    ]);
    setErr("");
    if (selectedRate.key === "custom") setCustomLabel("");
  }

  function loadQuote(quote: Quote) {
    setEditingId(quote._id);
    setCustomerId(customerIdOf(quote));
    setProspectName(quote.prospectName || "");
    setProspectEmail(quote.prospectEmail || "");
    setNotes(quote.notes || "");
    setValidUntil(dateInput(quote.validUntil));
    setContractSqft(quote.contractSqft ? String(quote.contractSqft) : "");
    setLines(quote.lines || []);
    setOpenQuote(null);
    setMsg("");
    setErr("");
  }

  async function onSave(e: FormEvent) {
    e.preventDefault();
    if (!token) return;
    if (lines.length === 0) {
      setErr("Add at least one line");
      return;
    }
    setBusy(true);
    setErr("");
    setMsg("");
    try {
      const body = {
        customerId: customerId || null,
        prospectName,
        prospectEmail,
        notes,
        validUntil: validUntil || null,
        contractSqft: contractSqft === "" ? 0 : Number(contractSqft),
        lines,
      };
      const saved = await api<{ quote: Quote }>(editingId ? `/quotes/${editingId}` : "/quotes", {
        method: editingId ? "PATCH" : "POST",
        token,
        body: JSON.stringify(body),
      });
      setMsg(`${saved.quote.number} saved`);
      resetForm();
      setPage(1);
      invalidateApiCache("/quotes");
      await reload();
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "Could not save estimate");
    } finally {
      setBusy(false);
    }
  }

  async function runAction(quote: Quote, action: "email" | "invite" | "invoice" | "decline" | "print") {
    if (!token) return;
    setErr("");
    setMsg("");
    try {
      if (action === "print") {
        const html = await apiFetchHtml(`/quotes/${quote._id}/document`, token);
        openHtmlForPrint(html);
        return;
      }
      if (action === "decline") {
        const ok = await dialog.confirm({
          title: "Decline estimate",
          message: `Decline ${quote.number}? It stays on file and will not become an invoice.`,
          confirmLabel: "Decline",
          danger: true,
        });
        if (!ok) return;
      }
      const result = await api<{ quote: Quote; emailed?: string; invoice?: { number: string } }>(
        `/quotes/${quote._id}/${action === "email" ? "email" : action}`,
        { method: "POST", token, body: JSON.stringify({}) }
      );
      const follow =
        action === "email"
          ? `Emailed ${result.emailed}`
          : action === "invite"
            ? "Invite sent. The account can use Contract, Crossdock, and Rework."
            : action === "invoice"
              ? `Draft invoice ${result.invoice?.number || ""} is in Billing. QuickBooks is unchanged until you send it.`
              : "Estimate declined";
      setMsg(`${result.quote.number}: ${follow}`);
      setOpenQuote(result.quote);
      invalidateApiCache();
      await reload();
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "Could not update estimate");
    }
  }

  const columns: Column<Quote>[] = [
    { key: "number", header: "Estimate", render: (quote) => <span className="font-semibold text-navy">{quote.number}</span> },
    { key: "who", header: "For", render: (quote) => whoName(quote) },
    { key: "status", header: "Status", render: (quote) => <Badge tone={quote.status === "accepted" ? "success" : quote.status === "declined" ? "danger" : "accent"}>{quote.status}</Badge> },
    { key: "total", header: "Total", render: (quote) => money(quote.total) },
    { key: "date", header: "Created", render: (quote) => dateLabel(quote.createdAt) },
  ];

  const preview = lines.reduce((sum, line) => sum + line.amount, 0);
  const closed = openQuote?.status === "accepted" || openQuote?.status === "declined";

  return (
    <>
      <PageHeader
        title="Quotes"
        icon={<ClipboardList className="h-5 w-5" />}
        description="Estimates from the fee schedule for a customer or a prospect. Not an invoice until you accept one."
      />
      <Alert>{error || err}</Alert>
      {msg ? <Alert tone="info">{msg}</Alert> : null}

      <FormSection
        title={editingId ? "Edit estimate" : "New estimate"}
        description="Contract, Crossdock, and Rework can all be on the same quote. Rates start from the fee schedule."
        icon={<ClipboardList className="h-4 w-4" />}
        className="mb-6"
      >
        <form onSubmit={onSave} className="space-y-4">
          <Field label="Customer" hint="Leave empty to quote a prospect who is not a customer yet.">
            <SearchableSelect
              value={customerId}
              onChange={setCustomerId}
              options={customerOptions}
              allowEmpty
              emptyOptionLabel="Prospect — no customer record"
              placeholder="Prospect — no customer record"
            />
          </Field>
          {customerId ? null : (
            <FormGrid>
              <Field label="Prospect name" required>
                <Input value={prospectName} onChange={(e) => setProspectName(e.target.value)} required />
              </Field>
              <Field label="Prospect email" hint="Used when you email the estimate or send a portal invite.">
                <Input type="email" value={prospectEmail} onChange={(e) => setProspectEmail(e.target.value)} />
              </Field>
            </FormGrid>
          )}
          <FormGrid>
            <Field label="Rate">
              <Select value={selectedRate?.key || rateKey} onChange={(e) => setRateKey(e.target.value)}>
                {GROUPS.map(([type, label]) => (
                  <optgroup key={type} label={label}>
                    {rates
                      .filter((rate) => rate.billingType === type)
                      .map((rate) => (
                        <option key={rate.key} value={rate.key}>
                          {rate.label} ({money(rate.unitAmount)})
                        </option>
                      ))}
                  </optgroup>
                ))}
              </Select>
            </Field>
            <Field label="Qty" hint={selectedRate && selectedRate.minQty > 1 ? `Billed at least ${selectedRate.minQty}` : undefined}>
              <NumberInput value={qtyStr} onValueChange={setQtyStr} />
            </Field>
            <Field label="Rate ($)" hint="Change this to quote a price other than the schedule.">
              <NumberInput value={unitStr} onValueChange={setUnitStr} />
            </Field>
          </FormGrid>
          {selectedRate?.key === "custom" ? (
            <FormGrid>
              <Field label="Custom description" required>
                <Input value={customLabel} onChange={(e) => setCustomLabel(e.target.value)} />
              </Field>
              <Field label="Billing type">
                <Select value={customType} onChange={(e) => setCustomType(e.target.value as QuoteLine["billingType"])}>
                  {GROUPS.map(([type, label]) => (
                    <option key={type} value={type}>{label}</option>
                  ))}
                </Select>
              </Field>
            </FormGrid>
          ) : null}
          <Button type="button" variant="secondary" onClick={addLine}>
            Add line
          </Button>
          {lines.length > 0 ? (
            <div className="space-y-1 text-sm">
              {lines.map((line, index) => (
                <div key={`${line.rateKey}-${index}`} className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2">
                  <span>
                    <Badge tone="neutral">{line.billingType}</Badge>{" "}
                    {line.description} × {line.qty} @ {money(line.unitAmount)}
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="font-semibold text-navy">{money(line.amount)}</span>
                    <button
                      type="button"
                      className="text-xs text-muted underline"
                      onClick={() => setLines((prev) => prev.filter((_, i) => i !== index))}
                    >
                      Remove
                    </button>
                  </span>
                </div>
              ))}
              <p className="m-0 text-right font-semibold text-navy">Total {money(preview)}</p>
            </div>
          ) : null}
          {hasContract ? (
            <Field label="Reserved sq ft" hint="Copied onto the customer if you invite them from this contract quote.">
              <NumberInput value={contractSqft} onValueChange={setContractSqft} decimal={false} />
            </Field>
          ) : null}
          <FormGrid>
            <Field label="Valid until">
              <Input type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} />
            </Field>
            <Field label="Notes">
              <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
            </Field>
          </FormGrid>
          <div className="flex gap-2">
            <Button type="submit" loading={busy}>
              Save estimate
            </Button>
            {editingId ? (
              <Button type="button" variant="secondary" onClick={resetForm}>
                Cancel edit
              </Button>
            ) : null}
          </div>
        </form>
      </FormSection>

      <DataTable
        columns={columns}
        rows={data?.quotes ?? []}
        rowKey={(quote) => quote._id}
        loading={loading}
        emptyTitle="No estimates yet"
        pagination={paginationFrom(data)}
        onPageChange={setPage}
        onRowClick={setOpenQuote}
      />

      <Modal
        open={Boolean(openQuote)}
        onClose={() => setOpenQuote(null)}
        title={openQuote ? openQuote.number : "Estimate"}
        description={openQuote ? whoName(openQuote) : undefined}
        size="lg"
      >
        {openQuote ? (
          <div className="space-y-3 text-sm">
            <p className="m-0">
              <Badge tone={openQuote.status === "accepted" ? "success" : openQuote.status === "declined" ? "danger" : "accent"}>
                {openQuote.status}
              </Badge>{" "}
              <span className="font-semibold text-navy">{money(openQuote.total)}</span>
            </p>
            {openQuote.lines.map((line, index) => (
              <p key={`${line.rateKey}-${index}`} className="m-0">
                <span className="font-semibold text-navy">{line.billingType}: </span>
                {line.description} × {line.qty} = {money(line.amount)}
              </p>
            ))}
            {openQuote.notes ? <p className="m-0 text-muted">{openQuote.notes}</p> : null}
            <div className="flex flex-wrap gap-2 pt-2">
              <Button size="sm" variant="secondary" onClick={() => runAction(openQuote, "print")}>
                Print / PDF
              </Button>
              <Button size="sm" variant="secondary" onClick={() => runAction(openQuote, "email")}>
                Email
              </Button>
              {closed ? null : (
                <Button size="sm" variant="secondary" onClick={() => loadQuote(openQuote)}>
                  Edit
                </Button>
              )}
              {openQuote.status === "declined" || customerIdOf(openQuote) ? null : (
                <Button size="sm" onClick={() => runAction(openQuote, "invite")}>
                  Invite as customer
                </Button>
              )}
              {openQuote.status === "declined" || !customerIdOf(openQuote) ? null : (
                <Button size="sm" onClick={() => runAction(openQuote, "invoice")}>
                  Draft invoice
                </Button>
              )}
              {openQuote.status === "declined" || openQuote.invoiceId ? null : (
                <Button size="sm" variant="secondary" onClick={() => runAction(openQuote, "decline")}>
                  Decline
                </Button>
              )}
            </div>
          </div>
        ) : null}
      </Modal>
    </>
  );
}
