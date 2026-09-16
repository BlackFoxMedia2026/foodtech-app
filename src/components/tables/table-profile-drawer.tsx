"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import {
  Pannello,
  PannelloContenuto,
  PannelloCorpo,
  PannelloTitle,
} from "@/components/ui/pannello";
import { BillDialog } from "@/components/orders/bill-dialog";
import { useServizioVivo } from "@/lib/use-servizio-vivo";
import { readApiError } from "@/lib/api-client";
import type { ProfiloTavolo } from "@/server/profilo-tavolo";
import { TestaProfilo } from "./profilo/testa-profilo";
import { StatoCorrente } from "./profilo/stato-corrente";
import { PersonaleLivello, PersonaleModulo } from "./profilo/personale-tavolo";
import { QrLivello, QrModulo } from "./profilo/qr-tavolo";
import { ContoTavolo } from "./profilo/conto-tavolo";
import { ClientiTavolo } from "./profilo/clienti-tavolo";
import { StoricoTavolo } from "./profilo/storico-tavolo";
import { AzioniContestuali, AzioniRapide, AzionePrenota, useAzioniTavolo } from "./profilo/azioni-rapide";

export type PermessiTavolo = {
  /** `manage_bookings`: segnare arrivi, accomodare, liberare, battere il conto. */
  prenotazioni: boolean;
  /** `manage_staff`: assegnare chi serve il tavolo. */
  personale: boolean;
  /** `manage_venue`: accendere e revocare il QR di pagamento. */
  locale: boolean;
};

/** Dove si è dentro il pannello. Il profilo, o uno dei due livelli operativi. */
type Vista = "profilo" | "personale" | "qr";

/**
 * **Il profilo di un tavolo**: lo stesso pannello in Sala e in Servizio.
 *
 * ## Cosa risolve
 *
 * Il tavolo era un oggetto grafico: si selezionava, si apriva un menu di tre
 * puntini, si sceglieva una voce. Per sapere chi c'era si andava in Servizio,
 * per il conto in un'altra schermata ancora, e lo storico non esisteva. Cinque
 * posti per cinque domande che chi sta in sala si fa **guardando lo stesso
 * tavolo**: chi c'è, da quanto, quanto deve, chi lo serve, quando si libera.
 *
 * ## Tre livelli, non un elenco
 *
 * La prima versione rispondeva a tutte e cinque le domande, ma con lo stesso
 * peso: sette blocchi identici — etichetta, testo, riga — in cui lo storico di
 * agosto pesava quanto il conto da novanta euro di adesso. Chi apriva il
 * pannello doveva **leggerlo** per capirlo, e durante un servizio non c'è
 * tempo di leggere.
 *
 * Adesso ci sono tre livelli dichiarati, che sono tre domande diverse:
 *
 * 1. **stato** — cosa succede adesso: un riquadro solo, con la superficie
 *    tinta dallo stato del tavolo, che si riconosce prima di essere letto;
 * 2. **azioni** — cosa posso fare: la principale nella fascia fissa in fondo
 *    (in testa, accanto al nome, quando il tavolo è libero e l'unica cosa da
 *    fare è prenotarlo), le secondarie dentro il riquadro dello stato, e le
 *    due operative — personale e QR — in due piastrelle affiancate;
 * 3. **consultazione** — conto, clienti, storico: testo che si legge quando
 *    serve, e che non compete con il resto.
 *
 * ## Un componente, non due
 *
 * Lo usano la piantina della Sala e la mappa del Servizio con le stesse
 * proprietà: sono le due schermate che uno stesso responsabile guarda a dieci
 * secondi di distanza, e due pannelli avrebbero cominciato a divergere sul
 * primo dettaglio.
 *
 * ## Non oscura la sala
 *
 * `Pannello` non ha velo e un clic fuori non lo chiude (vedi
 * `ui/pannello.tsx`): la mappa resta visibile e cliccabile, e toccare un altro
 * tavolo **cambia** il pannello invece di chiuderlo. Su telefono diventa un
 * foglio dal basso, che è la forma che il telefono conosce.
 */
export function TableProfileDrawer({
  tableId,
  onOpenChange,
  permessi,
  giorno = null,
  servizio = null,
  onDatiCambiati,
}: {
  /** Il tavolo da mostrare. `null` chiude il pannello. */
  tableId: string | null;
  onOpenChange: (aperto: boolean) => void;
  permessi: PermessiTavolo;
  /**
   * La giornata che si sta guardando, `YYYY-MM-DD`. La Sala ha un calendario e
   * la passa; il Servizio guarda sempre adesso e la lascia nulla.
   */
  giorno?: string | null;
  /** Il servizio scelto nel filtro della Sala. Nullo: si deduce dall'ora. */
  servizio?: string | null;
  /**
   * Qualcosa è cambiato davvero: la schermata sotto (mappa, elenco) va
   * riallineata. Separato dal ricaricamento interno del pannello, che succede
   * anche solo perché la sonda ha visto muoversi qualcosa.
   */
  onDatiCambiati?: () => void;
}) {
  return (
    <Pannello open={tableId !== null} onOpenChange={onOpenChange} modal={false}>
      {tableId !== null && (
        // `key`: cambiando tavolo il contenuto si rimonta da zero. Senza,
        // resterebbero appese al tavolo nuovo le righe di storico caricate
        // sul precedente — e, per un istante, il suo conto.
        <ContenutoProfilo
          key={tableId}
          tableId={tableId}
          permessi={permessi}
          giorno={giorno}
          servizio={servizio}
          onDatiCambiati={onDatiCambiati}
        />
      )}
    </Pannello>
  );
}

/**
 * Il corpo del pannello, montato **solo** mentre è aperto.
 *
 * Il motivo è la sonda: `useServizioVivo` iscrive chi lo chiama a
 * un'interrogazione ogni cinque secondi, e tenerla viva a pannello chiuso
 * avrebbe fatto interrogare il server anche alla Sala, che finora non lo
 * faceva. Un componente che si smonta è anche un'iscrizione che si cancella —
 * il gancio lo fa da sé nel suo `useEffect`.
 */
function ContenutoProfilo({
  tableId,
  permessi,
  giorno,
  servizio,
  onDatiCambiati,
}: {
  tableId: string;
  permessi: PermessiTavolo;
  giorno: string | null;
  servizio: string | null;
  onDatiCambiati?: () => void;
}) {
  const [profilo, setProfilo] = useState<ProfiloTavolo | null>(null);
  const [errore, setErrore] = useState<string | null>(null);
  const [contoAperto, setContoAperto] = useState(false);
  const [vista, setVista] = useState<Vista>("profilo");

  const scarica = useCallback(async () => {
    const q = new URLSearchParams();
    if (giorno) q.set("giorno", giorno);
    if (servizio) q.set("servizio", servizio);
    const coda = q.size > 0 ? `?${q}` : "";
    try {
      const res = await fetch(`/api/tables/${tableId}/profilo${coda}`, { cache: "no-store" });
      if (!res.ok) {
        setErrore(await readApiError(res, "Non riusciamo a leggere questo tavolo."));
        return;
      }
      setErrore(null);
      setProfilo(await res.json());
    } catch {
      // Rete che salta: resta l'ultima fotografia buona invece di una
      // schermata vuota. La sonda riproverà da sola, più piano.
    }
  }, [tableId, giorno, servizio]);

  /*
    Si aggiorna da solo.

    `useServizioVivo` è la sonda già in uso in Sala, Servizio e Attesa: chiede
    ogni cinque secondi una domanda piccola («è cambiato qualcosa?») e ricarica
    il profilo **solo quando la risposta cambia**. La sonda è una per pagina,
    quindi tenere aperto il pannello sopra la mappa non raddoppia le richieste.
    Chi paga col telefono mentre il pannello è aperto lo fa comparire lì, senza
    che nessuno debba chiudere e riaprire.

    La prima fotografia però la sonda non la manda — registra solo la versione
    corrente — quindi il primo caricamento lo fa `aggiornaOra` qui sotto.
  */
  const { aggiornaOra } = useServizioVivo(scarica);

  useEffect(() => {
    void aggiornaOra();
  }, [aggiornaOra]);

  const dopoAzione = useCallback(() => {
    void aggiornaOra();
    onDatiCambiati?.();
  }, [aggiornaOra, onDatiCambiati]);

  if (!profilo) {
    return (
      <PannelloContenuto aria-describedby={undefined}>
        <div className="fissa border-b border-border px-4 py-3">
          <PannelloTitle className="text-display text-xl leading-none">Tavolo</PannelloTitle>
        </div>
        <PannelloCorpo>
          {errore ? (
            <p role="alert" className="text-sm text-destructive-soft">
              {errore}
            </p>
          ) : (
            <p className="flex items-center gap-2 t-nota">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Un istante…
            </p>
          )}
        </PannelloCorpo>
      </PannelloContenuto>
    );
  }

  return (
    <CorpoProfilo
      profilo={profilo}
      permessi={permessi}
      vista={vista}
      setVista={setVista}
      contoAperto={contoAperto}
      setContoAperto={setContoAperto}
      dopoAzione={dopoAzione}
    />
  );
}

/**
 * La composizione vera e propria, con il profilo già in mano.
 *
 * Separata per una ragione sola: `useAzioniTavolo` è un gancio e ha bisogno
 * del profilo, che nel componente sopra può ancora essere nullo. Meglio un
 * componente in più che un gancio chiamato sotto condizione.
 */
function CorpoProfilo({
  profilo,
  permessi,
  vista,
  setVista,
  contoAperto,
  setContoAperto,
  dopoAzione,
}: {
  profilo: ProfiloTavolo;
  permessi: PermessiTavolo;
  vista: Vista;
  setVista: (v: Vista) => void;
  contoAperto: boolean;
  setContoAperto: (v: boolean) => void;
  dopoAzione: () => void;
}) {
  const azioni = useAzioniTavolo(profilo, dopoAzione);

  const etichettaLivello = vista === "personale" ? "Personale" : vista === "qr" ? "QR del tavolo" : null;

  return (
    <>
      <PannelloContenuto aria-describedby={undefined}>
        <TestaProfilo
          profilo={profilo}
          indietro={
            etichettaLivello
              ? { etichetta: etichettaLivello, onIndietro: () => setVista("profilo") }
              : undefined
          }
          /* Su un tavolo libero l'azione è una sola, e sta in testa: prenotarlo
             è il motivo per cui si apre il pannello, non la conclusione di
             quello che ci si legge dentro. Sui tavoli occupati è nulla, e
             l'azione del momento resta nella fascia in fondo. */
          azione={<AzionePrenota profilo={profilo} puoPrenotazioni={permessi.prenotazioni} />}
        />

        <PannelloCorpo className="space-y-5">
          {vista === "personale" ? (
            <PersonaleLivello profilo={profilo} onChanged={dopoAzione} />
          ) : vista === "qr" ? (
            <QrLivello profilo={profilo} puoGestireLocale={permessi.locale} />
          ) : (
            <>
              {/* 1. Stato — cosa succede adesso. */}
              <StatoCorrente
                profilo={profilo}
                azioni={
                  <AzioniContestuali
                    profilo={profilo}
                    azioni={azioni}
                    puoPrenotazioni={permessi.prenotazioni}
                  />
                }
              />

              {/* 2. Azioni operative — due piastrelle, stesso linguaggio. */}
              <div className="grid grid-cols-2 gap-2">
                <PersonaleModulo
                  profilo={profilo}
                  puoGestire={permessi.personale}
                  onGestisci={() => setVista("personale")}
                />
                <QrModulo profilo={profilo} onApri={() => setVista("qr")} />
              </div>

              {/* 3. Consultazione. */}
              {profilo.conto && <ContoTavolo profilo={profilo} />}
              <ClientiTavolo profilo={profilo} />
              <StoricoTavolo profilo={profilo} />
            </>
          )}
        </PannelloCorpo>

        {/* La fascia fissa resta la stessa anche dentro un livello: da
            «Personale» si può ancora segnare un arrivo senza tornare indietro. */}
        <AzioniRapide
          profilo={profilo}
          azioni={azioni}
          puoPrenotazioni={permessi.prenotazioni}
          onApriConto={() => setContoAperto(true)}
        />
      </PannelloContenuto>

      {/*
        Il conto resta una finestra modale, e a ragione: battere piatti è
        un'azione concentrata, si finisce o si annulla, e ha bisogno di tutta
        la larghezza per la ricerca del menu. È **la stessa** finestra che si
        apre dal Servizio, non una seconda copia.
      */}
      {profilo.corrente && (
        <BillDialog
          open={contoAperto}
          onOpenChange={setContoAperto}
          bookingId={profilo.corrente.bookingId}
          guestName={profilo.corrente.ospite.nome}
          currency={profilo.currency}
          onChanged={dopoAzione}
        />
      )}
    </>
  );
}
