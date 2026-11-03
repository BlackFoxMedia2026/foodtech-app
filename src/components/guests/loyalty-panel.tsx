"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ChevronDown, Gift, Hourglass, PenLine, Receipt, Sparkles } from "lucide-react";
import type { LoyaltyTxnKind } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { readApiError } from "@/lib/api-client";
import { formatCurrency, formatDateTime } from "@/lib/utils";
import { descriviMovimento, type SaldoFedelta } from "@/server/loyalty";

/** Quanti movimenti si vedono prima di «Mostra tutti». */
const VISIBILI = 5;

/** Dischetto e pastiglia di un movimento: guadagnati verdi, usati oro. */
function tipoMovimento(kind: LoyaltyTxnKind, punti: number) {
  switch (kind) {
    case "EARNED":
      return { icona: Receipt, disco: "vetro kpi-pastiglia", pastiglia: "bg-secondary/70 text-foreground" };
    case "REDEEMED":
      return { icona: Gift, disco: "bg-accent/25 text-accent-strong", pastiglia: "bg-accent/20 text-accent-strong" };
    case "EXPIRED":
      return { icona: Hourglass, disco: "bg-secondary text-muted-foreground", pastiglia: "bg-secondary/60 text-muted-foreground" };
    default:
      return {
        icona: PenLine,
        disco: "vetro kpi-pastiglia",
        pastiglia: punti >= 0 ? "bg-secondary/70 text-foreground" : "bg-accent/20 text-accent-strong",
      };
  }
}

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
  saldoSullaTessera = false,
}: {
  guestId: string;
  guestName: string;
  saldo: SaldoFedelta;
  currency: string;
  canAdjust: boolean;
  /**
   * Il saldo è già scritto grande sulla tessera accanto: qui non si ripete,
   * e il pannello diventa quello che è — l'estratto conto della carta.
   */
  saldoSullaTessera?: boolean;
}) {
  const router = useRouter();
  const [apri, setApri] = useState(false);
  const [tutti, setTutti] = useState(false);
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
          <Sparkles className="h-4 w-4 text-accent-strong" aria-hidden="true" /> Punti fedeltà
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
        ) : saldoSullaTessera ? null : (
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

        {saldo.alPremio && (
          /* «Hai 160 punti» non muove niente. «Ti mancano 40 punti alla cena
             omaggio» è la frase che fa tornare: è la stessa informazione
             detta dal lato che interessa al cliente. */
          <p className="flex items-start gap-2 rounded-xl border border-accent/30 bg-accent/10 p-3 text-sm">
            <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-accent-strong" aria-hidden="true" />
            <span>
            {/* Senza pronome: il genere del cliente non lo sappiamo, e
                indovinarlo su una scheda che il personale legge davanti alla
                persona è un modo gratuito di sbagliare. */}
            {saldo.alPremio.mancano === 0 ? (
              <>
                Traguardo raggiunto: <strong>{saldo.alPremio.cosa}</strong>.
              </>
            ) : (
              <>
                Mancano <strong className="tabular-nums">{saldo.alPremio.mancano} punti</strong> per{" "}
                <strong>{saldo.alPremio.cosa}</strong>.
              </>
            )}
            </span>
          </p>
        )}

        {apri && (
          <div className="space-y-2 riquadro p-3">
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
            <p className="t-nota">
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
          /*
            Un estratto conto a linea del tempo (3 novembre 2026): ogni
            movimento ha il suo dischetto — scontrino per i punti guadagnati,
            regalo per lo sconto usato, matita per la correzione a mano — e i
            punti in una pastiglia colorata. Prima era una colonna di testo
            tutta uguale, alta quanto venti righe.

            I primi cinque, gli altri a richiesta: i più recenti sono quelli
            che si cercano.
          */
          <div className="space-y-2">
            <p className="text-sm font-medium">Movimenti</p>
            <ol className="relative">
              {/* Il filo che lega i dischetti */}
              <span aria-hidden="true" className="absolute bottom-4 left-4 top-4 w-px bg-border" />
              {(tutti ? saldo.movimenti : saldo.movimenti.slice(0, VISIBILI)).map((m) => {
                const t = tipoMovimento(m.kind, m.points);
                return (
                  <li key={m.id} className="relative flex items-center gap-3 py-1.5">
                    <span
                      className={`relative z-10 grid h-8 w-8 shrink-0 place-items-center rounded-full ring-4 ring-card ${t.disco}`}
                    >
                      <t.icona
                        className="h-4 w-4"
                        stroke={t.disco.includes("kpi-pastiglia") ? "url(#trattoVetro)" : "currentColor"}
                        aria-hidden="true"
                      />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="break-words text-sm leading-snug">{descriviMovimento(m)}</p>
                      <p className="text-xs text-muted-foreground">{formatDateTime(m.createdAt)}</p>
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 font-mono text-xs tabular-nums ${t.pastiglia}`}
                    >
                      {m.points > 0 ? "+" : m.points < 0 ? "−" : ""}
                      {Math.abs(m.points)}
                    </span>
                  </li>
                );
              })}
            </ol>
            {saldo.movimenti.length > VISIBILI && (
              <button
                type="button"
                onClick={() => setTutti(!tutti)}
                className="inline-flex items-center gap-1 rounded-full border border-border px-3 py-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                <ChevronDown
                  className={`h-3.5 w-3.5 transition-transform ${tutti ? "rotate-180" : ""}`}
                  aria-hidden="true"
                />
                {tutti ? "Mostra meno" : `Mostra tutti i ${saldo.movimenti.length} movimenti`}
              </button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
