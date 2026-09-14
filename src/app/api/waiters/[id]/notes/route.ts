import { NextResponse } from "next/server";
import { apiErrorResponse, requireVenueApi } from "@/lib/api-auth";
import { auditActor } from "@/server/audit";
import { creaNota, listNote } from "@/server/staff-note";

/** Le note interne: solo `manage_staff`, in lettura e in scrittura. La
 * persona di cui parlano, anche se ha un account, non passa di qui. */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const ctx = await requireVenueApi("manage_staff");
  if (!ctx.ok) return ctx.response;
  return NextResponse.json(await listNote(ctx.venueId, params.id));
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const ctx = await requireVenueApi("manage_staff");
  if (!ctx.ok) return ctx.response;
  try {
    const autore = {
      userId: ctx.userId,
      label: ctx.session.user?.name || ctx.session.user?.email || "Responsabile",
    };
    const nota = await creaNota(ctx.venueId, params.id, await req.json(), autore, auditActor(ctx, req));
    return NextResponse.json(nota, { status: 201 });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
