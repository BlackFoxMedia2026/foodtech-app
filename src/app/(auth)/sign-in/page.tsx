"use client";

import { useState, Suspense } from "react";
import Link from "next/link";
import { Fraunces, Inter, Space_Mono } from "next/font/google";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Logo } from "@/components/shell/logo";

const sans = Inter({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
const display = Fraunces({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-display",
  display: "swap",
});
const mono = Space_Mono({ subsets: ["latin"], weight: ["400", "700"], variable: "--font-mono", display: "swap" });

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
    <main
      className={cn(
        sans.variable,
        display.variable,
        mono.variable,
        "grid min-h-screen w-full gap-10 overflow-x-hidden bg-background p-6 pb-[max(2.5rem,env(safe-area-inset-bottom))] text-foreground sm:p-8 md:grid-cols-[44%_1fr] md:gap-12 md:p-8 lg:grid-cols-[47%_1fr] lg:gap-16 lg:p-10 xl:gap-20",
      )}
    >
      {/* Identity panel */}
      <section className="relative order-2 flex min-h-[260px] flex-col p-2 sm:p-4 md:order-1 md:min-h-0">
        <div className="flex h-full flex-col">
          <Link href="/" className="flex items-center gap-2">
            <Logo />
            <span className="text-display text-lg">Tavolo</span>
          </Link>

          <div className="flex flex-1 flex-col items-end justify-center">
            <div className="max-w-md space-y-4">
              <p className="text-display text-2xl leading-tight sm:text-3xl">
                Una sala perfetta è prima di tutto una <span className="text-accent">questione di ritmo</span>.
              </p>
              <p className="hidden text-sm text-muted-foreground sm:block">
                Tavolo coordina prenotazioni, sala, ospiti ed esperienze in un&apos;unica
                interfaccia pensata per chi accoglie ogni giorno.
              </p>
              <div className="hidden items-center gap-3 rounded-xl border border-border bg-muted/50 px-4 py-3 sm:flex">
                <span className="font-mono text-lg font-semibold text-accent">142</span>
                <span className="text-xs text-muted-foreground">coperti gestiti ieri sera da Aurora Bistrot</span>
              </div>
            </div>
          </div>

          <p className="mt-8 text-xs text-muted-foreground">© Tavolo · gestionale ospitalità</p>
        </div>
      </section>

      {/* Login form */}
      <section className="relative order-1 flex items-center justify-center py-6 md:order-2 md:py-0">
        <Card className="card-notch w-full max-w-[400px] p-8 sm:p-10 lg:max-w-[440px]">
          <form onSubmit={onSubmit} noValidate className="w-full space-y-6 text-left">
            <div className="flex flex-col items-start space-y-4 text-left">
              <Logo />
              <div className="space-y-1.5">
                <h1 className="text-display text-2xl leading-tight">Accedi</h1>
                <p className="text-sm text-card-foreground/65">
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
                  className="h-11 text-sm shadow-[inset_0_3px_8px_rgba(0,0,0,0.25)]"
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
                    className="h-11 pr-10 text-sm shadow-[inset_0_3px_8px_rgba(0,0,0,0.25)]"
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
              <span className="text-xs text-card-foreground/65">Password dimenticata?</span>
            </div>

            <div aria-live="polite" className="sr-only">
              {loading ? "Accesso in corso…" : ""}
            </div>
            {error && (
              <p id="sign-in-error" role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}

            <Button type="submit" variant="brand" disabled={loading} className="h-11 w-full">
              {loading ? "Accesso in corso…" : "Entra in Tavolo"}
            </Button>

            <p className="text-left text-xs text-card-foreground/65">
              Accesso demo: <code>owner@tavolo.demo</code> · <code>tavolo2026</code>
            </p>
          </form>
        </Card>
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
