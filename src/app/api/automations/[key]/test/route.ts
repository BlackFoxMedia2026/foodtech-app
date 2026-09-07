import { NextResponse } from "next/server";
import { apiErrorResponse, requireVenueApi } from "@/lib/api-auth";
import { db } from "@/lib/db";
import { isAutomationKey } from "@/server/automations/catalogue";
import { sendAutomationTest } from "@/server/automations/engine";

/**
 * Manda una prova dell'automazione a chi l'ha chiesta.
 *
 * L'indirizzo non arriva dalla richiesta: è quello dell'account che ha
 * premuto il pulsante. Un campo libero qui sarebbe un modo per far partire
 * email dal dominio del ristorante verso chiunque.
 */
export async function POST(_req: Request, { params }: { params: { key: string } }) {
  const ctx = await requireVenueApi("edit_marketing");
  if (!ctx.ok) return ctx.response;
  try {
    if (!isAutomationKey(params.key)) throw new Error("not_found");
    const user = await db.user.findUniqueOrThrow({ where: { id: ctx.userId }, select: { email: true } });
    await sendAutomationTest(ctx.venueId, params.key, user.email);
    return NextResponse.json({ sent: true, to: user.email });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
