import { NextResponse } from "next/server";
import { apiErrorResponse, requireVenueApi } from "@/lib/api-auth";
import { auditActor } from "@/server/audit";
import { salvaBenvenuto, vistaBenvenuto } from "@/server/voice/benvenuto";

/**
 * Il saluto del risponditore, scritto dal locale.
 *
 * Come la scelta dell'ingresso, **non chiede la licenza**: si scrive il
 * saluto anche prima che il telefono sia accesso — è il genere di cosa che si
 * prepara, e trovare il campo bloccato finché non arriva una chiave
 * costringerebbe a ripassare da qui un'altra volta.
 */

export const dynamic = "force-dynamic";

export async function GET() {
  const ctx = await requireVenueApi("manage_phone");
  if (!ctx.ok) return ctx.response;
  try {
    return NextResponse.json(await vistaBenvenuto(ctx.venueId));
  } catch (err) {
    return apiErrorResponse(err);
  }
}

export async function PUT(req: Request) {
  const ctx = await requireVenueApi("manage_phone");
  if (!ctx.ok) return ctx.response;
  try {
    return NextResponse.json(
      await salvaBenvenuto(ctx.venueId, await req.json(), auditActor(ctx, req)),
    );
  } catch (err) {
    return apiErrorResponse(err);
  }
}
