"use client";

import { useMemo } from "react";
import { ChefHat, Martini, Search, ShieldCheck, SlidersHorizontal, Users, UtensilsCrossed } from "lucide-react";
import type { StaffCapability, StaffDepartment, StaffPrimaryRole, WaiterStatus, WorkShiftKind } from "@prisma/client";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { NewStaffDialog } from "@/components/staff/new-staff-dialog";
import { StaffRow } from "@/components/staff/staff-row";
import { StaffSwitch } from "@/components/staff/staff-switch";
import { BarraLaterale } from "@/components/staff/calendario/barra-laterale";
import { filtriAttivi as haFiltri } from "@/components/staff/filtri-staff";
import { useColonnaStaff } from "@/components/staff/colonna-staff";
import { groupStaffByDepartment, staffDepartmentLabel } from "@/lib/staff-departments";
import { etichettaGiornoBreve } from "@/lib/turni";
import { cn } from "@/lib/utils";

export type StaffListItem = {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  email: string | null;
  birthday: Date;
  hireDate: Date | null;
  role: string;
  primaryRole: StaffPrimaryRole | null;
  department: StaffDepartment | null;
  capabilities: StaffCapability[];
  status: WaiterStatus;
  photoUrl: string | null;
  /** L'account con cui questa persona entra, se ne ha uno. */
  user: { email: string } | null;
};

const DEPARTMENT_ICON: Record<StaffDepartment, React.ComponentType<{ className?: string }>> = {
  SALA: UtensilsCrossed,
  CUCINA: ChefHat,
  BAR: Martini,
  DIREZIONE: ShieldCheck,
  ALTRO: Users,
};

export function StaffPageClient({
  staff,
  mode,
  rooms,
  tables,
  serviceOptions,
  canManageStaff,
  canManageContracts,
  assignmentSummaryByStaffId,
  avvisiPerPersona,
  giorno,
  oggi,
  turniDelGiorno,
}: {
  staff: StaffListItem[];
  mode: "ROOMS" | "TABLES";
  rooms: { id: string; name: string }[];
  tables: { id: string; label: string; seats: number }[];
  serviceOptions: string[];
  canManageStaff: boolean;
  canManageContracts: boolean;
  assignmentSummaryByStaffId: Record<string, string>;
  /** L'avviso di scadenza per persona — contratto, visita medica, corsi,
   * documenti — solo per chi ne ha uno scaduto o vicino. */
  avvisiPerPersona: Record<string, { stato: "scaduto" | "in_scadenza"; testo: string }>;
  /** Il giorno scelto nel mini-calendario: decide il filtro «stato» e i tre
   * numeri della colonna, non l'elenco delle persone. */
  giorno: string;
  oggi: string;
  turniDelGiorno: { waiterId: string; kind: WorkShiftKind }[];
}) {
  const { filtri, barraProps, passaFiltri } = useColonnaStaff({
    staff,
    giorno,
    oggi,
    turniDelGiorno,
    percorso: "/staff",
  });

  /*
    L'elenco filtrato.

    I tre filtri sono **gli stessi della vista Turni** e vivono nello stesso
    posto (vedi `useFiltriStaff`): chi restringe a «Cucina» per capire chi c'è
    in brigata e poi passa qui per aprire una scheda ritrova Cucina, non tutti.
    La ricerca per nome invece resta locale: è una domanda che si fa e si
    esaurisce in questa pagina.
  */
  const filtrati = useMemo(() => staff.filter(passaFiltri), [staff, passaFiltri]);

  const gruppi = useMemo(() => groupStaffByDepartment(filtrati), [filtrati]);
  const conFiltriAttivi = haFiltri(filtri);

  return (
    <div className="schermo gap-3">
      <div className="fill flex min-h-0 gap-4">
        {/* La stessa colonna della vista Turni, con lo stesso interruttore in
            cima: passare da qui al calendario non cambia il contesto, cambia
            solo cosa c'è a destra. */}
        <aside className="hidden min-h-0 shrink-0 overflow-y-auto pb-2 pr-0.5 xl:block">
          <BarraLaterale
            vista="persone"
            {...barraProps}
            azione={
              canManageStaff ? (
                <NewStaffDialog canManageContracts={canManageContracts} className="w-full" />
              ) : undefined
            }
          />
        </aside>

        <section className="flex min-h-0 min-w-0 flex-1 flex-col gap-2.5">
          {/*
            Sotto `xl` la colonna non c'è, e con lei sparirebbero l'interruttore,
            i filtri e il pulsante che crea una persona. Questa riga esiste solo
            lì: sopra `xl` non si vede, perché tutto quello che contiene ha già
            una casa a sinistra.
          */}
          <div className="fissa flex flex-wrap items-center gap-2.5 xl:hidden">
            {/* Sul telefono l'interruttore prende la riga e i filtri diventano
                un tondo da 44 px accanto, come nei Turni. */}
            <StaffSwitch vista="persone" giorno={giorno} className="w-[calc(100%-3.375rem)] md:w-auto md:shrink-0" />

            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className={cn(
                    "flex h-11 w-11 shrink-0 items-center justify-center gap-1.5 rounded-full border text-xs font-medium transition-colors md:h-8 md:w-auto md:px-3",
                    conFiltriAttivi
                      ? "border-accent text-accent-strong"
                      : "border-border/70 text-foreground/90 hover:border-line-40",
                  )}
                >
                  <SlidersHorizontal className="h-[18px] w-[18px] md:h-3.5 md:w-3.5" aria-hidden="true" />
                  <span className="sr-only md:not-sr-only">Filtri</span>
                </button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-[min(300px,calc(100vw-2rem))] p-3 md:w-[260px]">
                <BarraLaterale compatta vista="persone" {...barraProps} />
              </PopoverContent>
            </Popover>

            {canManageStaff && (
              <div className="ml-auto">
                <NewStaffDialog canManageContracts={canManageContracts} />
              </div>
            )}
          </div>

          {staff.length === 0 ? (
            <div className="riquadro tratteggiato fill grid place-content-center p-12 text-center text-sm text-muted-foreground">
              <Users className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
              <p>Nessuna persona in organico.</p>
              <p className="mt-1 text-xs">Aggiungi il personale di sala, di cucina e di bar da «Nuova persona».</p>
            </div>
          ) : gruppi.length === 0 ? (
            <div className="riquadro tratteggiato fill grid place-content-center p-12 text-center text-sm text-muted-foreground">
              <Search className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
              <p>Nessuna persona trovata.</p>
              <p className="mt-1 text-xs">
                {conFiltriAttivi
                  ? `Nessun risultato con questi filtri${
                      filtri.reparto !== "tutti" ? ` in ${staffDepartmentLabel(filtri.reparto)}` : ""
                    }${filtri.stato !== "tutti" ? ` il ${etichettaGiornoBreve(giorno)}` : ""}.`
                  : "Nessuna persona in questo reparto."}
              </p>
            </div>
          ) : (
            // L'elenco del personale scorre dentro di sé: la pagina no.
            <div className="fill-scroll space-y-3 pr-0.5">
              {gruppi.map((gruppo) => {
                const Icon = DEPARTMENT_ICON[gruppo.key];
                return (
                  <section key={gruppo.key} className="riquadro overflow-hidden bg-card-sunken">
                    {/*
                      L'intestazione del reparto sta DENTRO la scheda, non sopra.
                      Prima ogni gruppo era «etichetta + riga divisoria + scheda»:
                      dieci volte, e il risultato erano trenta linee orizzontali di
                      peso simile in cui i gruppi non si distinguevano dalle
                      persone. Una sola scheda per reparto, con la sua testata, dà
                      all'occhio quattro blocchi invece di trenta righe.
                    */}
                    <div className="flex items-center gap-2 border-b border-border/60 bg-veil-5 px-3 py-2">
                      <Icon className="h-3.5 w-3.5 text-accent-strong" />
                      <span className="t-etichetta font-medium">{gruppo.label}</span>
                      <span className="t-etichetta text-muted-foreground">{gruppo.members.length}</span>
                    </div>
                    <div className="divide-y divide-border/50">
                      {gruppo.members.map((p) => (
                        <StaffRow
                          key={p.id}
                          person={p}
                          assignmentSummary={assignmentSummaryByStaffId[p.id] ?? null}
                          mode={mode}
                          rooms={rooms}
                          tables={tables}
                          serviceOptions={serviceOptions}
                          canManageStaff={canManageStaff}
                          avviso={avvisiPerPersona[p.id] ?? null}
                        />
                      ))}
                    </div>
                  </section>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
