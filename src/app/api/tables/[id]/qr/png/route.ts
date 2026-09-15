import { NextResponse } from "next/server";
import { requireVenueApi } from "@/lib/api-auth";
import { qrPng } from "@/server/qr-tavolo";

/** Il QR come immagine: l'anteprima nella scheda del tavolo, e «Scarica PNG». */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const ctx = await requireVenueApi();
  if (!ctx.ok) return ctx.response;

  const lato = Number(new URL(req.url).searchParams.get("lato") ?? 720);
  try {
    const png = await qrPng(ctx.venueId, params.id, Math.min(2000, Math.max(160, lato || 720)));
    return new NextResponse(png as unknown as BodyInit, {
      headers: {
        "Content-Type": "image/png",
        // Il QR di un tavolo non cambia finché non lo si rigenera, ma metterlo
        // in cache pubblica significherebbe lasciarlo in una rete intermedia:
        // è un segreto, e sta nel browser di chi ha i permessi o da nessuna
        // parte.
        "Cache-Control": "private, max-age=60",
      },
    });
  } catch {
    return NextResponse.json({ error: "qr_non_generato" }, { status: 404 });
  }
}
