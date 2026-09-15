import { NextResponse } from "next/server";
import { requireVenueApi } from "@/lib/api-auth";
import { qrPdf } from "@/server/qr-tavolo";

/** Il cartoncino pronto da stampare e appoggiare sul tavolo. */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const ctx = await requireVenueApi();
  if (!ctx.ok) return ctx.response;

  try {
    const pdf = await qrPdf(ctx.venueId, params.id);
    return new NextResponse(pdf as unknown as BodyInit, {
      headers: {
        "Content-Type": "application/pdf",
        // `attachment` e non `inline`: chi preme «Scarica PDF» vuole un file da
        // portare in stampa, non una scheda del browser in più.
        "Content-Disposition": `attachment; filename="tavolo-qr.pdf"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch {
    return NextResponse.json({ error: "qr_non_generato" }, { status: 404 });
  }
}
