"use client";

import { useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { invii, prezzoPiano } from "@/lib/dem-piani";
import { cn } from "@/lib/utils";

export type PianoInVetrina = {
  id: string;
  slug: string;
  name: string;
  monthlyEmails: number;
  priceCents: number;
  description: string | null;
  badge: string | null;
};

/**
 * Il confronto fra i piani, **senza la tabella con quarantacinque spunte**.
 *
 * Le funzioni sono le stesse in tutti i piani: editor, segmenti, modelli,
 * programmazione, statistiche, disiscrizioni, reputazione. Una tabella
 * comparativa con sette righe di spunte identiche non aiuta a scegliere —
 * suggerisce che ci sia una differenza e costringe a cercarla. L'unica
 * differenza è **quante email al mese**, e allora è quello il numero grande di
 * ogni scheda.
 *
 * ## Perché «Incluso» non sta nella griglia
 *
 * I piani sono cinque, e cinque schede in una griglia da tre fanno due schede
 * orfane in seconda fila: una fila piena e una mezza vuota, che si legge come
 * un errore di impaginazione. La soluzione non è stringere a cinque colonne —
 * a 1440 px sarebbero 250 px l'una, e il numero grande smetterebbe di essere
 * grande.
 *
 * La soluzione è che **«Incluso» non è un'offerta**: è il punto di partenza,
 * quello che si ha già senza pagare niente. Sta in una fascia sopra, dove
 * dichiara da dove si parte, e i quattro piani che si possono comprare vanno
 * in fila per quattro — nessun orfano a nessuna larghezza.
 *
 * Ha anche un effetto che la griglia non aveva: **tornare al piano incluso è
 * una disdetta**, e una disdetta non va messa accanto agli upgrade con lo
 * stesso peso visivo. Lì è un collegamento discreto, non un pulsante crema.
 *
 * L'elenco delle funzioni comuni sta una volta sola, sotto, dove risponde alla
 * domanda «cosa ci faccio» invece di fingere una scelta.
 */
export function SceltaPiano({
  piani,
  pianoAttuale,
  pianoProgrammato,
  puoAcquistare,
}: {
  piani: PianoInVetrina[];
  pianoAttuale: string;
  pianoProgrammato: string | null;
  /**
   * Chi può cambiare piano è chi amministra il locale, non chi scrive le
   * newsletter: sono spesso due persone diverse. Chi non può **vede comunque**
   * i piani — sapere quanto costa il gradino successivo serve a chi prepara le
   * campagne — ma trova scritto a chi chiedere invece di un pulsante che
   * risponde «non puoi».
   */
  puoAcquistare: boolean;
}) {
  const [inCorso, setInCorso] = useState<string | null>(null);
  const [errore, setErrore] = useState<string | null>(null);

  const attuale = piani.find((p) => p.slug === pianoAttuale);

  async function scegli(piano: PianoInVetrina) {
    setErrore(null);
    setInCorso(piano.id);
    try {
      const res = await fetch("/api/dem/piano", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId: piano.id }),
      });
      const dati = (await res.json()) as { url?: string; message?: string; cambiato?: boolean };
      if (!res.ok) throw new Error(dati.message || "Non siamo riusciti ad aprire il pagamento.");
      // Il pagamento avviene su Stripe: si esce dall'applicazione e si torna
      // con un webhook, che è l'unica prova che accettiamo. Il ritorno del
      // browser non conferma niente.
      if (dati.url) window.location.href = dati.url;
      else window.location.reload();
    } catch (err) {
      setErrore(err instanceof Error ? err.message : "Qualcosa è andato storto.");
      setInCorso(null);
    }
  }

  const incluso = piani.find((p) => p.priceCents <= 0) ?? null;
  const aPagamento = piani.filter((p) => p.priceCents > 0);

  return (
    <div className="space-y-6">
      {incluso && (
        <section
          className={cn(
            "surface flex flex-wrap items-center justify-between gap-x-6 gap-y-3 p-5",
            incluso.slug === pianoAttuale && "border-sage/50",
          )}
        >
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2.5">
              <h3 className="text-display text-lg">{incluso.name}</h3>
              {incluso.slug === pianoAttuale ? (
                <Badge tone="success-soft">Piano attuale</Badge>
              ) : incluso.slug === pianoProgrammato ? (
                <Badge tone="info">Dal prossimo rinnovo</Badge>
              ) : null}
            </div>
            <p className="t-nota mt-1">
              {invii(incluso.monthlyEmails)} email al mese, comprese nel tuo abbonamento Foodtech.
            </p>
          </div>

          {/* Disdire non è un gesto da pulsante crema: chi lo cerca lo trova,
              chi non lo cerca non ci inciampa sopra scorrendo. */}
          {incluso.slug !== pianoAttuale && incluso.slug !== pianoProgrammato && puoAcquistare && (
            <Button
              variant="ghost"
              size="sm"
              disabled={inCorso !== null}
              onClick={() => scegli(incluso)}
            >
              {inCorso === incluso.id ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Un istante…
                </>
              ) : (
                "Torna al piano incluso"
              )}
            </Button>
          )}
        </section>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {aPagamento.map((piano) => {
          const suo = piano.slug === pianoAttuale;
          const inArrivo = piano.slug === pianoProgrammato;
          const superiore = attuale ? piano.monthlyEmails > attuale.monthlyEmails : true;

          return (
            <article
              key={piano.id}
              className={cn(
                "surface flex h-full flex-col p-5",
                suo && "border-sage/50",
                piano.badge && !suo && "border-accent/40",
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <h3 className="text-display text-lg">{piano.name}</h3>
                {suo ? (
                  <Badge tone="success-soft">Piano attuale</Badge>
                ) : inArrivo ? (
                  <Badge tone="info">Dal prossimo rinnovo</Badge>
                ) : piano.badge ? (
                  <Badge tone="warning">{piano.badge}</Badge>
                ) : null}
              </div>

              <p className="text-display mt-3 text-2xl tabular-nums">{invii(piano.monthlyEmails)}</p>
              <p className="t-nota">email al mese</p>

              <p className="t-corpo mt-4">
                {prezzoPiano(piano.priceCents)}
                <span className="text-muted-foreground">/mese</span>
              </p>

              {piano.description && <p className="t-nota mt-2">{piano.description}</p>}

              {/* `mt-auto` e non `mt-5`: le schede sono alte uguali per via
                  della griglia, e senza questo i pulsanti si allineerebbero
                  all'altezza della descrizione più lunga invece che in fondo. */}
              <div className="mt-auto pt-5">
                {suo ? (
                  <p className="t-nota">È il piano che stai usando.</p>
                ) : !puoAcquistare ? (
                  <p className="t-nota">Lo attiva chi amministra il locale.</p>
                ) : (
                  <Button
                    variant={superiore ? "accent" : "outline"}
                    className="w-full"
                    disabled={inCorso !== null}
                    onClick={() => scegli(piano)}
                  >
                    {inCorso === piano.id ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" /> Un istante…
                      </>
                    ) : (
                      `Passa a ${piano.name}`
                    )}
                  </Button>
                )}
              </div>
            </article>
          );
        })}
      </div>

      {errore && <p className="text-sm text-destructive-soft">{errore}</p>}

      <section className="surface p-5">
        <h2 className="t-titolo-sezione">In tutti i piani</h2>
        <p className="t-nota mt-1">
          Cambia solo quante email puoi inviare ogni mese. Tutto il resto è compreso ovunque.
        </p>
        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
          {[
            "Editor newsletter",
            "Segmentazione dei contatti",
            "Modelli pronti",
            "Programmazione degli invii",
            "Statistiche di apertura e click",
            "Gestione delle disiscrizioni",
            "Monitoraggio della reputazione",
          ].map((voce) => (
            <li key={voce} className="flex items-center gap-2 text-sm">
              <Check className="h-4 w-4 shrink-0 text-sage-strong" aria-hidden="true" />
              {voce}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
