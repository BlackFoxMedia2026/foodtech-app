"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { VISIBILI } from "@/components/overview/finestra";
import { useGestoCarosello, type Verso } from "@/components/overview/gesto-carosello";
import { cn } from "@/lib/utils";

/** Quanto resta al centro una riga prima che scorra la successiva. */
const PASSO_MS = 5000;


/**
 * Il binario: la linea verticale su cui stanno i pallini.
 *
 * `left-[72px]` non è un numero a caso, ed è legato all'anatomia della riga:
 * l'ora è larga `w-14` (56 px), poi `gap-3` (12 px), poi il pallino da 10 px
 * — quindi il suo centro cade a 73 px e la linea da un pixel va a 72. Nella
 * vecchia lista il binario stava a 68 px e correva **a fianco** dei pallini
 * invece che dentro: tredici pixel di sfasamento che si vedevano.
 */
export function Binario() {
  return <div className="absolute bottom-0 left-[72px] top-0 w-px bg-border" aria-hidden="true" />;
}

/**
 * Una finestra su tre righe che scorre: quella prima, quella adesso, quella dopo.
 *
 * Sta fra le due cose che c'erano. Una lista di tutta la giornata era alta
 * quanto la schermata e a metà servizio parlava di cose finite; un mazzo di
 * carte sovrapposte le schiacciava una sull'altra e non se ne leggeva nessuna
 * per intero. Qui si vede la riga che conta al centro, e le due che le stanno
 * intorno smorzate: si capisce dove si è nella giornata, e si legge tutto.
 *
 * **Nessuna scala, solo opacità.** Rimpicciolire le righe di contorno era il
 * difetto del mazzo, e ne aggiungeva uno: scalando, i pallini uscivano dal
 * binario di quattro pixel.
 *
 * **E non è un anello.** Prima le posizioni si chiudevano in circolo, e con la
 * prima riga al centro la posizione «prima» pescava l'**ultima** prenotazione
 * della giornata: si leggeva 19:30 sopra 12:15. Su una lista qualsiasi sarebbe
 * un dettaglio, su una linea temporale è un errore — il tempo non torna
 * indietro. Quindi la finestra va avanti fino in fondo e poi ripercorre la
 * strada al contrario, come un pendolo: l'ordine è sempre quello dell'orologio,
 * non salta mai, e parte dalla prenotazione più imminente invece che da una in
 * mezzo.
 *
 * **La finestra è sempre piena, e l'evidenza si muove dentro.** La prima
 * versione teneva la riga in evidenza sempre al centro, e all'inizio del giro
 * il posto sopra restava vuoto: novantasei pixel di buco proprio nello stato
 * in cui si apre la pagina. Ora scorre la finestra, non l'evidenza: la riga
 * che conta sta al centro quando può, in cima alla prima passata e in fondo
 * all'ultima, e non si vedono posti vuoti.
 *
 * Le righe le passa chi usa il componente, già rese, così `new Date()` resta
 * sul server: una riga scrive «arrivo tra 12 min», e calcolarlo anche nel
 * browser darebbe un valore diverso e un disallineamento di idratazione.
 *
 * Quattro cose che la rendono usabile e non solo animata:
 *
 * - **si ferma quando la si guarda**: col puntatore sopra o arrivandoci col
 *   tabulatore sta ferma, altrimenti la riga che si stava leggendo scappa;
 * - **rispetta `prefers-reduced-motion`**: niente scorrimento automatico, e i
 *   pallini in fondo restano per muoversi a mano;
 * - **solo la riga al centro è interattiva**. Le altre sono `inert`: senza, il
 *   tabulatore entrerebbe in collegamenti smorzati o fuori dalla finestra;
 * - **si muove come ci si aspetta che si muova**: rotella, trackpad, swipe e
 *   frecce, non solo i pallini (`useGestoCarosello`). I pallini erano l'unico
 *   modo di scorrere, e sono bersagli da sei pixel: chi voleva vedere la
 *   prenotazione dopo aspettava i cinque secondi del giro.
 *
 * Chi tocca i comandi si prende il timone: al primo gesto — pallino, freccia o
 * rotella — il giro automatico finisce e non riparte. Sul desktop lo faceva
 * già il puntatore sopra, ma sul telefono il passaggio non esiste, e cinque
 * secondi dopo lo swipe la finestra tornava per conto suo dove voleva lei.
 */
export function Rotazione({ righe, etichetta }: { righe: React.ReactNode[]; etichetta?: string }) {
  // Indice e verso in un solo stato: il rimbalzo li cambia insieme, e con due
  // stati separati il verso invertito sarebbe arrivato un giro dopo.
  const [{ indice, verso }, setStato] = useState({ indice: 0, verso: 1 });
  const [ferma, setFerma] = useState(false);
  // Se qualcuno ha già scorso a mano. Da lì in poi la finestra sta dove l'ha
  // lasciata.
  const [manuale, setManuale] = useState(false);
  const contenitore = useRef<HTMLDivElement>(null);
  const idFinestra = useId();
  const n = righe.length;

  /** Va a una riga precisa — i pallini — e sistema il verso del pendolo. */
  const vaiA = useCallback(
    (i: number) => {
      setManuale(true);
      // Saltando all'ultima il pendolo riparte al contrario: altrimenti il
      // primo passo dopo il tocco sarebbe un rimbalzo sul posto.
      setStato({ indice: i, verso: i >= n - 1 ? -1 : 1 });
    },
    [n],
  );

  /** Un passo avanti o indietro — gesti e frecce. */
  const vai = useCallback(
    (v: Verso) => {
      setManuale(true);
      setStato(({ indice }) => {
        const prossimo = Math.min(Math.max(indice + v, 0), n - 1);
        return { indice: prossimo, verso: prossimo >= n - 1 ? -1 : prossimo <= 0 ? 1 : v };
      });
    },
    [n],
  );

  /*
    Dove finisce il carosello e ricomincia la pagina. È una riga sola ma è il
    cuore del patto con lo scroll: dall'ultima riga in giù, e dalla prima in
    su, il gesto non è più nostro.
  */
  const puoAndare = useCallback((v: Verso) => (v > 0 ? indice < n - 1 : indice > 0), [indice, n]);

  useGestoCarosello({ riferimento: contenitore, puoAndare, vai });

  useEffect(() => {
    if (n <= VISIBILI || ferma || manuale) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const t = setInterval(
      () =>
        setStato(({ indice, verso }) => {
          const prossimo = indice + verso;
          // Arrivato al capo, torna indietro dal passo appena fatto.
          if (prossimo < 0 || prossimo > n - 1) return { indice: indice - verso, verso: -verso };
          return { indice: prossimo, verso };
        }),
      PASSO_MS,
    );
    return () => clearInterval(t);
  }, [n, ferma, manuale]);

  if (n === 0) return null;

  /*
    Quale riga apre la finestra. `indice - 1` mette l'evidenza al centro; i due
    limiti la tengono piena ai capi — all'inizio non si scende sotto la prima,
    alla fine non si va oltre l'ultima terzina.
  */
  const base = Math.min(Math.max(indice - 1, 0), Math.max(n - VISIBILI, 0));

  return (
    <div
      ref={contenitore}
      // Il gruppo è raggiungibile col tabulatore e si muove con le frecce:
      // senza, l'unico modo da tastiera erano i pallini, in fondo alla card e
      // dopo il collegamento della riga.
      role="group"
      aria-roledescription="carosello"
      aria-label={etichetta}
      tabIndex={0}
      onKeyDown={(e) => {
        const v: Verso | null =
          e.key === "ArrowRight" || e.key === "ArrowDown"
            ? 1
            : e.key === "ArrowLeft" || e.key === "ArrowUp"
              ? -1
              : null;
        if (v === null || !puoAndare(v)) return;
        // Solo quando il passo si può fare davvero: in fondo alla lista la
        // freccia torna a essere della pagina.
        e.preventDefault();
        vai(v);
      }}
      onMouseEnter={() => setFerma(true)}
      onMouseLeave={() => setFerma(false)}
      onFocusCapture={() => setFerma(true)}
      onBlurCapture={() => setFerma(false)}
      // `touch-pan-y` è il patto col browser sul telefono: il verticale resta
      // suo e la pagina scorre sempre, l'orizzontale è nostro.
      className="flex min-h-0 flex-1 flex-col justify-center touch-pan-y rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
    >
      {/*
        `--passo` è l'altezza minima di uno scalino, e sta qui come proprietà
        arbitraria invece che in un numero dentro il JavaScript: cambia col
        punto di rottura — sul telefono «Tavolo da assegnare» va a capo e la
        riga è più alta — e in CSS il punto di rottura lo sa il foglio di
        stile, mentre il componente dovrebbe misurarlo dopo il primo disegno.

        La finestra sono **sempre** tre scalini, ma quanto sono alti lo decide
        lo schermo: prende l'altezza che avanza nella card (`flex-1`), non
        scende sotto i tre passi minimi e non sale sopra i tre massimi. Prima
        era alta tre passi fissi, e su uno schermo alto sotto le due card
        restava una fascia di pagina vuota — il difetto che si vedeva di più
        su una schermata che non scorre.

        Il massimo c'è perché una riga alta duecento pixel per due righe di
        testo non è una riga più leggibile, è una riga gonfiata; oltre quel
        punto lo spazio che avanza si divide sopra e sotto (`justify-center`
        sul gruppo) invece di finire tutto in fondo al pozzo.

        Gli scalini sono `h-1/3` e le righe si spostano di multipli del
        **100% di sé stesse**: così il passo resta esattamente uno scalino
        qualunque sia l'altezza, senza che il JavaScript debba misurare
        niente dopo il disegno.
      */}
      <div
        id={idFinestra}
        className="relative flex-1 overflow-hidden [--passo-max:128px] [--passo:96px] sm:[--passo:84px] min-h-[calc(3*var(--passo))] max-h-[calc(3*var(--passo-max))]"
      >
        <Binario />
        {righe.map((riga, i) => {
          /*
            Il posto della riga nella finestra, e **lineare**: l'ordine della
            lista è l'ordine dell'orologio, e non si richiude.

            Fuori dalla finestra si fermano tutte a un posto di distanza dal
            bordo, dove sono già tagliate: così una riga che entra scivola
            dentro invece di arrivare da un punto lontanissimo, e le altre non
            fanno traslazioni che nessuno vede.
          */
          const posto = i - base;
          const postoVisuale = Math.max(-1, Math.min(VISIBILI, posto));
          const alCentro = i === indice;
          const visibile = posto >= 0 && posto < VISIBILI;
          return (
            <div
              key={i}
              // React 18 non conosce `inert` fra le sue props: va passato come
              // attributo grezzo.
              {...(alCentro ? {} : ({ inert: "" } as unknown as React.HTMLAttributes<HTMLDivElement>))}
              aria-hidden={!alCentro}
              style={{ transform: `translateY(${postoVisuale * 100}%)` }}
              className={cn(
                "absolute inset-x-0 top-0 h-1/3 transition-[transform,opacity] duration-500 ease-out motion-reduce:transition-none",
                alCentro ? "z-20 opacity-100" : visibile ? "z-10 opacity-50" : "opacity-0",
                !alCentro && "pointer-events-none",
              )}
            >
              {riga}
            </div>
          );
        })}
      </div>

      {n > 1 && (
        <div className="mt-2 flex shrink-0 items-center justify-center gap-1.5">
          {righe.map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => vaiA(i)}
              aria-label={`Mostra la ${i + 1}ª di ${n}`}
              aria-current={i === indice ? "true" : undefined}
              aria-controls={idFinestra}
              className={cn(
                "h-1.5 rounded-full transition-all",
                i === indice ? "w-4 bg-card-foreground/70" : "w-1.5 bg-card-foreground/25 hover:bg-card-foreground/45",
              )}
            />
          ))}
        </div>
      )}
    </div>
  );
}
