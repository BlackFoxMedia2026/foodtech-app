import { logErrore } from "./observability";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { resolveActiveVenue, type ActiveVenueContext } from "./tenant";
import { can, type Ability } from "./abilities";
import { messaggioDiValidazione } from "./validation-message";

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
    return apiError(422, "validation_failed", messaggioDiValidazione(err), err.flatten());
  }

  // Gli errori di dominio portano un codice: qui diventa lo status giusto,
  // senza che questo file debba conoscere i moduli che li sollevano.
  const code = err instanceof Error && "code" in err ? String((err as { code?: unknown }).code) : "";
  const perCodice: Record<string, number> = {
    not_found: 404,
    no_table: 404,
    invalid_transition: 409,
    already_closed: 409,
    conflict: 409,
  };
  if (code && perCodice[code]) {
    return apiError(perCodice[code], code, err instanceof Error ? err.message : "Operazione non possibile.",
      "detail" in (err as object) ? (err as { detail?: unknown }).detail : undefined);
  }

  const message = err instanceof Error ? err.message : "";

  if (message === "not_found") {
    return apiError(404, "not_found", "Questo elemento non esiste più.");
  }
  if (message === "conflict") {
    return apiError(409, "conflict", "Qualcuno ha modificato questo elemento nel frattempo.");
  }
  if (message === "campaign_already_sent") {
    return apiError(409, "campaign_already_sent", "Questa campagna è già partita: non si può inviare due volte.");
  }
  if (message === "campaign_already_handed_over") {
    return apiError(
      409,
      "campaign_already_handed_over",
      "Questa campagna era già stata consegnata al fornitore: non la rimandiamo, per non scrivere due volte agli stessi clienti."
    );
  }
  if (message === "no_recipients") {
    return apiError(
      422,
      "no_recipients",
      "Nessun destinatario: con questi criteri non c'è nessun cliente con email e consenso."
    );
  }
  if (message === "category_not_empty") {
    return apiError(
      409,
      "category_not_empty",
      "Questa categoria contiene dei piatti: spostali o disattiva la categoria invece di eliminarla."
    );
  }
  if (message === "item_ordered") {
    return apiError(
      409,
      "item_ordered",
      "Questo piatto è già stato ordinato: eliminandolo si perderebbe la storia delle sue vendite. Segnalo non disponibile e sparirà dalla carta."
    );
  }
  if (message === "code_taken") {
    return apiError(409, "code_taken", "Questo codice è già in uso: scegline un altro.");
  }
  if (message === "has_tickets") {
    return apiError(
      409,
      "has_tickets",
      "Ci sono biglietti registrati per questa esperienza: riportala in bozza invece di eliminarla."
    );
  }
  if (message === "no_channel") {
    return apiError(
      422,
      "no_channel",
      "L'email non è configurata: senza chiave del fornitore non parte nessun messaggio."
    );
  }
  if (message === "send_failed") {
    return apiError(502, "send_failed", "Il fornitore email non ha accettato il messaggio. Riprova.");
  }
  if (message === "permission_denied") {
    return apiError(403, "forbidden", "Il tuo ruolo non consente questa operazione.");
  }

  // L'unico errore che non sappiamo spiegare: si scrive con il suo evento
  // cercabile, perché è quello su cui si costruirà l'allarme il giorno che
  // ci sarà un fornitore. Il percorso della richiesta lo aggiunge già Vercel,
  // che associa i log alla richiesta che li ha prodotti.
  logErrore("api.errore_non_gestito", err);
  return apiError(500, "internal_error", "Qualcosa è andato storto. Riprova.");
}
