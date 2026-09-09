import { can, getActiveVenue } from "@/lib/tenant";
import { listRooms } from "@/server/rooms";
import {
  confrontaPerPrecedenza,
  expireStaleOffers,
  listWaitlist,
  tavoliSuggeritiPerLaCoda,
  waitlistSummary,
} from "@/server/waitlist";
import { WaitlistPageClient } from "@/components/waitlist/waitlist-page-client";

export const dynamic = "force-dynamic";

export default async function WaitlistPage() {
  const ctx = await getActiveVenue();

  // Chiudere le offerte scadute prima di leggere: una coda che mostra come
  // "avvisate" persone andate altrove mezz'ora fa è peggio di una coda vuota.
  await expireStaleOffers(ctx.venueId);

  const [entries, summary, rooms] = await Promise.all([
    listWaitlist(ctx.venueId),
    waitlistSummary(ctx.venueId),
    listRooms(ctx.venueId),
  ]);

  /*
    Il tavolo da proporre, calcolato **dopo** la coda perché serve la coda.
    Una verifica di disponibilità per riga, non una per tavolo: vedi la nota su
    `tavoliSuggeritiPerLaCoda`.
  */
  const suggeriti = await tavoliSuggeritiPerLaCoda(ctx.venueId, entries);

  /*
    Chi tocca, quando non tocca al primo della fila.

    La lista resta in ordine di arrivo — è una coda, e il numero accanto al
    nome è la posizione — ma la precedenza sul primo tavolo che si libera non
    sempre coincide: chi ha aspettato molto oltre quello che gli abbiamo
    promesso passa avanti (`confrontaPerPrecedenza`, §26). Senza dirlo, quella
    decisione resterebbe invisibile e chi è in sala continuerebbe a offrire il
    tavolo al numero 1.

    Si segnala **solo quando i due ordini non coincidono**: un cartellino
    «tocca a lei» sul primo della fila non dice niente.
  */
  const inFila = entries.filter((e) => e.status === "WAITING" && !e.dimenticata);
  const perPrecedenza = [...inFila].sort(confrontaPerPrecedenza());
  const tocca =
    perPrecedenza.length > 1 && perPrecedenza[0].id !== inFila[0]?.id ? perPrecedenza[0].id : null;

  return (
    <WaitlistPageClient
      entries={entries.map((e) => ({
        id: e.id,
        guestName: e.guestName,
        phone: e.phone,
        partySize: e.partySize,
        status: e.status,
        notes: e.notes,
        waitingMin: e.waitingMin,
        overdue: e.overdue,
        ritardoSullaPromessa: e.ritardoSullaPromessa,
        expectedWaitMin: e.expectedWaitMin,
        desiredAt: e.desiredAt?.toISOString() ?? null,
        offerExpiresAt: e.offerExpiresAt?.toISOString() ?? null,
        isVip: e.isVip,
        allergies: e.guest?.allergies ?? null,
        preferredRoomName: e.preferredRoom?.name ?? null,
        tocca: e.id === tocca,
      }))}
      suggeriti={suggeriti}
      summary={summary}
      rooms={rooms.map((r) => ({ id: r.id, name: r.name }))}
      canManage={can(ctx.role, "manage_bookings")}
    />
  );
}
