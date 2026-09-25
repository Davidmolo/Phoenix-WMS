"use client";

import Image from "next/image";
import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, Button, Card, CardBody, Input, Label } from "@/components/ui";
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
      <main className="grid min-h-screen place-items-center text-sm text-muted">
        {user ? "Redirecting…" : "Loading…"}
      </main>
    );
  }

  return (
    <main className="grid min-h-screen place-items-center bg-[radial-gradient(1200px_600px_at_10%_-10%,#dbe4ff_0%,transparent_55%),radial-gradient(900px_500px_at_100%_0%,#e8eefc_0%,transparent_50%),var(--bg)] p-6">
      <Card className="w-full max-w-[420px]">
        <CardBody className="p-7">
          <div className="mb-5 flex justify-center">
            <Image
              src="/logo.png"
              alt="Phoenix Cross Dock"
              width={96}
              height={96}
              priority
              className="h-20 w-20 object-contain"
            />
          </div>
          <h1 className="m-0 text-center text-[22px] font-bold text-navy">Sign in</h1>
          <p className="mt-1.5 mb-6 text-center text-sm text-muted">Warehouse Management System</p>

          <form onSubmit={onSubmit} className="space-y-3.5">
            <div>
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="username"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            <Alert>{error}</Alert>

            <Button type="submit" className="w-full" loading={busy}>
              Sign in
            </Button>
          </form>

          <p className="mt-4 mb-0 text-xs leading-relaxed text-muted">
            Staff: <code>admin@phoenixcrossdock.com</code> · Customer portal:{" "}
            <code>sba@sbasite.com</code> — password <code>ChangeMe123!</code>
          </p>
        </CardBody>
      </Card>
    </main>
  );
}
