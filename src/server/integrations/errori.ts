import { randomBytes } from "node:crypto";
import { estratto, redigiTesto } from "./redazione";

/**
 * **Gli errori delle integrazioni, in due lingue.**
 *
 * La prima è per noi: codice, stato HTTP, indirizzo chiamato, un estratto
 * ripulito della risposta, l'identificativo di correlazione. Resta nel
 * registro e nei log.
 *
 * La seconda è per il ristoratore, e non contiene niente della prima.
 * «401 invalid_grant oauth2 token expired» non dice niente a chi gestisce una
 * sala; «Connessione scaduta — Ricollega Lightspeed» dice cosa fare.
 *
 * Ogni adattatore solleva `ErroreIntegrazione` con uno dei codici qui sotto:
 * è così che il motore sa, senza conoscere il fornitore, se riprovare, se
 * chiedere di ricollegarsi o se fermarsi.
 */

export type CodiceErrore =
  /** Il token è scaduto o revocato: serve ricollegarsi. */
  | "AUTH_EXPIRED"
  /** Le credenziali non sono valide (chiave sbagliata, client revocato). */
  | "AUTH_INVALID"
  /** Autenticati, ma senza il permesso per questa operazione (scope). */
  | "PERMISSION_DENIED"
  | "NOT_FOUND"
  | "RATE_LIMITED"
  /** Il fornitore risponde 5xx o è irraggiungibile. */
  | "PROVIDER_UNAVAILABLE"
  | "TIMEOUT"
  | "NETWORK"
  /** Manca o è sbagliato qualcosa nella configurazione dell'installazione. */
  | "INVALID_CONFIGURATION"
  /** Il fornitore rifiuta i dati inviati. */
  | "VALIDATION"
  | "CONFLICT"
  /** L'adattatore non offre questa operazione. */
  | "NOT_SUPPORTED"
  /** Mancano le variabili della piattaforma (client OAuth di Foodtech, …). */
  | "PLATFORM_NOT_CONFIGURED"
  /** Manca la chiave di cifratura: le credenziali non si possono custodire. */
  | "ENCRYPTION_UNAVAILABLE"
  | "UNKNOWN";

export type DettaglioTecnico = {
  status?: number;
  endpoint?: string;
  metodo?: string;
  codiceFornitore?: string;
  estratto?: string;
  /** Secondi da aspettare, quando il fornitore lo dice (`Retry-After`). */
  riprovaTraSecondi?: number;
  /**
   * L'aggiunta non è entrata perché il conto a cui si accodava è già chiuso
   * presso la cassa. `ordini.ts` allora apre un conto nuovo invece di fallire.
   */
  contoChiuso?: boolean;
};

export class ErroreIntegrazione extends Error {
  readonly correlationId: string;
  constructor(
    readonly codice: CodiceErrore,
    messaggioTecnico: string,
    readonly dettaglio: DettaglioTecnico = {},
    correlationId?: string,
  ) {
    super(redigiTesto(messaggioTecnico).slice(0, 500));
    this.name = "ErroreIntegrazione";
    this.correlationId = correlationId ?? nuovoCorrelationId();
  }

  /** Vale la pena riprovare più tardi senza che nessuno faccia niente. */
  get riprovabile(): boolean {
    return RIPROVABILI.has(this.codice);
  }

  /** Riassunto tecnico da salvare in `lastError` / `IntegrationSyncLog.error`. */
  riassunto(): string {
    const d = this.dettaglio;
    return [
      this.codice,
      d.status ? `HTTP ${d.status}` : null,
      d.metodo && d.endpoint ? `${d.metodo} ${d.endpoint}` : null,
      d.codiceFornitore ? `fornitore=${d.codiceFornitore}` : null,
      this.message,
      d.estratto ? `risposta: ${d.estratto}` : null,
      `corr=${this.correlationId}`,
    ]
      .filter(Boolean)
      .join(" · ")
      .slice(0, 1000);
  }
}

export const RIPROVABILI = new Set<CodiceErrore>(["RATE_LIMITED", "PROVIDER_UNAVAILABLE", "TIMEOUT", "NETWORK"]);

/** Errori che portano l'installazione in `REAUTH_REQUIRED`. */
export const ERRORI_DI_ACCESSO = new Set<CodiceErrore>(["AUTH_EXPIRED", "AUTH_INVALID"]);

export function nuovoCorrelationId(): string {
  return `int_${randomBytes(9).toString("base64url")}`;
}

/**
 * Da una risposta HTTP non riuscita a un codice. Il corpo si guarda solo per
 * i due casi in cui lo stato non basta: `invalid_grant` (il token di rinnovo
 * è morto: è un 400, ma è un problema di accesso) e `insufficient_scope`.
 */
export function codiceDaHttp(status: number, corpo?: unknown): CodiceErrore {
  const testo = typeof corpo === "string" ? corpo : JSON.stringify(corpo ?? "");
  if (/invalid_grant/i.test(testo)) return "AUTH_EXPIRED";
  if (/invalid_client|unauthorized_client/i.test(testo)) return "AUTH_INVALID";
  if (/insufficient_scope/i.test(testo)) return "PERMISSION_DENIED";
  if (status === 401) return "AUTH_EXPIRED";
  if (status === 403) return "PERMISSION_DENIED";
  if (status === 404) return "NOT_FOUND";
  if (status === 409) return "CONFLICT";
  if (status === 408) return "TIMEOUT";
  if (status === 429) return "RATE_LIMITED";
  if (status === 400 || status === 422) return "VALIDATION";
  if (status >= 500) return "PROVIDER_UNAVAILABLE";
  return "UNKNOWN";
}

export function erroreDaHttp(
  status: number,
  corpo: unknown,
  richiesta: { metodo: string; endpoint: string; riprovaTraSecondi?: number },
  correlationId?: string,
): ErroreIntegrazione {
  const codiceFornitore =
    corpo && typeof corpo === "object"
      ? String((corpo as Record<string, unknown>).error ?? (corpo as Record<string, unknown>).code ?? "") ||
        undefined
      : undefined;
  return new ErroreIntegrazione(
    codiceDaHttp(status, corpo),
    `Il fornitore ha risposto ${status}`,
    {
      status,
      metodo: richiesta.metodo,
      endpoint: richiesta.endpoint,
      codiceFornitore,
      estratto: estratto(corpo),
      riprovaTraSecondi: richiesta.riprovaTraSecondi,
    },
    correlationId,
  );
}

/** Qualunque cosa sollevata dentro un adattatore diventa un `ErroreIntegrazione`. */
export function normalizzaErrore(err: unknown, correlationId?: string): ErroreIntegrazione {
  if (err instanceof ErroreIntegrazione) return err;
  if (err instanceof Error && err.name === "ErroreDiCifratura") {
    return new ErroreIntegrazione("ENCRYPTION_UNAVAILABLE", err.message, {}, correlationId);
  }
  if (err instanceof Error && (err.name === "AbortError" || err.name === "TimeoutError")) {
    return new ErroreIntegrazione("TIMEOUT", "Il fornitore non ha risposto in tempo", {}, correlationId);
  }
  if (err instanceof TypeError && /fetch|network|ECONN|ENOTFOUND/i.test(err.message)) {
    return new ErroreIntegrazione("NETWORK", err.message, {}, correlationId);
  }
  return new ErroreIntegrazione(
    "UNKNOWN",
    err instanceof Error ? err.message : String(err),
    {},
    correlationId,
  );
}

/* -------------------------------------------------------------------------- */
/*  La lingua del ristoratore                                                 */
/* -------------------------------------------------------------------------- */

export type AzioneSuggerita = "ricollega" | "riprova" | "configura" | "contattaci" | null;

export type MessaggioErrore = { titolo: string; spiegazione: string; azione: AzioneSuggerita };

/**
 * Cosa dire al ristoratore. `nome` è il nome dell'integrazione («Lightspeed
 * Restaurant»): serve a scrivere «Ricollega Lightspeed», che è un pulsante,
 * e non «ricollega il fornitore», che è un enigma.
 */
export function messaggioPerIlRistoratore(
  codice: string | null | undefined,
  nome: string,
  /** Le frasi della voce del catalogo (`VoceCatalogo.messaggi`), quando le ha. */
  proprie?: Partial<Record<string, { titolo: string; spiegazione: string }>>,
): MessaggioErrore {
  const base = messaggioGenerico(codice, nome);
  const propria = codice ? proprie?.[codice] : undefined;
  return propria ? { ...base, ...propria } : base;
}

function messaggioGenerico(codice: string | null | undefined, nome: string): MessaggioErrore {
  switch (codice as CodiceErrore) {
    case "AUTH_EXPIRED":
      return {
        titolo: "Connessione scaduta",
        spiegazione: `L'accesso a ${nome} non è più valido. Ricollega l'account per riprendere.`,
        azione: "ricollega",
      };
    case "AUTH_INVALID":
      return {
        titolo: "Credenziali non valide",
        spiegazione: `${nome} non riconosce le credenziali salvate. Ricollega l'account.`,
        azione: "ricollega",
      };
    case "PERMISSION_DENIED":
      return {
        titolo: "Permessi insufficienti",
        spiegazione: `L'account ${nome} collegato non ha i permessi per questa operazione. Ricollegalo con un utente amministratore.`,
        azione: "ricollega",
      };
    case "RATE_LIMITED":
      return {
        titolo: "Troppe richieste",
        spiegazione: `${nome} ci ha chiesto di rallentare. Riproviamo da soli fra poco.`,
        azione: null,
      };
    case "PROVIDER_UNAVAILABLE":
    case "TIMEOUT":
    case "NETWORK":
      return {
        titolo: `${nome} non risponde`,
        spiegazione: "Il servizio del fornitore non è raggiungibile in questo momento. Riproviamo da soli; puoi anche riprovare tu.",
        azione: "riprova",
      };
    case "INVALID_CONFIGURATION":
    case "NOT_FOUND":
      return {
        titolo: "Configurazione da rivedere",
        spiegazione: `Qualcosa della configurazione non corrisponde più a ciò che c'è su ${nome} (per esempio una sede eliminata).`,
        azione: "configura",
      };
    case "VALIDATION":
    case "CONFLICT":
      return {
        titolo: "Dati rifiutati",
        spiegazione: `${nome} non ha accettato i dati inviati. Abbiamo conservato il dettaglio per capire perché.`,
        azione: "contattaci",
      };
    case "NOT_SUPPORTED":
      return {
        titolo: "Non disponibile",
        spiegazione: `${nome} non permette questa operazione.`,
        azione: null,
      };
    case "PLATFORM_NOT_CONFIGURED":
      return {
        titolo: "Non ancora attiva su Foodtech",
        spiegazione: `Il collegamento con ${nome} richiede un accordo con il fornitore che non è ancora attivo. Scrivici se ti serve.`,
        azione: "contattaci",
      };
    case "ENCRYPTION_UNAVAILABLE":
      return {
        titolo: "Custodia delle credenziali non pronta",
        spiegazione: "Questa installazione di Foodtech non può ancora conservare credenziali in modo sicuro. Scrivici e la attiviamo.",
        azione: "contattaci",
      };
    default:
      return {
        titolo: "Qualcosa non ha funzionato",
        spiegazione: `L'operazione con ${nome} non è riuscita. Abbiamo conservato il dettaglio; se si ripete, scrivici.`,
        azione: "riprova",
      };
  }
}
