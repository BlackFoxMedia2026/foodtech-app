import { logErrore } from "./observability";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { auth } from "./auth";
import { resolveActiveVenue, type ActiveVenueContext } from "./tenant";
import { can, type Ability } from "./abilities";
import { messaggioDiValidazione } from "./validation-message";
import { tokenDaIntestazione, type Ambito } from "@/lib/api-token-forma";
import { verificaApiToken } from "@/server/api-token";

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
/**
 * Solo «chi sei», senza chiedere un locale.
 *
 * `requireVenueApi` risponde **403 no_venue** a chi non appartiene a nessun
 * ristorante, ed è giusto per tutto quello che riguarda un locale. Ma non per
 * l'accesso di una persona: l'amministratore di piattaforma non appartiene a
 * nessun locale — è la sua condizione normale, dichiarata in
 * `lib/super-admin.ts` — e con quel 403 non poteva **accendere i due fattori
 * sul proprio accesso**. Cioè la difesa mancava proprio a chi vede tutti i
 * locali.
 *
 * Da qui passa solo ciò che appartiene alla persona: i suoi due fattori, la
 * sua password, le sue sessioni.
 */
export async function requireUtenteApi(): Promise<
  { ok: true; userId: string; email: string } | { ok: false; response: NextResponse }
> {
  const session = await auth();
  const u = session?.user as { id?: string; email?: string } | undefined;
  const userId = (session as { uid?: string } | null)?.uid ?? u?.id;
  if (!userId || !u?.email) {
    return {
      ok: false,
      response: apiError(401, "unauthenticated", "Sessione scaduta. Rientra per continuare."),
    };
  }
  return { ok: true, userId, email: u.email };
}

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

export type ApiTokenContext = { ok: true; venueId: string; tokenId: string; ambiti: string[] };
export type ApiTokenResult = ApiTokenContext | VenueApiFailure;

/**
 * Il guardiano delle rotte che usa un **servizio esterno**, non una persona.
 *
 * `requireVenueApi` legge la sessione del browser: serve a chi ha fatto
 * l'accesso. Il centralino telefonico non ha una sessione — vive su un altro
 * server — e si presenta con un token che vale per **un locale solo**.
 *
 * Il motivo del rifiuto resta fuori dalla risposta: a chi chiama si dice solo
 * «no». Sapere *perché* un token non va (sconosciuto? scaduto? senza
 * l'ambito?) aiuta chi prova a indovinarlo, e non aiuta chi ha un token
 * valido. Il motivo va nel registro del server, dove serve a noi.
 */
export async function requireApiToken(req: Request, ambito: Ambito): Promise<ApiTokenResult> {
  const esito = await verificaApiToken(
    tokenDaIntestazione(req.headers.get("authorization")),
    ambito,
  );

  if (!esito.ok) {
    /* Un ambito mancante è un 403, non un 401: il token è valido, quello che
       chiede non gli è concesso. La differenza conta per chi integra — un 401
       dice «rifai il token», un 403 dice «chiedi un permesso». */
    if (esito.motivo === "ambito") {
      return {
        ok: false,
        response: apiError(403, "forbidden", "Questo token non è abilitato a questa operazione.", {
          ambito,
        }),
      };
    }
    // eslint-disable-next-line no-console
    console.warn(`[api-token] rifiutato: ${esito.motivo}`);
    return {
      ok: false,
      response: apiError(401, "unauthenticated", "Token non valido."),
    };
  }

  return { ok: true, venueId: esito.venueId, tokenId: esito.tokenId, ambiti: esito.ambiti };
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

  /*
    Stripe non configurato non è un guasto: è una funzione spenta su questa
    installazione, e 503 lo dice — «non adesso», non «hai sbagliato tu». Il
    messaggio evita la parola Stripe: chi usa Foodtech compra da Foodtech, e
    il nome di chi incassa per noi non gli serve per capire cosa fare.
  */
  if (err instanceof Error && err.name === "StripeNonConfigurato") {
    return apiError(
      503,
      "payments_unavailable",
      "I pagamenti non sono ancora attivi su questa installazione. Scrivici e lo attiviamo.",
    );
  }

  if (err instanceof ZodError) {
    return apiError(422, "validation_failed", messaggioDiValidazione(err), err.flatten());
  }

  /*
    Errori di dominio che sanno già il proprio status: li sollevano le
    integrazioni (`server/integrations/`), dove lo status dipende dal
    fornitore — un accesso scaduto è un 409 («ricollega»), un fornitore giù
    è un 502 — e una tabella per codice qui dovrebbe conoscere ogni
    fornitore. Il messaggio è già quello per il ristoratore.
  */
  if (
    err instanceof Error &&
    typeof (err as { httpStatus?: unknown }).httpStatus === "number" &&
    typeof (err as { code?: unknown }).code === "string"
  ) {
    const e = err as Error & { httpStatus: number; code: string; detail?: unknown };
    return apiError(e.httpStatus, e.code, e.message, e.detail);
  }

  // Gli errori di dominio portano un codice: qui diventa lo status giusto,
  // senza che questo file debba conoscere i moduli che li sollevano.
  const code = err instanceof Error && "code" in err ? String((err as { code?: unknown }).code) : "";
  const perCodice: Record<string, number> = {
    not_found: 404,
    // Dati che Zod non può bocciare da solo perché il difetto sta nel
    // rapporto fra due campi — l'ora di fine prima di quella di inizio — e si
    // vede solo dopo averli letti entrambi. Resta un 422 come gli altri.
    validation_failed: 422,
    no_table: 404,
    invalid_transition: 409,
    already_closed: 409,
    conflict: 409,
    /*
      Gli invii DEM finiti non sono un dato sbagliato né un conflitto: sono un
      limite del piano, e 402 è l'unico status che lo dice. Il corpo porta i
      numeri (disponibili, richiesti, mancanti) perché la schermata deve poter
      scrivere «te ne mancano 2.390», non «errore».
    */
    dem_quota_insufficient: 402,
    dem_sending_paused: 409,
    /*
      Il budget di infrastruttura è un limite **nostro**, non del piano del
      cliente: 409 e non 402, perché non c'è niente che il ristorante possa
      pagare per sbloccarlo. Lo sblocca un'autorizzazione del Super Admin.
    */
    dem_budget_exceeded: 409,
    /*
      Non sapere quanto costa un invio è un guasto nostro, e 503 lo dice:
      riprova più tardi, il problema non è la tua richiesta.
    */
    cost_calculation_unavailable: 503,
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
  if (message === "dem_test_limit") {
    return apiError(
      429,
      "dem_test_limit",
      "Hai già mandato parecchie prove di questa campagna. Gli invii di prova partono davvero e " +
        "scalano dal tuo piano: se il contenuto è pronto, mandala.",
    );
  }
  if (message === "dem_plan_not_purchasable") {
    return apiError(
      422,
      "dem_plan_not_purchasable",
      "Questo piano non è ancora acquistabile. Riprova più tardi o scrivici.",
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
