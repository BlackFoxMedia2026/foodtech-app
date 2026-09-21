import { db } from "@/lib/db";
import { telefonoLeggibile } from "@/lib/telefono";
import { richiamateAperte, type Richiamata } from "@/server/voice/richiamate";

/**
 * Le due cose che il telefono chiede di fare, e nient'altro.
 *
 * ## Perché una lettura a parte e non un filtro sullo storico
 *
 * Perché sono domande diverse. Lo storico risponde a «cosa è successo», e lo
 * si guarda una volta al mese. Questa risponde a «cosa devo fare adesso», e la
 * si guarda venti volte in una sera. Metterle nella stessa lista con un
 * filtro sopra vuol dire che la seconda si trova solo premendo — e quello che
 * si trova premendo, in servizio, non si trova.
 *
 * ## Le due liste, e perché non sono una sola
 *
 * - **le richiamate in coda**: qualcuno ha deciso che quella persona va
 *   richiamata. È un impegno preso, con un contatore dei tentativi.
 * - **le chiamate perse che nessuno ha guardato**: nessuno ha ancora deciso
 *   niente. Il gesto da fare è **decidere**: la richiamo, o lascio perdere.
 *
 * Tenerle separate serve a questo: la prima lista si svuota lavorando, la
 * seconda si svuota decidendo. Un elenco unico farebbe sembrare la decisione
 * un lavoro, e allora non la prende nessuno.
 */

/** Da quanto indietro si guardano le perse: oltre, richiamare non ha più senso. */
const FINESTRA_PERSE_ORE = 48;

export type PersaDaGestire = {
  id: string;
  /** Come si legge il numero a voce. Nullo se è arrivato riservato. */
  telefono: string | null;
  quando: Date;
  ospite: {
    id: string;
    nome: string;
    blocked: boolean;
    noShowCount: number;
  } | null;
};

export type CosaDaFareAlTelefono = {
  richiamate: Richiamata[];
  perse: PersaDaGestire[];
  /** Quante cose in tutto. È il numero del bollino in testata. */
  totale: number;
};

export async function cosaDaFareAlTelefono(
  venueId: string,
  adesso: Date = new Date(),
): Promise<CosaDaFareAlTelefono> {
  const da = new Date(adesso.getTime() - FINESTRA_PERSE_ORE * 60 * 60 * 1000);

  const [richiamate, perse] = await Promise.all([
    richiamateAperte(venueId, adesso),
    db.phoneCall.findMany({
      where: {
        venueId,
        status: "MISSED",
        startedAt: { gte: da },
        /* Senza prenotazione e senza richiamata in coda: se una delle due c'è,
           qualcuno se n'è già occupato. Un elenco che continua a chiedere
           attenzione su cose fatte si impara a ignorare — e allora smette di
           servire anche quando ha ragione. */
        bookingId: null,
        callbacks: { none: {} },
      },
      orderBy: { startedAt: "desc" },
      take: 50,
      select: {
        id: true,
        fromNumber: true,
        startedAt: true,
        guest: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            blocked: true,
            noShowCount: true,
          },
        },
      },
    }),
  ]);

  return {
    richiamate,
    perse: perse.map((p) => ({
      id: p.id,
      telefono: telefonoLeggibile(p.fromNumber),
      quando: p.startedAt,
      ospite: p.guest
        ? {
            id: p.guest.id,
            nome: `${p.guest.firstName}${p.guest.lastName ? ` ${p.guest.lastName}` : ""}`,
            blocked: p.guest.blocked,
            noShowCount: p.guest.noShowCount,
          }
        : null,
    })),
    totale: richiamate.length + perse.length,
  };
}
