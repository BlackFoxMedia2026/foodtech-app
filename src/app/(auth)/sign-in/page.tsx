"use client";

import { useState, Suspense } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AmbientScene } from "@/components/shell/ambient-scene";
import { AmbientBackground } from "@/components/shell/ambient-background";

function SignInForm() {
  const router = useRouter();
  const search = useSearchParams();
  const callback = search.get("callbackUrl") ?? "/overview";
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

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
    <main>
      <AmbientScene className="dark relative z-0 grid min-h-screen w-full gap-10 overflow-x-hidden bg-background p-6 pb-[max(2.5rem,env(safe-area-inset-bottom))] sm:p-8 md:grid-cols-[44%_1fr] md:gap-12 md:p-8 lg:grid-cols-[47%_1fr] lg:gap-16 lg:p-10 xl:gap-20">
        <AmbientBackground />

        {/* Visual panel */}
        <section className="relative order-2 flex min-h-[260px] flex-col overflow-hidden rounded-[28px] p-8 shadow-[0_24px_60px_-24px_rgba(0,0,0,0.6)] sm:p-10 md:order-1 md:min-h-0 md:p-10 lg:p-12">
          <div className="relative z-10 flex h-full flex-col text-foreground">
            <div className="flex items-center gap-2">
              <span className="grid h-8 w-8 place-items-center rounded-md bg-accent text-accent-foreground font-display font-semibold">T</span>
              <span className="text-display text-lg">Tavolo</span>
            </div>

            <div className="flex-1" />

            <div className="max-w-md space-y-4">
              <p className="text-display text-2xl leading-tight sm:text-3xl">
                Una sala perfetta è prima di tutto una <span className="text-accent">questione di ritmo</span>.
              </p>
              <p className="hidden text-sm text-muted-foreground sm:block">
                Tavolo coordina prenotazioni, sala, ospiti ed esperienze in un&apos;unica
                interfaccia pensata per chi accoglie ogni giorno.
              </p>
            </div>

            <p className="mt-8 text-xs text-muted-foreground">© Tavolo · gestionale ospitalità</p>
          </div>
        </section>

        {/* Login form */}
        <section className="relative order-1 flex items-center justify-center bg-background py-6 md:order-2 md:py-0">
          <form onSubmit={onSubmit} noValidate className="w-full max-w-[400px] space-y-6 text-left lg:max-w-[440px]">
            <div className="flex flex-col items-start space-y-4 text-left">
              <span className="grid h-9 w-9 place-items-center rounded-md bg-accent text-accent-foreground font-display font-semibold">T</span>
              <div className="space-y-1.5">
                <h1 className="text-display text-2xl leading-tight text-foreground">Accedi</h1>
                <p className="text-sm text-muted-foreground">
                  Gestisci prenotazioni, sala e ospiti da un unico spazio.
                </p>
              </div>
            </div>

            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  required
                  autoComplete="email"
                  defaultValue="owner@tavolo.demo"
                  aria-invalid={!!error}
                  aria-describedby={error ? "sign-in-error" : undefined}
                  className="h-11 bg-black/40 text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="password">Password</Label>
                <div className="relative">
                  <Input
                    id="password"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    required
                    autoComplete="current-password"
                    defaultValue="tavolo2026"
                    aria-invalid={!!error}
                    aria-describedby={error ? "sign-in-error" : undefined}
                    className="h-11 bg-black/40 pr-10 text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? "Nascondi password" : "Mostra password"}
                    aria-pressed={showPassword}
                    className="absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            </div>

            <div className="flex justify-end">
              <span className="text-xs text-muted-foreground">Password dimenticata?</span>
            </div>

            <div aria-live="polite" className="sr-only">
              {loading ? "Accesso in corso…" : ""}
            </div>
            {error && (
              <p id="sign-in-error" role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}

            <Button type="submit" variant="gold" disabled={loading} className="h-11 w-full">
              {loading ? "Accesso in corso…" : "Entra in Tavolo"}
            </Button>

            <p className="text-left text-xs text-muted-foreground">
              Accesso demo: <code>owner@tavolo.demo</code> · <code>tavolo2026</code>
            </p>
          </form>
        </section>
      </AmbientScene>
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
