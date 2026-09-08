"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { readApiError } from "@/lib/api-client";
import type { InvitoPubblico } from "@/server/team";

const NOME_RUOLO: Record<string, string> = {
  MANAGER: "manager",
  RECEPTION: "reception",
  WAITER: "cameriere",
  MARKETING: "marketing",
  READ_ONLY: "sola lettura",
};

/**
 * Accettare un invito.
 *
 * Due strade, e la differenza la decide il server: chi ha già un accesso a
 * Tavolo non si vede chiedere una password nuova — gli si aggiunge il locale.
 * Chiedergliela vorrebbe dire farne una seconda per la stessa persona, e poi
 * scoprire quale delle due funziona.
 *
 * Chi non ce l'ha la scegli qui, e il link è la prova che quell'indirizzo è
 * suo: è lo stesso ragionamento di ogni invito via email, con la differenza
 * che qui il messaggio l'ha consegnato una persona.
 */
export function AcceptInviteForm({ invito }: { invito: InvitoPubblico }) {
  const router = useRouter();
  const [nome, setNome] = useState("");
  const [password, setPassword] = useState("");
  const [inCorso, setInCorso] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fatto, setFatto] = useState(false);

  async function accetta(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setInCorso(true);
    setError(null);
    const res = await fetch("/api/public/invite", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        token: invito.token,
        ...(invito.haGiaUnAccount ? {} : { nome, password }),
      }),
    });
    setInCorso(false);
    if (!res.ok) {
      setError(await readApiError(res, "Non siamo riusciti ad accettare l'invito."));
      return;
    }
    setFatto(true);
  }

  if (fatto) {
    return (
      <div className="surface rounded-md border border-border p-6 text-center">
        <CheckCircle2 className="mx-auto h-8 w-8 text-sage" aria-hidden="true" />
        <h1 className="mt-3 text-display text-2xl">Ci sei</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Il tuo accesso a {invito.venueName} è attivo. Entra con <strong>{invito.email}</strong>
          {invito.haGiaUnAccount ? " e la password che usi già." : " e la password che hai appena scelto."}
        </p>
        <Button
          variant="accent"
          className="mt-4 w-full"
          onClick={() => router.push("/sign-in")}
        >
          Entra in Tavolo
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={accetta} className="surface space-y-4 rounded-md border border-border p-6">
      <div>
        <p className="text-xs uppercase tracking-widest text-muted-foreground">Invito</p>
        <h1 className="mt-1 text-display text-2xl">{invito.venueName}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Ti hanno dato accesso come <strong>{NOME_RUOLO[invito.ruolo] ?? invito.ruolo}</strong>, con
          l&apos;indirizzo <strong>{invito.email}</strong>.
        </p>
      </div>

      {invito.haGiaUnAccount ? (
        <p className="rounded-md border border-border p-3 text-sm text-muted-foreground">
          Questo indirizzo ha già un accesso a Tavolo: non serve una password nuova. Accettando, il
          locale si aggiunge a quelli che vedi già.
        </p>
      ) : (
        <>
          <div className="space-y-1.5">
            <Label htmlFor="inv-nome">Come ti chiami</Label>
            <Input
              id="inv-nome"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              required
              placeholder="Maria Rossi"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="inv-password">Scegli una password</Label>
            <Input
              id="inv-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={10}
              autoComplete="new-password"
            />
            <p className="text-xs text-tertiary-foreground">
              Almeno dieci caratteri. Serve a te per entrare: il locale non la vede.
            </p>
          </div>
        </>
      )}

      <Button type="submit" variant="accent" className="w-full" disabled={inCorso}>
        {inCorso ? "Un istante…" : "Accetta l'invito"}
      </Button>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <p className="text-center text-xs text-tertiary-foreground">
        Non ti aspettavi questo invito?{" "}
        <Link href="/" className="underline">
          Chiudi questa pagina
        </Link>
        : senza accettarlo non succede niente.
      </p>
    </form>
  );
}
