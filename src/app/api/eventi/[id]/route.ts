import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, apiErrorResponse, requireVenueApi } from "@/lib/api-auth";
import { auditActor } from "@/server/audit";
import {
  EventoError,
  accettaRichiesta,
  perdiRichiesta,
  scriviPreventivo,
} from "@/server/eventi";

/**
 * I tre gesti di una trattativa: **preventivo**, **accettata**, **persa**.
 *
 * Una rotta e non tre, perché sono tre passi dello stesso oggetto e chi li fa
 * li fa dalla stessa schermata. L'azione sta nel corpo, e ogni ramo dice cosa
 * succede — non è una rotta «fai qualcosa» con un interruttore dentro.
 *
 * Il motivo su «persa» è obbligatorio: «perse: dodici» non insegna niente a
 * nessuno, «otto perse per il prezzo» cambia il listino degli eventi.
 */

export const dynamic = "force-dynamic";

const Corpo = z.discriminatedUnion("azione", [
  z.object({
    azione: z.literal("preventivo"),
    preventivoCents: z.coerce.number().int().nonnegative().nullish(),
    perPersonaCents: z.coerce.number().int().nonnegative().nullish(),
    menuConcordato: z.string().max(2000).nullish(),
    note: z.string().max(1000).nullish(),
    quando: z.coerce.date().nullish(),
    persone: z.coerce.number().int().min(1).max(500).nullish(),
  }),
  z.object({
    azione: z.literal("accetta"),
    quando: z.coerce.date().nullish(),
    persone: z.coerce.number().int().min(1).max(500).nullish(),
    preventivoCents: z.coerce.number().int().nonnegative().nullish(),
  }),
  z.object({ azione: z.literal("persa"), motivo: z.string().min(1).max(300) }),
]);

/** I motivi che valgono una frase loro invece di un errore generico. */
const FRASI: Record<string, string> = {
  non_trovata: "Questa richiesta non esiste più.",
  gia_accettata: "Qualcuno l'ha già accettata: la prenotazione c'è già.",
  senza_data:
    "Serve il giorno: un evento «verso Natale» si accetta quando la data è decisa, altrimenti in agenda finisce una riga senza quando.",
  non_modificabile: "Questa trattativa è già chiusa: non si modifica più.",
  motivo_mancante: "Scrivi perché è andata persa: è il numero che serve al listino.",
};

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const ctx = await requireVenueApi("manage_bookings");
  if (!ctx.ok) return ctx.response;

  try {
    const corpo = Corpo.parse(await req.json());
    const actor = auditActor(ctx, req);

    if (corpo.azione === "preventivo") {
      return NextResponse.json(await scriviPreventivo(ctx.venueId, params.id, corpo, { actor }));
    }
    if (corpo.azione === "accetta") {
      return NextResponse.json(await accettaRichiesta(ctx.venueId, params.id, corpo, { actor }));
    }
    await perdiRichiesta(ctx.venueId, params.id, corpo.motivo, { actor });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof EventoError) {
      const frase = FRASI[err.code] ?? "Non siamo riusciti ad aggiornare la richiesta.";
      /* 409 e non 400: la richiesta era scritta bene, è lo **stato** che non
         la permette. La differenza conta per chi guarda i registri. */
      return apiError(err.code === "non_trovata" ? 404 : 409, err.code, frase);
    }
    return apiErrorResponse(err);
  }
}
