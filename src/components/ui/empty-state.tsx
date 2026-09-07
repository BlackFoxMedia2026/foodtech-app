import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Uno stato vuoto che serve a qualcosa.
 *
 * Prima ogni sezione vuota diceva soltanto il fatto — «Nessun cameriere
 * registrato ancora.» — occupando mezzo schermo per un'informazione che
 * l'utente aveva già capito guardando la pagina. Uno stato vuoto è il primo
 * momento in cui una persona incontra una funzione: deve spiegare **a cosa
 * serve** e offrire **il passo successivo**.
 *
 * Tre parti, tutte necessarie:
 * - `title`: cosa manca, al positivo
 * - `children`: perché serve, in una frase
 * - `action`: cosa fare adesso
 */
export function EmptyState({
  icon: Icon,
  title,
  children,
  action,
  secondaryAction,
  compact = false,
  className,
}: {
  icon?: LucideIcon;
  title: string;
  children?: React.ReactNode;
  action?: React.ReactNode;
  secondaryAction?: React.ReactNode;
  /** Per gli spazi stretti (colonne, pannelli laterali). */
  compact?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-md border border-dashed border-border text-center",
        compact ? "px-4 py-8" : "px-6 py-12",
        className,
      )}
    >
      {Icon && (
        <Icon
          className={cn("mx-auto text-tertiary-foreground", compact ? "mb-2 h-6 w-6" : "mb-3 h-8 w-8")}
          aria-hidden="true"
        />
      )}
      <p className={cn("font-medium text-foreground", compact ? "text-sm" : "text-base")}>{title}</p>
      {children && (
        <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">{children}</p>
      )}
      {(action || secondaryAction) && (
        <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
          {action}
          {secondaryAction}
        </div>
      )}
    </div>
  );
}
