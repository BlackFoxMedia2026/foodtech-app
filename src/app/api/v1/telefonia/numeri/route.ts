import { NextResponse } from "next/server";
import { apiError, apiErrorResponse, requireApiToken } from "@/lib/api-auth";
import { LicenzaError, richiediFunzioneCentralino } from "@/server/licenza-centralino";
import { NumeroDiUnAltroError, dichiaraNumeri } from "@/server/voice/numeri-linea";
import { fornitoreDi } from "@/server/voice/provider";

/**
 * `PUT /api/v1/telefonia/numeri`
 *
 * Il centralino dichiara **quali linee arrivano a questo locale**.
 *
 * E la riga che fa comparire, nella procedura di collegamento, il numero a cui
 * far deviare le telefonate. Prima quel numero non c'era e la schermata lo
 * diceva; adesso lo dice il centralino, che e l'unico posto che sa se quella
 * linea e davvero collegata a quel cliente.
 *
 * `PUT` e non `POST` perche e l'elenco **completo**: quello che non compare
 * piu si spegne. Mandarne uno alla volta lascerebbe accese linee che il
 * centralino non serve piu, e il ristoratore le detterebbe all'operatore.
 */

export const dynamic = "force-dynamic";

export async function PUT(req: Request) {
  const ctx = await requireApiToken(req, "telefonia:write");
  if (!ctx.ok) return ctx.response;

  try {
    await richiediFunzioneCentralino(ctx.venueId, "riconoscimento");
    const fornitore = await fornitoreDi(ctx.venueId);
    const esito = await dichiaraNumeri(ctx.venueId, fornitore.nome, await req.json());
    return NextResponse.json(esito);
  } catch (err) {
    if (err instanceof LicenzaError) {
      return apiError(403, "centralino_non_attivo", "Il telefono non è attivo su questo locale.");
    }
    if (err instanceof NumeroDiUnAltroError) {
      return apiError(
        409,
        "numero_di_un_altro_locale",
        "Questo numero è già assegnato a un altro locale: una linea porta a un locale solo, altrimenti le telefonate finirebbero nel gestionale sbagliato.",
        { numero: err.numero },
      );
    }
    return apiErrorResponse(err);
  }
}
