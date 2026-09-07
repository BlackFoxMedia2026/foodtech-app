"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { readApiError } from "@/lib/api-client";
import { formatCurrency, formatDateTime } from "@/lib/utils";
import { descriviMovimento, type SaldoFedelta } from "@/server/loyalty";

/**
 * I punti di un cliente, con la storia di come sono arrivati.
 *
 * Il numero grande è il saldo, ma la lista sotto conta di più: è la risposta a
 * «perché ho 180 punti?», e senza di essa un saldo è solo un numero da credere
 * sulla parola. Ogni riga dice da quale conto viene, o chi l'ha messa a mano e
 * perché.
 *
 * La rettifica a mano esiste perché la realtà di un ristorante non passa tutta
 * dal software: un conto pagato in contanti senza dire il nome, un gesto per
 * un cliente arrabbiato. Il motivo è obbligatorio: fra sei mesi «+200 punti»
 * senza spiegazione non si distingue da un errore.
 */
export function LoyaltyPanel({
  guestId,
  guestName,
  saldo,
  currency,
  canAdjust,
}: {
  guestId: string;
  guestName: string;
  saldo: SaldoFedelta;
  currency: string;
  canAdjust: boolean;
}) {
  const router = useRouter();
  const [apri, setApri] = useState(false);
  const [punti, setPunti] = useState("");
  const [motivo, setMotivo] = useState("");
  const [inCorso, setInCorso] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function rettifica() {
    setInCorso(true);
    setError(null);
    const res = await fetch("/api/loyalty/adjust", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ guestId, punti: Number(punti), reason: motivo.trim() }),
    });
    setInCorso(false);
    if (!res.ok) {
      setError(await readApiError(res, "Non siamo riusciti a modificare i punti."));
      return;
    }
    setApri(false);
    setPunti("");
    setMotivo("");
    router.refresh();
  }

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-accent" aria-hidden="true" /> Punti fedeltà
        </CardTitle>
        {canAdjust && saldo.attiva && (
          <Button variant="outline" size="sm" onClick={() => setApri(!apri)}>
            {apri ? "Annulla" : "Correggi a mano"}
          </Button>
        )}
      </CardHeader>

      <CardContent className="space-y-4">
        {!saldo.attiva ? (
          <p className="text-sm text-muted-foreground">
            La raccolta punti è spenta: nessuno accumula niente. Si accende dalle{" "}
            <Link href="/settings" className="underline">
              Impostazioni
            </Link>
            , dicendo quanti punti dà un euro e quanto vale un punto.
          </p>
        ) : (
          <div className="flex items-baseline gap-3">
            <p className="text-display text-3xl tabular-nums">{saldo.punti}</p>
            <p className="text-sm text-muted-foreground">
              {saldo.punti === 1 ? "punto" : "punti"}
              {saldo.valoreCents != null && saldo.valoreCents > 0
                ? ` · valgono ${formatCurrency(saldo.valoreCents, currency)} sul prossimo conto`
                : ""}
            </p>
          </div>
        )}

        {apri && (
          <div className="space-y-2 rounded-md border border-border p-3">
            <div className="grid gap-3 sm:grid-cols-[7rem_1fr]">
              <div className="space-y-1.5">
                <Label htmlFor="ap-punti">Punti</Label>
                <Input
                  id="ap-punti"
                  inputMode="numeric"
                  value={punti}
                  onChange={(e) => setPunti(e.target.value.replace(/[^0-9-]/g, ""))}
                  placeholder="Es. 50 o -50"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ap-motivo">Perché</Label>
                <Input
                  id="ap-motivo"
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                  placeholder="Es. cena del 4 settembre pagata senza tessera"
                />
              </div>
            </div>
            <p className="text-xs text-tertiary-foreground">
              Positivo aggiunge, negativo toglie. Il motivo resta scritto nella storia dei punti.
            </p>
            <Button
              variant="accent"
              size="sm"
              onClick={rettifica}
              disabled={inCorso || !punti.trim() || Number(punti) === 0 || !motivo.trim()}
            >
              {inCorso ? "Salvo…" : "Salva la correzione"}
            </Button>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
        )}

        {saldo.movimenti.length === 0 ? (
          saldo.attiva && (
            <p className="text-sm text-muted-foreground">
              Nessun movimento: {guestName} accumulerà punti al primo conto chiuso al suo tavolo.
            </p>
          )
        ) : (
          <ul className="divide-y divide-border">
            {saldo.movimenti.map((m) => (
              <li key={m.id} className="flex items-baseline justify-between gap-3 py-2 text-sm">
                <div className="min-w-0">
                  <p className="truncate">{descriviMovimento(m)}</p>
                  <p className="text-xs text-muted-foreground">{formatDateTime(m.createdAt)}</p>
                </div>
                <span
                  className={`shrink-0 tabular-nums ${m.points >= 0 ? "text-sage" : "text-muted-foreground"}`}
                >
                  {m.points > 0 ? "+" : ""}
                  {m.points}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
