import { NextResponse } from "next/server";
import { requireStaffApi } from "@/lib/staff-auth";
import { staffErrorResponse } from "@/lib/staff-errori";
import { turniNelPeriodo } from "@/server/staff-app/turno";
import { dateKeyInVenue, shiftDateKey } from "@/lib/venue-time";

/**
 * I propri turni. **Solo i propri**: il `waiterId` non arriva dalla richiesta,
 * lo mette il server dal contesto. Non c'è modo di chiedere quelli di un
 * collega, e non è un controllo — è che il parametro non esiste.
 */
export async function GET(req: Request) {
  const ctx = await requireStaffApi("view_own_shifts");
  if (!ctx.ok) return ctx.response;

  try {
    const url = new URL(req.url);
    const dal = url.searchParams.get("dal") ?? dateKeyInVenue(new Date(), ctx.timezone);
    const giorni = Math.min(Math.max(Number(url.searchParams.get("giorni") ?? 14), 1), 62);

    return NextResponse.json({
      dal,
      giorni: await turniNelPeriodo(ctx.venueId, ctx.persona.waiterId, dal, giorni),
      /* La settimana prima e dopo, per le frecce del calendario: calcolarle
         qui evita alla schermata di dover conoscere il fuso del locale. */
      precedente: shiftDateKey(dal, -giorni),
      successiva: shiftDateKey(dal, giorni),
    });
  } catch (err) {
    return staffErrorResponse(err);
  }
}
