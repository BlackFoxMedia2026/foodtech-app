import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, apiErrorResponse, requireVenueApi } from "@/lib/api-auth";
import {
  SenzaOspiteError,
  approvaInsight,
  ignoraInsight,
} from "@/server/voice/insight";
import {
  LicenzaError,
  richiediFunzioneCentralino,
} from "@/server/licenza-centralino";

/**
 * Decidere su un'informazione proposta.
 *
 * `manage_bookings` e non `use_phone`: approvare **scrive nella scheda di un
 * cliente**, ed è la stessa capacità che serve per modificarla a mano. Chi
 * risponde al telefono può proporre; scrivere nel profilo è un'altra cosa.
 */

const Corpo = z.object({ come: z.enum(["approva", "ignora"]) });

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } },
) {
  const ctx = await requireVenueApi("manage_bookings");
  if (!ctx.ok) return ctx.response;
  try {
    await richiediFunzioneCentralino(ctx.venueId, "riconoscimento");
    const { come } = Corpo.parse(await req.json());
    const attore = ctx.session.user?.email ?? ctx.userId;

    if (come === "ignora") {
      await ignoraInsight(ctx.venueId, params.id, attore);
      return NextResponse.json({ ok: true });
    }

    const esito = await approvaInsight(ctx.venueId, params.id, attore);
    return NextResponse.json(esito);
  } catch (err) {
    if (err instanceof LicenzaError) {
      return apiError(
        403,
        "centralino_non_attivo",
        "Il telefono non è attivo su questo locale.",
      );
    }
    if (err instanceof SenzaOspiteError) {
      /* 409: la richiesta è giusta, è lo **stato** che la rifiuta — e il
         messaggio dice cosa fare, perché il gesto che lo risolve è a due righe
         di distanza nello storico. */
      return apiError(
        409,
        "senza_ospite",
        "Questo numero non è ancora di nessuno: dai un nome a chi ha chiamato, poi approva.",
      );
    }
    if (err instanceof Error && err.message === "not_found") {
      return apiError(
        404,
        "not_found",
        "Questa proposta non esiste più: forse l'ha già decisa qualcun altro.",
      );
    }
    return apiErrorResponse(err);
  }
}
