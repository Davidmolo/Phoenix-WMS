"use client";

import { FormEvent, useEffect, useState } from "react";
import Image from "next/image";
import { useParams, useRouter } from "next/navigation";
import { Lock, LogIn } from "lucide-react";
import { Alert, Button, Field, Input } from "@/components/ui";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";

export default function InvitePage() {
  const params = useParams<{ token: string }>();
  const token = String(params?.token || "");
  const router = useRouter();
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError("");
      try {
        const data = await api<{ email: string; name: string }>(`/auth/invite/${token}`);
        if (cancelled) return;
        setEmail(data.email);
        setName(data.name);
      } catch (ex) {
        if (!cancelled) setError(ex instanceof Error ? ex.message : "Invite is not valid");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (password !== confirm) {
      setError("Passwords do not match");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const data = await api<{ token: string; user: { email: string } }>(`/auth/invite/${token}`, {
        method: "POST",
        body: JSON.stringify({ password }),
      });
      await login(data.user.email, password);
      router.replace("/dashboard");
    } catch (ex) {
      setError(ex instanceof Error ? ex.message : "Could not set password");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main
      className="relative grid min-h-screen place-items-center overflow-hidden p-6"
      style={{ background: "var(--gradient-warm), var(--gradient-hero)" }}
    >
      <div className="w-full max-w-[440px]">
        <div className="mb-6 text-center">
          <Image
            src="/logo.png"
            alt="Phoenix Cross Dock"
            width={88}
            height={88}
            priority
            className="mx-auto h-[72px] w-[72px] object-contain"
          />
          <div className="font-display mt-3 text-[22px] font-semibold tracking-[0.06em] uppercase sm:text-[26px]">
            <span className="text-navy">Phoenix </span>
            <span className="text-accent">Cross Dock</span>
          </div>
          <p className="mt-1.5 mb-0 text-[11px] font-bold tracking-[0.1em] text-muted uppercase">
            Customer portal access
          </p>
        </div>

        <div
          className="overflow-hidden rounded-[var(--radius-xl)] border border-border shadow-[var(--shadow-card)]"
          style={{ background: "var(--blend-card)" }}
        >
          <div className="border-b border-border px-6 py-4 sm:px-8">
            <h1 className="font-display m-0 text-[18px] font-semibold tracking-[0.06em] text-navy uppercase">
              Set your password
            </h1>
            <p className="mt-1 mb-0 text-sm text-muted">
              {loading ? "Checking invite…" : email ? `Invited as ${name || email}` : "Invite required"}
            </p>
          </div>

          <form onSubmit={onSubmit} className="space-y-4 px-6 py-6 sm:px-8 sm:py-7">
            <Alert>{error}</Alert>
            <Field label="Password" htmlFor="invite-password" required>
              <Input
                id="invite-password"
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                icon={<Lock className="h-4 w-4" />}
              />
            </Field>
            <Field label="Confirm password" htmlFor="invite-confirm" required>
              <Input
                id="invite-confirm"
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                icon={<Lock className="h-4 w-4" />}
              />
            </Field>
            <Button
              type="submit"
              className="w-full"
              loading={busy}
              disabled={loading || !email}
              icon={<LogIn className="h-4 w-4" />}
            >
              Activate portal
            </Button>
          </form>
        </div>
      </div>
    </main>
  );
}
