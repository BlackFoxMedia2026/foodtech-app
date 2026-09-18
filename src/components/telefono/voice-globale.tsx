"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { useServizioVivo } from "@/lib/use-servizio-vivo";
import { ChiamateInArrivo } from "@/components/service/chiamata-in-arrivo";
import type { ChiamataViva } from "@/server/chiamate";

/**
 * Il telefono addosso, su qualunque pagina.
 *
 * ## Il difetto che questo componente corregge
 *
 * Il riquadro della chiamata viveva **dentro Servizio**. Che vuol dire: chi
 * stava guardando la carta, le impostazioni o la scheda di un cliente non
 * vedeva squillare niente. Una telefonata dura venti secondi e non aspetta che
 * qualcuno cambi pagina — e il riquadro più bello del mondo, su una pagina
 * dove nessuno sta, non serve a niente.
 *
 * ## Come si aggiorna, e cosa **non** fa
 *
 * Usa la sonda condivisa a cinque secondi, la stessa del Servizio: una sola
 * interrogazione per pagina, distribuita a chi si è iscritto. Non ne apre una
 * seconda, e non tiene una connessione aperta — su Vercel non ci sono
 * WebSocket, e una connessione per tablet costerebbe una funzione per tutto il
 * servizio.
 *
 * Quando scarica, scarica **poco**: `/api/telefono/vivo`, non la fotografia
 * del servizio. Sapere se squilla il telefono non deve costare prenotazioni,
 * tavoli, coda e conti.
 *
 * ## Tre forme, un contenuto
 *
 * Scrivania: riquadro flottante in basso a destra, sopra tutto.
 * Tablet: pannello che entra da destra, senza coprire la sala.
 * Telefono: foglio dal basso, dove sta il pollice.
 *
 * Il contenuto è lo stesso componente della chiamata che c'era in Servizio:
 * due versioni della stessa scheda divergono al primo cambiamento, e quella
 * che non si guarda diventa quella sbagliata.
 */

/* -------------------------------------------------------------------------- */
/*  Lo stato condiviso con la testata                                         */
/* -------------------------------------------------------------------------- */

type StatoTelefono = {
  chiamate: ChiamataViva[];
  perseDaGestire: number;
  richiamateAperte: number;
  azioni: number;
};

const VUOTO: StatoTelefono = {
  chiamate: [],
  perseDaGestire: 0,
  richiamateAperte: 0,
  azioni: 0,
};

const Ctx = createContext<StatoTelefono>(VUOTO);

/**
 * Lo stato del telefono, per chi lo mostra altrove.
 *
 * La testata ha bisogno dello stesso dato per il suo bollino. Passa da un
 * contesto e non da una seconda interrogazione: due letture dello stesso
 * numero si contraddicono, e il bollino direbbe «2» mentre il pannello mostra
 * tre cose.
 */
export function useTelefonoVivo(): StatoTelefono {
  return useContext(Ctx);
}

/* -------------------------------------------------------------------------- */

export function VoiceGlobale({
  attivo,
  versione,
  children,
}: {
  /** Se questo locale ha il telefono. Quando è falso non si interroga niente. */
  attivo: boolean;
  /**
   * La versione del servizio con cui il server ha reso **questa** pagina.
   *
   * Senza, la sonda prende come punto di partenza la propria prima
   * interrogazione — cinque secondi dopo — e tutto quello che succede in
   * mezzo finisce dentro il punto di partenza: cioè non fa comparire niente.
   * Su una prenotazione si recupera al cambiamento dopo; su una telefonata,
   * che dura venti secondi, quei cinque secondi sono un quarto della sua vita
   * e il riquadro non compare mai.
   *
   * Servizio lo faceva già, perché la sua fotografia porta la versione con
   * sé. Su tutte le altre pagine non lo faceva nessuno, ed è il difetto che
   * il test «il telefono squilla anche per chi non sta guardando la sala»
   * ha trovato al primo giro.
   */
  versione?: string;
  children: React.ReactNode;
}) {
  const [stato, setStato] = useState<StatoTelefono>(VUOTO);
  const [chiuse, setChiuse] = useState<string[]>([]);

  const scarica = useCallback(async () => {
    if (!attivo) return;
    const res = await fetch("/api/telefono/vivo", { cache: "no-store" });
    /* Una rete che salta per un istante non deve far sparire una chiamata in
       corso dallo schermo: resta l'ultimo stato buono. */
    if (res.ok) setStato((await res.json()) as StatoTelefono);
  }, [attivo]);

  /* La sonda parte solo se il locale ha il telefono: su tutti gli altri —
     cioè quasi tutti — il guscio non fa nemmeno una richiesta in più. */
  useServizioVivo(attivo ? scarica : async () => {}, versione);

  // Il primo giro: la sonda registra la versione e non scarica.
  useEffect(() => {
    void scarica();
  }, [scarica]);

  /* Le chiamate chiuse a mano non ritornano.

     Senza questo, chi preme «Chiudi» su un riquadro se lo rivede fra cinque
     secondi — il centralino non ha ancora mandato la fine, e la chiamata è
     ancora viva per il server. Un riquadro che torna dopo che lo hai chiuso
     è la cosa che fa smettere di usare una funzione. */
  const daMostrare = stato.chiamate.filter((c) => !chiuse.includes(c.id));

  // Quando una chiamata finisce davvero, si dimentica di averla chiusa: così
  // l'elenco non cresce per tutto il servizio.
  useEffect(() => {
    const vive = new Set(stato.chiamate.map((c) => c.id));
    setChiuse((p) =>
      p.some((id) => !vive.has(id)) ? p.filter((id) => vive.has(id)) : p,
    );
  }, [stato.chiamate]);

  return (
    <Ctx.Provider value={stato}>
      {children}
      {daMostrare.length > 0 && (
        <PannelloChiamata
          chiamate={daMostrare}
          onChiudi={(id) => setChiuse((p) => [...p, id])}
        />
      )}
    </Ctx.Provider>
  );
}

function PannelloChiamata({
  chiamate,
  onChiudi,
}: {
  chiamate: ChiamataViva[];
  onChiudi: (id: string) => void;
}) {
  return (
    <div
      /*
        Le tre forme in una sola regola, con le classi che il prodotto usa già.

        Telefono: incollato in basso, larghezza piena — il foglio dal basso.
        Tablet e scrivania: in basso a destra, con una larghezza massima.

        `pointer-events-none` sul contenitore e `auto` sul contenuto: il
        riquadro non deve rubare i clic alla pagina sotto nello spazio che
        occupa e non usa.
      */
      className="pointer-events-none fixed inset-x-0 bottom-0 z-50 p-3 md:inset-x-auto md:bottom-4 md:right-4 md:w-[26rem] md:p-0 lg:w-[30rem]"
      role="region"
      aria-label="Telefono"
    >
      <div className="pointer-events-auto space-y-2">
        {chiamate.map((c) => (
          <div key={c.id} className="relative">
            <ChiamateInArrivo chiamate={[c]} />
            {/*
              Chiudere il riquadro non chiude la chiamata, e l'etichetta lo
              dice: «Nascondi». Un pulsante che sembra riattaccare, su un
              riquadro che compare mentre parli, è il difetto peggiore che
              questa schermata possa avere.
            */}
            <button
              type="button"
              onClick={() => onChiudi(c.id)}
              aria-label="Nascondi questo riquadro. La chiamata non si interrompe."
              title="Nascondi (la chiamata non si interrompe)"
              className="tocco-comodo absolute right-2 top-2 rounded-md px-2 py-1 t-nota hover:text-foreground"
            >
              Nascondi
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
