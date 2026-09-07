import { NextResponse } from "next/server";
import { requireVenueApi } from "@/lib/api-auth";
import { deleteRoom, renameRoom } from "@/server/rooms";

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const ctx = await requireVenueApi("manage_venue");
  if (!ctx.ok) return ctx.response;
  try {
    const body = await req.json();
    const updated = await renameRoom(ctx.venueId, params.id, body);
    return NextResponse.json(updated);
  } catch (err) {
    const message = err instanceof Error ? err.message : "invalid";
    if (message === "not_found") return NextResponse.json({ error: message }, { status: 404 });
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const ctx = await requireVenueApi("manage_venue");
  if (!ctx.ok) return ctx.response;
  try {
    await deleteRoom(ctx.venueId, params.id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "invalid";
    if (message === "not_found") return NextResponse.json({ error: message }, { status: 404 });
    if (message === "room_in_use") {
      return NextResponse.json(
        { error: message, message: "Impossibile eliminare: la sala contiene tavoli o assegnazioni esistenti." },
        { status: 409 },
      );
    }
    if (message === "last_room") {
      return NextResponse.json(
        { error: message, message: "Non puoi eliminare l'unica sala del ristorante." },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
