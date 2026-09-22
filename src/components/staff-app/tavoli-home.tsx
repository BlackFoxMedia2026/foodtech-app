"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { useAvvisi } from "@/components/ui/avvisi";
import { STATO_STAFF_BREVE, STATO_STAFF_LABEL, type TonoStato } from "@/lib/stato-tavolo-staff";
import type { TavoloStaff } from "@/server/staff-app/sala";
import { FoglioTavoloLibero } from "./foglio-accomoda";
import { NessunTavolo, Sezione } from "./sezioni-home";
import { GlifoTavolo, RIQUADRO_GLIFO, scalaPerGlifi } from "./glifo-tavolo";
import { GrigliaTavoli } from "./griglia-tavoli";

/**
 * **I miei tavoli e i tavoli liberi**, nella misura che meritano.
 *
 * ## Cosa è cambiato, e perché non è una questione di CSS
 *
 * Le due sezioni erano **la stessa griglia**: tasti quadrati da 132 px con il
 * tavolo disegnato grande in mezzo. Andava bene finché la Home era un elenco
 * di tavoli; da quando sopra c'è «Da gestire ora», è un errore di gerarchia
 * visibile a occhio nudo. Nello screenshot da cui è partito questo lavoro,
 * sei tasti da 132 px di **tavoli vuoti** occupavano più schermo di una
 * famiglia di quattro persone appena sedute. I tavoli liberi avevano più
 * importanza del cliente già dentro.
 *
 * Adesso:
 *
 * - **i miei tavoli** sono righe compatte, alte 60 px invece di 132: targa,
 *   chi c'è, stato, ora. Sono tavoli che sto già seguendo — mi serve
 *   ritrovarli, non ammirarli, e il disegno del tavolo basta piccolo perché
 *   accanto c'è già scritto chi è seduto;
 * - **i tavoli disponibili restano tasti**, con il tavolo disegnato grande.
 *
 * ## Perché i liberi sono tornati tasti
 *
 * Erano diventati pastiglie — «T1 · 2» su una riga che scorre di lato — per
 * togliere peso alla sezione. Tolgono peso e tolgono anche la cosa che serve:
 * di un tavolo vuoto la domanda è «ci stanno in quattro, e dov'è?», e la
 * risposta è la **forma**. Un divanetto, un tondo da due e un rettangolo da
 * sei ridotti tutti alla stessa pastiglia si distinguono solo leggendo il
 * numero dei posti — cioè fermandosi a leggere, che è quello che questa app
 * esiste per non far fare. Il disegno è anche l'identità che il cameriere ha
 * imparato dalla piantina: B3 è il tondo grande in mezzo alla sala, non una
 * sigla.
 *
 * La gerarchia che le pastiglie cercavano si regge lo stesso, e su una cosa
 * più solida della dimensione: **l'ordine**. «Da gestire ora» sta sopra ed è
 * la prima cosa che si incontra; i tavoli vuoti stanno in fondo, dove si
 * arriva quando si sta cercando un posto dove far sedere qualcuno.
 *
 * ## Il tocco, che non è cambiato
 *
 * Un tavolo **libero** apre le scelte (accomoda chi aspetta, walk-in, vedi il
 * tavolo): toccarlo per finire su una pagina che dice «qui non c'è nessuno»
 * era il difetto che questo componente ha tolto la prima volta. Un tavolo
 * **occupato** apre il tavolo, perché è lì che c'è da fare qualcosa.
 */

/** Il lato del disegnino sulle righe dei propri tavoli. */
const RIQUADRO_RIGA = 44;

const PUNTO_TONO: Record<TonoStato, string> = {
  neutro: "bg-border-strong",
  attesa: "bg-surface-brown-light/70",
  attivo: "bg-sage",
  urgente: "bg-accent",
  spento: "bg-border",
};

export function TavoliHome({
  miei,
  liberi,
  inAttesa,
  puoAccomodare,
  codaVuota,
}: {
  miei: TavoloStaff[];
  liberi: TavoloStaff[];
  /** Quanti ospiti aspettano: serve al foglio per dirlo sull'azione. */
  inAttesa: number;
  puoAccomodare: boolean;
  /**
   * Vero quando «Da gestire ora» non ha mostrato niente.
   *
   * Serve a una cosa sola: decidere se vale la pena dire «nessun tavolo
   * assegnato». Sopra una coda piena è una frase che contraddice lo schermo —
   * il cameriere *sta* gestendo dei tavoli, semplicemente nessuno gliene ha
   * assegnato uno. Su una schermata per il resto vuota invece è l'unica cosa
   * da dire, e porta dove si rimedia.
   */
  codaVuota: boolean;
}) {
  const router = useRouter();
  const avvisi = useAvvisi();
  const [tavolo, setTavolo] = useState<TavoloStaff | null>(null);

  /** Le scelte solo sui liberi, e solo a chi può accomodare. */
  const apri = (t: TavoloStaff) => {
    if (puoAccomodare && t.stato === "LIBERO") setTavolo(t);
    else router.push(`/staff-app/tavolo/${t.tableId}`);
  };

  /*
    Due scale, una per misura di riquadro.

    Non è un'incoerenza col commento in `glifo-tavolo.tsx` — «una scala sola
    per schermata» vale fra disegni **confrontabili**, e queste due sezioni
    non lo sono: una è un elenco di righe alte 60 px, l'altra una griglia di
    tasti da 132. Confrontabili restano i tavoli *dentro* ciascuna, che è la
    ragione per cui il sei posti si vede più grande del due.
  */
  const scala = scalaPerGlifi(miei, RIQUADRO_RIGA);
  const scalaLiberi = scalaPerGlifi(liberi, RIQUADRO_GLIFO);

  return (
    <>
      {miei.length > 0 ? (
        <Sezione
          titolo={`I miei tavoli · ${miei.length}`}
          azione={{ testo: "Sala", href: "/staff-app/sala" }}
        >
          <ul className="space-y-1.5">
            {miei.map((t) => (
              <li key={t.tableId}>
                <RigaMioTavolo tavolo={t} scala={scala} />
              </li>
            ))}
          </ul>
        </Sezione>
      ) : (
        codaVuota && (
          <Sezione titolo="I miei tavoli">
            <NessunTavolo />
          </Sezione>
        )
      )}

      {liberi.length > 0 && (
        <Sezione titolo="Tavoli disponibili" azione={{ testo: "Sala", href: "/staff-app/sala" }}>
          <GrigliaTavoli tavoli={liberi} scala={scalaLiberi} onTocca={apri} />
        </Sezione>
      )}

      {tavolo && (
        <FoglioTavoloLibero
          tavolo={tavolo}
          inAttesa={inAttesa}
          aperto
          onChiudi={() => setTavolo(null)}
          onFatto={(messaggio) => {
            setTavolo(null);
            avvisi.mostra(messaggio);
            router.refresh();
          }}
        />
      )}
    </>
  );
}

/* -------------------------------------------------------------------------- */
/*  Una riga fra i propri tavoli                                              */
/* -------------------------------------------------------------------------- */

/**
 * Targa, ospite, stato, ora: quattro fatti su una riga sola.
 *
 * Quello che **non** c'è, e che la card grande scriveva: il conto, i minuti
 * alla fine, il richiamo. Il richiamo in particolare non serve qui — un
 * tavolo che chiede qualcosa è già scritto sopra, in «Da gestire ora», con
 * una card sua e due tasti. Ripeterlo qui significherebbe scorrere due volte
 * la stessa notizia, che è esattamente il difetto che questa riscrittura ha
 * tolto.
 */
function RigaMioTavolo({ tavolo, scala }: { tavolo: TavoloStaff; scala: number }) {
  const meta = [
    tavolo.ospiti ? `${tavolo.ospiti} ospiti` : `${tavolo.posti} posti`,
    tavolo.dalle,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <Link
      href={`/staff-app/tavolo/${tavolo.tableId}`}
      aria-label={`Tavolo ${tavolo.label}, ${meta}, ${STATO_STAFF_LABEL[tavolo.stato]}`}
      className="sa-tocco sa-piano-basso flex min-h-[60px] items-center gap-3 px-2.5 py-2"
    >
      <GlifoTavolo
        tavolo={tavolo}
        tono={tavolo.tono}
        scala={scala}
        riquadro={RIQUADRO_RIGA}
      />
      <span className="min-w-0 flex-1">
        <span className="sa-corpo block truncate font-medium">
          {tavolo.ospite ?? `Tavolo ${tavolo.label}`}
        </span>
        <span className="sa-nota block truncate">{meta}</span>
      </span>
      <span className="flex shrink-0 items-center gap-1.5">
        <span
          className={cn("h-2 w-2 rounded-full", PUNTO_TONO[tavolo.tono])}
          aria-hidden="true"
        />
        <span className="text-[0.8125rem] font-medium text-tertiary-foreground">
          {STATO_STAFF_BREVE[tavolo.stato]}
        </span>
      </span>
    </Link>
  );
}
