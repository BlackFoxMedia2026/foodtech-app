import { NextResponse } from "next/server";
import { apiError, apiErrorResponse } from "@/lib/api-auth";
import { superAdminCorrente } from "@/lib/super-admin";
import { logEvento } from "@/lib/observability";
import { LineaError, assegnaLinea } from "@/server/admin/linee";
import { CentralinoRemotoError } from "@/server/admin/centralino-remoto";
import { NumeroDiUnAltroError } from "@/server/voice/numeri-linea";

/**
 * Assegna una linea a un locale.
 *
 * Due sistemi in una richiesta — il centralino che riceve la telefonata e
 * Tavolo che la mostra — e i motivi per cui può non riuscire sono diversi fra
 * loro: il collegamento non configurato, il centralino che non ci riconosce,
 * un numero già di un altro cliente. **Ognuno ha il suo messaggio**, perché
 * portano a tre gesti diversi e un «non è stato possibile» li manderebbe tutti
 * e tre a cercare la cosa sbagliata.
 */
export async function POST(req: Request, { params }: { params: { venueId: string } }) {
  const admin = await superAdminCorrente();
  if (!admin.ok) return apiError(404, "not_found", "Questo indirizzo non esiste.");

  try {
    const esito = await assegnaLinea(params.venueId, await req.json());
    logEvento("admin.linea_assegnata", {
      venueId: params.venueId,
      da: admin.email,
      numero: esito.numero,
    });
    return NextResponse.json(esito);
  } catch (err) {
    if (err instanceof LineaError) {
      return apiError(err.codice === "locale_non_trovato" ? 404 : 409, err.codice, err.message);
    }
    if (err instanceof CentralinoRemotoError) {
      /* 502 e non 500: il guasto non e nostro, e la differenza conta per chi
         legge i registri fra sei mesi. */
      return apiError(502, err.codice, err.message, err.dettaglio);
    }
    if (err instanceof NumeroDiUnAltroError) {
      return apiError(
        409,
        "numero_di_un_altro_locale",
        "Questo numero è già assegnato a un altro locale in Tavolo: una linea porta a un locale solo.",
        { numero: err.numero },
      );
    }
    return apiErrorResponse(err);
  }
}
