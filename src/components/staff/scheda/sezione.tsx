import type { ComponentType, ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * I mattoni della scheda: una **sezione** con titolo grande e un'azione a
 * destra, una **griglia** di campi, un **campo** che si legge.
 *
 * La modale di prima era un modulo: trenta `<input>` uno sotto l'altro, con
 * la data di nascita nello stesso riquadro del ruolo. Qui vale la regola
 * opposta — *si legge prima, si modifica quando serve*: un campo a riposo è
 * un'etichetta piccola e un valore grande, e diventa un `<input>` solo
 * dentro la sezione su cui si è premuto «Modifica».
 *
 * Il valore è in `text-base`/`text-lg`, non `text-sm`: la scheda la legge
 * un responsabile che cerca **un** dato, spesso su un tablet, e un numero
 * di telefono in 14 px non si legge da in piedi.
 */
export function Sezione({
  titolo,
  descrizione,
  icona: Icona,
  azione,
  className,
  children,
  id,
}: {
  titolo: string;
  descrizione?: ReactNode;
  icona?: ComponentType<{ className?: string }>;
  /** Il comando della sezione: «Modifica», «+ Aggiungi corso», «Carica documento». */
  azione?: ReactNode;
  className?: string;
  children: ReactNode;
  id?: string;
}) {
  return (
    <section id={id} className={cn("surface p-5 md:p-6", className)} aria-labelledby={id ? `${id}-titolo` : undefined}>
      <header className="mb-5 flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <div className="min-w-0">
          <h2 id={id ? `${id}-titolo` : undefined} className="flex items-center gap-2 text-display text-xl md:text-2xl">
            {Icona && <Icona className="h-5 w-5 shrink-0 text-accent-strong" aria-hidden="true" />}
            <span className="break-words">{titolo}</span>
          </h2>
          {descrizione && <p className="mt-1 text-sm text-muted-foreground">{descrizione}</p>}
        </div>
        {azione && <div className="flex shrink-0 flex-wrap items-center gap-2">{azione}</div>}
      </header>
      {children}
    </section>
  );
}

/** Da una a tre colonne: una sul telefono, tutte da `md`. */
export function GrigliaCampi({
  colonne = 3,
  className,
  children,
}: {
  colonne?: 2 | 3 | 4;
  className?: string;
  children: ReactNode;
}) {
  const cols = { 2: "md:grid-cols-2", 3: "md:grid-cols-3", 4: "md:grid-cols-2 xl:grid-cols-4" }[colonne];
  return <div className={cn("grid grid-cols-1 gap-x-8 gap-y-5", cols, className)}>{children}</div>;
}

/**
 * Un dato a riposo. Il vuoto si scrive («Non indicato»): uno spazio vuoto in
 * una scheda si legge come un errore di caricamento, non come un'assenza.
 */
export function Campo({
  etichetta,
  valore,
  vuoto = "Non indicato",
  href,
  nota,
  largo = false,
  className,
}: {
  etichetta: string;
  valore: ReactNode | null | undefined;
  vuoto?: string;
  /** Un telefono o un'email si toccano: diventano un link. */
  href?: string;
  nota?: ReactNode;
  /** Occupa tutta la riga: un indirizzo, una nota. */
  largo?: boolean;
  className?: string;
}) {
  const manca = valore === null || valore === undefined || valore === "";
  return (
    <div className={cn("min-w-0", largo && "md:col-span-full", className)}>
      <p className="t-etichetta">{etichetta}</p>
      {manca ? (
        <p className="mt-1 text-base text-tertiary-foreground">{vuoto}</p>
      ) : href ? (
        <a href={href} className="mt-1 block break-words text-base text-foreground underline-offset-4 hover:text-accent-strong hover:underline md:text-lg">
          {valore}
        </a>
      ) : (
        <p className="mt-1 break-words text-base text-foreground md:text-lg">{valore}</p>
      )}
      {nota && <p className="mt-0.5 text-xs text-muted-foreground">{nota}</p>}
    </div>
  );
}

/** La coppia «Annulla / Salva modifiche» in fondo a una sezione in modifica. */
export function PiedeModifica({
  onAnnulla,
  salvando,
  errore,
  etichettaSalva = "Salva modifiche",
  children,
}: {
  onAnnulla: () => void;
  salvando: boolean;
  errore?: string | null;
  etichettaSalva?: string;
  /** Un'azione in più a sinistra (di solito «Elimina»). */
  children?: ReactNode;
}) {
  return (
    <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
      <div className="flex min-w-0 items-center gap-3">
        {children}
        {errore && <p className="text-sm text-destructive-soft">{errore}</p>}
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onAnnulla}
          disabled={salvando}
          className="inline-flex h-10 items-center rounded-md border border-surface-brown/40 px-4 text-sm font-medium transition-colors hover:bg-surface-brown/15 disabled:opacity-50"
        >
          Annulla
        </button>
        <button
          type="submit"
          disabled={salvando}
          className="inline-flex h-10 items-center rounded-full bg-cream px-5 text-sm font-medium text-clay-ink shadow-[0_10px_24px_rgba(0,0,0,0.35)] transition hover:brightness-105 disabled:opacity-50"
        >
          {salvando ? "Salvataggio…" : etichettaSalva}
        </button>
      </div>
    </div>
  );
}

/** Un campo del modulo: etichetta sopra, controllo sotto, errore se c'è. */
export function CampoModulo({
  etichetta,
  htmlFor,
  errore,
  nota,
  largo = false,
  children,
}: {
  etichetta: string;
  htmlFor?: string;
  errore?: string;
  nota?: ReactNode;
  largo?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={cn("space-y-1.5", largo && "md:col-span-full")}>
      <label htmlFor={htmlFor} className="t-etichetta font-medium">
        {etichetta}
      </label>
      {children}
      {errore ? <p className="text-xs text-destructive-soft">{errore}</p> : nota ? <p className="text-xs text-muted-foreground">{nota}</p> : null}
    </div>
  );
}
