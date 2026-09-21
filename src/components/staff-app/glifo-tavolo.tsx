import { cn } from "@/lib/utils";
import {
  dimensioneDisegnata,
  ingombroTavolo,
  posizioniSedie,
  type TavoloMisurabile,
  LARGHEZZA_SEDIA,
  PROFONDITA_SEDIA,
  RAGGIO_FORMA,
} from "@/lib/tavolo-geometria";
import type { TonoStato } from "@/lib/stato-tavolo-staff";
import type { TableShape } from "@prisma/client";

/**
 * **Il tavolo disegnato**, per la Home della Staff App.
 *
 * ## Perché non è una seconda logica
 *
 * La geometria — quanto è grande il piano, dove stanno le sedie, quanto sono
 * tondi gli angoli — **non è scritta qui**. Arriva tutta da
 * `lib/tavolo-geometria.ts`, lo stesso modulo che disegna l'editor della
 * sala (`TavoloEditorNode`) e la vista operativa (`RoomTableNode`). Il
 * commento in testa a quel file racconta cosa è successo l'ultima volta che
 * la stessa risposta è stata scritta in tre posti: i tre disegni sono
 * divergiti, e nella mappa delle prenotazioni un sei posti e un dieci posti
 * erano identici.
 *
 * Qui cambia **una cosa sola**: la scala. La piantina è in pixel di canvas
 * (100 px = 1 metro) e un divanetto occupa 186 px di ingombro; in una card
 * di dashboard larga 160 px non ci sta. Quindi il glifo rimpicciolisce
 * l'intero disegno di un fattore, senza toccare le proporzioni.
 *
 * ## La scala, e perché non riempie il riquadro
 *
 * La tentazione è far riempire il riquadro a ogni tavolo. Sarebbe sbagliato:
 * la ragione per cui si disegna il tavolo invece di scrivere «4 posti» è
 * proprio che **un sei posti si vede che è più grande di un due posti**.
 * Normalizzare le dimensioni butterebbe via l'unica informazione che il
 * disegno aggiunge al testo.
 *
 * Quindi la scala è **una sola per tutta la schermata** — la calcola
 * `scalaPerGlifi()` sul tavolo più ingombrante fra quelli che si stanno
 * disegnando — e i glifi la ricevono già fatta.
 *
 * Il primo tentativo la calcolava sul tavolo più ingombrante *possibile* (un
 * divanetto, 186 px). In un locale di tavoli da due quel massimo non esiste,
 * e tutti i glifi uscivano a un terzo del riquadro: quattro cerchietti da
 * trentasei pixel persi in mezzo a card da centotrenta. La scala va presa su
 * quello che c'è, non su quello che potrebbe esserci.
 *
 * ## Il colore
 *
 * Il piano cambia tinta secondo il tono dello stato — le stesse quattro
 * famiglie della card, non undici colori. Il legno della piantina
 * (`table-wood`) non è stato riusato di proposito: là è una superficie
 * chiara su un fondo chiaro, qui i tavoli stanno su verde scuro e un piano
 * color legno a 40 px diventa una macchia beige che non dice niente.
 */

/**
 * Oltre la dimensione vera della piantina non si va: un tavolo ingrandito
 * sembrerebbe più grande di quello che è, che è il contrario di quello per
 * cui lo si disegna.
 */
const SCALA_MASSIMA = 1;

/*
  Il piano del tavolo, per tono.

  Due correzioni rispetto al primo tentativo, e sono tutte e due di
  **gerarchia**, non di gusto:

  - `attesa` era il bruno pieno. Accanto al terracotta di `urgente` faceva
    quasi lo stesso rumore, e un tavolo prenotato per le nove finiva a
    gridare come uno che ha chiesto il conto adesso. Adesso è lo stesso
    bruno al 45%: si distingue dal verde, non compete con l'accento;
  - `neutro` era il verde alzato del sistema (#284D3F) sul verde della card
    (#163C2F): un rapporto di 1,4 : 1, cioè un tavolo libero che non si
    vedeva. Ed è il tono della sezione che si guarda apposta per trovare
    dove far sedere qualcuno. Adesso è il verde del bordo forte, che è la
    tinta chiara più alta della famiglia prima di uscirne.
*/
const PIANO_TONO: Record<TonoStato, string> = {
  neutro: "bg-border-strong",
  attesa: "bg-surface-brown-dark/45",
  attivo: "bg-sage-deep",
  urgente: "bg-accent",
  spento: "bg-card-sunken",
};

const BORDO_TONO: Record<TonoStato, string> = {
  neutro: "ring-border-strong/70",
  attesa: "ring-surface-brown-light/40",
  attivo: "ring-sage/40",
  urgente: "ring-accent-strong/60",
  spento: "ring-border/60",
};

const ETICHETTA_TONO: Record<TonoStato, string> = {
  neutro: "text-cream",
  attesa: "text-cream",
  attivo: "text-cream",
  urgente: "text-cream",
  spento: "text-muted-foreground",
};

/**
 * L'ingombro **davvero occupato dal disegno**.
 *
 * `ingombroTavolo()` somma sempre il margine delle sedie, perché sulla
 * piantina serve a delimitare lo spazio che il tavolo si prende nella sala
 * — e attorno a un divanetto quello spazio c'è comunque, ci passa la gente.
 * Qui invece si sta scalando un disegno dentro un riquadro, e un divanetto
 * senza sedie porterebbe ventisei pixel di margine vuoto.
 *
 * Non è un dettaglio da niente: in un locale con tre divanetti da sei posti
 * il margine fantasma del più grande abbassava la scala di tutta la
 * schermata, e i tavoli da due finivano disegnati a metà del riquadro.
 *
 * La regola su chi ha le sedie **non è riscritta qui**: si guarda se
 * `posizioniSedie()` ne ha restituite. Copiare «divanetto e lounge non
 * hanno sedie» in questo file sarebbe la seconda fonte di verità che
 * `lib/tavolo-geometria.ts` esiste per non creare.
 */
function ingombroDisegnato(t: TavoloMisurabile): { w: number; h: number } {
  const piano = dimensioneDisegnata(t);
  const sedie = posizioniSedie(t.shape, piano.w, piano.h, t.seats);
  return sedie.length > 0 ? ingombroTavolo(t) : piano;
}

export type TavoloDisegnabile = {
  label: string;
  posti: number;
  shape: TableShape;
  larghezza: number | null;
  altezza: number | null;
};

/**
 * **Il lato del riquadro** in cui il disegno di un tavolo deve stare.
 *
 * Sta qui, accanto alla funzione che calcola la scala, e non nel componente
 * della griglia che lo usa. Non è pignoleria: la griglia è un modulo
 * `"use client"`, e una costante esportata da un modulo client e letta da una
 * pagina del server **non è un numero** — è un riferimento al client. Dividere
 * per quel riferimento dà `NaN`, e un `NaN` dentro una `transform` fa
 * scartare l'intera dichiarazione: il disegno del tavolo resta alla scala
 * della piantina, senza traslazione, e finisce a coprire il tasto accanto.
 *
 * È accaduto, e dallo schermo sembrava un difetto di CSS. Le misure del
 * disegno appartengono al disegno.
 */
export const RIQUADRO_GLIFO = 92;

/**
 * La scala da dare a tutti i glifi di una schermata.
 *
 * Si calcola una volta sull'insieme dei tavoli mostrati, così due tavoli in
 * due griglie diverse restano confrontabili: se il sei posti dei «miei» è
 * più grande del due posti dei «disponibili», è perché lo è davvero.
 */
export function scalaPerGlifi(tavoli: readonly TavoloDisegnabile[], riquadro: number): number {
  if (tavoli.length === 0) return SCALA_MASSIMA;
  const piuGrande = Math.max(
    ...tavoli.map((t) => {
      const i = ingombroDisegnato({ shape: t.shape, seats: t.posti, width: t.larghezza, height: t.altezza });
      return Math.max(i.w, i.h);
    }),
  );
  return Math.min(SCALA_MASSIMA, riquadro / piuGrande);
}

export function GlifoTavolo({
  tavolo,
  tono,
  scala,
  /** Il lato del riquadro in cui il disegno deve stare. */
  riquadro = 92,
}: {
  tavolo: TavoloDisegnabile;
  tono: TonoStato;
  /** Da `scalaPerGlifi()`, calcolata una volta su tutti i tavoli mostrati. */
  scala: number;
  riquadro?: number;
}) {
  const misurabile = {
    shape: tavolo.shape,
    seats: tavolo.posti,
    width: tavolo.larghezza,
    height: tavolo.altezza,
  };

  const ingombro = ingombroDisegnato(misurabile);
  const piano = dimensioneDisegnata(misurabile);
  const sedie = posizioniSedie(tavolo.shape, piano.w, piano.h, tavolo.posti);
  const raggio = RAGGIO_FORMA[tavolo.shape];

  /* Il disegno è alla scala della piantina e viene rimpicciolito in blocco
     con una `transform`: così sedie, spessori e raggi restano nelle stesse
     proporzioni di là, invece di essere ricalcolati (e sbagliati) qui. */
  return (
    <div
      aria-hidden="true"
      className="relative shrink-0"
      style={{ width: riquadro, height: Math.min(riquadro, ingombro.h * scala) }}
    >
      <div
        className="absolute left-1/2 top-1/2"
        style={{ transform: `translate(-50%, -50%) scale(${scala})` }}
      >
        <div className="relative grid place-items-center" style={{ width: ingombro.w, height: ingombro.h }}>
          {/* Le sedie stanno sotto al piano: una sedia disegnata sopra il
              tavolo sembra appoggiata sul tavolo. Stessa scelta, e stesso
              commento, dell'editor. */}
          {sedie.map((s, i) => (
            <span
              key={i}
              className="absolute rounded-[3px] bg-border-strong"
              style={{
                left: "50%",
                top: "50%",
                width: LARGHEZZA_SEDIA,
                height: PROFONDITA_SEDIA,
                transform: `translate(-50%, -50%) translate(${s.x}px, ${s.y}px) rotate(${s.rotazione}deg)`,
              }}
            />
          ))}

          <span
            className={cn(
              "absolute grid place-items-center ring-1",
              PIANO_TONO[tono],
              BORDO_TONO[tono],
            )}
            style={{
              width: piano.w,
              height: piano.h,
              borderRadius: raggio === "full" ? 9999 : raggio,
            }}
          >
            {/*
              Il numero sta **dentro** il piano, come in sala.

              È scritto alla scala della piantina e poi rimpicciolito con
              tutto il resto: a 20 px di carattere per una scala di 0,72
              arriva a 14 px reali, che è la misura minima leggibile decisa
              per questa app.
            */}
            <span
              className={cn("font-display font-semibold leading-none", ETICHETTA_TONO[tono])}
              style={{ fontSize: 20 }}
            >
              {tavolo.label}
            </span>
          </span>
        </div>
      </div>
    </div>
  );
}
