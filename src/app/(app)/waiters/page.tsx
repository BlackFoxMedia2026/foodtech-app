import { db } from "@/lib/db";
import { can, getActiveVenue } from "@/lib/tenant";
import { listWaiters } from "@/server/waiters";
import { listRooms } from "@/server/rooms";
import { listAssignmentsForDate, listServiceOptions } from "@/server/waiter-assignments";
import { listStaffAssignmentsForDate } from "@/server/staff-assignments";
import { listAttentionNeededContracts } from "@/server/staff-contracts";
import { formatTableSelectionLabel } from "@/lib/table-range";
import { WaitersPageClient } from "@/components/waiters/waiters-page-client";

export const dynamic = "force-dynamic";

export default async function WaitersPage() {
  const ctx = await getActiveVenue();
  const mode = ctx.venue.serviceAssignmentMode;
  const canManageContracts = can(ctx.role, "manage_contracts");

  const [waiters, rooms, tables, serviceOptions, todayAssignments, assegnazioniTavolo, contractAttention] = await Promise.all([
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
    canManageContracts ? listAttentionNeededContracts(ctx.venueId) : Promise.resolve(new Map()),
  ]);

  const tableLabelById = new Map(tables.map((t) => [t.id, t.label]));

  /*
    Il turno di oggi, raggruppato per servizio.

    La pagina aveva già le assegnazioni, ma le mostrava una per riga dentro un
    elenco ordinato per ruolo: per sapere «chi è in turno stasera e su che
    zona» bisognava leggere tutte le righe e tenere a mente quali avevano
    un'assegnazione. È un elenco amministrativo, e durante il servizio serve
    l'altra domanda.

    Qui si gira: prima il servizio, poi chi c'è, poi quanti tavoli. Chi non ha
    un'assegnazione non compare — non è «zero tavoli», è che stasera non è in
    turno, e sono due cose diverse.
  */
  const nomePerId = new Map(waiters.map((w) => [w.id, w]));
  const perServizio = new Map<
    string,
    { nome: string; ruolo: string; zona: string; tavoli: number }[]
  >();
  for (const a of todayAssignments) {
    const w = nomePerId.get(a.waiterId);
    if (!w) continue;
    const zona =
      a.assignmentMode === "ROOMS"
        ? a.room?.name ?? "Sala"
        : formatTableSelectionLabel(a.tableIds.map((id) => tableLabelById.get(id) ?? id));
    const righe = perServizio.get(a.service) ?? [];
    righe.push({
      nome: `${w.firstName} ${w.lastName ?? ""}`.trim(),
      ruolo: w.role,
      zona,
      tavoli: a.assignmentMode === "ROOMS" ? 0 : a.tableIds.length,
    });
    perServizio.set(a.service, righe);
  }
  /*
    E le assegnazioni fatte dalla piantina, unite alle prime.

    Sono due tabelle diverse per lo stesso fatto — vedi la nota su
    `listStaffAssignmentsForDate` — e finché resteranno due, chi legge il turno
    di oggi deve vedere entrambe: sono tutte assegnazioni fatte dentro il
    prodotto, e mostrarne solo metà farebbe sembrare vuoto un turno pieno.
    Sulla demo era esattamente così: settantasei tavoli assegnati dalla sala, e
    questa pagina non ne mostrava nessuno.
  */
  /*
    Le etichette si raccolgono e si formattano **una volta sola**, con la stessa
    funzione che usa il riepilogo di ogni riga: `formatTableSelectionLabel` fa
    gli intervalli. Concatenandole a mano si leggeva «B1, B2, B3, T1, T11, T13,
    T2, T4, T6, T8» — dieci etichette in ordine alfabetico, dove T11 sta prima
    di T2. Con gli intervalli diventa una cosa che si legge di sfuggita, che è
    il punto di questa fascia.
  */
  const etichettePerPersona = new Map<string, string[]>();
  for (const a of assegnazioniTavolo) {
    const nome = `${a.waiter.firstName} ${a.waiter.lastName ?? ""}`.trim();
    const chiave = `${a.service}|${nome}`;
    const righe = perServizio.get(a.service) ?? [];
    if (!righe.some((r) => r.nome === nome)) {
      righe.push({ nome, ruolo: a.waiter.role, zona: "", tavoli: 0 });
      perServizio.set(a.service, righe);
    }
    const etichette = etichettePerPersona.get(chiave) ?? [];
    if (a.table?.label && !etichette.includes(a.table.label)) etichette.push(a.table.label);
    etichettePerPersona.set(chiave, etichette);
  }
  for (const [chiave, etichette] of etichettePerPersona) {
    const [servizio, nome] = chiave.split("|");
    const riga = perServizio.get(servizio)?.find((r) => r.nome === nome);
    if (!riga) continue;
    riga.zona = riga.zona
      ? `${riga.zona} · ${formatTableSelectionLabel(etichette)}`
      : formatTableSelectionLabel(etichette);
    riga.tavoli = etichette.length;
  }

  const turnoDiOggi = [...perServizio.entries()].map(([servizio, persone]) => ({
    servizio,
    persone: persone.sort((x, y) => x.nome.localeCompare(y.nome)),
  }));
  const summaryByWaiterId = new Map<string, string>();
  for (const a of todayAssignments) {
    const target =
      a.assignmentMode === "ROOMS"
        ? a.room?.name ?? "Sala"
        : formatTableSelectionLabel(a.tableIds.map((id) => tableLabelById.get(id) ?? id));
    const line = `${a.service} · ${target}`;
    const existing = summaryByWaiterId.get(a.waiterId);
    summaryByWaiterId.set(a.waiterId, existing ? `${existing} · ${line}` : line);
  }

  return (
    <WaitersPageClient
      waiters={waiters}
      mode={mode}
      rooms={rooms.map((r) => ({ id: r.id, name: r.name }))}
      tables={tables}
      serviceOptions={serviceOptions}
      canManageContracts={canManageContracts}
      turnoDiOggi={turnoDiOggi}
      assignmentSummaryByWaiterId={Object.fromEntries(summaryByWaiterId)}
      contractAttentionByWaiterId={Object.fromEntries(contractAttention)}
    />
  );
}
