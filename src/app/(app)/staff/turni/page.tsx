import { can, getActiveVenue } from "@/lib/tenant";
import { listWaiters } from "@/server/waiters";
import { listServiceOptions } from "@/server/waiter-assignments";
import { listShiftsForRange } from "@/server/work-shifts";
import { giorniDellaSettimana, grigliaMese, lunediDi } from "@/lib/turni";
import { todayInVenue } from "@/lib/venue-time";
import { CalendarioTurni } from "@/components/staff/calendario/calendario-turni";
import type { Vista } from "@/components/staff/calendario/tipi";

export const dynamic = "force-dynamic";

const VISTE: Vista[] = ["giorno", "settimana", "mese"];

function giornoValido(valore: string | undefined): string | null {
  return valore && /^\d{4}-\d{2}-\d{2}$/.test(valore) ? valore : null;
}

export default async function TurniPage({
  searchParams,
}: {
  searchParams: { g?: string; vista?: string; dal?: string; giorno?: string };
}) {
  const ctx = await getActiveVenue();
  const canManageShifts = can(ctx.role, "manage_shifts");

  // «Oggi» è il giorno del locale, non quello del server: fra mezzanotte e le
  // due, in Italia, UTC è ancora ieri — e questa è proprio l'ora in cui si
  // chiude il servizio e si guarda la settimana.
  const oggi = todayInVenue(ctx.venue.timezone);

  const vista: Vista = VISTE.includes(searchParams.vista as Vista) ? (searchParams.vista as Vista) : "settimana";

  /*
    Il giorno scelto, e i due parametri vecchi che continuano a funzionare.

    `?dal=` e `?giorno=` erano l'indirizzo della tabella, e ci sono link in
    giro — nelle chat di chi lavora, non nel codice. Rispondere a un vecchio
    indirizzo con la settimana corrente invece che con quella chiesta sarebbe
    un errore silenzioso, quindi si accettano entrambi e si preferisce il
    nuovo.
  */
  const giornoSelezionato =
    giornoValido(searchParams.g) ?? giornoValido(searchParams.giorno) ?? giornoValido(searchParams.dal) ?? oggi;

  const giorni =
    vista === "giorno"
      ? [giornoSelezionato]
      : vista === "settimana"
        ? giorniDellaSettimana(lunediDi(giornoSelezionato))
        : grigliaMese(giornoSelezionato);

  const [staff, turni, serviceOptions] = await Promise.all([
    listWaiters(ctx.venueId),
    listShiftsForRange(ctx.venueId, giorni[0], giorni[giorni.length - 1]),
    listServiceOptions(ctx.venueId),
  ]);

  return (
    /*
      `key` sul periodo, e non è decorazione.

      Dentro il calendario vive dello stato che si inizializza una volta — il
      mese del mini-calendario, la fascia «tutto il giorno» espansa. React non
      rimonta un componente che resta lo stesso, quindi senza chiave un salto
      di settimana lascerebbe quello stato appeso a un periodo che non è più
      sullo schermo.
    */
    <CalendarioTurni
      key={`${vista}:${giorni[0]}`}
      vista={vista}
      giornoSelezionato={giornoSelezionato}
      oggi={oggi}
      giorni={giorni}
      staff={staff.map((p) => ({
        id: p.id,
        firstName: p.firstName,
        lastName: p.lastName,
        primaryRole: p.primaryRole,
        department: p.department,
        photoUrl: p.photoUrl,
      }))}
      turni={turni}
      serviceOptions={serviceOptions}
      canManageShifts={canManageShifts}
    />
  );
}
