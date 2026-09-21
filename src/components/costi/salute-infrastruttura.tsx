"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TESTO_LIVELLO, type Livello, type Verifica } from "@/lib/salute-ses";
import { cn } from "@/lib/utils";

/**
 * Lo stato della catena di invio, in una sezione che si legge in tre secondi.
 *
 * Non è una console AWS, ed è una scelta precisa: chi apre questa pagina non
 * vuole amministrare Amazon, vuole sapere **se il prodotto sta funzionando** e
 * cosa manca. Quindi righe brevi in italiano, e i nomi tecnici — insiemi di
 * configurazione, destinazioni, tenant — chiusi dentro «Dettagli tecnici», per
 * quando si sta davvero cercando un guasto.
 *
 * I toni sono gli stessi degli stati economici: verde «va», oro «manca un
 * passo», terracotta «qualcosa funziona a metà», rosso «è rotto».
 */

const TONO: Record<Livello, "success-soft" | "gold" | "warning" | "danger" | "neutral"> = {
  OPERATIVO: "success-soft",
  CONFIGURAZIONE_INCOMPLETA: "gold",
  ATTENZIONE: "warning",
  ERRORE: "danger",
  SCONOSCIUTO: "neutral",
};

export type DatiSalute = {
  salute: { complessivo: Livello; verifiche: Verifica[] };
  quando: string;
  degradata: boolean;
  regione: string;
  account: string;
  ultimaRiconciliazione: string | null;
};

export function SaluteInfrastruttura({ dati }: { dati: DatiSalute }) {
  const router = useRouter();
  const [inCorso, avvia] = useTransition();
  const [aperto, setAperto] = useState(false);
  const [controllo, setControllo] = useState(false);

  async function ricontrolla() {
    setControllo(true);
    try {
      await fetch("/api/admin/costi/salute?ricontrolla=1", { cache: "no-store" });
      avvia(() => router.refresh());
    } finally {
      setControllo(false);
    }
  }

  const { complessivo, verifiche } = dati.salute;
  const daSistemare = verifiche.filter((v) => v.livello !== "OPERATIVO");

  return (
    <section className="surface space-y-3 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <p className="t-etichetta">Stato infrastruttura email</p>
          <Badge tone={TONO[complessivo]}>{TESTO_LIVELLO[complessivo]}</Badge>
          {dati.degradata && <Badge tone="neutral">lettura parziale</Badge>}
        </div>
        <div className="flex items-center gap-3">
          <span className="t-nota">
            Ultimo controllo {new Date(dati.quando).toLocaleString("it-IT", { dateStyle: "short", timeStyle: "short" })}
          </span>
          <Button variant="outline" size="sm" onClick={ricontrolla} disabled={controllo || inCorso}>
            {controllo ? "Controllo…" : "Ricontrolla"}
          </Button>
        </div>
      </div>

      {/* In evidenza solo ciò che non è a posto: se va tutto bene, una riga. */}
      {daSistemare.length === 0 ? (
        <p className="text-sm">Tutti i controlli superati: invio, eventi e fatturazione sono a posto.</p>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2">
          {daSistemare.map((v) => (
            <li key={v.chiave} className="flex flex-wrap items-baseline gap-x-2 text-sm">
              <Badge tone={TONO[v.livello]} className="whitespace-nowrap">
                {v.titolo}
              </Badge>
              <span className="tabular-nums">{v.valore}</span>
              {v.nota && <span className="t-nota w-full">{v.nota}</span>}
              {v.elenco && v.elenco.length > 0 && (
                <span className="t-nota w-full">{v.elenco.slice(0, 6).join(" · ")}</span>
              )}
            </li>
          ))}
        </ul>
      )}

      <button
        type="button"
        onClick={() => setAperto((a) => !a)}
        className="t-nota transition-colors hover:text-foreground"
        aria-expanded={aperto}
      >
        {aperto ? "Nascondi dettagli tecnici" : "Dettagli tecnici"}
      </button>

      {aperto && (
        <div className="space-y-2 border-t border-border/60 pt-3">
          <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
            <Riga voce="Regione" valore={dati.regione} />
            {/* L'identificativo dell'account non compare per intero: non serve
                a chi guarda, e aiuta chi prova a fare danni. */}
            <Riga voce="Account AWS" valore={dati.account} />
            {verifiche.map((v) => (
              <Riga key={v.chiave} voce={v.titolo} valore={v.valore} livello={v.livello} />
            ))}
            <Riga
              voce="Ultima riconciliazione"
              valore={
                dati.ultimaRiconciliazione
                  ? new Date(dati.ultimaRiconciliazione).toLocaleString("it-IT", { dateStyle: "short", timeStyle: "short" })
                  : "mai"
              }
            />
          </dl>
        </div>
      )}
    </section>
  );
}

function Riga({ voce, valore, livello }: { voce: string; valore: string; livello?: Livello }) {
  return (
    <div className="flex justify-between gap-3 border-b border-border/30 py-1">
      <dt className="text-muted-foreground">{voce}</dt>
      <dd className={cn("text-right tabular-nums", livello === "ERRORE" && "text-destructive")}>{valore}</dd>
    </div>
  );
}
