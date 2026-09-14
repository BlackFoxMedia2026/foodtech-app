import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { can, getActiveVenue } from "@/lib/tenant";
import { listWaiters } from "@/server/waiters";
import { listRooms } from "@/server/rooms";
import { listAssignmentsForDate, listServiceOptions } from "@/server/waiter-assignments";
import { listStaffAssignmentsForDate } from "@/server/staff-assignments";
import { avvisiScadenzePerPersona } from "@/server/staff-scadenze";
import { listShiftsForRange } from "@/server/work-shifts";
import { todayInVenue } from "@/lib/venue-time";
import { formatTableSelectionLabel } from "@/lib/table-range";
import { StaffPageClient } from "@/components/staff/staff-page-client";

export const dynamic = "force-dynamic";

export default async function StaffPage({ searchParams }: { searchParams: { g?: string; waiterId?: string } }) {
  const ctx = await getActiveVenue();

  /*
    Il vecchio link profondo. Le notifiche di contratto in scadenza già nel
    database mandano a `/staff?waiterId=…`, che apriva la scheda in una
    modale. La scheda adesso è una pagina: si va lì.
  */
  if (searchParams.waiterId) redirect(`/staff/${encodeURIComponent(searchParams.waiterId)}`);

  /*
    Il giorno scelto viaggia nell'indirizzo, come nella vista Turni.

    Serve al mini-calendario della colonna e al filtro «stato», che qui vuol
    dire «chi lavora **quel** giorno»: senza un giorno, «In turno» non
    significherebbe niente. Passando da qui ai Turni e ritorno il giorno resta
    quello, perché l'interruttore se lo porta dietro.
  */
  const oggi = todayInVenue(ctx.venue.timezone);
  const giorno = searchParams.g && /^\d{4}-\d{2}-\d{2}$/.test(searchParams.g) ? searchParams.g : oggi;
  const mode = ctx.venue.serviceAssignmentMode;
  const canManageStaff = can(ctx.role, "manage_staff");
  const canManageContracts = can(ctx.role, "manage_contracts");

  const [waiters, rooms, tables, serviceOptions, todayAssignments, assegnazioniTavolo, avvisi, turniDelGiorno] = await Promise.all([
    listWaiters(ctx.venueId),
    listRooms(ctx.venueId),
    db.table.findMany({
      where: { venueId: ctx.venueId, active: true },
      orderBy: { label: "asc" },
      select: { id: true, label: true, seats: true },
    }),
    listServiceOptions(ctx.venueId),
    listAssignmentsForDate(ctx.venueId, new Date()),
    // Le assegnazioni fatte dalla piantina: un'altra tabella per lo stesso
    // fatto. Vedi la nota su `listStaffAssignmentsForDate`.
    listStaffAssignmentsForDate(ctx.venueId, new Date()),
    // Le scadenze della scheda — contratto, visita medica, corsi, documenti —
    // alimentano la card: una riga sola per persona, solo se serve.
    canManageStaff ? avvisiScadenzePerPersona(ctx.venueId) : Promise.resolve(new Map()),
    listShiftsForRange(ctx.venueId, giorno, giorno),
  ]);

  const tableLabelById = new Map(tables.map((t) => [t.id, t.label]));

  /*
    La fascia «il turno di oggi» non c'è più, e con lei il suo conto.

    Raggruppava le assegnazioni per servizio in cima all'elenco, e diceva una
    cosa che adesso dice meglio la colonna di sinistra: chi c'è, quel giorno.
    Le due interrogazioni sulle assegnazioni restano, perché servono al
    riepilogo che compare **nella riga di ogni persona** — che è la stessa
    informazione dove serve davvero, accanto al nome di cui parla.
  */
  /*
    Il riepilogo che compare nella riga di ogni persona.

    Legge **tutte e due** le tabelle delle assegnazioni, e non è un dettaglio:
    prima leggeva solo `WaiterAssignment`, quindi una persona assegnata dalla
    piantina compariva nella fascia «il turno di oggi» in cima con dieci tavoli
    accanto al nome, e tre centimetri più sotto, nella sua riga, «Nessuna
    assegnazione». Due affermazioni opposte sullo stesso schermo — e quella
    sbagliata era la riga, che è anche quella da cui si decide se assegnare
    qualcuno.

    Le due tabelle restano due (vedi la nota su `listStaffAssignmentsForDate`);
    finché è così, chi legge le vede unite.
  */
  const summaryByWaiterId = new Map<string, string[]>();
  function aggiungiRiepilogo(waiterId: string, riga: string) {
    const righe = summaryByWaiterId.get(waiterId) ?? [];
    if (!righe.includes(riga)) righe.push(riga);
    summaryByWaiterId.set(waiterId, righe);
  }

  for (const a of todayAssignments) {
    const target =
      a.assignmentMode === "ROOMS"
        ? a.room?.name ?? "Sala"
        : formatTableSelectionLabel(a.tableIds.map((id) => tableLabelById.get(id) ?? id));
    aggiungiRiepilogo(a.waiterId, `${a.service} · ${target}`);
  }

  // Le etichette dei tavoli si raccolgono per persona+servizio e si formattano
  // una volta sola, con la stessa funzione degli intervalli usata sopra.
  const tavoliPerPersonaServizio = new Map<string, string[]>();
  for (const a of assegnazioniTavolo) {
    if (!a.table?.label) continue;
    const chiave = `${a.waiterId}|${a.service}`;
    const etichette = tavoliPerPersonaServizio.get(chiave) ?? [];
    if (!etichette.includes(a.table.label)) etichette.push(a.table.label);
    tavoliPerPersonaServizio.set(chiave, etichette);
  }
  for (const [chiave, etichette] of tavoliPerPersonaServizio) {
    const [waiterId, servizio] = chiave.split("|");
    aggiungiRiepilogo(waiterId, `${servizio} · ${formatTableSelectionLabel(etichette)}`);
  }

  const riepilogoPerPersona = Object.fromEntries(
    [...summaryByWaiterId].map(([id, righe]) => [id, righe.join(" · ")]),
  );

  return (
    <StaffPageClient
      staff={waiters}
      mode={mode}
      rooms={rooms.map((r) => ({ id: r.id, name: r.name }))}
      tables={tables}
      serviceOptions={serviceOptions}
      canManageStaff={canManageStaff}
      canManageContracts={canManageContracts}
      assignmentSummaryByStaffId={riepilogoPerPersona}
      avvisiPerPersona={Object.fromEntries(avvisi)}
      giorno={giorno}
      oggi={oggi}
      turniDelGiorno={turniDelGiorno.map((t) => ({ waiterId: t.waiterId, kind: t.kind }))}
    />
  );
}
