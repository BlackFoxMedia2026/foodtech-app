import { notFound } from "next/navigation";
import { can, getActiveVenue } from "@/lib/tenant";
import { listWaiters } from "@/server/waiters";
import { daDecidere } from "@/server/staff-richieste";
import { listShiftsForRange } from "@/server/work-shifts";
import { todayInVenue } from "@/lib/venue-time";
import { RichiestePagina } from "@/components/staff/richieste-pagina";

/**
 * Ferie, permessi e cambi turno.
 *
 * Una pagina sua e non un pannello dentro il calendario: il calendario dei
 * turni risponde a «chi lavora sabato», questa a «chi ha chiesto cosa». Sono
 * due domande che si fanno in due momenti diversi — la seconda si fa quando si
 * pianifica, prima di scrivere i turni.
 *
 * Chiede `manage_shifts`, la stessa capacità che serve a spostare un turno:
 * approvare una ferie **è** spostare i turni di quella settimana. A chi non
 * l'ha la pagina risponde «non esiste», non «non hai i permessi» — sono dati
 * del personale, e la loro esistenza non è un'informazione da dare.
 */

export const dynamic = "force-dynamic";

export default async function RichiestePage({ searchParams }: { searchParams: { g?: string } }) {
  const ctx = await getActiveVenue();
  if (!can(ctx.role, "manage_shifts")) notFound();

  // Il giorno della colonna, come in Persone e Turni: passando da una vista
  // all'altra resta quello.
  const oggi = todayInVenue(ctx.venue.timezone);
  const giorno = searchParams.g && /^\d{4}-\d{2}-\d{2}$/.test(searchParams.g) ? searchParams.g : oggi;

  const [richieste, staff, turniDelGiorno] = await Promise.all([
    daDecidere(ctx.venueId),
    listWaiters(ctx.venueId),
    listShiftsForRange(ctx.venueId, giorno, giorno),
  ]);

  return (
    <RichiestePagina
      richieste={richieste.map((r) => ({
        id: r.id,
        tipoNome: r.tipoNome,
        statoNome: r.statoNome,
        dal: r.dal.toISOString(),
        al: r.al.toISOString(),
        motivo: r.motivo,
        persona: r.persona,
      }))}
      staff={staff.map((p) => ({
        id: p.id,
        nome: `${p.firstName}${p.lastName ? ` ${p.lastName}` : ""}`,
        primaryRole: p.primaryRole,
        department: p.department,
      }))}
      giorno={giorno}
      oggi={oggi}
      turniDelGiorno={turniDelGiorno.map((t) => ({ waiterId: t.waiterId, kind: t.kind }))}
      canManageStaff={can(ctx.role, "manage_staff")}
      canManageContracts={can(ctx.role, "manage_contracts")}
    />
  );
}
