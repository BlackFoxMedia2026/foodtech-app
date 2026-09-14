import { NextResponse } from "next/server";
import { requireVenueApi } from "@/lib/api-auth";
import { auditActor } from "@/server/audit";
import { impostaPassword } from "@/server/staff-account";
import { erroreAccount } from "../_comune";

/** Il responsabile imposta una password nuova. La password viaggia una
 * volta, qui dentro, e non torna mai indietro. */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const ctx = await requireVenueApi("manage_venue");
  if (!ctx.ok) return ctx.response;
  try {
    await impostaPassword(ctx.venueId, params.id, await req.json(), auditActor(ctx, req));
    return NextResponse.json({ ok: true });
  } catch (err) {
    return erroreAccount(err);
  }
}
