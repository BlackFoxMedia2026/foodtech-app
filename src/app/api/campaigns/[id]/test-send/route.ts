import { NextResponse } from "next/server";
import { z } from "zod";
import { can, getActiveVenue } from "@/lib/tenant";
import { sendTestEmail } from "@/server/campaigns";

const Body = z.object({ to: z.string().email() });

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const ctx = await getActiveVenue();
  if (!can(ctx.role, "edit_marketing")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  try {
    const { to } = Body.parse(await req.json());
    await sendTestEmail(ctx.venueId, params.id, to);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "invalid";
    return NextResponse.json({ error: message }, { status: message === "not_found" ? 404 : 400 });
  }
}
