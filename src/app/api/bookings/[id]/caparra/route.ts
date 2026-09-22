import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, apiErrorResponse, requireVenueApi } from "@/lib/api-auth";
import { auditActor } from "@/server/audit";
import { CaparraError, chiediCaparra, rimborsaCaparra } from "@/server/caparre";

/**
 * Chiedere la caparra, e restituirla.
 *
 * Due gesti sulla stessa prenotazione: `chiedi` prepara il pagamento e
 * restituisce **il link** da mandare al cliente; `rimborsa` gli ridà i soldi.
 *
 * `manage_bookings` per chiedere — lo fa chi risponde al telefono, subito dopo
 * aver preso la prenotazione — e `view_revenue` per restituire: quello è denaro
 * che torna indietro, e non è un gesto di sala.
 */

export const dynamic = "force-dynamic";

const Corpo = z.object({ azione: z.enum(["chiedi", "rimborsa"]) });

/** I motivi che valgono una frase loro invece di un errore generico. */
const FRASI: Record<string, string> = {
  non_trovata: "Questa prenotazione non esiste più.",
  gia_pagata: "La caparra è già stata pagata.",
  prenotazione_chiusa: "La prenotazione è chiusa: non si chiede più una caparra.",
  nessuna_caparra:
    "Per questa prenotazione non è prevista una caparra: guarda la regola in Impostazioni → Prenotazioni.",
  stripe_non_pronto:
    "I pagamenti non sono ancora collegati su questo locale: serve il collegamento a Stripe in Impostazioni → Pagamenti.",
  stripe_senza_indirizzo: "Stripe non ha restituito un indirizzo di pagamento: riprova.",
  nessuna_caparra_pagata: "Non c'è nessuna caparra pagata da restituire.",
};

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const corpo = Corpo.safeParse(await req.json().catch(() => ({})));
  if (!corpo.success) return apiError(422, "azione_non_valida", "Azione non riconosciuta.");

  const ctx = await requireVenueApi(
    corpo.data.azione === "rimborsa" ? "view_revenue" : "manage_bookings",
  );
  if (!ctx.ok) return ctx.response;

  try {
    const actor = auditActor(ctx, req);
    if (corpo.data.azione === "chiedi") {
      const origine = new URL(req.url).origin;
      return NextResponse.json(await chiediCaparra(ctx.venueId, params.id, { origine, actor }));
    }
    return NextResponse.json(await rimborsaCaparra(ctx.venueId, params.id, { actor }));
  } catch (err) {
    if (err instanceof CaparraError) {
      const frase = FRASI[err.code] ?? "Non siamo riusciti a completare l'operazione.";
      return apiError(err.code === "non_trovata" ? 404 : 409, err.code, frase);
    }
    return apiErrorResponse(err);
  }
}
