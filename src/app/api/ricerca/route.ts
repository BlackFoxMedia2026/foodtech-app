import { NextResponse } from "next/server";
import { requireVenueApi } from "@/lib/api-auth";
import { cercaNelLocale } from "@/server/ricerca";

/**
 * La ricerca globale.
 *
 * Nessuna abilità richiesta oltre all'accesso al locale: chi può aprire il
 * gestionale può cercare un nome. I risultati sono **solo** del locale attivo,
 * e il filtro è nella query (`venueId`), non in un controllo dopo la lettura.
 */
export async function GET(req: Request) {
  const ctx = await requireVenueApi();
  if (!ctx.ok) return ctx.response;

  const q = new URL(req.url).searchParams.get("q") ?? "";
  const esito = await cercaNelLocale(ctx.venueId, q);
  return NextResponse.json(esito);
}
