import { NextResponse } from "next/server";
import { z } from "zod";
import { apiErrorResponse, requireVenueApi } from "@/lib/api-auth";
import { auditActor, recordAudit } from "@/server/audit";
import { db } from "@/lib/db";

/**
 * Da quanto in anticipo, e fino a quando, si prenota **online**.
 *
 * Vale solo per il widget: al telefono il locale accetta quello che vuole,
 * fino all'ultimo minuto. Un software che impedisse a chi risponde di
 * scrivere una prenotazione delle 20:40 verrebbe aggirato con una penna, e da
 * lì in poi la sala e lo schermo non direbbero più la stessa cosa.
 */
const Body = z.object({
  /** Giorni di anticipo massimo. Nullo = nessun limite. */
  windowDays: z.union([z.coerce.number().int().min(1).max(730), z.null()]),
  /** Minuti di preavviso minimo. Nullo = fino all'ultimo. */
  cutoffMin: z.union([z.coerce.number().int().min(0).max(10_080), z.null()]),
  /**
   * Percentuale accettata oltre la capienza del turno.
   *
   * Il tetto a 30 non è arbitrario: oltre, l'overbooking smette di compensare
   * le assenze e diventa una fila all'ingresso.
   */
  overbookingPct: z.union([z.coerce.number().int().min(0).max(30), z.null()]).optional(),
});

export async function PATCH(req: Request) {
  const ctx = await requireVenueApi("manage_venue");
  if (!ctx.ok) return ctx.response;

  try {
    const { windowDays, cutoffMin, overbookingPct } = Body.parse(await req.json());

    const updated = await db.venue.update({
      where: { id: ctx.venueId },
      data: {
        bookingWindowDays: windowDays,
        bookingCutoffMin: cutoffMin || null,
        ...(overbookingPct !== undefined && { overbookingPct: overbookingPct || null }),
      },
      select: { bookingWindowDays: true, bookingCutoffMin: true, overbookingPct: true },
    });

    await recordAudit(auditActor(ctx, req), "venue.booking_window_update", "venue", ctx.venueId, {
      giorniDiAnticipo: windowDays,
      preavvisoMinuti: cutoffMin,
      oltreLaCapienzaPct: overbookingPct ?? null,
    });

    return NextResponse.json(updated);
  } catch (err) {
    return apiErrorResponse(err);
  }
}
