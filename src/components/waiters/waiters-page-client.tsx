"use client";

import { useMemo, useState } from "react";
import { Crown, DoorOpen, Footprints, Layers, Martini, Search, Star, UserCog, UserRound, Users, Utensils, Wine } from "lucide-react";
import type { StaffCapability, StaffPrimaryRole } from "@prisma/client";
import { Separator } from "@/components/ui/separator";
import { NewWaiterDialog } from "@/components/waiters/new-waiter-dialog";
import { WaiterRow } from "@/components/waiters/waiter-row";
import { WaiterSearchBar } from "@/components/waiters/waiter-search-bar";
import { groupWaitersByRole, type StaffRoleGroupKey } from "@/lib/staff-role-groups";
import { matchesStaffQuery } from "@/lib/staff-search";

type WaiterListItem = {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  birthday: Date;
  role: string;
  primaryRole: StaffPrimaryRole | null;
  capabilities: StaffCapability[];
  status: "ACTIVE" | "RESTING";
  photoUrl: string | null;
};

const GROUP_ICON: Record<StaffRoleGroupKey, React.ComponentType<{ className?: string }>> = {
  manager: Crown,
  maitre: Star,
  waiters: UserRound,
  sommelier: Wine,
  bar: Martini,
  runner: Footprints,
  commis: Utensils,
  busser: Layers,
  host: DoorOpen,
  other: Users,
};

export function WaitersPageClient({
  waiters,
  mode,
  rooms,
  tables,
  serviceOptions,
  canManageContracts,
  turnoDiOggi,
  assignmentSummaryByWaiterId,
  contractAttentionByWaiterId,
}: {
  waiters: WaiterListItem[];
  mode: "ROOMS" | "TABLES";
  rooms: { id: string; name: string }[];
  tables: { id: string; label: string; seats: number }[];
  serviceOptions: string[];
  canManageContracts: boolean;
  /**
   * Chi è in turno oggi, per servizio. Vuoto quando nessuno è assegnato — e in
   * quel caso la fascia non compare: «nessuno in turno» a metà pomeriggio è
   * normale, e una riga che lo dice ogni giorno insegna a non leggerla.
   */
  turnoDiOggi: { servizio: string; persone: { nome: string; ruolo: string; zona: string; tavoli: number }[] }[];
  assignmentSummaryByWaiterId: Record<string, string>;
  contractAttentionByWaiterId: Record<string, { status: "EXPIRING_SOON" | "EXPIRED"; detail: string }>;
}) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    if (!query.trim()) return waiters;
    return waiters.filter((w) => matchesStaffQuery(w, query));
  }, [waiters, query]);

  const groups = useMemo(() => groupWaitersByRole(filtered), [filtered]);

  return (
    <div className="schermo animate-fade-in gap-3">
      <header className="fissa flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-baseline gap-2">
          <h1 className="text-lg font-semibold leading-none">Camerieri</h1>
          <p className="t-etichetta">Sala</p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2 max-sm:w-full">
          <WaiterSearchBar query={query} onQueryChange={setQuery} />
          <NewWaiterDialog canManageContracts={canManageContracts} />
        </div>
      </header>

      {/*
        Il turno di oggi, in cima.

        Questa pagina era un elenco amministrativo: nomi raggruppati per ruolo,
        con l'assegnazione scritta dentro ogni riga. Per sapere «chi è in turno
        stasera e su che zona» bisognava leggere tutte le righe e tenere a
        mente quali ce l'avevano.

        Qui la domanda è girata: prima il servizio, poi chi c'è, poi quanti
        tavoli. Chi non è assegnato non compare — non è «zero tavoli», è che
        stasera non è in turno.

        Compare solo se qualcuno è assegnato: «nessuno in turno» a metà
        pomeriggio è normale, e una riga che lo dice ogni giorno insegna a non
        leggerla.
      */}
      {turnoDiOggi.length > 0 && (
        <section className="fissa riquadro denso space-y-2" aria-label="Il turno di oggi">
          <p className="t-etichetta">Il turno di oggi</p>
          {turnoDiOggi.map(({ servizio, persone }) => (
            <div key={servizio} className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="t-titolo-scheda min-w-[4.5rem]">{servizio}</span>
              {persone.map((p) => (
                <span key={`${servizio}-${p.nome}`} className="t-corpo text-muted-foreground">
                  <strong className="font-medium text-foreground">{p.nome}</strong>
                  <span className="t-nota"> {p.ruolo}</span> · {p.zona}
                  {p.tavoli > 0 && (
                    <span className="t-nota">
                      {" "}
                      ({p.tavoli} {p.tavoli === 1 ? "tavolo" : "tavoli"})
                    </span>
                  )}
                </span>
              ))}
            </div>
          ))}
        </section>
      )}

      {waiters.length === 0 ? (
        <div className="rounded-md border border-dashed p-12 text-center text-sm text-muted-foreground">
          <UserCog className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
          Nessun cameriere registrato ancora.
        </div>
      ) : groups.length === 0 ? (
        <div className="rounded-md border border-dashed p-12 text-center text-sm text-muted-foreground">
          <Search className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
          <p>Nessun membro del personale trovato.</p>
          <p className="mt-1 text-xs">Prova con un altro nome o ruolo.</p>
        </div>
      ) : (
        // L'elenco del personale scorre dentro di sé: la pagina no.
        <div className="fill-scroll space-y-4 pr-0.5">
          {groups.map((group) => {
            const Icon = GROUP_ICON[group.key];
            return (
              <section key={group.key} className="space-y-2">
                <div className="flex items-center gap-2 t-etichetta font-medium">
                  <Icon className="h-3.5 w-3.5" />
                  {group.label}
                  <span className="text-muted-foreground">· {group.members.length}</span>
                </div>
                <Separator />
                <div className="divide-y divide-border riquadro bg-card">
                  {group.members.map((w) => (
                    <WaiterRow
                      key={w.id}
                      waiter={w}
                      assignmentSummary={assignmentSummaryByWaiterId[w.id] ?? null}
                      mode={mode}
                      rooms={rooms}
                      tables={tables}
                      serviceOptions={serviceOptions}
                      canManageContracts={canManageContracts}
                      contractAttention={contractAttentionByWaiterId[w.id] ?? null}
                    />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
