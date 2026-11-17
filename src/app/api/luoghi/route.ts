import { NextResponse } from "next/server";
import { requireVenueApi } from "@/lib/api-auth";
import { cercaLuoghi } from "@/server/luoghi";

/**
 * Suggerimenti di comuni (`?comuni=1`) e indirizzi mentre si scrive.
 *
 * Passa dal server e non dal browser: il fornitore si cambia in un file solo,
 * e il browser non parla con un servizio esterno. Chiede `manage_staff`:
 * serve solo a chi compila una scheda del personale.
 */
export async function GET(req: Request) {
  const ctx = await requireVenueApi("manage_staff");
  if (!ctx.ok) return ctx.response;
  const params = new URL(req.url).searchParams;
  const q = (params.get("q") ?? "").slice(0, 120);
  const luoghi = await cercaLuoghi(q, params.get("comuni") === "1");
  return NextResponse.json(
    { luoghi },
    // Le stesse lettere ridigitate non ripartono da capo.
    { headers: { "Cache-Control": "private, max-age=300" } },
  );
}
