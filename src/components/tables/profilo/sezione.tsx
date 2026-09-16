import type { ComponentType, ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * I pezzi con cui è composto il profilo del tavolo.
 *
 * ## Cosa c'era prima, e perché non funzionava
 *
 * Una sola forma per tutto: etichetta in maiuscoletto, testo, riga di
 * separazione. Ripetuta sette volte. Il risultato è che «chi è seduto a questo
 * tavolo e quanto deve» pesava esattamente quanto «lo storico di agosto»: per
 * sapere cosa stava succedendo bisognava **leggere**, e un pannello che si
 * apre durante un servizio deve rispondere prima di essere letto.
 *
 * Il difetto non era la mancanza di informazioni, era la mancanza di
 * **livelli**. Qui ce ne sono tre, e sono tre oggetti diversi:
 *
 * - `Riquadro` — il blocco principale. Uno solo per pannello, con la
 *   superficie tinta dallo stato del tavolo: si vede prima di leggerlo;
 * - `Modulo` — la piastrella compatta, in coppia. Stato **e** azione in tre
 *   righe, senza paragrafi: «Personale · nessuno · gestisci»;
 * - `Gruppo` — il testo che si consulta, separato da spazio e non da righe.
 *
 * ## Le righe orizzontali
 *
 * Ce n'era una fra ogni blocco, ed è il modo più veloce per appiattire una
 * colonna: una riga dice «qui finisce una cosa e ne comincia un'altra» senza
 * dire quale delle due conta. Adesso separano **spazio**, superficie e
 * dimensione del testo; la riga resta solo sotto la testata fissa, dove ha un
 * lavoro vero — dire dove passa il contenuto che scorre.
 */

/* -------------------------------------------------------------------------- */
/*  Livello 1 — il blocco principale                                          */
/* -------------------------------------------------------------------------- */

/**
 * Il riquadro dominante: cosa sta succedendo **adesso**.
 *
 * La superficie arriva da fuori (`SUPERFICIE_STATO`) perché è lo stato del
 * tavolo a deciderla. È l'unico oggetto del pannello che cambia colore, ed è
 * voluto: se cambiassero tutti, nessuno cambierebbe.
 */
export function Riquadro({
  superficie,
  children,
  className,
}: {
  superficie: string;
  children: ReactNode;
  className?: string;
}) {
  return <section className={cn("rounded-lg border p-4", superficie, className)}>{children}</section>;
}

/* -------------------------------------------------------------------------- */
/*  Livello 2 — le piastrelle                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Una piastrella operativa: **stato e azione**, mai un paragrafo.
 *
 * Personale e QR rispondono alla stessa forma di domanda — «com'è messo, e
 * dove si cambia» — quindi hanno la stessa forma. Stanno in coppia sulla
 * stessa riga perché insieme occupano lo spazio che una sola di loro occupava
 * prima da sola, con le sue due frasi di spiegazione.
 *
 * Tutta la piastrella è il bersaglio, non una parola dentro: durante un
 * servizio si tocca con il pollice, e un collegamento largo sessanta pixel in
 * mezzo a un riquadro è un bersaglio mancato.
 */
export function Modulo({
  icona: Icona,
  titolo,
  onApri,
  ariaLabel,
  children,
  className,
}: {
  icona: ComponentType<{ className?: string }>;
  titolo: string;
  /** Apre il livello di gestione. Senza, la piastrella si legge e basta. */
  onApri?: () => void;
  ariaLabel?: string;
  children: ReactNode;
  className?: string;
}) {
  const corpo = (
    <>
      <span className="flex items-center gap-1.5">
        <Icona className="h-3.5 w-3.5 shrink-0 text-tertiary-foreground" aria-hidden="true" />
        <span className="t-etichetta">{titolo}</span>
        {onApri && (
          <ChevronRight
            className="ml-auto h-3.5 w-3.5 shrink-0 text-tertiary-foreground transition-transform group-hover:translate-x-0.5"
            aria-hidden="true"
          />
        )}
      </span>
      <span className="mt-2 block">{children}</span>
    </>
  );

  const stile = cn(
    "rounded-lg border border-border bg-card-sunken/60 p-3 text-left",
    onApri && "group transition-colors hover:border-border-strong hover:bg-card-sunken",
    className,
  );

  if (!onApri) return <div className={stile}>{corpo}</div>;
  return (
    <button type="button" onClick={onApri} aria-label={ariaLabel ?? titolo} className={stile}>
      {corpo}
    </button>
  );
}

/* -------------------------------------------------------------------------- */
/*  Livello 3 — quello che si consulta                                        */
/* -------------------------------------------------------------------------- */

/**
 * Un gruppo di consultazione: un titolo leggero, un'azione facoltativa a
 * destra, il contenuto sotto.
 *
 * Il titolo **non è in maiuscoletto**: l'uppercase resta per le etichette
 * piccole delle piastrelle, dove una parola sola fa da insegna. Usato anche
 * qui diventava un sistema, e un sistema di insegne non ha più una gerarchia.
 */
export function Gruppo({
  titolo,
  contatore,
  azione,
  children,
  className,
}: {
  titolo: string;
  /** «24 servizi»: dice quanto c'è prima di aprirlo. */
  contatore?: string;
  azione?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={className}>
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h3 className="t-titolo-scheda text-muted-foreground">
          {titolo}
          {contatore && <span className="ml-2 t-nota font-normal">{contatore}</span>}
        </h3>
        {azione}
      </div>
      {children}
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*  Le cifre                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Un numero e cosa vuol dire, con il numero **prima**.
 *
 * L'etichetta sotto e non sopra: si cerca la cifra, non la parola. È la stessa
 * inversione fatta nel pannello dei coupon — «Solo il martedì» sopra «giorni
 * in cui vale» — e vale ancora di più qui, dove la cifra è un conto da pagare.
 */
export function Cifra({
  valore,
  etichetta,
  tono = "normale",
  className,
}: {
  valore: ReactNode;
  etichetta: string;
  /** `forte` per quello che decide un gesto: il residuo, il ritardo. */
  tono?: "normale" | "forte" | "quieto";
  className?: string;
}) {
  return (
    <div className={cn("min-w-0", className)}>
      <p
        className={cn(
          "tabular-nums leading-tight",
          tono === "forte" ? "text-xl font-semibold" : "text-base font-medium",
          tono === "quieto" && "text-muted-foreground",
        )}
      >
        {valore}
      </p>
      <p className="t-nota mt-0.5">{etichetta}</p>
    </div>
  );
}
