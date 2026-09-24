"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { readApiError } from "@/lib/api-client";

type Richiesta = {
  id: string;
  slug: string;
  integrazione: string;
  tipo: "ACCESS" | "NOTIFY";
  abilitabile: boolean;
  locale: string;
  gruppo: string;
  richiestaDa: string | null;
  il: string;
};

/**
 * **Richieste integrazioni**: la coda di «Richiedi attivazione» e «Avvisami»
 * dei ristoranti. Solo interna: niente parte verso i fornitori.
 *
 * «Abilita beta» concede l'accesso beta a quel locale (e chiude la
 * richiesta); «Archivia» la chiude senza concedere niente. Le regole le
 * applica il server (`richieste.ts`).
 */
export function RichiesteIntegrazioni({ richieste }: { richieste: Richiesta[] }) {
  const router = useRouter();
  const [inCorso, setInCorso] = useState<string | null>(null);
  const [errore, setErrore] = useState<string | null>(null);

  async function esegui(id: string, azione: "approva_richiesta" | "archivia_richiesta") {
    setInCorso(id);
    setErrore(null);
    try {
      const res = await fetch("/api/admin/integrazioni", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ azione, id }),
      });
      if (!res.ok) throw new Error(await readApiError(res, "Operazione non riuscita."));
      router.refresh();
    } catch (e) {
      setErrore(e instanceof Error ? e.message : String(e));
    } finally {
      setInCorso(null);
    }
  }

  if (richieste.length === 0) return <p className="t-nota">Nessuna richiesta aperta.</p>;

  return (
    <div className="space-y-2">
      {errore && (
        <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-sm">
          {errore}
        </p>
      )}
      <ul className="divide-y divide-border/60 rounded-lg border border-border">
        {richieste.map((r) => (
          <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
            <div className="min-w-0">
              <p className="font-medium">
                {r.locale} <span className="t-nota">· {r.gruppo}</span>
              </p>
              <p className="mt-0.5 flex flex-wrap items-center gap-2">
                <Link href={`/admin/integrazioni/${r.slug}`} className="underline-offset-4 hover:underline">
                  {r.integrazione}
                </Link>
                <Badge tone={r.tipo === "ACCESS" ? "gold" : "neutral"}>{r.tipo === "ACCESS" ? "Attivazione" : "Avvisami"}</Badge>
                <span className="t-nota">
                  Richiesta {new Date(r.il).toLocaleDateString("it-IT")}
                  {r.richiestaDa ? ` da ${r.richiestaDa}` : ""}
                </span>
              </p>
            </div>
            <div className="flex gap-2">
              {r.abilitabile && (
                <Button size="sm" variant="accent" disabled={!!inCorso} onClick={() => void esegui(r.id, "approva_richiesta")}>
                  {inCorso === r.id ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
                  Abilita beta
                </Button>
              )}
              <Button size="sm" variant="ghost" disabled={!!inCorso} onClick={() => void esegui(r.id, "archivia_richiesta")}>
                Archivia
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
