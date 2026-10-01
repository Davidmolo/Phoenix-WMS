"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { UserRound } from "lucide-react";
import {
  Alert,
  Button,
  Card,
  CardBody,
  CardTitle,
  Field,
  Input,
  PageHeader,
} from "@/components/ui";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useApiQuery, invalidateApiCache } from "@/hooks/useApiQuery";
import { useAppNav } from "@/lib/appNav";
import type { Customer } from "@/types";

type ProfileFields = {
  name: string;
  contact: string;
  email: string;
  phone: string;
};

function missingProfileFields(p: ProfileFields): Array<keyof ProfileFields> {
  const missing: Array<keyof ProfileFields> = [];
  if (!p.name.trim()) missing.push("name");
  if (!p.contact.trim()) missing.push("contact");
  if (!p.email.trim()) missing.push("email");
  if (!p.phone.trim()) missing.push("phone");
  return missing;
}

function labelForField(key: keyof ProfileFields) {
  switch (key) {
    case "name":
      return "company name";
    case "contact":
      return "contact name";
    case "email":
      return "email";
    case "phone":
      return "phone";
  }
}

/** Portal customer self-service profile (contact fields used for dock booking). */
export default function PortalProfileScreen() {
  const { token, user } = useAuth();
  const { navigate } = useAppNav();
  const customerPath = user?.customerId ? `/customers/${user.customerId}` : null;
  const {
    data: customerPayload,
    loading,
    reload,
  } = useApiQuery<{ customer: Customer }>(customerPath);
  const customer = customerPayload?.customer;

  const [draft, setDraft] = useState<ProfileFields>({
    name: "",
    contact: "",
    email: "",
    phone: "",
  });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!customer && !user) return;
    setDraft({
      name: customer?.name || "",
      contact: customer?.contact || "",
      email: customer?.email || user?.email || "",
      phone: customer?.phone || "",
    });
  }, [customer, user]);

  const saved = useMemo<ProfileFields>(
    () => ({
      name: (customer?.name || "").trim(),
      contact: (customer?.contact || "").trim(),
      email: (customer?.email || "").trim(),
      phone: (customer?.phone || "").trim(),
    }),
    [customer]
  );
  const missing = useMemo(() => missingProfileFields(saved), [saved]);
  const complete = missing.length === 0;

  async function onSave(e: FormEvent) {
    e.preventDefault();
    if (!token || !user?.customerId) return;
    const nextMissing = missingProfileFields(draft);
    if (nextMissing.length) {
      setErr(`Please fill in: ${nextMissing.map(labelForField).join(", ")}`);
      return;
    }
    setBusy(true);
    setErr("");
    setMsg("");
    try {
      await api(`/customers/${user.customerId}`, {
        method: "PATCH",
        token,
        body: JSON.stringify({
          name: draft.name.trim(),
          contact: draft.contact.trim(),
          email: draft.email.trim(),
          phone: draft.phone.trim(),
        }),
      });
      invalidateApiCache(`/customers/${user.customerId}`);
      await reload();
      setMsg("Profile saved.");
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "Could not update profile");
    } finally {
      setBusy(false);
    }
  }

  if (!user?.customerId) {
    return (
      <div>
        <PageHeader
          title="Profile"
          icon={<UserRound className="h-5 w-5" />}
          description="Account contact details for dock booking."
        />
        <Alert tone="danger">
          This login is not linked to a customer account. Ask the dock office to connect your portal
          user.
        </Alert>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Profile"
        icon={<UserRound className="h-5 w-5" />}
        description="Keep company, contact, email, and phone up to date — required before booking a dock time."
      />

      {msg ? <Alert tone="success">{msg}</Alert> : null}
      {err ? <Alert tone="danger">{err}</Alert> : null}

      {!complete && customer ? (
        <Alert tone="info">
          Profile incomplete. Missing: <strong>{missing.map(labelForField).join(", ")}</strong>.
          Update these before you can submit a dock request.
        </Alert>
      ) : null}

      <Card>
        <CardBody>
          <CardTitle>Contact on file</CardTitle>
          {loading && !customer ? (
            <p className="mt-3 mb-0 text-sm text-muted">Loading profile…</p>
          ) : (
            <form onSubmit={onSave} className="mt-4 space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Company name" required>
                  <Input
                    required
                    value={draft.name}
                    onChange={(e) => setDraft((p) => ({ ...p, name: e.target.value }))}
                    placeholder="Company on the BOL"
                  />
                </Field>
                <Field label="Contact name" required>
                  <Input
                    required
                    value={draft.contact}
                    onChange={(e) => setDraft((p) => ({ ...p, contact: e.target.value }))}
                    placeholder="Who the dock should call"
                  />
                </Field>
                <Field label="Email" required>
                  <Input
                    required
                    type="email"
                    value={draft.email}
                    onChange={(e) => setDraft((p) => ({ ...p, email: e.target.value }))}
                  />
                </Field>
                <Field label="Phone" required>
                  <Input
                    required
                    value={draft.phone}
                    onChange={(e) => setDraft((p) => ({ ...p, phone: e.target.value }))}
                    placeholder="(623) 555-0100"
                  />
                </Field>
              </div>
              <div className="flex flex-wrap gap-2 pt-1">
                <Button type="submit" loading={busy}>
                  Save profile
                </Button>
                {complete ? (
                  <Button type="button" variant="secondary" onClick={() => navigate("/bookings")}>
                    Book a dock time
                  </Button>
                ) : null}
              </div>
            </form>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
