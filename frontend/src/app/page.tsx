"use client";

import Image from "next/image";
import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Lock, Mail, LogIn } from "lucide-react";
import { Alert, Button, Field, Input, Skeleton } from "@/components/ui";
import { useAuth } from "@/lib/auth";

export default function LoginPage() {
  const { login, user, loading } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("admin@phoenixcrossdock.com");
  const [password, setPassword] = useState("ChangeMe123!");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && user) router.replace("/dashboard");
  }, [loading, user, router]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await login(email, password);
      router.replace("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setBusy(false);
    }
  }

  if (loading || user) {
    return (
      <main
        className="relative grid min-h-screen place-items-center overflow-hidden p-4 sm:p-6"
        style={{ background: "var(--gradient-warm), var(--gradient-hero)" }}
      >
        <div className="w-full max-w-[440px]">
          <div className="mb-6 flex flex-col items-center gap-3">
            <Skeleton className="h-[72px] w-[72px] rounded-2xl" />
            <Skeleton className="h-6 w-52" />
            <Skeleton className="h-3 w-40" />
          </div>
          <div
            className="overflow-hidden rounded-[var(--radius-xl)] border border-border shadow-[var(--shadow-card)]"
            style={{ background: "var(--blend-card)" }}
          >
            <div className="flex items-center justify-between border-b border-border px-6 py-4">
              <Skeleton className="h-5 w-24" />
              <Skeleton className="h-6 w-24 rounded-full" />
            </div>
            <div className="space-y-4 px-6 py-6">
              <div className="space-y-1.5">
                <Skeleton className="h-2.5 w-14" />
                <Skeleton className="h-10 w-full rounded-[var(--radius)]" />
              </div>
              <div className="space-y-1.5">
                <Skeleton className="h-2.5 w-16" />
                <Skeleton className="h-10 w-full rounded-[var(--radius)]" />
              </div>
              <Skeleton className="h-11 w-full rounded-[var(--radius)]" />
            </div>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main
      className="relative grid min-h-screen place-items-center overflow-hidden p-6"
      style={{ background: "var(--gradient-warm), var(--gradient-hero)" }}
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-[linear-gradient(90deg,var(--navy),var(--accent),var(--navy))]" />

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
            Phoenix, AZ — I-10 / I-17 corridors
          </p>
        </div>

        <div
          className="overflow-hidden rounded-[var(--radius-xl)] border border-border shadow-[var(--shadow-card)]"
          style={{ background: "var(--blend-card)" }}
        >
          <div className="flex items-center justify-between gap-3 border-b border-border px-6 py-4 sm:px-8">
            <h1 className="font-display m-0 text-[18px] font-semibold tracking-[0.06em] text-navy uppercase">
              Sign in
            </h1>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-accent-bg px-2.5 py-1 text-[10px] font-bold tracking-[0.06em] text-[var(--accent-text)] uppercase">
              <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden />
              WMS portal
            </span>
          </div>

          <form onSubmit={onSubmit} className="space-y-4 px-6 py-6 sm:px-8 sm:py-7">
            <Field label="Email" htmlFor="email" required>
              <Input
                id="email"
                type="email"
                autoComplete="username"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                icon={<Mail className="h-4 w-4" />}
              />
            </Field>
            <Field label="Password" htmlFor="password" required>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                icon={<Lock className="h-4 w-4" />}
              />
            </Field>

            <Alert>{error}</Alert>

            <Button type="submit" className="w-full" loading={busy} icon={<LogIn className="h-4 w-4" />}>
              Sign in
            </Button>
          </form>

          <p className="m-0 border-t border-border px-6 py-4 text-xs leading-relaxed text-muted sm:px-8">
            Staff: <code className="text-navy">admin@phoenixcrossdock.com</code>
            <br />
            Customer: <code className="text-navy">sba@sbasite.com</code>
            <br />
            Password: <code className="text-navy">ChangeMe123!</code>
            <br />
            New customers receive a portal invite from staff — there is no public sign-up.
          </p>
        </div>

        <p className="mt-5 mb-0 text-center text-xs text-muted">
          <a
            href="https://phoenixcrossdocks.com"
            target="_blank"
            rel="noreferrer"
            className="font-semibold text-navy hover:text-[var(--accent-text)]"
          >
            phoenixcrossdocks.com
          </a>
          {" · "}Suite 5 · 3550 W Clarendon Ave
        </p>
      </div>
    </main>
  );
}
