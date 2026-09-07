import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { resolveActiveVenue, type ActiveVenueContext } from "./tenant";
import { can, type Ability } from "./abilities";

/**
 * Punto unico da cui passano autenticazione, locale attivo e permessi delle
 * route API.
 *
 * Prima ogni route chiamava getActiveVenue(), che redirige: una richiesta
 * senza sessione riceveva 307 verso /sign-in, il client seguiva il redirect,
 * otteneva HTML e res.json() esplodeva. Chi ha la sessione scaduta vedeva un
 * errore di parsing invece di "rientra".
 *
 * E il controllo del ruolo era facoltativo: 11 mutazioni — fra cui la
 * creazione di una prenotazione — non lo facevano affatto, quindi un membro
 * READ_ONLY poteva scrivere. Qui la capacità richiesta è un argomento, così
 * dimenticarla è una scelta esplicita e non una distrazione.
 *
 * Uso:
 *
 *   const ctx = await requireVenueApi("manage_staff");
 *   if (!ctx.ok) return ctx.response;
 *   // qui ctx.venueId, ctx.role, ctx.userId sono garantiti
 */

export type VenueApiContext = ActiveVenueContext & { ok: true };
export type VenueApiFailure = { ok: false; response: NextResponse };
export type VenueApiResult = VenueApiContext | VenueApiFailure;

/** Errore applicativo con uno status HTTP che significa qualcosa. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly detail?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function apiError(status: number, code: string, message: string, detail?: unknown) {
  return NextResponse.json({ error: code, message, ...(detail ? { detail } : {}) }, { status });
}

/** 401 quando manca la sessione, 403 quando manca il locale o la capacità. */
export async function requireVenueApi(ability?: Ability): Promise<VenueApiResult> {
  const resolved = await resolveActiveVenue();

  if (resolved.state === "unauthenticated") {
    return {
      ok: false,
      response: apiError(401, "unauthenticated", "Sessione scaduta. Rientra per continuare."),
    };
  }

  if (resolved.state === "no_venue") {
    return {
      ok: false,
      response: apiError(403, "no_venue", "Il tuo account non è collegato a nessun locale."),
    };
  }

  if (ability && !can(resolved.context.role, ability)) {
    return {
      ok: false,
      response: apiError(
        403,
        "forbidden",
        "Il tuo ruolo non consente questa operazione.",
        { ability, role: resolved.context.role },
      ),
    };
  }

  return { ok: true, ...resolved.context };
}

/**
 * Traduce in status HTTP gli errori che i moduli server sollevano già oggi,
 * invece di appiattire tutto su 400: "not_found" nasce da un findFirst che non
 * trova nulla nel locale corrente, e per il client è un 404, non un dato
 * malformato.
 */
export function apiErrorResponse(err: unknown) {
  if (err instanceof ApiError) {
    return apiError(err.status, err.code, err.message, err.detail);
  }

  if (err instanceof ZodError) {
    return apiError(422, "validation_failed", "Alcuni campi non sono validi.", err.flatten());
  }

  const message = err instanceof Error ? err.message : "";

  if (message === "not_found") {
    return apiError(404, "not_found", "Questo elemento non esiste più.");
  }
  if (message === "conflict") {
    return apiError(409, "conflict", "Qualcuno ha modificato questo elemento nel frattempo.");
  }
  if (message === "permission_denied") {
    return apiError(403, "forbidden", "Il tuo ruolo non consente questa operazione.");
  }

  console.error("[api] errore non gestito:", err);
  return apiError(500, "internal_error", "Qualcosa è andato storto. Riprova.");
}
