import { NextResponse } from "next/server";
import { z } from "zod";
import { can, getActiveVenue } from "@/lib/tenant";
import { saveRoomLayout, setActiveLayoutMode } from "@/server/room-layout";

const ModeSchema = z.object({ mode: z.enum(["IMAGE", "BUILDER"]) });

export async function PUT(req: Request, { params }: { params: { id: string } }) {
  const ctx = await getActiveVenue();
  if (!can(ctx.role, "manage_venue")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "invalid_body" }, { status: 400 });

  try {
    const layout = await saveRoomLayout(ctx.venueId, params.id, body);
    return NextResponse.json(layout);
  } catch (err) {
    if (err instanceof Error && err.message === "not_found") {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: "invalid_body", issues: err.issues }, { status: 400 });
    }
    throw err;
  }
}

// Switches which layout mode is rendered for the room (IMAGE vs BUILDER)
// without touching either layout's underlying data — lets a manager flip
// back to a previously-built or previously-uploaded plan without redoing it.
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const ctx = await getActiveVenue();
  if (!can(ctx.role, "manage_venue")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const parsed = ModeSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "invalid_body" }, { status: 400 });

  try {
    const room = await setActiveLayoutMode(ctx.venueId, params.id, parsed.data.mode);
    return NextResponse.json(room);
  } catch (err) {
    if (err instanceof Error && err.message === "not_found") {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    throw err;
  }
}
