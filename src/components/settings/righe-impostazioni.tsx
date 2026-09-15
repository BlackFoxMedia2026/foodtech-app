import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Le Impostazioni si **leggono scorrendo**, non aprendo.
 *
 * Fino al 15 settembre ogni configurazione era un `<details>`: il valore si
 * leggeva nell'intestazione e per cambiarlo si apriva. Risolveva il problema
 * di allora — tredici schede alte tutte uguali — creandone un altro: per
 * sapere *cosa c'è dentro* una sezione bisognava aprirla, una per una, e
 * l'indice mostrava una parte sola per volta. Due gesti obbligatori prima di
 * vedere qualcosa.
 *
 * Adesso è una pagina sola che scorre, e la gerarchia la fanno tre livelli
 * dichiarati qui:
 *
 * 1. **sezione** — «Il locale»: titolo grande in serif, sottotitolo, una linea
 *    sotto. È l'ancora della barra in alto;
 * 2. **gruppo** — «Brand»: un titolo e un riquadro di righe;
 * 3. **riga** — «Nome pubblico»: nome a sinistra, valore o controllo a destra.
 *
 * Nessun box dentro box: il gruppo è **l'unico** riquadro, e le righe dentro
 * sono separate da una linea, non da un bordo ciascuna. È la ragione per cui
 * queste primitive esistono invece del markup a mano — venti righe scritte a
 * mano sono venti densità diverse alla terza modifica.
 */

/* -------------------------------------------------------------------------- */
/*  Gruppo                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Una sottosezione: «Brand», «Turni di servizio», «Raccolta punti».
 *
 * `azione` è il comando che vale per tutto il gruppo (di solito «Modifica» o
 * «Salva») e sta in alto a destra, accanto al titolo: dentro le righe
 * competerebbe con i valori.
 */
export function GruppoImpostazioni({
  titolo,
  descrizione,
  azione,
  children,
  className,
}: {
  titolo: string;
  descrizione?: ReactNode;
  azione?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("space-y-3", className)}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <div className="min-w-0">
          <h3 className="t-titolo-sezione">{titolo}</h3>
          {descrizione && (
            <p className="mt-0.5 max-w-3xl text-sm text-muted-foreground">{descrizione}</p>
          )}
        </div>
        {azione && <div className="flex shrink-0 items-center gap-2">{azione}</div>}
      </div>

      {/*
        Il riquadro del gruppo è **appena** staccato dal fondo: niente gradiente
        e niente ombra come `.surface`. Con quattro sezioni di gruppi in una
        pagina che scorre, venti superfici che galleggiano diventano rumore —
        e l'alone era la cosa che faceva sembrare questa pagina meno adulta del
        prodotto intorno.
      */}
      <div className="riquadro rounded-xl border-border/80 bg-white/[0.02] px-4 md:px-5">
        {children}
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*  Riga                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Una singola impostazione: **nome a sinistra, valore o controllo a destra**.
 *
 * Su scrivania due colonne — il nome e la sua spiegazione prendono lo spazio
 * che avanza, il controllo una colonna fissa sulla destra. Sotto `md` le due
 * colonne si impilano invece di stringersi: un `<select>` largo 90 px con
 * accanto un'etichetta a capo ogni due parole non è più denso, è solo più
 * difficile da leggere.
 *
 * `larga` toglie la colonna fissa: serve alle righe il cui controllo è esso
 * stesso una forma — la scelta fra sale e tavoli, l'elenco dei collegamenti
 * alle recensioni — che a 22rem sarebbe schiacciata.
 */
export function RigaImpostazione({
  nome,
  descrizione,
  htmlFor,
  larga = false,
  children,
  className,
}: {
  nome: ReactNode;
  descrizione?: ReactNode;
  /** Se il controllo a destra è un campo, la sua `id`: così il nome della riga
   *  è la sua etichetta e ci si clicca sopra. */
  htmlFor?: string;
  larga?: boolean;
  children?: ReactNode;
  className?: string;
}) {
  const Nome = htmlFor ? "label" : "p";
  return (
    <div
      className={cn(
        "grid gap-x-8 gap-y-3 border-b border-border/60 py-4 last:border-b-0 md:py-5",
        larga
          ? "md:grid-cols-1"
          : "md:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] md:items-center",
        className,
      )}
    >
      <div className="min-w-0">
        <Nome
          {...(htmlFor ? { htmlFor } : {})}
          className={cn(
            "block text-sm font-medium text-foreground md:text-[0.9375rem]",
            htmlFor && "cursor-pointer",
          )}
        >
          {nome}
        </Nome>
        {descrizione && (
          <p className="mt-1 max-w-2xl text-xs leading-relaxed text-muted-foreground md:text-sm">
            {descrizione}
          </p>
        )}
      </div>
      {children && (
        <div
          className={cn(
            "flex flex-wrap items-center gap-2",
            larga ? "md:justify-start" : "md:justify-end",
          )}
        >
          {children}
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Valori                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Il valore attuale, quando non c'è niente da toccare sulla riga.
 *
 * Più basso di contrasto del nome dell'impostazione, e **non** oro: l'oro qui
 * dice stato e metadato, non «questo è il dato». Con tre valori per riga su
 * quaranta righe, tutto oro vuol dire niente oro.
 */
export function ValoreImpostazione({
  children,
  mono = false,
  className,
}: {
  children: ReactNode;
  /** Cifre che si incolonnano: orari, coperti, percentuali. */
  mono?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "text-sm text-card-foreground/80 md:text-right",
        mono && "tabular-nums",
        className,
      )}
    >
      {children}
    </span>
  );
}

/** Il valore che non c'è: detto, non lasciato vuoto. */
export function ValoreVuoto({ children = "non impostato" }: { children?: ReactNode }) {
  return <span className="text-sm text-tertiary-foreground md:text-right">{children}</span>;
}

/**
 * Una riga che non è un'impostazione: la frase che riassume cosa vedrà il
 * cliente, l'esempio di calcolo, la fila «aggiungi e salva».
 *
 * Esiste per non far scrivere a mano il bordo e il respiro di una riga ogni
 * volta che dentro un gruppo serve qualcosa che non sta in due colonne — che
 * è esattamente il modo in cui, la volta scorsa, sono nate quattro spaziature
 * diverse per la stessa cosa.
 */
export function RigaLibera({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("border-b border-border/60 py-4 last:border-b-0 md:py-5", className)}>
      {children}
    </div>
  );
}

/**
 * L'esito di un salvataggio, detto sul posto.
 *
 * Con le impostazioni tutte visibili in una pagina sola, un «Salvato.» in
 * fondo alla schermata è un «Salvato.» che non si vede: sta accanto al
 * pulsante che l'ha prodotto.
 */
export function EsitoSalvataggio({ salvato, errore }: { salvato?: boolean; errore?: string | null }) {
  if (errore) return <span className="text-sm text-destructive-soft">{errore}</span>;
  if (salvato) return <span className="text-sm text-sage-strong">Salvato.</span>;
  return null;
}
