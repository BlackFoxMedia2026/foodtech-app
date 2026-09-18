import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, apiErrorResponse, requireVenueApi } from "@/lib/api-auth";
import { collegaChiamataAContatto } from "@/server/chiamate";
import {
  LicenzaError,
  richiediFunzioneCentralino,
} from "@/server/licenza-centralino";

/**
 * Dai un nome a un numero che ha chiamato.
 *
 * È il gesto che mancava: una persona telefona, il numero non è di nessuno, e
 * resta una riga nello storico invece di diventare un cliente. Prima non
 * esisteva **nessun** modo di creare un contatto dall'interfaccia di Tavolo —
 * la rotta c'era e nessuna schermata la chiamava — e questa è la porta più
 * naturale per farlo: non si inventa un contatto dal nulla, si dà un nome a
 * qualcuno che ha appena telefonato.
 *
 * `manage_bookings` e non `manage_venue`: lo fa chi risponde al telefono,
 * mentre parla.
 */

const Corpo = z.object({
  firstName: z.string().min(1).max(80),
  lastName: z.string().max(80).nullish(),
  email: z.string().email().max(160).nullish(),
});

export async function POST(
  req: Request,
  { params }: { params: { id: string } },
) {
  const ctx = await requireVenueApi("manage_bookings");
  if (!ctx.ok) return ctx.response;

  try {
    await richiediFunzioneCentralino(ctx.venueId, "riconoscimento");
    const corpo = Corpo.parse(await req.json());
    const esito = await collegaChiamataAContatto(ctx.venueId, params.id, corpo);
    /* Si dice se la scheda c'era già: chi ha appena scritto un nome e si ritrova
       una scheda con un altro nome deve capire perché — quel numero era già di
       qualcuno, e `trovaOCreaOspite` ha riusato la sua invece di fare un
       doppione. */
    return NextResponse.json(esito, {
      status: esito.giaConosciuto ? 200 : 201,
    });
  } catch (err) {
    if (err instanceof LicenzaError) {
      return apiError(
        403,
        "centralino_non_attivo",
        "Il telefono non è attivo su questo locale.",
      );
    }
    if (err instanceof Error && err.message === "not_found") {
      return apiError(404, "not_found", "Questa chiamata non esiste.");
    }
    return apiErrorResponse(err);
  }
}
