"use client";

import { useState } from "react";
import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { readApiError } from "@/lib/api-client";

/** Scegliere la password nuova, dal link ricevuto. Due volte, per non
 * chiudersi fuori con un errore di battitura. */
export function ReimpostaPasswordForm({ token, email }: { token: string; email: string }) {
  const [password, setPassword] = useState("");
  const [conferma, setConferma] = useState("");
  const [inCorso, setInCorso] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const [fatto, setFatto] = useState(false);

  async function invia(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErrore(null);
    if (password.length < 10) return setErrore("Servono almeno dieci caratteri.");
    if (password !== conferma) return setErrore("Le due password non coincidono.");
    setInCorso(true);
    const res = await fetch("/api/public/reimposta-password", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token, password }),
    });
    setInCorso(false);
    if (!res.ok) {
      setErrore(await readApiError(res, "Non siamo riusciti a reimpostare la password."));
      return;
    }
    setFatto(true);
  }

  if (fatto) {
    return (
      <div className="surface p-6 text-center">
        <CheckCircle2 className="mx-auto h-8 w-8 text-sage-strong" aria-hidden="true" />
        <h1 className="mt-3 text-display text-2xl">Password aggiornata</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Da adesso entri con <strong>{email}</strong> e la password che hai appena scelto. Gli altri
          dispositivi dove eri dentro dovranno rientrare.
        </p>
        <Button asChild variant="accent" className="mt-5">
          <Link href="/sign-in">Entra</Link>
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={invia} className="surface space-y-5 p-6">
      <div>
        <h1 className="text-display text-2xl">Scegli una password nuova</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Per l&apos;accesso <strong className="text-foreground">{email}</strong>.
        </p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="password">Password nuova</Label>
        <Input
          id="password"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          minLength={10}
          required
        />
        <p className="text-xs text-muted-foreground">Almeno dieci caratteri.</p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="conferma">Ripeti la password</Label>
        <Input
          id="conferma"
          type="password"
          autoComplete="new-password"
          value={conferma}
          onChange={(e) => setConferma(e.target.value)}
          required
        />
      </div>
      {errore && <p className="text-sm text-destructive-soft">{errore}</p>}
      <Button type="submit" variant="accent" className="w-full" disabled={inCorso}>
        {inCorso ? "Salvo…" : "Salva la password"}
      </Button>
    </form>
  );
}
