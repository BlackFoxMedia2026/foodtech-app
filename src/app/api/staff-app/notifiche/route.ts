import { NextResponse } from "next/server";
import { z } from "zod";
import { requireStaffApi } from "@/lib/staff-auth";
import { staffErrorResponse } from "@/lib/staff-errori";
import { daLeggere, notificheDi, segnaLetta, segnaTutteLette } from "@/server/staff-app/notifiche";

/** Le notifiche personali: solo le proprie, sempre. */
export async function GET() {
  const ctx = await requireStaffApi("view_own_profile");
  if (!ctx.ok) return ctx.response;

  try {
    const [notifiche, nonLette] = await Promise.all([
      notificheDi(ctx.venueId, ctx.persona.waiterId),
      daLeggere(ctx.venueId, ctx.persona.waiterId),
    ]);
    return NextResponse.json({ notifiche, nonLette }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return staffErrorResponse(err);
  }
}

const Input = z.object({ id: z.string().min(1).optional() });

/** Senza `id` si segnano lette tutte: è il gesto che si fa aprendo l'elenco. */
export async function POST(req: Request) {
  const ctx = await requireStaffApi("view_own_profile");
  if (!ctx.ok) return ctx.response;

  try {
    const { id } = Input.parse(await req.json().catch(() => ({})));
    if (id) await segnaLetta(ctx.venueId, ctx.persona.waiterId, id);
    else await segnaTutteLette(ctx.venueId, ctx.persona.waiterId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return staffErrorResponse(err);
  }
}
