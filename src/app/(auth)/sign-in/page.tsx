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
    <main className="dark relative z-0 grid min-h-screen overflow-hidden lg:grid-cols-2">
      <div className="mesh-bg pointer-events-none absolute -inset-32 -z-10">
        <div className="mesh-blob mesh-blob-1" />
        <div className="mesh-blob mesh-blob-2" />
        <div className="mesh-blob mesh-blob-3" />
        <div className="mesh-blob mesh-blob-4" />
        <div className="mesh-blob mesh-blob-5" />
        <div className="mesh-blob mesh-blob-6" />
      </div>

      <section className="relative z-10 hidden flex-col justify-between p-10 text-foreground lg:flex">
        <div className="flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-md bg-accent text-accent-foreground font-display font-semibold">T</span>
          <span className="text-display text-lg">Tavolo</span>
        </div>
        <div className="max-w-md space-y-4">
          <p className="text-display text-3xl leading-tight">
            Una sala perfetta è prima di tutto una <span className="text-accent">questione di ritmo</span>.
          </p>
          <p className="text-sm text-muted-foreground">
            Tavolo coordina prenotazioni, sala, ospiti ed esperienze in un'unica
            interfaccia pensata per chi accoglie ogni giorno.
          </p>
        </div>
        <p className="text-xs text-muted-foreground">© Tavolo · gestionale ospitalità</p>
      </section>

      <section className="relative z-10 flex items-center justify-center bg-background/70 px-6 py-12 text-foreground backdrop-blur-2xl">
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
