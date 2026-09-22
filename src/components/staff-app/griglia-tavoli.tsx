"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import { STATO_STAFF_BREVE, STATO_STAFF_LABEL } from "@/lib/stato-tavolo-staff";
import type { TavoloStaff } from "@/server/staff-app/sala";
import { GlifoTavolo, RIQUADRO_GLIFO } from "./glifo-tavolo";
import { CALORE_RICHIAMO, ICONA_RICHIAMO } from "./segni-richiamo";

/**
 * **I tavoli come tasti.**
 *
 * ## Perché una griglia e non un elenco
 *
 * La Sala era un elenco di card larghe quanto lo schermo e alte 104 px: su un
 * iPhone ci stavano **quattro tavoli**, e un locale da venti tavoli si
 * scorreva cinque volte per trovarne uno. Ogni card portava nome ospite,
 * minuti, conto e stato per esteso — informazioni giuste per una riga da
 * leggere, sbagliate per un bersaglio da premere.
 *
 * In griglia a due colonne ne stanno otto, e ognuno è un tasto da 132 px con
 * il tavolo **disegnato** dentro: forma, proporzioni e sedie sono quelle
 * dell'editor della sala (`lib/tavolo-geometria.ts`), quindi il tondo grande
 * in mezzo alla sala si riconosce senza leggere il numero. È la stessa
 * griglia che la Home aveva già: adesso è un componente solo, usato da
 * entrambe, perché due griglie di tavoli con due densità diverse erano due
 * modi di imparare lo stesso prodotto.
 *
 * Il dettaglio non è perso, è **a un tocco**: chi c'è, da quanto e a quanto
 * sta il conto si leggono aprendo il tavolo, che è dove si va per fare
 * qualcosa a quel tavolo.
 *
 * ## Cosa resta scritto sul tasto
 *
 * I posti, sempre. Lo stato in forma breve **solo quando non è «Libero»**: un
 * tavolo vuoto si riconosce dal tasto vuoto, e in una sala che alle sette è
 * tutta libera la parola comparirebbe dodici volte di seguito senza
 * distinguere niente da niente. Quello che ha bisogno di una parola è
 * «Occupato», «Ordinazione», «Conto» — cioè i tavoli su cui sta succedendo
 * qualcosa.
 *
 * E **l'icona del richiamo**, quando quel tavolo chiede di alzarsi: è
 * l'unica cosa che l'elenco diceva e che una griglia muta perderebbe, e senza
 * di essa un tavolo con due piatti pronti al passe sarebbe indistinguibile da
 * uno che aspetta i primi.
 */

export function CardTavoloGriglia({
  tavolo,
  scala,
  onTocca,
}: {
  tavolo: TavoloStaff;
  scala: number;
  /**
   * Cosa fa il tasto. Quando c'è, è un pulsante e apre le scelte; senza,
   * resta il collegamento al tavolo aperto.
   */
  onTocca?: () => void;
}) {
  const richiamo = tavolo.richiamo;
  const Icona = richiamo ? ICONA_RICHIAMO[richiamo.tipo] : null;
  const calore = richiamo ? CALORE_RICHIAMO[richiamo.tipo] : null;
  const allarme = calore === "allarme";
  /*
    Solo i richiami «caldi» accendono il tasto.

    Da quando un tavolo seduto senza comanda è un richiamo — e lo è, ed è il
    motivo di tutta questa riscrittura — la metà della sala ha un richiamo
    quasi sempre. Se ognuno di essi alzasse il bordo, la Sala tornerebbe la
    schermata uniforme che la griglia esisteva per non essere: dodici tasti
    accesi non distinguono niente da niente, e un tavolo da riassettare
    griderebbe come due piatti che si freddano.
  */
  const urgente = tavolo.tono === "urgente" || allarme || calore === "ora";

  /*
    `overflow-hidden` è una **garanzia**, non una rifinitura: il disegno del
    tavolo è posizionato in modo assoluto e scalato con una `transform`, e se
    una di quelle due cose sbaglia il disegno esce dal tasto e copre quello
    accanto — cioè si preme un tavolo e se ne apre un altro. Clippare è
    peggio esteticamente e infinitamente meglio operativamente.
  */
  const veste = cn(
    "sa-tocco relative flex min-h-[132px] w-full flex-col items-center justify-center gap-1.5 overflow-hidden rounded-[18px] border px-2 py-3",
    allarme
      ? "border-destructive/50 bg-destructive/10"
      : urgente
        ? "border-accent/60 bg-accent/10"
        : "border-border bg-card",
  );

  const etichetta = [
    `Tavolo ${tavolo.label}`,
    `${tavolo.posti} posti`,
    STATO_STAFF_LABEL[tavolo.stato],
    richiamo?.testo,
  ]
    .filter(Boolean)
    .join(", ");

  const contenuto = (
    <>
      {/*
        Il richiamo è un'icona in alto a destra, non una riga: su un tasto
        quadrato una frase andrebbe a capo due volte. La frase intera resta
        nell'etichetta accessibile e sulla schermata del tavolo — a chi
        ascolta lo spazio non manca mai.
      */}
      {Icona && (
        <span
          aria-hidden="true"
          className={cn(
            "absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full",
            allarme
              ? "bg-destructive/20 text-destructive-soft"
              : calore === "ora"
                ? "bg-accent/25 text-accent-strong"
                : "bg-card-sunken text-tertiary-foreground",
          )}
        >
          <Icona
            className={cn(
              "h-[0.875rem] w-[0.875rem]",
              /* Solo il piatto pronto respira: è l'unica cosa che
                 **peggiora aspettando**. Un conto chiesto resta chiesto. */
              richiamo?.tipo === "PIATTI_PRONTI" && "animate-respiro motion-reduce:animate-none",
            )}
          />
        </span>
      )}

      <GlifoTavolo tavolo={tavolo} tono={tavolo.tono} scala={scala} riquadro={RIQUADRO_GLIFO} />

      <span className="sa-nota max-w-full truncate">
        {tavolo.posti === 1 ? "1 posto" : `${tavolo.posti} posti`}
      </span>

      {tavolo.stato !== "LIBERO" && (
        <span
          className={cn(
            "max-w-full truncate text-[0.8125rem] font-medium",
            urgente ? "text-accent-strong" : "text-tertiary-foreground",
          )}
        >
          {STATO_STAFF_BREVE[tavolo.stato]}
        </span>
      )}
    </>
  );

  return onTocca ? (
    <button type="button" onClick={onTocca} aria-label={etichetta} className={veste}>
      {contenuto}
    </button>
  ) : (
    <Link href={`/staff-app/tavolo/${tavolo.tableId}`} aria-label={etichetta} className={veste}>
      {contenuto}
    </Link>
  );
}

/**
 * La griglia.
 *
 * `onTocca` riceve il tavolo e decide: la Sala e la Home aprono le scelte sui
 * tavoli liberi e lasciano andare al tavolo aperto quelli occupati. La
 * decisione sta nel chiamante e non qui, perché è una regola di prodotto e
 * non di disposizione.
 */
export function GrigliaTavoli({
  tavoli,
  scala,
  onTocca,
}: {
  tavoli: TavoloStaff[];
  scala: number;
  onTocca?: (tavolo: TavoloStaff) => void;
}) {
  return (
    <ul className="grid grid-cols-2 gap-2.5">
      {tavoli.map((t) => (
        <li key={t.tableId}>
          <CardTavoloGriglia
            tavolo={t}
            scala={scala}
            onTocca={onTocca ? () => onTocca(t) : undefined}
          />
        </li>
      ))}
    </ul>
  );
}
