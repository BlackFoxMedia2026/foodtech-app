"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { WifiOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { chiedi, ErroreStaff } from "@/lib/staff-fetch";
import { useServizioVivo } from "@/lib/use-servizio-vivo";
import { useAvvisi } from "@/components/ui/avvisi";
import type { SalaStaff, TavoloStaff } from "@/server/staff-app/sala";
import type { OspiteDaAccomodare } from "@/server/staff-app/da-accomodare";
import { GrigliaTavoli } from "./griglia-tavoli";
import { RIQUADRO_GLIFO, scalaPerGlifi } from "./glifo-tavolo";
import { CodaDaAccomodare } from "./coda-accoglienza";
import { FoglioTavoloLibero, FoglioTrovaTavolo } from "./foglio-accomoda";

/**
 * **La Sala del cameriere**, e il realtime (§21).
 *
 * Non introduce niente di nuovo sul fronte del tempo reale: usa
 * `useServizioVivo`, la sonda che questo progetto ha già — si chiede ogni
 * cinque secondi una domanda piccola («è cambiato qualcosa?») e si riscarica
 * la fotografia **solo quando la risposta cambia**. Su Vercel non ci sono
 * WebSocket, e una connessione aperta da ogni telefono costerebbe più di
 * quello che risparmia: il perché per esteso sta in
 * `server/versione-servizio.ts`.
 *
 * ## Cos'è cambiato con l'accoglienza
 *
 * Prima questa schermata rispondeva a una domanda sola — «come stanno i miei
 * tavoli» — e a chi non aveva tavoli assegnati diceva «Nessun tavolo
 * assegnato», che è vero e inutile. Adesso ne risponde a due, nell'ordine in
 * cui contano quando qualcuno è appena entrato:
 *
 * 1. **chi aspetta di sedersi**, in cima, con il pulsante che trova il tavolo;
 * 2. **com'è messa la sala**, sotto, come griglia di tasti.
 *
 * La griglia ha sostituito l'elenco: quattro card larghe quanto lo schermo
 * mostravano quattro tavoli, gli stessi otto tasti ne mostrano otto e si
 * premono meglio. Il ragionamento per esteso sta in `griglia-tavoli.tsx`.
 *
 * La coda arriva nella **stessa** fotografia dei tavoli (`SalaStaff.
 * daAccomodare`): una chiamata a sé avrebbe avuto un suo aggiornamento, e per
 * qualche secondo la schermata avrebbe mostrato un ospite in attesa accanto al
 * tavolo su cui un collega lo aveva appena accomodato.
 *
 * ## Quando la rete salta
 *
 * **La fotografia resta.** Non si svuota la schermata e non si mette uno
 * scheletro grigio: si tiene l'ultima buona e si dice, in una riga sottile,
 * che è vecchia. Un cameriere con dati di trenta secondi fa lavora; un
 * cameriere con una schermata vuota si ferma.
 */
export function ListaTavoli({
  iniziale,
  puoVedereTutti,
  puoAccomodare,
}: {
  iniziale: SalaStaff;
  puoVedereTutti: boolean;
  /** `manage_tables`: senza, la sala si guarda e non si tocca. */
  puoAccomodare: boolean;
}) {
  const router = useRouter();
  const avvisi = useAvvisi();
  const [sala, setSala] = useState(iniziale);
  const [tutti, setTutti] = useState(false);
  const [staccato, setStaccato] = useState(false);

  /* Quale foglio è aperto. Uno alla volta di proposito: sono tutti modali, e
     due fogli sovrapposti su uno schermo da 375 px non lasciano vedere
     nemmeno quello davanti.

     Il walk-in non è qui: sta al centro della barra in basso, raggiungibile
     da ogni schermata (`nav-basso.tsx`). Tenerne una seconda copia in cima
     alla Sala voleva dire due pulsanti per lo stesso gesto a dieci
     centimetri di distanza. */
  const [ospiteScelto, setOspiteScelto] = useState<OspiteDaAccomodare | null>(null);
  const [tavoloScelto, setTavoloScelto] = useState<TavoloStaff | null>(null);

  const scarica = useCallback(async () => {
    try {
      const dati = await chiedi<SalaStaff>(`/api/staff-app/sala${tutti ? "?tutti=1" : ""}`);
      setSala(dati);
      setStaccato(false);
    } catch (err) {
      /* Un errore della sonda non svuota niente e non alza un avviso: si
         segna e basta. L'avviso serve a raccontare l'esito di un gesto, e
         qui nessuno ha fatto un gesto. */
      if (err instanceof ErroreStaff && (err.codice === "offline" || err.codice === "rete" || err.codice === "timeout")) {
        setStaccato(true);
      }
    }
  }, [tutti]);

  const { aggiornaOra } = useServizioVivo(scarica);

  async function cambiaVista(valore: boolean) {
    setTutti(valore);
    try {
      setSala(await chiedi<SalaStaff>(`/api/staff-app/sala${valore ? "?tutti=1" : ""}`));
      setStaccato(false);
    } catch {
      setStaccato(true);
    }
  }

  /**
   * Dopo un accomodamento: si chiude il foglio, si dice cos'è successo, e si
   * riscarica **subito**.
   *
   * `aggiornaOra` e non l'attesa del prossimo giro della sonda: chi ha appena
   * accomodato quattro persone guarda lo schermo per vedere il tavolo
   * diventare occupato, e cinque secondi di card ferma sono cinque secondi in
   * cui si chiede se il tocco è andato a buon fine.
   */
  function fatto(messaggio: string) {
    setOspiteScelto(null);
    setTavoloScelto(null);
    avvisi.mostra(messaggio);
    void aggiornaOra();
  }

  /*
    **In griglia l'ordine è l'etichetta, non l'urgenza.**

    `salaDelCameriere` ordina per urgenza — piatti pronti, poi conti, poi
    allergie — ed è l'ordine giusto per un elenco che si legge dall'alto e per
    la Home, che ne mostra sei su venti: là l'ordine decide *cosa si vede*.

    Qui non si taglia niente, quindi l'ordine decide solo *dove sta* un
    tavolo. E una tastiera che si riordina da sola ogni cinque secondi è una
    tastiera su cui non si impara dove premere: si cerca «T8» e lo si trova in
    tre posti diversi in un minuto. L'urgenza resta visibile dov'era — il
    colore del tasto e l'icona del richiamo — che è come la si legge in una
    griglia: guardandola, non scorrendola.
  */
  const tavoli = [...sala.tavoli].sort((a, b) =>
    a.label.localeCompare(b.label, "it", { numeric: true }),
  );

  /*
    Una scala sola per tutti i disegni, calcolata sui tavoli che si stanno
    mostrando: due tasti con due scale diverse renderebbero incomparabili un
    due posti e un sei posti, e la ragione per cui li si disegna è proprio
    poterli confrontare a colpo d'occhio.
  */
  const scalaGlifi = scalaPerGlifi(tavoli, RIQUADRO_GLIFO);

  return (
    <div className="schermo">
      {puoVedereTutti && (
        <div className="fissa px-4 pb-3">
          {/*
            Due sole viste, e un interruttore a due posizioni invece di un
            menu a tendina: è una scelta binaria che si fa col pollice, e una
            tendina costerebbe due tap per la stessa risposta.
          */}
          <div role="tablist" aria-label="Quali tavoli" className="flex rounded-full border border-border p-1">
            <Linguetta attiva={!tutti} onClick={() => cambiaVista(false)}>
              I miei ({sala.miei})
            </Linguetta>
            <Linguetta attiva={tutti} onClick={() => cambiaVista(true)}>
              Tutta la sala
            </Linguetta>
          </div>
        </div>
      )}

      {/*
        La coda **prima** dei tavoli, e fissa: scorrendo venti card non deve
        sparire chi è in piedi all'ingresso. È l'inversione di priorità che il
        §2 del brief chiede — «quando entro in Sala devo vedere immediatamente
        chi aspetta».
      */}
      <CodaDaAccomodare
        ospiti={sala.daAccomodare}
        puoAccomodare={puoAccomodare}
        onTrovaTavolo={setOspiteScelto}
      />

      {staccato && (
        <button
          type="button"
          onClick={() => aggiornaOra()}
          className="fissa mx-4 mb-3 flex items-center gap-2 rounded-md border border-border bg-secondary px-3 py-2 text-left text-xs text-muted-foreground"
        >
          <WifiOff className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span className="min-w-0 flex-1">
            Connessione instabile: questi tavoli potrebbero non essere aggiornati.
          </span>
          <span className="shrink-0 font-medium text-foreground">Riprova</span>
        </button>
      )}

      <div className="fill-scroll px-4 pb-4">
        {tavoli.length === 0 ? (
          <div className="riquadro tratteggiato comodo">
            <p className="t-titolo-scheda">
              {tutti ? "Nessun tavolo in sala" : "Nessun tavolo assegnato"}
            </p>
            <p className="t-nota mt-1">
              {tutti
                ? "Questo locale non ha ancora tavoli configurati."
                : `Per il servizio «${sala.servizio}» non ti è stato assegnato nessun tavolo. Chiedi al responsabile di sala.`}
            </p>
          </div>
        ) : (
          /*
            Il tavolo libero apre il foglio delle scelte; tutti gli altri
            restano il collegamento al tavolo aperto, che su un tavolo con
            gente seduta è esattamente la cosa che serve.
          */
          <GrigliaTavoli
            tavoli={tavoli}
            scala={scalaGlifi}
            onTocca={
              puoAccomodare
                ? (t) => {
                    if (t.stato === "LIBERO") setTavoloScelto(t);
                    else router.push(`/staff-app/tavolo/${t.tableId}`);
                  }
                : undefined
            }
          />
        )}
      </div>

      {ospiteScelto && (
        <FoglioTrovaTavolo
          ospite={ospiteScelto}
          aperto
          onChiudi={() => setOspiteScelto(null)}
          onAccomodato={fatto}
        />
      )}

      {tavoloScelto && (
        <FoglioTavoloLibero
          tavolo={tavoloScelto}
          inAttesa={sala.daAccomodare.length}
          aperto
          onChiudi={() => setTavoloScelto(null)}
          onFatto={fatto}
        />
      )}

    </div>
  );
}

function Linguetta({
  attiva,
  onClick,
  children,
}: {
  attiva: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={attiva}
      onClick={onClick}
      className={cn(
        "min-h-[40px] flex-1 rounded-full px-3 text-sm transition-colors",
        attiva ? "bg-cream font-medium text-clay-ink" : "text-muted-foreground",
      )}
    >
      {children}
    </button>
  );
}
