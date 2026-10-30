import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, apiErrorResponse } from "@/lib/api-auth";
import { createBooking } from "@/server/bookings";
import { AvailabilityError } from "@/server/availability";
import { bookingWriteErrorResponse } from "@/server/booking-errors";
import {
  eScontroDiChiave,
  giaFattaConQuestaChiave,
} from "@/server/widget-defenses";
import { consumaRipresa, leggiRipresa } from "@/server/voice/recupero-link";

/**
 * Chi ha riattaccato a metà finisce la prenotazione da qui.
 *
 * Pubblica per necessità — chi apre il link non ha un accesso a Tavolo — e la
 * prova è il **token**, che vale una volta e scade.
 *
 * ## Perché non passa dal modulo pubblico normale
 *
 * Perché quello pretende un'email, e di chi ha telefonato abbiamo il
 * **numero**. Chiedere un indirizzo a chi ha già detto tutto a voce è il modo
 * più veloce di perdere la prenotazione una seconda volta.
 *
 * ## Quello che il token decide, e quello che decide il server
 *
 * Dal token vengono il locale e il numero di telefono: **non** si accettano
 * dal corpo della richiesta, o chiunque avesse un link potrebbe scrivere
 * prenotazioni su un altro locale, o intestarle a un numero che non è il suo.
 * Dal corpo arrivano solo le cose che la persona può cambiare: giorno, ora,
 * persone, nome, una nota.
 */

export const dynamic = "force-dynamic";

const Corpo = z.object({
  token: z.string().regex(/^[a-f0-9]{64}$/),
  nome: z.string().trim().min(1).max(80),
  cognome: z.string().trim().max(80).optional(),
  startsAt: z.string().datetime(),
  persone: z.coerce.number().int().min(1).max(50),
  note: z.string().trim().max(500).optional(),
});

export async function POST(req: Request) {
  try {
    const corpo = Corpo.parse(await req.json());

    const ripresa = await leggiRipresa(corpo.token);
    if (!ripresa) {
      return apiError(
        410,
        "link_non_valido",
        "Questo link non è più valido: può essere scaduto o già usato. Chiama il ristorante, è la strada più breve.",
      );
    }

    const chiave = `riprendi-${corpo.token}`;
    let booking: {
      id: string;
      reference: string | null;
      startsAt: Date;
      partySize: number;
    };
    try {
      booking = await createBooking(
        ripresa.venueId,
        {
          guest: {
            firstName: corpo.nome,
            lastName: corpo.cognome || null,
            /* Il numero viene dal token, non dal corpo: è quello da cui la
             telefonata è arrivata, ed è anche il modo in cui questa persona
             si ritrova nel CRM senza diventare un doppione. */
            phone: ripresa.numero,
          },
          partySize: corpo.persone,
          startsAt: corpo.startsAt,
          notes: corpo.note || null,
        },
        {
          /* `VOICE`, imposta da qui: la prenotazione **nasce da una
           telefonata**, e resta da confermare come quelle del risponditore.
           Chi l'ha completata da sé sul modulo non cambia da dove viene. */
          source: "VOICE",
          /* Il canale pubblico: chi prenota è il cliente, e valgono le regole
           che il locale ha dichiarato per il pubblico. */
          canale: "pubblico",
          /* La chiave del tentativo è il token: due invii dello stesso modulo —
           un doppio tocco, una rete lenta — non possono diventare due
           prenotazioni. */
          idempotencyKey: chiave,
        },
      );
    } catch (err) {
      /* Due invii insieme dello stesso modulo: fra la lettura del token e la
         scrittura non si vedono, e l'unicità la garantisce l'indice sulla
         chiave. Il secondo perde, e perdere qui vuol dire «la prenotazione
         c'è già» — la stessa lettura del modulo pubblico, non un 500. */
      if (!eScontroDiChiave(err)) throw err;
      const esistente = await giaFattaConQuestaChiave(ripresa.venueId, chiave);
      if (!esistente) throw err;
      booking = esistente;
    }

    /* Si consuma **dopo** che la prenotazione esiste: se si consumasse prima e
       la scrittura fallisse, il link sarebbe bruciato e la persona resterebbe
       senza tavolo e senza strada. */
    await consumaRipresa(corpo.token, booking.id);

    return NextResponse.json({
      ok: true,
      riferimento: booking.reference ?? null,
      quando: booking.startsAt,
      persone: booking.partySize,
    });
  } catch (err) {
    /* Orario pieno, locale chiuso, fuori dalla finestra: è un conflitto con
       l'agenda, e risponde come il modulo pubblico (409 con i motivi), non
       come un guasto. */
    if (err instanceof AvailabilityError) return bookingWriteErrorResponse(err);
    return apiErrorResponse(err);
  }
}
