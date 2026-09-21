import { NextResponse } from "next/server";
import { requireStaffApi } from "@/lib/staff-auth";
import { staffErrorResponse } from "@/lib/staff-errori";
import { propostePerOspite } from "@/server/staff-app/accoglienza";

/**
 * «Dove faccio sedere Rossi?»
 *
 * Il permesso è `manage_tables` e non `view_tables`: questa risposta contiene
 * **tutti** i tavoli del locale con il loro stato, e chi non può accomodare
 * non ha motivo di riceverli. Quello che non contiene, per nessuno, è chi è
 * seduto dove — di un tavolo occupato esce che è occupato, e basta.
 */
export async function GET(_req: Request, { params }: { params: { bookingId: string } }) {
  const ctx = await requireStaffApi("manage_tables");
  if (!ctx.ok) return ctx.response;

  try {
    const proposte = await propostePerOspite(
      { venueId: ctx.venueId, timezone: ctx.timezone, waiterId: ctx.persona.waiterId },
      params.bookingId,
    );
    return NextResponse.json(proposte, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return staffErrorResponse(err);
  }
}
