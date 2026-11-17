"use client";

import { useMemo } from "react";
import { SlidersHorizontal } from "lucide-react";
import type { StaffDepartment, StaffPrimaryRole, WorkShiftKind } from "@prisma/client";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { BarraLaterale } from "@/components/staff/calendario/barra-laterale";
import { NuovaPersonaPulsante } from "@/components/staff/nuova-persona-pulsante";
import { RichiestePersonale } from "@/components/staff/richieste-personale";
import { StaffSwitch } from "@/components/staff/staff-switch";
import { filtriAttivi } from "@/components/staff/filtri-staff";
import { useColonnaStaff } from "@/components/staff/colonna-staff";
import { cn } from "@/lib/utils";

type Richiesta = Parameters<typeof RichiestePersonale>[0]["richieste"][number];

/**
 * La terza faccia dello Staff, con la stessa colonna delle altre due.
 *
 * Era una pagina centrata con l'interruttore in cima: cliccando «Richieste»
 * l'interruttore saltava dalla colonna di sinistra al centro, e mese, filtri e
 * riepilogo sparivano. Ora la colonna è identica a quella di Persone e cambia
 * solo il riquadro a destra. I filtri valgono anche qui: restringendo a
 * «Cucina» si vedono le richieste della brigata di cucina.
 */
export function RichiestePagina({
  richieste,
  staff,
  giorno,
  oggi,
  turniDelGiorno,
  canManageStaff,
}: {
  richieste: Richiesta[];
  staff: {
    id: string;
    nome: string;
    primaryRole: StaffPrimaryRole | null;
    department: StaffDepartment | null;
  }[];
  giorno: string;
  oggi: string;
  turniDelGiorno: { waiterId: string; kind: WorkShiftKind }[];
  canManageStaff: boolean;
}) {
  const { filtri, barraProps, passaFiltri } = useColonnaStaff({
    staff,
    giorno,
    oggi,
    turniDelGiorno,
    percorso: "/staff/richieste",
  });

  const visibili = useMemo(() => {
    const ammesse = new Set(staff.filter(passaFiltri).map((p) => p.id));
    // Una richiesta senza persona (la persona è stata tolta) non ha reparto né
    // ruolo: si vede solo a filtri puliti.
    return richieste.filter((r) => (r.persona ? ammesse.has(r.persona.id) : !filtriAttivi(filtri)));
  }, [richieste, staff, passaFiltri, filtri]);

  const conFiltri = filtriAttivi(filtri);
  const nuovaPersona = canManageStaff ? (
    <NuovaPersonaPulsante className="w-full" />
  ) : undefined;

  return (
    <div className="schermo gap-3">
      <div className="fill flex min-h-0 gap-4">
        <aside className="hidden min-h-0 shrink-0 overflow-y-auto pb-2 pr-0.5 xl:block">
          <BarraLaterale vista="richieste" {...barraProps} azione={nuovaPersona} />
        </aside>

        <section className="flex min-h-0 min-w-0 flex-1 flex-col gap-2.5">
          {/* Sotto `xl` la colonna non c'è: interruttore e filtri tornano in
              cima, come in Persone. */}
          <div className="fissa flex flex-wrap items-center gap-2.5 xl:hidden">
            <StaffSwitch
              vista="richieste"
              giorno={giorno}
              className="w-[calc(100%-3.375rem)] md:w-auto md:shrink-0"
            />
            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className={cn(
                    "flex h-11 w-11 shrink-0 items-center justify-center gap-1.5 rounded-full border text-xs font-medium transition-colors md:h-8 md:w-auto md:px-3",
                    conFiltri
                      ? "border-accent text-accent-strong"
                      : "border-border/70 text-foreground/90 hover:border-line-40",
                  )}
                >
                  <SlidersHorizontal className="h-[18px] w-[18px] md:h-3.5 md:w-3.5" aria-hidden="true" />
                  <span className="sr-only md:not-sr-only">Filtri</span>
                </button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-[min(300px,calc(100vw-2rem))] p-3 md:w-[260px]">
                <BarraLaterale compatta vista="richieste" {...barraProps} />
              </PopoverContent>
            </Popover>
          </div>

          <RichiestePersonale
            richieste={visibili}
            nascoste={richieste.length - visibili.length}
            persone={staff.map((p) => ({ id: p.id, nome: p.nome }))}
            canManage
          />
        </section>
      </div>
    </div>
  );
}
