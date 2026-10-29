import { cn } from "@/lib/utils";

/**
 * L'unica tabella del prodotto.
 *
 * Le due tabelle vere — prenotazioni e ospiti — erano scritte due volte con
 * markup quasi identico e dettagli diversi: `border-border` in una e `border`
 * nell'altra, un `hover` diverso, e nelle prenotazioni una riga in attesa
 * dipinta con `bg-red-50` — un rosso da tema chiaro, che su un fondo verde
 * scuro diventa una banda quasi bianca. Nessuno se ne era accorto perché la
 * demo non ha quasi mai prenotazioni in sospeso.
 *
 * È il difetto che l'audit visivo chiamava «design system che è uno stile
 * simile, non un sistema»: due copie divergono sempre, e divergono nel caso
 * che nessuno guarda.
 *
 * ## La densità è del contesto, non dell'utente
 *
 * Due livelli — `comoda` e `densa` — e non sono un'impostazione da mettere in
 * un menù: la sceglie la schermata. Dove si legge (ospiti, pagamenti) le
 * righe respirano; dove si lavora durante il servizio (prenotazioni) stanno
 * più vicine, perché la cosa che conta è quante ne stanno in uno schermo.
 */

export type Densita = "comoda" | "densa" | "ariosa";

const CELLA: Record<Densita, string> = {
  comoda: "px-4 py-3",
  densa: "px-2 py-2.5 md:px-4",
  /*
    Il terzo passo, per le tabelle che si **consultano** invece di scorrerle.

    Nasce dagli ospiti: sei colonne di informazioni tutte in `text-sm` e
    dodici pixel di aria verticale, e chi cercava il telefono di qualcuno
    doveva appoggiare il dito sullo schermo per non perdere la riga. Qui la
    riga è alta abbastanza da contenere due misure di testo — il nome grande e
    i dati sotto — senza che si tocchino.

    Non è «comoda con più padding»: è la densità di una tabella dove le righe
    sono poche decine e ognuna è una persona, non un evento della serata.

    Il passo **orizzontale** cresce con lo schermo, quello verticale no: su
    tablet le sei colonne degli ospiti stanno in 784 px solo se i fianchi si
    stringono, e stringere i fianchi non toglie niente a chi legge — toglie
    aria fra una colonna e l'altra, che a quella larghezza è esattamente ciò
    che avanza. L'altezza della riga resta quella ovunque: è lei a rendere la
    tabella leggibile, ed è la ragione per cui questa densità esiste.
  */
  ariosa: "px-3 py-4 lg:px-5",
};

/**
 * Su che piano sta la tabella.
 *
 * `--card` (#163C2F) e la capsula della barra in alto sono lo stesso verde a
 * occhio: una tabella a tutta pagina dipinta con `card` si legge come un
 * pezzo della navigazione che continua nel contenuto, ed è esattamente il
 * difetto che in Staff aveva portato a `--card-sunken` (#102B22, vedi la nota
 * in `globals.css`). Stessa tinta, luminosità più bassa: stacca dalla capsula
 * (1,82 : 1 contro 1,04 : 1) restando un piano visibile sopra il fondo.
 *
 * `incassato` è quel piano. Non è una variante estetica da scegliere a gusto:
 * vale per le tabelle che **occupano la pagina**, dove il rischio di
 * confondersi con la barra c'è. Una tabella dentro una card resta `card`,
 * perché lì la card è già lo stacco.
 */
export type Piano = "card" | "incassato";

const FONDO: Record<Piano, string> = {
  card: "bg-card",
  incassato: "bg-card-sunken",
};

/*
  L'altezza della testata, fissata: 46 px di capsula più 6 d'aria sotto
  (`.testa-tabella`). Il binario della barra di scorrimento parte da qui,
  quindi le due misure devono essere la stessa.
*/
const ALTEZZA_TESTA: Record<Densita, string> = {
  comoda: "[--testa-h:3.25rem]",
  densa: "[--testa-h:3.25rem]",
  ariosa: "[--testa-h:3.5rem]",
};

/*
  Il colore della capsula. Per il piano incassato è la stessa tinta di
  `--card-sunken` abbassata di due punti di luminosità: la regola dei
  `finish-*`, dove le variazioni si costruiscono dalla tinta invece di
  ripescarle a occhio. In Carta i due piani hanno la stessa capsula.
*/
const FONDO_TESTA: Record<Piano, string> = {
  card: "[--testa-fondo:var(--table-head-card)]",
  incassato: "[--testa-fondo:var(--table-head-incassato)]",
};

export function Tabella({
  children,
  densita = "comoda",
  minWidth,
  /**
   * La tabella prende l'altezza che avanza e **scorre dentro di sé**.
   *
   * È la regola delle liste senza lunghezza naturale: sessanta clienti o
   * centoventi piatti non possono dettare l'altezza della schermata. Con
   * `fill` l'intestazione resta attaccata in alto mentre le righe scorrono —
   * altrimenti si scorre e non si sa più cosa sia ogni colonna.
   */
  fill = false,
  piano = "card",
  className,
}: {
  children: React.ReactNode;
  densita?: Densita;
  /** Larghezza minima: sotto, la tabella scorre invece di comprimersi. */
  minWidth?: string;
  fill?: boolean;
  /** Il fondo su cui poggia. Vedi `Piano`. */
  piano?: Piano;
  className?: string;
}) {
  return (
    /*
      Due scatole: la scheda, che non scorre e tiene un margine d'aria attorno
      alla testata, e dentro di lei la regione che scorre. Se scorresse la
      scheda stessa, la capsula appiccicata in alto toccherebbe il bordo e le
      righe passerebbero nell'aria sopra di lei.
    */
    <div
      className={cn(
        "overflow-hidden rounded-[20px] border border-border pl-2.5 pr-1.5 pt-2.5",
        FONDO[piano],
        fill && "fill flex flex-col",
        ALTEZZA_TESTA[densita],
        FONDO_TESTA[piano],
        className,
      )}
    >
      <div
        className={cn(
          /*
            Senza la riserva per la barra di scorrimento. `fill-scroll` la
            tiene sempre (`scrollbar-gutter: stable`): qui la barra compare
            solo quando le righe scorrono davvero.
          */
          fill ? "fill-scroll overflow-x-auto [scrollbar-gutter:auto]" : "overflow-x-auto",
          "tabella-scorre",
        )}
      >
        <table
          className={cn("w-full text-sm", minWidth)}
          data-densita={densita}
          data-fill={fill ? "" : undefined}
        >
          {children}
        </table>
      </div>
    </div>
  );
}

export function Testa({
  children,
  piano = "card",
}: {
  children: React.ReactNode;
  /** Deve essere lo stesso passato a `Tabella`, altrimenti stonano. */
  piano?: Piano;
}) {
  return (
    // `sticky` vale solo dentro una tabella che scorre (`fill`), e lì serve:
    // scorrere cinquanta righe senza più sapere cosa sia ogni colonna è
    // peggio che scorrere. Il fondo è quello della scheda, pieno: copre le
    // righe attorno alla capsula, che è disegnata in `.testa-tabella`.
    <thead className={cn("testa-tabella sticky top-0 z-10 t-etichetta text-[color:var(--table-head-ink)]", FONDO[piano])}>
      <tr>{children}</tr>
    </thead>
  );
}

export function Th({
  children,
  densita = "comoda",
  allineamento = "left",
  className,
}: {
  children?: React.ReactNode;
  densita?: Densita;
  allineamento?: "left" | "right";
  className?: string;
}) {
  return (
    <th
      className={cn(
        CELLA[densita],
        allineamento === "right" ? "text-right" : "text-left",
        // L'altezza la dà la riga; i 6 px sotto sono l'aria fra capsula e
        // righe, e il testo si centra nella capsula, non nella cella.
        "pb-1.5 pt-0 font-semibold",
        className,
      )}
      scope="col"
    >
      {children}
    </th>
  );
}

export function Corpo({ children }: { children: React.ReactNode }) {
  return <tbody className="divide-y divide-border">{children}</tbody>;
}

export function Riga({
  children,
  /**
   * Una riga che chiede una decisione (una prenotazione da approvare).
   *
   * Il segno è un bordo a sinistra e un velo dell'accento — **non** un fondo
   * chiaro: il colore qui significa «serve una tua risposta», e su un fondo
   * scuro un rosso da tema chiaro rende il testo illeggibile.
   */
  daDecidere = false,
  onClick,
  className,
}: {
  children: React.ReactNode;
  daDecidere?: boolean;
  /**
   * Tutta la riga porta da qualche parte.
   *
   * **Non sostituisce il link**: dentro la riga deve restare un `<a>` vero
   * sulla cosa che si apre, perché è quello che la tastiera raggiunge, che
   * si apre in una scheda nuova col comando, e che un lettore di schermo
   * annuncia. Questo aggiunge solo la comodità del bersaglio grande per chi
   * usa il mouse — e per questo non porta `role="button"` né `tabIndex`, che
   * duplicherebbero il link nell'ordine di tabulazione.
   */
  onClick?: () => void;
  className?: string;
}) {
  return (
    <tr
      onClick={onClick}
      className={cn(
        "transition-colors hover:bg-secondary/30",
        daDecidere && "border-l-2 border-l-[color:var(--riga-decidere-segno)] bg-accent/[0.07]",
        className,
      )}
    >
      {children}
    </tr>
  );
}

export function Td({
  children,
  densita = "comoda",
  allineamento = "left",
  className,
}: {
  children?: React.ReactNode;
  densita?: Densita;
  allineamento?: "left" | "right";
  className?: string;
}) {
  return (
    <td
      className={cn(CELLA[densita], allineamento === "right" ? "text-right" : "text-left", className)}
    >
      {children}
    </td>
  );
}

/** Il vuoto dentro una tabella: una riga sola che occupa tutte le colonne. */
export function RigaVuota({ colonne, children }: { colonne: number; children: React.ReactNode }) {
  return (
    <tr>
      <td colSpan={colonne} className="px-4 py-12 text-center text-muted-foreground">
        {children}
      </td>
    </tr>
  );
}
