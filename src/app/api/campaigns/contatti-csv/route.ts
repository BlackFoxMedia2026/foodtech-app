import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, apiErrorResponse, requireVenueApi } from "@/lib/api-auth";
import { auditActor } from "@/server/audit";
import { anteprimaContatti, importaContatti } from "@/server/campaign-contatti";
import { SegmentFilter } from "@/server/campaigns";

/**
 * Destinatari da un file CSV, nel passo «Destinatari» della campagna.
 *
 * Come l'importazione clienti (`/api/venue/importa`): `esegui` assente
 * **guarda** e non scrive, `esegui: true` scrive. Per scrivere serve anche
 * `consensoDichiarato: true` — la casella «ho il consenso di queste persone»
 * — altrimenti la richiesta si rifiuta: vedi `server/campaign-contatti.ts`.
 */

export const dynamic = "force-dynamic";

const TESTO_MASSIMO = 2 * 1024 * 1024;

const Corpo = z.object({
  testo: z.string().min(1).max(TESTO_MASSIMO),
  esegui: z.boolean().optional(),
  consensoDichiarato: z.boolean().optional(),
  campaignId: z.string().max(40).nullable().optional(),
  /** Quale colonna è quale, come l'ha confermato chi carica il file. */
  colonne: z
    .object({
      email: z.number().int().min(0).max(200),
      nome: z.number().int().min(0).max(200).optional(),
      cognome: z.number().int().min(0).max(200).optional(),
      nomeCompleto: z.number().int().min(0).max(200).optional(),
      telefono: z.number().int().min(0).max(200).optional(),
    })
    .optional(),
  /** Il pubblico attuale: chi lo riceve già viene saltato. */
  segment: SegmentFilter.optional(),
});

export async function POST(req: Request) {
  const ctx = await requireVenueApi("edit_marketing");
  if (!ctx.ok) return ctx.response;

  try {
    const corpo = Corpo.parse(await req.json());
    if (!corpo.esegui) {
      return NextResponse.json(await anteprimaContatti(ctx.venueId, corpo.testo, corpo.colonne, corpo.segment));
    }
    if (!corpo.consensoDichiarato) {
      return apiError(
        400,
        "consenso_non_dichiarato",
        "Per aggiungere questi contatti devi confermare di avere il loro consenso a ricevere email.",
      );
    }
    return NextResponse.json(
      await importaContatti(ctx.venueId, corpo.testo, {
        actor: auditActor(ctx, req),
        campaignId: corpo.campaignId ?? null,
        abbinamento: corpo.colonne,
        segment: corpo.segment,
      }),
    );
  } catch (err) {
    if (err instanceof z.ZodError) {
      const sulTesto = err.issues.filter((i) => i.path[0] === "testo");
      if (sulTesto.some((i) => i.code === "too_big")) {
        return apiError(
          413,
          "file_troppo_grande",
          "Il file è troppo grande: dividilo in due e caricali uno per volta.",
        );
      }
      if (sulTesto.some((i) => i.code === "too_small")) {
        return apiError(400, "file_vuoto", "Il file è vuoto: controlla di aver scelto quello giusto.");
      }
      return apiError(400, "richiesta_non_valida", "La richiesta non è valida: ricarica la pagina e riprova.");
    }
    return apiErrorResponse(err);
  }
}
