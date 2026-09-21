import { notFound } from "next/navigation";
import { can, getActiveVenue } from "@/lib/tenant";
import { listWaiters } from "@/server/waiters";
import { daDecidere } from "@/server/staff-richieste";
import { RichiestePersonale } from "@/components/staff/richieste-personale";
import { StaffSwitch } from "@/components/staff/staff-switch";

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

export default async function RichiestePage() {
  const ctx = await getActiveVenue();
  if (!can(ctx.role, "manage_shifts")) notFound();

  const [richieste, staff] = await Promise.all([
    daDecidere(ctx.venueId),
    listWaiters(ctx.venueId),
  ]);

  return (
    <div className="schermo animate-fade-in mx-auto w-full max-w-3xl gap-4">
      <div className="fissa">
        <StaffSwitch vista="richieste" />
      </div>

      <div className="fill-scroll pr-0.5">
        <RichiestePersonale
          richieste={richieste.map((r) => ({
            id: r.id,
            tipoNome: r.tipoNome,
            statoNome: r.statoNome,
            dal: r.dal.toISOString(),
            al: r.al.toISOString(),
            motivo: r.motivo,
            persona: r.persona,
          }))}
          persone={staff.map((p) => ({
            id: p.id,
            nome: `${p.firstName}${p.lastName ? ` ${p.lastName}` : ""}`,
          }))}
          canManage
        />
      </div>
    </div>
  );
}
