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
  assignmentSummaryByWaiterId,
  contractAttentionByWaiterId,
}: {
  waiters: WaiterListItem[];
  mode: "ROOMS" | "TABLES";
  rooms: { id: string; name: string }[];
  tables: { id: string; label: string; seats: number }[];
  serviceOptions: string[];
  canManageContracts: boolean;
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
    <div className="space-y-6 animate-fade-in">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-widest text-muted-foreground">Sala</p>
          <h1 className="text-display text-3xl">Camerieri</h1>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2 max-sm:w-full">
          <WaiterSearchBar query={query} onQueryChange={setQuery} />
          <NewWaiterDialog canManageContracts={canManageContracts} />
        </div>
      </header>

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
        <div className="space-y-6">
          {groups.map((group) => {
            const Icon = GROUP_ICON[group.key];
            return (
              <section key={group.key} className="space-y-2">
                <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-widest text-muted-foreground">
                  <Icon className="h-3.5 w-3.5" />
                  {group.label}
                  <span className="text-muted-foreground/70">· {group.members.length}</span>
                </div>
                <Separator />
                <div className="divide-y divide-border rounded-md border border-border bg-card">
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
