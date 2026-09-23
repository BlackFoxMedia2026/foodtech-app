import type { Salute, StatoInstallazione } from "./tipi";
import { ERRORI_DI_ACCESSO, RIPROVABILI, type CodiceErrore } from "./errori";

/**
 * **Il ciclo di vita di un'installazione, in una tabella.**
 *
 * ```
 *  NOT_INSTALLED ─installa→ INSTALLING ─autenticato→ NEEDS_CONFIGURATION
 *        ▲                                              │ prova riuscita
 *        │ disinstalla (da qualunque stato)             ▼
 *        │                                          CONNECTED ─attiva→ ACTIVE ⇄ SYNCING
 *        │                                                               │  ▲
 *        │                                        errore non di accesso ▼  │ prova/sync ok
 *        │                                                             ERROR
 *        │           errore di accesso, da qualunque stato operativo → REAUTH_REQUIRED
 *        │                                                  ricollegato → NEEDS_CONFIGURATION
 *        └──────────────────────── DISABLED ⇄ (riattiva, dopo una prova) ACTIVE
 * ```
 *
 * Le transizioni ammesse sono **solo** quelle di `TRANSIZIONI`. Il servizio
 * non scrive mai uno stato a mano: chiede `prossimoStato(da, evento)`, e se
 * la risposta è `null` rifiuta l'operazione con `invalid_transition`. Così
 * «attivare» un'integrazione che non ha mai superato una prova di connessione
 * non è una svista possibile — è un errore 409.
 */

export type Evento =
  | { tipo: "installa" }
  | { tipo: "autenticato" }
  | { tipo: "configurato" }
  | { tipo: "prova_riuscita" }
  | { tipo: "prova_fallita"; codice: CodiceErrore }
  | { tipo: "attiva" }
  | { tipo: "sync_inizio" }
  | { tipo: "sync_riuscita" }
  | { tipo: "sync_fallita"; codice: CodiceErrore }
  | { tipo: "errore"; codice: CodiceErrore }
  | { tipo: "disattiva" }
  | { tipo: "riattiva" }
  | { tipo: "disinstalla" };

type Tipo = Evento["tipo"];

/** Da dove si può partire per ogni evento, e dove si arriva. */
const TRANSIZIONI: Record<Tipo, { da: StatoInstallazione[]; a: StatoInstallazione | "dipende" }> = {
  installa: { da: ["NOT_INSTALLED"], a: "INSTALLING" },
  /* Ci si autentica al primo giro e quando si ricollega: in entrambi i casi
     si torna a configurare e riprovare, perché l'account nuovo può avere
     sedi diverse dal vecchio. */
  autenticato: {
    da: ["INSTALLING", "NEEDS_CONFIGURATION", "CONNECTED", "ERROR", "REAUTH_REQUIRED", "DISABLED", "ACTIVE"],
    a: "NEEDS_CONFIGURATION",
  },
  /* Cambiare la configurazione di un'integrazione collegata la rimette da
     provare: una sede diversa è un collegamento diverso. */
  configurato: { da: ["NEEDS_CONFIGURATION", "CONNECTED", "ERROR", "ACTIVE", "DISABLED"], a: "NEEDS_CONFIGURATION" },
  /* Una prova riuscita su un'integrazione attiva (o in errore che torna a
     funzionare) la lascia attiva: provare non deve spegnere niente. */
  prova_riuscita: { da: ["NEEDS_CONFIGURATION", "CONNECTED", "ERROR", "ACTIVE", "DISABLED"], a: "dipende" },
  prova_fallita: {
    da: ["NEEDS_CONFIGURATION", "CONNECTED", "ERROR", "ACTIVE", "DISABLED", "REAUTH_REQUIRED"],
    a: "dipende",
  },
  attiva: { da: ["CONNECTED"], a: "ACTIVE" },
  sync_inizio: { da: ["ACTIVE", "ERROR"], a: "SYNCING" },
  sync_riuscita: { da: ["SYNCING"], a: "ACTIVE" },
  sync_fallita: { da: ["SYNCING"], a: "dipende" },
  errore: { da: ["ACTIVE", "SYNCING", "ERROR", "CONNECTED", "NEEDS_CONFIGURATION"], a: "dipende" },
  disattiva: { da: ["ACTIVE", "ERROR", "CONNECTED", "SYNCING", "REAUTH_REQUIRED", "NEEDS_CONFIGURATION"], a: "DISABLED" },
  /* Riaccendere passa sempre da una prova riuscita, che il servizio fa prima:
     in un mese spenta la password della cassa può essere cambiata. */
  riattiva: { da: ["DISABLED"], a: "ACTIVE" },
  disinstalla: {
    da: [
      "INSTALLING",
      "NEEDS_CONFIGURATION",
      "CONNECTED",
      "SYNCING",
      "ACTIVE",
      "ERROR",
      "DISABLED",
      "REAUTH_REQUIRED",
    ],
    a: "NOT_INSTALLED",
  },
};

export function prossimoStato(da: StatoInstallazione, evento: Evento): StatoInstallazione | null {
  const regola = TRANSIZIONI[evento.tipo];
  if (!regola.da.includes(da)) return null;
  if (regola.a !== "dipende") return regola.a;

  switch (evento.tipo) {
    case "prova_riuscita":
      // Chi era attivo (o in errore dopo essere stato attivo) resta operativo;
      // chi stava configurando diventa «collegato» e aspetta l'attivazione;
      // chi era spento resta spento: riaccenderlo è un gesto a parte.
      if (da === "ACTIVE" || da === "ERROR") return "ACTIVE";
      if (da === "DISABLED") return "DISABLED";
      return "CONNECTED";
    case "prova_fallita":
    case "sync_fallita":
    case "errore":
      if (ERRORI_DI_ACCESSO.has(evento.codice)) return "REAUTH_REQUIRED";
      // Un fornitore lento o che chiede di rallentare non rompe un'integrazione
      // che funziona: resta attiva, e la salute dice «degradata».
      if (RIPROVABILI.has(evento.codice) && (da === "ACTIVE" || da === "SYNCING")) return "ACTIVE";
      // Una prova fallita durante la configurazione non è un guasto: si resta
      // a configurare, e la schermata dice cosa non va.
      if (da === "NEEDS_CONFIGURATION" || da === "CONNECTED") return "NEEDS_CONFIGURATION";
      if (da === "DISABLED") return "DISABLED";
      if (da === "REAUTH_REQUIRED") return "REAUTH_REQUIRED";
      return "ERROR";
    default:
      return null;
  }
}

export class TransizioneNonAmmessa extends Error {
  readonly code = "invalid_transition";
  constructor(da: StatoInstallazione, evento: Tipo) {
    super(`Da «${da}» non si può fare «${evento}».`);
    this.name = "TransizioneNonAmmessa";
  }
}

export function transizione(da: StatoInstallazione, evento: Evento): StatoInstallazione {
  const a = prossimoStato(da, evento);
  if (!a) throw new TransizioneNonAmmessa(da, evento.tipo);
  return a;
}

/* -------------------------------------------------------------------------- */
/*  La salute: lo stato in un colpo d'occhio                                  */
/* -------------------------------------------------------------------------- */

/** Dopo quanto un'integrazione attiva che non sincronizza «sta invecchiando». */
export const ORE_SYNC_VECCHIA = 24;

/**
 * Dallo stato dell'installazione allo stato sintetico.
 *
 * `DEGRADED` è la sfumatura che serve: l'integrazione funziona, ma qualcosa
 * merita un'occhiata — l'ultima sincronizzazione è vecchia, o l'ultimo
 * errore è di quelli che si risolvono da soli (troppe richieste, fornitore
 * lento).
 */
export function saluteDi(i: {
  status: StatoInstallazione;
  lastErrorCode?: string | null;
  lastErrorAt?: Date | null;
  lastSuccessfulSyncAt?: Date | null;
}, adesso: Date = new Date()): Salute {
  switch (i.status) {
    case "REAUTH_REQUIRED":
      return "AUTH_REQUIRED";
    case "ERROR":
      return "ERROR";
    case "ACTIVE":
    case "SYNCING": {
      const erroreRecente =
        i.lastErrorAt &&
        (!i.lastSuccessfulSyncAt || i.lastErrorAt > i.lastSuccessfulSyncAt);
      if (erroreRecente) return "DEGRADED";
      if (
        i.lastSuccessfulSyncAt &&
        adesso.getTime() - i.lastSuccessfulSyncAt.getTime() > ORE_SYNC_VECCHIA * 3_600_000
      ) {
        return "DEGRADED";
      }
      return "HEALTHY";
    }
    case "CONNECTED":
      return "HEALTHY";
    default:
      return "UNKNOWN";
  }
}

/** Gli stati in cui l'integrazione «richiede attenzione» (filtro del catalogo). */
export function richiedeAttenzione(stato: StatoInstallazione, salute: Salute): boolean {
  return stato === "ERROR" || stato === "REAUTH_REQUIRED" || salute === "DEGRADED" || salute === "ERROR";
}

/** Installata = esiste una riga e non è stata disinstallata. */
export function installata(stato: StatoInstallazione | null | undefined): boolean {
  return !!stato && stato !== "NOT_INSTALLED";
}
