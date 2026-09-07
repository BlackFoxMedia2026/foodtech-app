import { NextResponse } from "next/server";
import { apiError, apiErrorResponse, requireVenueApi } from "@/lib/api-auth";
import { auditActor } from "@/server/audit";
import { OrderError, addLine } from "@/server/orders";

const MESSAGGIO: Record<string, { stato: number; testo: string }> = {
  not_found: { stato: 404, testo: "Questo piatto non esiste più." },
  already_closed: { stato: 409, testo: "Il conto è già chiuso: riaprine uno nuovo." },
  not_available: { stato: 409, testo: "Questo piatto è segnato finito: non si può ordinare." },
  empty_order: { stato: 409, testo: "Il conto è vuoto." },
};

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const ctx = await requireVenueApi("manage_bookings");
  if (!ctx.ok) return ctx.response;
  try {
    return NextResponse.json(
      await addLine(ctx.venueId, params.id, await req.json(), { actor: auditActor(ctx, req) }),
    );
  } catch (err) {
    if (err instanceof OrderError) {
      const m = MESSAGGIO[err.code];
      return apiError(m.stato, err.code, m.testo);
    }
    return apiErrorResponse(err);
  }
}
