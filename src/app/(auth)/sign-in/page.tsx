"use client";

import { useState, Suspense } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function SignInForm() {
  const router = useRouter();
  const search = useSearchParams();
  const callback = search.get("callbackUrl") ?? "/overview";
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const fd = new FormData(e.currentTarget);
    const res = await signIn("credentials", {
      email: String(fd.get("email")),
      password: String(fd.get("password")),
      redirect: false,
    });
    setLoading(false);
    if (res?.error) {
      setError("Credenziali non valide.");
      return;
    }
    router.push(callback);
    router.refresh();
  }

  return (
    <main className="grid min-h-screen lg:grid-cols-2">
      <section className="hidden flex-col justify-between bg-carbon-800 p-10 text-sand-50 lg:flex">
        <div className="flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-md bg-gilt text-carbon-900 font-display font-semibold">T</span>
          <span className="text-display text-lg">Tavolo</span>
        </div>
        <div className="max-w-md space-y-4">
          <p className="text-display text-3xl leading-tight">
            Una sala perfetta è prima di tutto una <span className="text-gilt-light">questione di ritmo</span>.
          </p>
          <p className="text-sm text-sand-200/80">
            Tavolo coordina prenotazioni, sala, ospiti ed esperienze in un&apos;unica
            interfaccia pensata per chi accoglie ogni giorno.
          </p>
        </div>
        <p className="text-xs text-sand-200/60">© Tavolo · gestionale ospitalità</p>
      </section>

      <section className="flex items-center justify-center px-6 py-12">
        <form onSubmit={onSubmit} className="w-full max-w-sm space-y-6">
          <div className="space-y-2">
            <h1 className="text-display text-2xl">Accedi</h1>
            <p className="text-sm text-muted-foreground">
              Demo: <code>owner@tavolo.demo</code> · <code>tavolo2026</code>
            </p>
          </div>

          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input id="email" name="email" type="email" required defaultValue="owner@tavolo.demo" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <Input id="password" name="password" type="password" required defaultValue="tavolo2026" />
            </div>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Accesso in corso…" : "Entra in Tavolo"}
          </Button>
        </form>
      </section>
    </main>
  );
}

export default function Page() {
  return (
    <Suspense>
      <SignInForm />
    </Suspense>
  );
}
