import { NextResponse } from "next/server";
import { z } from "zod";
import { apiErrorResponse, requireVenueApi } from "@/lib/api-auth";
import { db } from "@/lib/db";
import { auditActor, recordAudit } from "@/server/audit";
import { channelAvailable } from "@/server/messaging/send";

/**
 * Accendere e spegnere gli SMS **di questo locale**.
 *
 * Il canale si configura per installazione — una chiave, un mittente — ma un
 * SMS **si paga** e arriva sul telefono di un cliente vero: chi decide di
 * spendere è il locale, e lo decide con un gesto suo. Spento per difetto.
 *
 * Nella risposta torna anche se il canale **esiste** su questa installazione:
 * un interruttore acceso su un canale che non c'è è una funzione che sembra
 * accesa e non manda niente, ed è la specie di bugia che questo prodotto
 * esiste per non avere.
 */

export const dynamic = "force-dynamic";

const Corpo = z.object({ attivi: z.boolean() });

export async function PATCH(req: Request) {
  const ctx = await requireVenueApi("manage_venue");
  if (!ctx.ok) return ctx.response;

  try {
    const { attivi } = Corpo.parse(await req.json());
    const venue = await db.venue.update({
      where: { id: ctx.venueId },
      data: { smsAttivi: attivi },
      select: { smsAttivi: true },
    });

    await recordAudit(auditActor(ctx, req), "venue.sms_update", "venue", ctx.venueId, {
      attivi: venue.smsAttivi,
    });

    return NextResponse.json({
      attivi: venue.smsAttivi,
      canaleDisponibile: channelAvailable("SMS"),
    });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
