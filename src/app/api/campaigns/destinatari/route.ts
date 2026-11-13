import { NextResponse } from "next/server";
import { z } from "zod";
import { apiErrorResponse, requireVenueApi } from "@/lib/api-auth";
import { elencoDestinatari, SegmentFilter } from "@/server/campaigns";

const Corpo = z.object({
  segment: SegmentFilter.optional(),
  cerca: z.string().max(120).optional(),
  pagina: z.number().int().min(1).max(10_000).optional(),
});

/** L'elenco dei destinatari di una campagna, per la tabella del passo «Invio». */
export async function POST(req: Request) {
  const ctx = await requireVenueApi("edit_marketing");
  if (!ctx.ok) return ctx.response;
  try {
    const corpo = Corpo.parse(await req.json());
    return NextResponse.json(
      await elencoDestinatari(ctx.venueId, corpo.segment ?? {}, { cerca: corpo.cerca, pagina: corpo.pagina }),
    );
  } catch (err) {
    return apiErrorResponse(err);
  }
}
