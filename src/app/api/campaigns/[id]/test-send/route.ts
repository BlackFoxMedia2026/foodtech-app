import { NextResponse } from "next/server";
import { requireVenueApi } from "@/lib/api-auth";
import { z } from "zod";
import { sendTestEmail } from "@/server/campaigns";

const Body = z.object({ to: z.string().email() });

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const ctx = await requireVenueApi("edit_marketing");
  if (!ctx.ok) return ctx.response;
  try {
    const { to } = Body.parse(await req.json());
    await sendTestEmail(ctx.venueId, params.id, to);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "invalid";
    return NextResponse.json({ error: message }, { status: message === "not_found" ? 404 : 400 });
  }
}
