"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Phone, PhoneOff } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CopyButton } from "@/components/ui/copy-button";
import {
  GruppoImpostazioni,
  RigaImpostazione,
  RigaLibera,
  ValoreImpostazione,
} from "@/components/settings/righe-impostazioni";
import { readApiError } from "@/lib/api-client";
import { FUNZIONI_CENTRALINO, type FunzioneCentralino } from "@/lib/licenza-centralino";

/**
 * Il telefono del locale, dentro Tavolo.
 *
 * Il centralino **non è un altro gestionale**: chi risponde al telefono lavora
 * nelle stesse schermate dove vede le prenotazioni. Quello che si compra è una
 * chiave, e questa è la riga dove si incolla.
 *
 * Per questo la schermata parla di «telefono» e non di «centralino»,
 * «integrazione» o «API»: per il ristoratore è il suo telefono che diventa
 * parte del gestionale. La parola «centralino» resta nel codice, dove serve a
 * noi per sapere di cosa parliamo.
 *
 * Quando è spento non si nasconde: si dice cosa farebbe. Una funzione che non
 * si sa di poter comprare è una funzione che non si compra — ed è una riga,
 * non un cartello pubblicitario in mezzo alle impostazioni.
 */

/** Cosa fa ogni funzione, detto a chi paga e non a chi programma. */
const COSA_FA: Record<FunzioneCentralino, string> = {
  riconoscimento:
    "Quando il telefono squilla, Tavolo mostra chi sta chiamando: nome, allergie, quante volte non si è presentato.",
  prenotazioni: "Le prenotazioni prese al telefono entrano in Tavolo senza riscriverle.",
  statistiche: "Quante chiamate arrivano, in quali ore, e quante diventano prenotazioni.",
};

const NOME_FUNZIONE: Record<FunzioneCentralino, string> = {
  riconoscimento: "Chi sta chiamando",
  prenotazioni: "Prenotazioni al telefono",
  statistiche: "I numeri del telefono",
};

const GIORNO = new Intl.DateTimeFormat("it-IT", { day: "numeric", month: "long", year: "numeric" });

export type StatoCentralinoVista = {
  attivo: boolean;
  funzioni: string[];
  scadeIl: string | null;
  attivatoIl: string | null;
  chiaveLeggibile: string | null;
  motivoSpento: "scaduta" | "non_piu_valida" | null;
};

export function Centralino({
  stato,
  venueId,
  canManage,
}: {
  stato: StatoCentralinoVista;
  /** L'identificativo di questo locale: è quello che va sulla licenza. */
  venueId: string;
  canManage: boolean;
}) {
  const router = useRouter();
  const [chiave, setChiave] = useState("");
  const [inCorso, setInCorso] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);

  async function attiva(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setInCorso(true);
    setErrore(null);
    const res = await fetch("/api/venue/centralino", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chiave }),
    });
    setInCorso(false);
    if (!res.ok) {
      setErrore(await readApiError(res, "Non siamo riusciti ad attivare il telefono."));
      return;
    }
    setChiave("");
    router.refresh();
  }

  async function spegni() {
    setInCorso(true);
    setErrore(null);
    const res = await fetch("/api/venue/centralino", { method: "DELETE" });
    setInCorso(false);
    if (!res.ok) {
      setErrore(await readApiError(res, "Non siamo riusciti a togliere la chiave."));
      return;
    }
    router.refresh();
  }

  const scadenza = stato.scadeIl ? new Date(stato.scadeIl) : null;
  /* Il giorno *scritto* sulla licenza è l'ultimo valido, e la fine è la
     mezzanotte dopo: sottraendo un minuto si torna al giorno da mostrare,
     altrimenti a chi ha pagato fino al 17 si dice «scade il 18». */
  const ultimoGiorno = scadenza ? new Date(scadenza.getTime() - 60_000) : null;

  return (
    <GruppoImpostazioni
      titolo="Telefono"
      descrizione={
        stato.attivo
          ? "Il telefono del locale è collegato a Tavolo."
          : "Collegando il telefono, Tavolo riconosce chi chiama e prende le prenotazioni senza riscriverle."
      }
      azione={
        stato.attivo && canManage ? (
          <Button variant="outline" size="sm" onClick={spegni} disabled={inCorso}>
            <PhoneOff className="mr-1.5 h-4 w-4" aria-hidden="true" />
            Togli la chiave
          </Button>
        ) : undefined
      }
    >
      <RigaImpostazione
        nome="Stato"
        descrizione={
          stato.motivoSpento === "scaduta"
            ? "La chiave è scaduta. Le prenotazioni già prese al telefono restano: si è spento il telefono, non la storia."
            : stato.motivoSpento === "non_piu_valida"
              ? "La chiave inserita non è più valida. Scrivici: te ne mandiamo una nuova."
              : undefined
        }
      >
        {stato.attivo ? (
          <Badge tone="success">
            <Phone className="mr-1 h-3 w-3" aria-hidden="true" />
            Collegato
          </Badge>
        ) : stato.motivoSpento ? (
          <Badge tone="warning">Da riattivare</Badge>
        ) : (
          <Badge tone="neutral">Non collegato</Badge>
        )}
      </RigaImpostazione>

      {stato.chiaveLeggibile && (
        <RigaImpostazione
          nome="Chiave"
          descrizione={
            stato.attivatoIl
              ? `Inserita il ${GIORNO.format(new Date(stato.attivatoIl))}.`
              : undefined
          }
        >
          {/* Solo le ultime lettere: bastano a rispondere a «è quella che ti
              ho mandato?», e una schermata che la ripete per intero è una
              schermata da cui si copia. */}
          <ValoreImpostazione mono>{stato.chiaveLeggibile}</ValoreImpostazione>
        </RigaImpostazione>
      )}

      {stato.attivo && ultimoGiorno && (
        <RigaImpostazione nome="Valida fino al">
          <ValoreImpostazione>{GIORNO.format(ultimoGiorno)}</ValoreImpostazione>
        </RigaImpostazione>
      )}

      {FUNZIONI_CENTRALINO.map((f) => {
        const accesa = stato.funzioni.includes(f);
        return (
          <RigaImpostazione key={f} nome={NOME_FUNZIONE[f]} descrizione={COSA_FA[f]}>
            {accesa ? (
              <Badge tone="success">Attiva</Badge>
            ) : (
              /* Spenta, non assente: si vede cosa c'è da avere. Una funzione
                 che non si sa di poter comprare non si compra. */
              <Badge tone="neutral">Non attiva</Badge>
            )}
          </RigaImpostazione>
        );
      })}

      {/*
        L'identificativo del locale, da copiare.

        Sta qui perche **serve per ottenere la chiave**: chi la emette deve
        sapere per quale locale, e questo codice non era scritto in nessuna
        schermata del prodotto. Senza, l'unico modo di averlo era leggerlo
        dall'indirizzo di una pagina o dal database — e chi compilava il modulo
        scriveva il nome del locale al suo posto, ottenendo una licenza che non
        accendeva niente.
      */}
      {canManage && !stato.attivo && (
        <RigaImpostazione
          nome="Identificativo di questo locale"
          descrizione="Serve a noi per emettere la tua chiave. Mandacelo, o tienilo a portata quando ce lo chiediamo."
        >
          <div className="flex min-w-0 items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded-md border border-border/60 bg-muted/30 px-2 py-1 font-mono text-xs">
              {venueId}
            </code>
            <CopyButton value={venueId} variant="outline" size="sm" soloIcona />
          </div>
        </RigaImpostazione>
      )}

      {canManage && (
        <RigaLibera>
          <form onSubmit={attiva} className="space-y-2">
            <Label htmlFor="centralino-chiave">
              {stato.attivo ? "Sostituisci la chiave" : "La chiave che ti abbiamo mandato"}
            </Label>
            <div className="flex flex-wrap items-start gap-2">
              <Input
                id="centralino-chiave"
                value={chiave}
                onChange={(e) => setChiave(e.target.value)}
                placeholder="tvlc1.…"
                autoComplete="off"
                spellCheck={false}
                className="min-w-0 flex-1 font-mono text-xs"
              />
              <Button type="submit" variant="accent" size="sm" disabled={inCorso || !chiave.trim()}>
                {inCorso ? "Controllo…" : "Attiva"}
              </Button>
            </div>
            <p className="t-nota">
              Incollala come l&apos;hai ricevuta: spazi e capi a riga non sono un problema. Vale
              solo per questo locale.
            </p>
            {errore && <p className="text-sm text-destructive">{errore}</p>}
          </form>
        </RigaLibera>
      )}
    </GruppoImpostazioni>
  );
}
