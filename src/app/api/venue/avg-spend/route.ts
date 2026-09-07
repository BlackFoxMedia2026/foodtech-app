import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, apiErrorResponse, requireVenueApi } from "@/lib/api-auth";
import { auditActor, recordAudit } from "@/server/audit";
import { db } from "@/lib/db";

/**
 * La spesa media per coperto dichiarata dal locale.
 *
 * Serve per la stima degli incassi e per il valore stimato di un cliente.
 * Prima quella stima si basava sulla media di `Guest.totalSpend`, un campo che
 * nessuna parte del codice aggiornava: un numero del seed presentato come
 * dato. Dichiararla è la sola forma onesta finché non ci sono ordini o incassi.
 */
const Body = z.object({
  /** In euro, come lo scrive una persona. Nullo = nessuna stima. */
  avgSpend: z.union([z.coerce.number().min(1).max(1000), z.null()]),
});

export async function PATCH(req: Request) {
  const ctx = await requireVenueApi("manage_venue");
  if (!ctx.ok) return ctx.response;

  try {
    const { avgSpend } = Body.parse(await req.json());
    const avgSpendCents = avgSpend == null ? null : Math.round(avgSpend * 100);

    const updated = await db.venue.update({
      where: { id: ctx.venueId },
      data: { avgSpendCents },
      select: { avgSpendCents: true },
    });

    await recordAudit(auditActor(ctx, req), "venue.avg_spend_update", "venue", ctx.venueId, {
      spesaMediaCentesimi: avgSpendCents,
    });

    return NextResponse.json(updated);
  } catch (err) {
    return apiErrorResponse(err);
  }
}

export async function GET() {
  const ctx = await requireVenueApi();
  if (!ctx.ok) return ctx.response;
  const venue = await db.venue.findUnique({
    where: { id: ctx.venueId },
    select: { avgSpendCents: true },
  });
  if (!venue) return apiError(404, "not_found", "Locale non trovato.");
  return NextResponse.json(venue);
}
