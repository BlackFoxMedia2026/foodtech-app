import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, apiErrorResponse, requireVenueApi } from "@/lib/api-auth";
import { auditActor } from "@/server/audit";
import { OrderError, setLineQuantity } from "@/server/orders";

const Body = z.object({ quantity: z.coerce.number().int().min(0).max(99) });

/** Cambia la quantità di una riga; a zero la riga si toglie. */
export async function PATCH(req: Request, { params }: { params: { id: string; lineId: string } }) {
  const ctx = await requireVenueApi("manage_bookings");
  if (!ctx.ok) return ctx.response;
  try {
    const { quantity } = Body.parse(await req.json());
    return NextResponse.json(
      await setLineQuantity(ctx.venueId, params.id, params.lineId, quantity, { actor: auditActor(ctx, req) }),
    );
  } catch (err) {
    if (err instanceof OrderError) {
      return apiError(
        err.code === "already_closed" ? 409 : 404,
        err.code,
        err.code === "already_closed" ? "Il conto è già chiuso." : "Questa riga non esiste più.",
      );
    }
    return apiErrorResponse(err);
  }
}
