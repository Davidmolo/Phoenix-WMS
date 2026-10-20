"use client";

import { FormEvent, useState } from "react";
import { ArrowRightLeft } from "lucide-react";
import { Alert, Button, Field, FormSection, Input, PageHeader } from "@/components/ui";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { invalidateApiCache } from "@/hooks/useApiQuery";

export default function InventoryMoveScreen() {
  const { token } = useAuth();
  const [palletCode, setPalletCode] = useState("");
  const [locationCode, setLocationCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function onMove(e: FormEvent) {
    e.preventDefault();
    if (!token || !palletCode.trim() || !locationCode.trim()) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const result = await api<{ message: string }>("/pallets/move", {
        method: "POST",
        token,
        body: JSON.stringify({
          palletCode: palletCode.trim(),
          locationCode: locationCode.trim(),
        }),
      });
      setMessage(result.message || `${palletCode.trim()} moved to ${locationCode.trim()}`);
      setPalletCode("");
      setLocationCode("");
      invalidateApiCache();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Move failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Inventory move"
        icon={<ArrowRightLeft className="h-5 w-5" />}
        description="Scan the pallet, then scan the location it is actually in."
      />
      <Alert>{error}</Alert>
      {message ? <Alert tone="success">{message}</Alert> : null}
      <FormSection
        title="Move a pallet"
        description="Use this when a pallet was put in the wrong spot, or to pull one customer's freight together."
        icon={<ArrowRightLeft className="h-4 w-4" />}
      >
        <form onSubmit={onMove} className="space-y-4">
          <Field label="Pallet" required hint="Scan the barcode, for example PLT-20095.">
            <Input
              value={palletCode}
              onChange={(e) => setPalletCode(e.target.value)}
              autoFocus
              required
            />
          </Field>
          <Field label="New location" required hint="Scan the slot, for example A1A-1. A1A means spot 1.">
            <Input
              value={locationCode}
              onChange={(e) => setLocationCode(e.target.value)}
              required
            />
          </Field>
          <Button type="submit" loading={busy}>
            Confirm move
          </Button>
        </form>
      </FormSection>
    </>
  );
}
