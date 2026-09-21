import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, apiErrorResponse, requireApiToken } from "@/lib/api-auth";
import { LicenzaError, richiediFunzioneCentralino } from "@/server/licenza-centralino";
import { disdiciDalTelefono, prenotazioneDaDisdire } from "@/server/voice/disdetta-telefono";

/**
 * `POST /api/v1/telefonia/disdetta`
 *
 * Due cose in una rotta, di proposito: **cercare** la prenotazione di chi sta
 * chiamando e **disdirla**. Senza `bookingId` cerca; con `bookingId` disdice.
 *
 * Sono due passi della stessa telefonata — la voce chiede «trovo una
 * prenotazione a suo nome per venerdì alle 20, la disdico?» e solo dopo il sì
 * disdice — e tenerli insieme evita che un centralino possa disdire senza aver
 * mai letto cosa stava disdicendo.
 *
 * Chi chiama per disdire e non riesce **diventa un no-show**: è la telefonata
 * che costa un tavolo a chi la perde.
 */

export const dynamic = "force-dynamic";

const Corpo = z.object({
  /** Il numero di chi sta chiamando, in qualunque forma. */
  phone: z.string().min(3).max(40),
  /** Presente = disdici quella. Assente = dimmi quale sarebbe. */
  bookingId: z.string().min(1).max(120).optional(),
});

export async function POST(req: Request) {
  const ctx = await requireApiToken(req, "telefonia:write");
  if (!ctx.ok) return ctx.response;

  try {
    await richiediFunzioneCentralino(ctx.venueId, "prenotazioni");
    const corpo = Corpo.parse(await req.json());

    if (!corpo.bookingId) {
      const trovata = await prenotazioneDaDisdire(ctx.venueId, corpo.phone);
      return NextResponse.json({
        trovata: !!trovata,
        ...(trovata
          ? {
              id: trovata.id,
              quando: trovata.quando.toISOString(),
              persone: trovata.persone,
              nome: trovata.nome,
            }
          : {}),
      });
    }

    const esito = await disdiciDalTelefono(ctx.venueId, {
      bookingId: corpo.bookingId,
      telefono: corpo.phone,
    });

    if (!esito.ok) {
      /* Si dice **quale** ostacolo: «già disdetta» e «non è la tua» sono due
         frasi diverse al telefono, e la voce deve poter dire quella giusta. */
      return NextResponse.json({ ok: false, perche: esito.perche }, { status: 409 });
    }

    return NextResponse.json({
      ok: true,
      quando: esito.quando.toISOString(),
      persone: esito.persone,
    });
  } catch (err) {
    if (err instanceof LicenzaError) {
      return apiError(403, "centralino_non_attivo", "Il telefono non è attivo su questo locale.");
    }
    return apiErrorResponse(err);
  }
}
