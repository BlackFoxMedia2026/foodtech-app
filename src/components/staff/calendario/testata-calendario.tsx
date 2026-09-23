"use client";

import type { ReactNode } from "react";
import { CalendarDays, ChefHat, ChevronLeft, ChevronRight, SlidersHorizontal, Users } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { Vista } from "@/components/staff/calendario/tipi";
import { cn } from "@/lib/utils";

/** L'ordine è quello del mockup, e non è casuale: la settimana è la vista
 * che si apre per prima e che si usa il novanta per cento delle volte. */
const VISTE: { value: Vista; label: string; breve: string }[] = [
  { value: "settimana", label: "Settimana", breve: "S" },
  { value: "giorno", label: "Giorno", breve: "G" },
  { value: "mese", label: "Mese", breve: "M" },
];

/**
 * La barra di comando, e i tre numeri.
 *
 * Due oggetti distinti sulla stessa riga, e distinti di proposito: a sinistra
 * quello che si **preme** (dove sono, come guardo), a destra quello che si
 * **legge**. Mescolarli in un'unica barra faceva sembrare premibili anche i
 * numeri.
 */
export function TestataCalendario({
  etichetta,
  vista,
  onVista,
  onPrecedente,
  onSuccessivo,
  onOggi,
  inTurno,
  assenti,
  liberi,
  eOggi,
  pannelloFiltri,
  conFiltriAttivi,
  interruttore,
  azione,
}: {
  etichetta: string;
  vista: Vista;
  onVista: (v: Vista) => void;
  onPrecedente: () => void;
  onSuccessivo: () => void;
  onOggi: () => void;
  inTurno: number;
  assenti: number;
  liberi: number;
  eOggi: boolean;
  pannelloFiltri: ReactNode;
  conFiltriAttivi: boolean;
  /** L'interruttore Persone/Turni, che sotto `xl` non ha più la colonna in
   * cui vive normalmente. */
  interruttore: ReactNode;
  /** «Nuovo turno»: sta in fondo alla riga, **dopo i numeri**, perché è
   * l'unica cosa qui dentro che scrive qualcosa. Prima stava da sola in una
   * testata sopra la pagina, che esisteva solo per contenere lei. */
  azione: ReactNode;
}) {
  return (
    <div className="fissa flex flex-wrap items-stretch gap-2.5">
      {interruttore}
      <div className="riquadro flex min-w-0 flex-1 flex-wrap items-center gap-2 bg-card/40 px-2.5 py-2">
        <button
          type="button"
          onClick={onPrecedente}
          aria-label="Periodo precedente"
          className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-border/70 text-muted-foreground transition-colors hover:border-line-40 hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <h2 className="truncate px-1 text-[0.95rem] font-medium capitalize md:text-base">{etichetta}</h2>
        <button
          type="button"
          onClick={onSuccessivo}
          aria-label="Periodo successivo"
          className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-border/70 text-muted-foreground transition-colors hover:border-line-40 hover:text-foreground"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={onOggi}
          className="h-8 shrink-0 rounded-full border border-border/70 px-4 text-xs font-medium text-foreground/90 transition-colors hover:border-line-40 hover:bg-veil-6"
        >
          Oggi
        </button>

        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              className={cn(
                "flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors xl:hidden",
                conFiltriAttivi
                  ? "border-accent text-accent-strong"
                  : "border-border/70 text-foreground/90 hover:border-line-40",
              )}
            >
              <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
              Filtri
            </button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-[260px] p-3">
            {pannelloFiltri}
          </PopoverContent>
        </Popover>

        {/* Il selettore di vista. Tre segmenti dentro un solco, non tre
            pulsanti: dicono che sono alternative e che una è già scelta. */}
        <div className="ml-auto flex shrink-0 items-center gap-0.5 rounded-full border border-border/60 bg-veil-4 p-0.5">
          {VISTE.map((v) => (
            <button
              key={v.value}
              type="button"
              onClick={() => onVista(v.value)}
              aria-pressed={vista === v.value}
              className={cn(
                "rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors",
                vista === v.value
                  ? "bg-segment text-segment-ink"
                  : "text-muted-foreground hover:bg-veil-10 hover:text-foreground",
              )}
            >
              <span className="hidden sm:inline">{v.label}</span>
              <span className="sm:hidden">{v.breve}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="flex shrink-0 items-stretch gap-2.5">
        <Kpi icona={Users} valore={inTurno} etichetta={eOggi ? "In turno oggi" : "In turno"} />
        <Kpi icona={ChefHat} valore={assenti} etichetta="Assenti" />
        <Kpi icona={CalendarDays} valore={liberi} etichetta="Giorni liberi" />
        {azione}
      </div>
    </div>
  );
}

function Kpi({
  icona: Icona,
  valore,
  etichetta,
}: {
  icona: typeof Users;
  valore: number;
  etichetta: string;
}) {
  return (
    <div className="riquadro flex items-center gap-2.5 bg-card/40 px-3 py-2">
      <Icona className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <p className="leading-none">
        <span className="block text-base font-semibold tabular-nums">{valore}</span>
        <span className="mt-1 block whitespace-nowrap text-[0.68rem] text-muted-foreground">{etichetta}</span>
      </p>
    </div>
  );
}
