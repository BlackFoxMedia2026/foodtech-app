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

export type Densita = "comoda" | "densa";

const CELLA: Record<Densita, string> = {
  comoda: "px-4 py-3",
  densa: "px-2 py-2.5 md:px-4",
};

export function Tabella({
  children,
  densita = "comoda",
  minWidth,
  className,
}: {
  children: React.ReactNode;
  densita?: Densita;
  /** Larghezza minima: sotto, la tabella scorre invece di comprimersi. */
  minWidth?: string;
  className?: string;
}) {
  return (
    <div className={cn("overflow-x-auto rounded-xl border border-border bg-card", className)}>
      <table className={cn("w-full text-sm", minWidth)} data-densita={densita}>
        {children}
      </table>
    </div>
  );
}

export function Testa({ children }: { children: React.ReactNode }) {
  return (
    <thead className="border-b border-border bg-secondary/50 text-xs uppercase tracking-wider text-muted-foreground">
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
        "font-medium",
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
  className,
}: {
  children: React.ReactNode;
  daDecidere?: boolean;
  className?: string;
}) {
  return (
    <tr
      className={cn(
        "transition-colors hover:bg-secondary/30",
        daDecidere && "border-l-2 border-l-accent bg-accent/[0.07]",
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
