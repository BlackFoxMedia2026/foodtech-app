import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, apiErrorResponse } from "@/lib/api-auth";
import { superAdminCorrente } from "@/lib/super-admin";
import { db } from "@/lib/db";
import { autorizzaSuperamento, storicoOverride } from "@/server/costi/override";

/**
 * Autorizza un superamento per il ciclo corrente di un cliente.
 *
 * Come le altre rotte di piattaforma, l'autorizzazione non passa da
 * `requireVenueApi`: quella verifica che tu appartenga al locale, ed è proprio
 * quello che qui non vale. Sei nell'elenco dei Super Admin, o questo indirizzo
 * per te non esiste.
 *
 * Il corpo dice **di quanto** aumentare, non a quanto portare: è la domanda
 * che si fa davanti alla schermata («quanto gliene do in più»), e un valore
 * assoluto scritto male abbasserebbe un tetto invece di alzarlo, fermando una
 * campagna in corso.
 */

const Corpo = z.object({
  kind: z.enum(["BUDGET", "EMAILS"]),
  /** Centesimi per il budget, invii per le email. Sempre positivo. */
  delta: z.number().int().positive(),
  note: z.string().max(300).optional(),
});

export async function POST(req: Request, { params }: { params: { venueId: string } }) {
  const admin = await superAdminCorrente();
  if (!admin.ok) return apiError(404, "not_found", "Questo indirizzo non esiste.");

  try {
    const corpo = Corpo.parse(await req.json());
    const venue = await db.venue.findUnique({ where: { id: params.venueId }, select: { id: true } });
    if (!venue) return apiError(404, "not_found", "Locale non trovato.");

    const esito = await autorizzaSuperamento({
      venueId: params.venueId,
      kind: corpo.kind,
      delta: corpo.delta,
      note: corpo.note ?? null,
      // Chi ha deciso: l'email della sessione, non un identificativo che fra un
      // anno non si sa più a chi apparteneva.
      actorEmail: admin.email,
    });

    return NextResponse.json(esito);
  } catch (err) {
    const messaggio = err instanceof Error ? err.message : "";
    if (messaggio === "override_senza_budget") {
      return apiError(
        409,
        "override_senza_budget",
        "Questo cliente non ha un budget configurato: non c'è niente da superare. Il tetto si mette sul piano.",
      );
    }
    if (messaggio === "override_senza_ciclo") {
      return apiError(409, "override_senza_ciclo", "Questo cliente non ha ancora un ciclo di consumo aperto.");
    }
    return apiErrorResponse(err);
  }
}

/** Lo storico delle autorizzazioni: §15, «Storico modifiche». */
export async function GET(_req: Request, { params }: { params: { venueId: string } }) {
  const admin = await superAdminCorrente();
  if (!admin.ok) return apiError(404, "not_found", "Questo indirizzo non esiste.");

  return NextResponse.json({ righe: await storicoOverride(params.venueId) });
}
