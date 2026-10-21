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
  /*
    Una riga sola. Prima la barra andava a capo dentro di sé (il selettore di
    vista scendeva sotto la data), la riga diventava alta il doppio e i
    riquadri dei numeri e «Nuovo turno», stirati a quell'altezza, sembravano
    pulsanti giganti. Ora la barra non va a capo, i numeri stanno in un
    riquadro solo e il pulsante tiene la sua altezza naturale.

    Quando la riga non basta a capo vanno i **riquadri interi**, non il
    contenuto della barra: da `md` la barra non si stringe sotto la propria
    misura (`flex-[1_0_auto]`), così i numeri scendono sotto invece di
    sovrapporsi al selettore di vista. Sul telefono prende tutta la larghezza
    e a stringersi è solo la data.
  */
  return (
    <div className="fissa flex flex-wrap items-center gap-2.5">
      {interruttore}
      <div className="riquadro flex w-full min-w-0 items-center gap-2 bg-card/40 px-2 py-1.5 md:w-auto md:flex-[1_0_auto]">
        <button
          type="button"
          onClick={onPrecedente}
          aria-label="Periodo precedente"
          className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-border/70 text-muted-foreground transition-colors hover:border-line-40 hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <h2 className="min-w-0 truncate px-1 text-[0.95rem] font-medium capitalize md:text-base">{etichetta}</h2>
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

      {/* I tre numeri in un riquadro solo, su una riga. Da `xl` in su li
          ripete già il riepilogo della colonna a sinistra, a un palmo da qui:
          lì si tolgono e la riga respira. */}
      <div className="riquadro flex shrink-0 items-center gap-3.5 self-stretch bg-card/40 px-3.5 xl:hidden">
        <Kpi icona={Users} valore={inTurno} etichetta={eOggi ? "in turno oggi" : "in turno"} />
        <Kpi icona={ChefHat} valore={assenti} etichetta="assenti" />
        <Kpi icona={CalendarDays} valore={liberi} etichetta="liberi" />
      </div>

      <div className="ml-auto shrink-0">{azione}</div>
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
    <p className="flex items-center gap-1.5 whitespace-nowrap text-xs text-muted-foreground">
      <Icona className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span className="text-sm font-semibold tabular-nums text-foreground">{valore}</span>
      {etichetta}
    </p>
  );
}
