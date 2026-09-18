import { NextResponse } from "next/server";
import { apiError, requireVenueApi } from "@/lib/api-auth";
import { auditActor } from "@/server/audit";
import { createBooking, listBookingsForDay } from "@/server/bookings";
import { bookingWriteErrorResponse } from "@/server/booking-errors";
import { collegaPrenotazioneAChiamata } from "@/server/voice/collega";

export async function GET(req: Request) {
  const ctx = await requireVenueApi();
  if (!ctx.ok) return ctx.response;
  const url = new URL(req.url);
  const day = url.searchParams.get("day");
  const target = day ? new Date(day) : new Date();
  const data = await listBookingsForDay(ctx.venueId, target);
  return NextResponse.json(data);
}

export async function POST(req: Request) {
  const ctx = await requireVenueApi("manage_bookings");
  if (!ctx.ok) return ctx.response;

  try {
    const body = await req.json();

    /**
     * La forzatura: accettare una prenotazione oltre orari, capienza o posti
     * del tavolo. Serve davvero — un tavolo condiviso, un gruppo sistemato a
     * mano, un cliente a cui non si dice no — ma **non** è raggiungibile dai
     * canali pubblici (che hanno la loro route) e pretende un motivo scritto,
     * che finisce nel registro con il nome di chi l'ha usata.
     */
    const force = body?.force;
    const forceReason =
      typeof force?.reason === "string" ? force.reason.trim() : "";
    if (force && forceReason.length < 3) {
      return apiError(
        422,
        "force_reason_required",
        "Per forzare serve un motivo, anche breve.",
      );
    }

    const created = await createBooking(ctx.venueId, body, {
      actor: auditActor(ctx, req),
      ...(force ? { skipAvailabilityCheck: true, forceReason } : {}),
    });

    /*
      La telefonata da cui nasce, quando nasce da una telefonata.

      Il modulo lo manda quando ci si arriva dal telefono (`?chiamata=<id>`).
      Si gestisce **qui**, esplicitamente, e non dentro `createBooking`: un
      campo che entra nei dati di una prenotazione e viene scartato in
      silenzio è una trappola — ci sono già cascato con `status`. Questo non
      entra nei dati, entra in un'operazione sua.

      Non fallisce la prenotazione: legare è importante, ma la prenotazione è
      già creata e questo è il posto sbagliato per perderla.
    */
    const idChiamata =
      typeof body?.chiamataId === "string" && body.chiamataId
        ? body.chiamataId
        : null;
    if (idChiamata) {
      await collegaPrenotazioneAChiamata(
        ctx.venueId,
        idChiamata,
        { id: created.id, reference: created.reference },
        /* Nel registro della chiamata l'attore è una persona con un nome
           leggibile: fra un mese chi rilegge quella telefonata vuole sapere
           **chi** ha preso la prenotazione, non un identificativo. */
        ctx.session.user?.email ?? ctx.userId,
      );
    }

    return NextResponse.json(created, { status: 201 });
  } catch (err) {
    return bookingWriteErrorResponse(err);
  }
}
