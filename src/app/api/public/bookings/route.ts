import { NextResponse } from "next/server";
import { createBooking } from "@/server/bookings";
import { bookingWriteErrorResponse } from "@/server/booking-errors";
import { db } from "@/lib/db";
import {
  annotaTrappola,
  chiaveIdempotenza,
  eScontroDiChiave,
  giaFattaConQuestaChiave,
  giaPrenotatoUgualeIdentico,
  trappolaScattata,
} from "@/server/widget-defenses";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const venueId = typeof body?.venueId === "string" ? body.venueId : undefined;

    if (!venueId) {
      return NextResponse.json({ error: "venueId required" }, { status: 400 });
    }

    const venue = await db.venue.findFirst({ where: { id: venueId, active: true } });
    if (!venue) {
      return NextResponse.json({ error: "venue not found" }, { status: 404 });
    }

    /**
     * La campagna arriva dal link cliccato, quindi dal mondo esterno: si
     * accetta solo se esiste e appartiene a **questo** locale. Se non torna,
     * la prenotazione si fa comunque senza attribuzione: un link storto non
     * deve impedire a un cliente di prenotare.
     */
    const campagnaRichiesta = typeof body?.campaignId === "string" ? body.campaignId : null;
    const campaignId = campagnaRichiesta
      ? (
          await db.campaign.findFirst({
            where: { id: campagnaRichiesta, venueId },
            select: { id: true },
          })
        )?.id ?? null
      : null;

    /**
     * Il campo trappola.
     *
     * Chi lo compila riceve un rifiuto generico: **non gli si racconta una
     * finta conferma**. Far credere di avere un tavolo che non esiste è una
     * bugia anche verso un programma — e se un giorno scattasse per errore su
     * una persona vera, la conferma falsa sarebbe il danno peggiore.
     */
    if (trappolaScattata(body)) {
      annotaTrappola(venueId);
      return NextResponse.json(
        { error: "richiesta_non_valida", message: "Controlla i dati e riprova." },
        { status: 422 },
      );
    }

    const payload = {
      guest: body?.guest,
      partySize: body?.partySize,
      startsAt: body?.startsAt,
      durationMin: body?.durationMin,
      occasion: body?.occasion,
      notes: body?.notes,
      source: "WIDGET" as const,
    };

    const chiave = chiaveIdempotenza(body);

    /**
     * Le due strade per non prenotare due volte la stessa cosa.
     *
     * La prima è precisa: la chiave la genera il modulo una volta per
     * tentativo, quindi due richieste con la stessa chiave sono lo stesso
     * tocco arrivato due volte — succede su una rete lenta, e succede spesso.
     */
    const giaFatta = await giaFattaConQuestaChiave(venueId, chiave);
    if (giaFatta) {
      // 200 e non 201: non è stato creato niente adesso, ed è la verità.
      return NextResponse.json(giaFatta, { status: 200 });
    }

    /**
     * La seconda copre il modulo ricaricato e ricompilato, dove la chiave è
     * cambiata: stessa persona, stesso orario, stessi coperti. Confronto
     * esatto, perché due amici che prenotano lo stesso tavolo a orari diversi
     * devono ottenere due prenotazioni.
     */
    const startsAt = body?.startsAt ? new Date(body.startsAt) : null;
    if (startsAt && !Number.isNaN(startsAt.getTime()) && body?.partySize) {
      const doppione = await giaPrenotatoUgualeIdentico(venueId, {
        email: body?.guest?.email,
        phone: body?.guest?.phone,
        startsAt,
        partySize: Number(body.partySize),
      });
      if (doppione) return NextResponse.json(doppione, { status: 200 });
    }

    try {
      const booking = await createBooking(venueId, payload, {
        campaignId,
        canale: "pubblico",
        idempotencyKey: chiave,
      });
      return NextResponse.json(booking, { status: 201 });
    } catch (err) {
      /**
       * Due richieste in parallelo con la stessa chiave: fra la lettura e la
       * scrittura non si vedono, e l'unicità la garantisce l'indice. La
       * seconda perde, e perdere qui vuol dire «esisteva già» — non «è
       * andato storto».
       */
      if (eScontroDiChiave(err)) {
        const esistente = await giaFattaConQuestaChiave(venueId, chiave);
        if (esistente) return NextResponse.json(esistente, { status: 200 });
      }
      throw err;
    }
  } catch (err) {
    return bookingWriteErrorResponse(err);
  }
}
