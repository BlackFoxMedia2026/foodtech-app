"use client";

import { useState } from "react";
import { CalendarClock, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/ui/copy-button";
import { readApiError } from "@/lib/api-client";
import {
  GruppoImpostazioni,
  RigaLibera,
} from "@/components/settings/righe-impostazioni";

/**
 * Le prenotazioni nel calendario del telefono.
 *
 * Un indirizzo a cui **abbonarsi**: le prenotazioni compaiono accanto agli
 * altri appuntamenti, senza installare niente e senza entrare nel gestionale.
 *
 * ## Perché il link non c'è finché non lo si chiede
 *
 * Perché l'indirizzo **è** la credenziale — nessuna applicazione di calendario
 * sa fare l'accesso — e un segreto che esiste senza che nessuno l'abbia chiesto
 * è una porta aperta che nessuno sorveglia. Per la stessa ragione il pulsante
 * per rigenerarlo sta accanto a quello per copiarlo, e non in fondo a un menu:
 * un indirizzo condiviso per sbaglio si revoca solo così, e va saputo **prima**
 * di condividerlo.
 */
export function CalendarioPrenotazioni({
  percorsoIniziale,
  indirizzo,
  canManage,
}: {
  /** Il percorso già esistente, se qualcuno l'ha già chiesto. */
  percorsoIniziale: string | null;
  /** L'indirizzo di questa installazione, per comporre il link completo. */
  indirizzo: string;
  canManage: boolean;
}) {
  const [percorso, setPercorso] = useState(percorsoIniziale);
  const [inCorso, setInCorso] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);

  const link = percorso ? `${indirizzo}${percorso}` : null;

  async function chiedi(rigenera: boolean) {
    setInCorso(true);
    setErrore(null);
    try {
      const res = await fetch("/api/venue/calendario", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ rigenera }),
      });
      if (!res.ok) {
        throw new Error(await readApiError(res, "Non siamo riusciti a creare il link."));
      }
      const dati = (await res.json()) as { percorso: string };
      setPercorso(dati.percorso);
    } catch (err: unknown) {
      setErrore(err instanceof Error ? err.message : "Non ci siamo riusciti.");
    } finally {
      setInCorso(false);
    }
  }

  return (
    <GruppoImpostazioni
      titolo="Prenotazioni nel tuo calendario"
      descrizione="Un indirizzo da aggiungere al calendario del telefono: le prenotazioni compaiono lì, e si aggiornano da sole."
      azione={link ? <CopyButton value={link} size="sm" variant="outline" /> : undefined}
    >
      {link ? (
        <>
          <RigaLibera>
            {/* A capo e non in orizzontale: l'indirizzo è lungo, si copia col
                pulsante e non si legge a mano. */}
            <pre className="whitespace-pre-wrap break-all rounded-md border border-border bg-black/20 p-3 text-xs leading-relaxed">
              {link}
            </pre>
          </RigaLibera>
          <RigaLibera>
            <p className="t-nota">
              Chi ha questo indirizzo vede le prenotazioni dei prossimi tre mesi,
              con nome, coperti e note. <strong>Non</strong> i numeri di telefono
              dei clienti. Se lo condividi per sbaglio, rigeneralo: il vecchio
              smette di funzionare subito.
            </p>
          </RigaLibera>
          {errore && (
            <RigaLibera>
              <p role="alert" className="text-sm text-destructive">
                {errore}
              </p>
            </RigaLibera>
          )}
          <RigaLibera>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void chiedi(true)}
              disabled={inCorso || !canManage}
            >
              <RefreshCw className="mr-1.5 h-4 w-4" aria-hidden="true" />
              Rigenera l&apos;indirizzo
            </Button>
          </RigaLibera>
        </>
      ) : (
        <>
          {errore && (
            <RigaLibera>
              <p role="alert" className="text-sm text-destructive">
                {errore}
              </p>
            </RigaLibera>
          )}
          <RigaLibera>
            <Button size="sm" onClick={() => void chiedi(false)} disabled={inCorso || !canManage}>
              <CalendarClock className="mr-1.5 h-4 w-4" aria-hidden="true" />
              Crea l&apos;indirizzo del calendario
            </Button>
          </RigaLibera>
        </>
      )}
    </GruppoImpostazioni>
  );
}
