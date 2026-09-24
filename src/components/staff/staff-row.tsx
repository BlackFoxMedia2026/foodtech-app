"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, MoreHorizontal } from "lucide-react";
import type { StaffCapability, StaffDepartment, StaffPrimaryRole, WaiterStatus } from "@prisma/client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { isAssignable, staffStatusLabel, staffStatusTone } from "@/lib/staff-status";
import { staffPrimaryRoleLabel } from "@/lib/staff-roles";
import { cn, initials } from "@/lib/utils";
import { AssignServiceDialog } from "./assign-service-dialog";
import { StaffStatusSelect } from "./staff-status-select";

type Mode = "ROOMS" | "TABLES";

export type StaffRowPerson = {
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

/**
 * Una persona, in una riga.
 *
 * La riga di prima metteva tutto sullo stesso piano: nome e ruolo a sinistra,
 * poi tre controlli a destra — una pillola «A riposo», un bottone «Metti a
 * riposo» e un bottone «Assegna servizio», tutti della stessa dimensione e
 * tutti sempre presenti. Con venti persone erano sessanta bottoni identici, e
 * l'informazione che conta davvero (chi è questa persona, sta lavorando) era
 * la parte meno visibile.
 *
 * Qui l'ordine è quello con cui si legge: **chi**, **che ruolo**, **cosa fa
 * oggi**, **come sta**, e solo in fondo le azioni. Le azioni rare
 * (assegnazione) scendono nel menu contestuale; resta fuori lo stato, che è
 * l'unica cosa che si cambia tutti i giorni.
 */
export function StaffRow({
  person,
  assignmentSummary,
  mode,
  rooms,
  tables,
  serviceOptions,
  canManageStaff = false,
  avviso = null,
}: {
  person: StaffRowPerson;
  assignmentSummary: string | null;
  mode: Mode;
  rooms: { id: string; name: string }[];
  tables: { id: string; label: string; seats: number }[];
  serviceOptions: string[];
  canManageStaff?: boolean;
  /**
   * L'unica scadenza da scrivere sulla card: «HACCP scaduto», «Visita medica
   * tra 15 giorni». Una sola, e solo se scaduta o vicina — vedi
   * `avvisiScadenzePerPersona`. La card deve restare pulita.
   */
  avviso?: { stato: "scaduto" | "in_scadenza"; testo: string } | null;
}) {
  const router = useRouter();
  const [assignOpen, setAssignOpen] = useState(false);
  const scheda = `/staff/${person.id}`;
  const fullName = `${person.firstName} ${person.lastName}`;
  const available = isAssignable(person.status);
  const roleLabel = person.primaryRole ? staffPrimaryRoleLabel(person.primaryRole) : person.role;
  /* Le capability contano solo per chi può coprire un tavolo: un sous-chef non
     ne ha, e mostrargli una riga vuota dove gli altri hanno «Assegna servizio»
     lo farebbe sembrare un profilo incompleto invece che una persona di un
     altro reparto. */
  const assignable = person.capabilities.length > 0;

  return (
    <div
      className={cn(
        "group grid grid-cols-[auto_1fr_auto] items-center gap-x-3 gap-y-2 px-3 py-2.5 transition-colors sm:grid-cols-[auto_minmax(0,1fr)_minmax(0,14rem)_auto_auto]",
        "hover:bg-veil-4",
        !available && "opacity-70",
      )}
    >
      {/* Chi. La scheda è una pagina (`/staff/<id>`), non più una modale:
          ha un indirizzo, si apre in un'altra linguetta, e ha lo spazio per
          documenti, corsi, visita medica, account e storico. */}
      <Link
        href={scheda}
        className="col-start-1 row-start-1 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label={`Apri la scheda di ${fullName}`}
      >
        <Avatar className="h-9 w-9">
          {person.photoUrl && <AvatarImage src={person.photoUrl} alt="" />}
          <AvatarFallback>{initials(fullName)}</AvatarFallback>
        </Avatar>
      </Link>

      <div className="col-start-2 row-start-1 min-w-0">
        <Link href={scheda} className="block max-w-full truncate text-left">
          <span className="text-sm font-medium text-card-foreground underline-offset-2 hover:underline">
            {fullName}
          </span>
        </Link>
        <p className="truncate text-xs text-muted-foreground">{roleLabel}</p>
      </div>

      {/*
        Cosa fa oggi. È la colonna che prima non esisteva: l'assegnazione stava
        scritta dentro l'etichetta di un bottone («Modifica assegnazione»), e
        per sapere dove fosse assegnato qualcuno bisognava aprire il dialogo.
      */}
      <div className="col-span-2 col-start-2 row-start-2 min-w-0 sm:col-span-1 sm:col-start-3 sm:row-start-1">
        {/*
          «Nessuna assegnazione» si scrive solo a chi un'assegnazione potrebbe
          averla. Su un executive chef sarebbe una mancanza che non esiste —
          le assegnazioni sono i tavoli della sala — e ripetuta su tutta la
          brigata farebbe sembrare mezza pagina incompleta.
        */}
        {assignmentSummary ? (
          <p className="truncate text-xs text-ink/70" title={assignmentSummary}>
            {assignmentSummary}
          </p>
        ) : assignable && available ? (
          /* Senza il `/60`: `muted-foreground` è già il grigio del secondo
             piano, e smorzarlo di un altro 40% lo portava a 3.64:1 sul fondo
             reso, sotto la soglia. «Nessuna assegnazione» è l'unica cosa
             scritta su quella riga: se non si legge, la riga non dice niente. */
          <p className="text-xs text-muted-foreground">Nessuna assegnazione</p>
        ) : null}
        {avviso && (
          <Link href={`${scheda}`} className="mt-1 inline-block">
            <Badge tone={avviso.stato === "scaduto" ? "danger" : "warning"} className="gap-1">
              <AlertTriangle className="h-3 w-3" aria-hidden="true" />
              {avviso.testo}
            </Badge>
          </Link>
        )}
      </div>

      {/* Come sta */}
      <div className="col-start-3 row-start-1 flex items-center justify-end gap-2 sm:col-start-4">
        {canManageStaff ? (
          <StaffStatusSelect waiterId={person.id} status={person.status} />
        ) : (
          <Badge tone={staffStatusTone(person.status)}>{staffStatusLabel(person.status)}</Badge>
        )}
      </div>

      {/* Le azioni, in fondo e sotto un menu */}
      <div className="col-start-3 row-start-1 flex justify-end sm:col-start-5">
        {canManageStaff ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0 opacity-60 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                aria-label={`Altre azioni per ${fullName}`}
              >
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem onSelect={() => router.push(scheda)}>Apri la scheda</DropdownMenuItem>
              {assignable && (
                <DropdownMenuItem disabled={!available} onSelect={() => setAssignOpen(true)}>
                  {assignmentSummary ? "Modifica assegnazione" : "Assegna servizio"}
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <span className="block h-8 w-8" aria-hidden="true" />
        )}
        {assignable && (
          <AssignServiceDialog
            waiter={person}
            mode={mode}
            rooms={rooms}
            tables={tables}
            serviceOptions={serviceOptions}
            triggerLabel={assignmentSummary ? "Modifica assegnazione" : "Assegna servizio"}
            disabled={!available}
            open={assignOpen}
            onOpenChange={setAssignOpen}
          />
        )}
      </div>
    </div>
  );
}
