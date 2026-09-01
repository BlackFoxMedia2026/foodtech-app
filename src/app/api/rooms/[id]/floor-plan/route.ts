import { NextResponse } from "next/server";
import { put, del } from "@vercel/blob";
import { can, getActiveVenue } from "@/lib/tenant";
import { db } from "@/lib/db";
import { setRoomFloorPlan } from "@/server/rooms";

const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/webp"];

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const ctx = await getActiveVenue();
  if (!can(ctx.role, "manage_venue")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const room = await db.room.findFirst({ where: { id: params.id, venueId: ctx.venueId } });
  if (!room) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "missing_file" }, { status: 400 });
  }
  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json({ error: "not_an_image" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "file_too_large" }, { status: 400 });
  }

  const extension = file.name.includes(".") ? file.name.split(".").pop() : "jpg";
  const pathname = `floor-plans/${ctx.venueId}/${params.id}/${crypto.randomUUID()}.${extension}`;
  const blob = await put(pathname, file, { access: "public" });

  const previousUrl = room.floorPlanUrl;
  const updated = await setRoomFloorPlan(ctx.venueId, params.id, blob.url);

  if (previousUrl) {
    await del(previousUrl).catch(() => {});
  }

  return NextResponse.json(updated);
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const ctx = await getActiveVenue();
  if (!can(ctx.role, "manage_venue")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const room = await db.room.findFirst({ where: { id: params.id, venueId: ctx.venueId } });
  if (!room) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const updated = await setRoomFloorPlan(ctx.venueId, params.id, null);
  if (room.floorPlanUrl) {
    await del(room.floorPlanUrl).catch(() => {});
  }

  return NextResponse.json(updated);
}
