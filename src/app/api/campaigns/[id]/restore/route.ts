import { NextResponse } from "next/server";
import { requireVenueApi } from "@/lib/api-auth";
import { ripristinaBozza } from "@/server/campaigns";

/** Riporta una bozza fuori dal cestino. */
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const ctx = await requireVenueApi("edit_marketing");
  if (!ctx.ok) return ctx.response;
  const ripristinata = await ripristinaBozza(ctx.venueId, params.id);
  if (!ripristinata) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
