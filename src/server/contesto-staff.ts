import { cache } from "react";
import type { StaffDepartment, StaffPrimaryRole, StaffRole, WaiterStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { resolveActiveVenue } from "@/lib/tenant";
import { staffDepartmentOf } from "@/lib/staff-roles";
import {
  permessiStaff,
  profiloStaff,
  staffAppEHome,
  type PermessoStaff,
  type ProfiloStaff,
} from "@/lib/permessi-staff";

/**
 * **Chi sta guardando questo schermo, durante il servizio.**
 *
 * Il back office risponde «un account con un ruolo su un locale»
 * (`resolveActiveVenue`). Alla Staff App non basta: lì serve sapere **chi è
 * la persona**, perché tutto quello che si mostra è suo — i suoi turni, i suoi
 * tavoli, le sue comande, i suoi documenti.
 *
 * Il ponte è `Waiter.userId`, che esiste già. Chi ha un account ma nessuna
 * anagrafica collegata non ha una Staff App: non è un errore da nascondere,
 * è un dato mancante che qualcuno deve compilare, e va detto.
 *
 * ## Una lettura sola per richiesta
 *
 * `cache()` di React, come `resolveActiveVenue`: una pagina della Staff App
 * tocca il contesto in cinque punti (guscio, navigazione, testata, elenco
 * tavoli, comande) e deve costare una interrogazione, non cinque.
 */

export type PersonaStaff = {
  waiterId: string;
  nome: string;
  cognome: string;
  nomeCompleto: string;
  primaryRole: StaffPrimaryRole | null;
  department: StaffDepartment;
  photoUrl: string | null;
  status: WaiterStatus;
};

export type ContestoStaff = {
  userId: string;
  /** L'email dell'account: serve solo al registro delle azioni. */
  email: string | null;
  /** L'organizzazione del locale, per la stessa ragione. */
  orgId: string;
  venueId: string;
  venueName: string;
  timezone: string;
  currency: string;
  /** Il ruolo d'accesso del back office: serve a capire i tetti e i rimandi. */
  accesso: StaffRole;
  persona: PersonaStaff;
  permessi: PermessoStaff[];
  profilo: ProfiloStaff;
  /** Vero se per questa persona la Staff App è l'ambiente di casa (§48). */
  staffAppEHome: boolean;
};

export type EsitoContestoStaff =
  | { stato: "ok"; contesto: ContestoStaff }
  | { stato: "senza_sessione" }
  | { stato: "senza_locale" }
  /** Ha un account, ma nessuna anagrafica collegata in questo locale. */
  | { stato: "senza_anagrafica"; userId: string; venueId: string }
  /** L'anagrafica c'è ma la persona non è in servizio (ferie, malattia). */
  | { stato: "non_attivo"; persona: PersonaStaff };

/**
 * Gli stati in cui una persona **non entra** nella Staff App.
 *
 * Non è una punizione ed è reversibile in un tap dalla scheda: è che una
 * comanda battuta da chi risulta in ferie è una comanda che a fine serata
 * nessuno sa spiegare. `UNAVAILABLE` resta fuori per lo stesso motivo.
 *
 * `RESTING` invece entra: «riposo» è lo stato di chi oggi non è in turno, e
 * capita tutte le settimane a chi poi viene chiamato a coprire.
 */
const FUORI_SERVIZIO: WaiterStatus[] = ["VACATION", "SICK_LEAVE", "UNAVAILABLE"];

function personaDa(w: {
  id: string;
  firstName: string;
  lastName: string;
  primaryRole: StaffPrimaryRole | null;
  department: StaffDepartment | null;
  photoUrl: string | null;
  status: WaiterStatus;
}): PersonaStaff {
  return {
    waiterId: w.id,
    nome: w.firstName,
    cognome: w.lastName,
    nomeCompleto: `${w.firstName} ${w.lastName}`.trim(),
    primaryRole: w.primaryRole,
    department: staffDepartmentOf(w),
    photoUrl: w.photoUrl,
    status: w.status,
  };
}

export const risolviContestoStaff = cache(async function risolviContestoStaff(): Promise<EsitoContestoStaff> {
  const attivo = await resolveActiveVenue();
  if (attivo.state === "unauthenticated") return { stato: "senza_sessione" };
  if (attivo.state === "no_venue") return { stato: "senza_locale" };

  const { userId, venueId, venue, role, orgId, session } = attivo.context;

  const persona = await db.waiter.findFirst({
    where: { venueId, userId },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      primaryRole: true,
      department: true,
      photoUrl: true,
      status: true,
    },
  });

  if (!persona) return { stato: "senza_anagrafica", userId, venueId };

  const p = personaDa(persona);
  if (FUORI_SERVIZIO.includes(p.status)) return { stato: "non_attivo", persona: p };

  return {
    stato: "ok",
    contesto: {
      userId,
      email: session.user?.email ?? null,
      orgId,
      venueId,
      venueName: venue.name,
      timezone: venue.timezone,
      currency: venue.currency,
      accesso: role,
      persona: p,
      permessi: permessiStaff({ primaryRole: p.primaryRole, accesso: role }),
      profilo: profiloStaff({ primaryRole: p.primaryRole }),
      staffAppEHome: staffAppEHome(role),
    },
  };
});
