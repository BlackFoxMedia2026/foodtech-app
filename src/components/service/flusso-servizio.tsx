"use client";

import { cn } from "@/lib/utils";

/**
 * Il flusso di sala: tre passi, non tre colonne.
 *
 * ## Cosa cambia, e perché non è un riordino di CSS
 *
 * Le tre colonne si chiamavano **Adesso · Prossimi arrivi · Lista d'attesa**.
 * Sono tre nomi corretti che non dicono la cosa più importante: che sono lo
 * **stesso percorso** visto in tre momenti. «Adesso» poi ne conteneva due
 * pezzi che stanno in momenti diversi — chi è in ritardo (non è ancora
 * entrato) e chi è arrivato ma è in piedi (è dentro, senza tavolo) — e li
 * metteva accanto a chi mangia da un'ora.
 *
 * Adesso ogni passo corrisponde a un **luogo fisico**, che è la cosa che chi
 * accoglie vede davvero:
 *
 * - **In arrivo** — fuori. Chi deve ancora entrare, compreso chi è in
 *   ritardo.
 * - **In attesa** — dentro, in piedi. Chi è arrivato e aspetta il tavolo, e
 *   chi è in lista. Sono la stessa domanda («dove li metto?») e per la prima
 *   volta stanno nello stesso posto.
 * - **Accomodati** — a tavola.
 *
 * Nessun dato cambia, nessuna chiamata cambia: cambia **in quale colonna si
 * legge** una prenotazione che il server manda già divisa com'era.
 *
 * ## Perché «Accomodati» e non «In sala adesso»
 *
 * Nella stessa testata, a due centimetri, c'è l'interruttore
 * **Elenco / Sala**, e in navigazione «Sala» è la pianta del locale. «In
 * sala» come titolo di colonna avrebbe due significati sullo stesso schermo.
 * E c'è un guadagno: il pulsante del passo di mezzo dice **Accomoda**, e chi
 * lo preme vede la persona ricomparire sotto **Accomodati**. Il flusso si
 * legge anche nel verbo.
 *
 * ## Cosa lega i tre passi: i nomi, e basta
 *
 * Tre versioni di questa banda sono state costruite e potate. Portava, nella
 * prima: frecce nei solchi, numerazione `01/02/03`, un'intestazione comune
 * «Flusso di sala» e una riga colorata da 2 px per passo. Tutte e quattro
 * dicevano la stessa cosa — *questi tre stanno insieme e si leggono in
 * quest'ordine* — che però la lettura da sinistra a destra dice già da sola,
 * gratis.
 *
 * Quello che resta a legarli è la **stessa identica struttura di testata** e
 * tre nomi costruiti uguali: due «In ...» e il participio che chiude. Su una
 * schermata la cui malattia è l'affollamento, ogni oggetto grafico in più che
 * ripete una cosa già detta è un oggetto che toglie spazio a una prenotazione.
 */

/**
 * Un passo del flusso.
 *
 * `riassunto` è **il dato, non un sottotitolo**: «18 persone · 5
 * prenotazioni». Le persone prima dei gruppi, perché i coperti sono l'unità
 * con cui si ragiona in sala — quanti ne entrano in quel tavolo, non quanti
 * nomi ci sono in lista.
 */
export function PassoServizio({
  numero,
  titolo,
  riassunto,
  comandi,
  visibile,
  className,
  children,
}: {
  /** Solo per i lettori di schermo: «Passo 2 di 3». */
  numero: 1 | 2 | 3;
  titolo: string;
  riassunto: React.ReactNode;
  /** Il filtro della finestra: sta nella testata, non sopra le card. */
  comandi?: React.ReactNode;
  /** Sul telefono si vede un passo per volta. */
  visibile: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      className={cn("flex min-w-0 flex-col gap-2.5", !visibile && "hidden md:flex", className)}
      aria-label={`Passo ${numero} di 3: ${titolo}`}
    >
      <div>
        <h3 className="truncate text-sm font-semibold uppercase tracking-wider">{titolo}</h3>

        {/*
          La seconda riga è alta 36 px **in tutti e tre i passi**, anche dove
          porta solo il conteggio. È quello che tiene le tre testate alla
          stessa quota: se il filtro 30/60/90 allungasse la sola prima
          colonna, le tre testate resterebbero sfalsate di dieci pixel e si
          leggerebbero come tre widget, che è esattamente ciò da cui veniamo.
        */}
        <div className="mt-0.5 flex min-h-[36px] flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <p className="text-[13px] tabular-nums text-muted-foreground">{riassunto}</p>
          {comandi}
        </div>
      </div>

      {children}
    </section>
  );
}

/**
 * Sul telefono un passo per volta.
 *
 * Tre colonne da 120 px sono tre strisce illeggibili, quindi si guarda un
 * passo alla volta. Le linguette portano il conteggio perché è la risposta
 * che serve **senza** aprire il passo: quanti stanno arrivando, quanti
 * aspettano, quanti sono seduti si leggono tutti e tre in una riga.
 */
export function SelettorePassi<T extends string>({
  passi,
  attivo,
  onCambia,
  className,
}: {
  passi: { chiave: T; corto: string; conteggio: number }[];
  attivo: T;
  onCambia: (chiave: T) => void;
  className?: string;
}) {
  return (
    <div
      className={cn("fissa flex gap-1 md:hidden", className)}
      role="tablist"
      aria-label="I momenti del servizio"
    >
      {passi.map((p) => (
        <button
          key={p.chiave}
          type="button"
          role="tab"
          aria-selected={attivo === p.chiave}
          onClick={() => onCambia(p.chiave)}
          className={cn(
            "flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-full px-2 text-sm font-medium transition-colors",
            attivo === p.chiave ? "bg-cream text-clay-ink" : "bg-current/10 text-muted-foreground",
          )}
        >
          {p.corto}
          <span className="text-xs tabular-nums opacity-70">{p.conteggio}</span>
        </button>
      ))}
    </div>
  );
}
