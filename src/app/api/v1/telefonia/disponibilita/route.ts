import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, apiErrorResponse, requireApiToken } from "@/lib/api-auth";
import { LicenzaError, richiediFunzioneCentralino } from "@/server/licenza-centralino";
import { disponibilitaPerTelefono } from "@/server/voice/disponibilita-telefono";

/**
 * `POST /api/v1/telefonia/disponibilita`
 *
 * «Per quattro persone, venerdì alle nove, c'è posto?» — la domanda che il
 * risponditore fa prima di prendere la prenotazione.
 *
 * Risponde **sì, no con gli orari che ci stanno, oppure non lo so**: il terzo
 * caso non è un errore da nascondere. Se il motore della disponibilità non
 * risponde, la voce prende la prenotazione come ha sempre fatto — da
 * confermare — invece di dire a un cliente che non si può prenotare.
 *
 * È un `POST` e non un `GET` perché i dati sono tre e uno è una data con il
 * fuso: in una stringa di ricerca si sbaglia a scriverla, e l'ora sbagliata
 * qui si sente al telefono.
 */

export const dynamic = "force-dynamic";

const Corpo = z.object({
  persone: z.coerce.number().int().min(1).max(50),
  /** Giorno e ora richiesti, in ISO con il fuso. */
  quando: z.string().datetime({ offset: true }),
});

export async function POST(req: Request) {
  const ctx = await requireApiToken(req, "telefonia:read");
  if (!ctx.ok) return ctx.response;

  try {
    await richiediFunzioneCentralino(ctx.venueId, "prenotazioni");

    const corpo = Corpo.parse(await req.json());
    const quando = new Date(corpo.quando);
    if (Number.isNaN(quando.getTime())) {
      return apiError(400, "quando_non_valido", "La data richiesta non è una data.");
    }

    return NextResponse.json(
      await disponibilitaPerTelefono(ctx.venueId, { persone: corpo.persone, quando }),
    );
  } catch (err) {
    if (err instanceof LicenzaError) {
      return apiError(403, "centralino_non_attivo", "Il telefono non è attivo su questo locale.");
    }
    return apiErrorResponse(err);
  }
}
