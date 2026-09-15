import { NextResponse } from "next/server";
import { apiErrorResponse, requireVenueApi } from "@/lib/api-auth";
import { listRedemptions } from "@/server/coupons";

/**
 * Chi ha usato questo coupon, e quando.
 *
 * `listRedemptions` esisteva da sempre in `server/coupons.ts` e non era
 * renderizzata da nessuna parte: l'unico modo di sapere se uno sconto stesse
 * funzionando era leggere un contatore. Il pannello «Gestisci» la mostra, e
 * per farlo serviva una porta.
 *
 * Si carica solo all'apertura del pannello, non con l'elenco: undici coupon
 * per cinquanta utilizzi ciascuno sono cinquecentocinquanta righe per una
 * pagina che ne mostra zero finché nessuno chiede.
 *
 * Il permesso è `edit_marketing` come per le altre porte dei coupon: qui
 * dentro ci sono nomi di ospiti, e chi non può toccare il marketing non ha
 * motivo di leggere chi è venuto a cena con quale sconto. Il filtro per locale
 * sta dentro la funzione, sulla riga dell'utilizzo: un identificativo di un
 * altro ristorante non restituisce niente invece di restituire i suoi dati.
 */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const ctx = await requireVenueApi("edit_marketing");
  if (!ctx.ok) return ctx.response;
  try {
    return NextResponse.json(await listRedemptions(ctx.venueId, params.id));
  } catch (err) {
    return apiErrorResponse(err);
  }
}
