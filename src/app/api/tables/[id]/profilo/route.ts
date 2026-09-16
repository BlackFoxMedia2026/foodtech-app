import { NextResponse } from "next/server";
import { apiErrorResponse, requireVenueApi } from "@/lib/api-auth";
import { getProfiloTavolo, ProfiloTavoloError } from "@/server/profilo-tavolo";

/**
 * Il profilo di un tavolo: chi c'è, da quanto, quanto deve, chi lo serve.
 *
 * Basta **leggere** il locale, non `manage_venue`: è la schermata che si apre
 * toccando un tavolo durante il servizio, e chi porta i piatti deve poterla
 * guardare. Le azioni che partono da qui hanno ciascuna il proprio permesso
 * sulla propria rotta — assegnare personale chiede `manage_staff`, accendere
 * il QR chiede `manage_venue` — quindi aprire il pannello non concede niente.
 *
 * Il segreto del QR **non passa di qui**: il profilo dice solo se il codice
 * esiste ed è acceso. Il link con il token lo serve `/api/tables/[id]/qr/stato`,
 * che è la rotta che già lo faceva.
 */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const ctx = await requireVenueApi();
  if (!ctx.ok) return ctx.response;
  const url = new URL(req.url);
  try {
    // La Sala ha un calendario: `giorno` e `servizio` dicono **quale**
    // giornata si sta guardando. Senza, si risponde su adesso, che è il caso
    // del Servizio.
    const profilo = await getProfiloTavolo(ctx.venueId, params.id, {
      giorno: url.searchParams.get("giorno"),
      servizio: url.searchParams.get("servizio"),
    });
    return NextResponse.json(profilo, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    if (err instanceof ProfiloTavoloError) {
      return NextResponse.json({ error: err.code }, { status: 404 });
    }
    return apiErrorResponse(err);
  }
}
