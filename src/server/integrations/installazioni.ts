import { motivoRilascio } from "./certificazione/accesso";
import { randomBytes } from "node:crypto";
import { Prisma as PrismaValori, type IntegrationInstallation, type Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { logEvento } from "@/lib/observability";
import { enqueueJob } from "@/server/jobs/queue";
import { recordAudit, type AuditActor } from "@/server/audit";
import { requisitiMancanti, voceDi, type VoceCatalogo } from "./registry";
import { adattatoreDi } from "./adapters";
import type { ContestoAdattatore, CredenzialiNuove, IntegrationAdapter, InstallazioneVista } from "./adapters/tipi";
import { creaClientFornitore, type ClientFornitore } from "./adapters/http";
import {
  cancellaCredenziali,
  aggiungiSegreti,
  credenzialiFresche,
  custodiaPronta,
  salvaCredenziali,
  type CredenzialiLette,
} from "./credenziali";
import { ErroreIntegrazione, messaggioPerIlRistoratore, normalizzaErrore, nuovoCorrelationId } from "./errori";
import { saluteDi, transizione, type Evento } from "./stati";
import { creaState } from "./oauth-state";
import { gruppiAccesi } from "./cliente";
import type { Capacita, StatoInstallazione } from "./tipi";

/**
 * **Il servizio integrazioni.** Il punto in mezzo:
 *
 * ```
 * rotte / interfaccia → installazioni.ts → adattatore → fornitore
 * ```
 *
 * Qui stanno le regole che valgono per ogni fornitore: chi può partire da
 * quale stato, dove finiscono le credenziali, cosa si registra, cosa si dice
 * al ristoratore quando qualcosa va storto. Gli adattatori non sanno niente
 * di tutto questo; le rotte non sanno niente dei fornitori.
 *
 * ## L'isolamento
 *
 * Ogni funzione riceve `venueId` **dal contesto della richiesta** (mai dal
 * corpo) e ogni lettura filtra `{ venueId, integrationSlug }`. Un'installazione
 * si trova solo dentro il proprio locale: non esiste una funzione che la
 * cerchi per `id` da sola. La stessa regola di `docs/SECURITY.md`, e la
 * stessa prova (`integrazioni-isolamento`).
 */

export type Attore = {
  venueId: string;
  orgId: string;
  userId: string;
  audit?: AuditActor;
};

/* -------------------------------------------------------------------------- */
/*  Errori di servizio                                                        */
/* -------------------------------------------------------------------------- */

const STATUS_PER_CODICE: Record<string, number> = {
  not_found: 404,
  forbidden: 403,
  conflict: 409,
  invalid_transition: 409,
  validation_failed: 422,
  integration_not_available: 409,
  integration_coming_soon: 409,
  integration_beta_required: 403,
  integration_suspended: 423,
  integration_native: 409,
  integration_platform_not_configured: 503,
  integration_encryption_unavailable: 503,
};

function erroreServizio(code: string, message: string, detail?: unknown, httpStatus?: number) {
  return Object.assign(new Error(message), { code, detail, httpStatus: httpStatus ?? STATUS_PER_CODICE[code] ?? 400 });
}

/**
 * Da un errore del fornitore a un errore di rotta: il codice HTTP dice cosa
 * fare al client, il messaggio è già quello per il ristoratore. Il
 * dettaglio tecnico **non** esce: resta nel registro.
 */
export function erroreVersoLaRotta(err: unknown, voce: Pick<VoceCatalogo, "nome" | "messaggi">) {
  if (err instanceof ErroreIntegrazione) {
    const m = messaggioPerIlRistoratore(err.codice, voce.nome, voce.messaggi);
    const status =
      err.codice === "PLATFORM_NOT_CONFIGURED" || err.codice === "ENCRYPTION_UNAVAILABLE"
        ? 503
        : err.codice === "AUTH_EXPIRED" || err.codice === "AUTH_INVALID" || err.codice === "PERMISSION_DENIED"
          ? 409
          : err.codice === "INVALID_CONFIGURATION" || err.codice === "VALIDATION"
            ? 422
            : 502;
    return erroreServizio(
      `integration_${err.codice.toLowerCase()}`,
      `${m.titolo}. ${m.spiegazione}`,
      { azione: m.azione, correlationId: err.correlationId },
      status,
    );
  }
  return err;
}

/* -------------------------------------------------------------------------- */
/*  Letture                                                                   */
/* -------------------------------------------------------------------------- */

export function voceObbligatoria(slug: string): VoceCatalogo {
  const v = voceDi(slug);
  if (!v) throw erroreServizio("not_found", "Questa integrazione non esiste nel catalogo.");
  return v;
}

function adattatoreObbligatorio(slug: string): IntegrationAdapter {
  const a = adattatoreDi(slug);
  if (!a) throw erroreServizio("integration_not_available", "Questa integrazione non è ancora disponibile.");
  return a;
}

export async function trovaInstallazione(venueId: string, slug: string) {
  return db.integrationInstallation.findFirst({ where: { venueId, integrationSlug: slug } });
}

async function installazioneObbligatoria(venueId: string, slug: string) {
  const i = await trovaInstallazione(venueId, slug);
  if (!i || i.status === "NOT_INSTALLED") {
    throw erroreServizio("not_found", "Questa integrazione non è installata su questo locale.");
  }
  return i;
}

export function vistaPerAdattatore(i: IntegrationInstallation): InstallazioneVista {
  return {
    id: i.id,
    venueId: i.venueId,
    configuration: (i.configuration ?? {}) as Record<string, unknown>,
    enabledCapabilities: i.enabledCapabilities,
    externalAccountId: i.externalAccountId,
    externalLocationId: i.externalLocationId,
    webhookKey: i.webhookKey,
    metadata: i.metadata && typeof i.metadata === "object" ? (i.metadata as Record<string, unknown>) : null,
  };
}

/* -------------------------------------------------------------------------- */
/*  Il contesto di un adattatore                                              */
/* -------------------------------------------------------------------------- */

/** Chi costruisce i client HTTP: sostituibile nelle prove. */
let fetchDelleProve: typeof fetch | undefined;
/** Vero quando le chiamate ai fornitori vanno a un `fetch` finto (prove): mai evidenze API. */
export function fetchDiProvaAttivo(): boolean {
  return !!fetchDelleProve;
}

export function usaFetchPerProve(f: typeof fetch | undefined) {
  if (process.env.NODE_ENV === "production") throw new Error("solo_nelle_prove");
  fetchDelleProve = f;
}

export function clientPer(slug: string, correlationId: string, token?: () => string | undefined): ClientFornitore {
  return creaClientFornitore({
    slug,
    correlationId,
    fetchImpl: fetchDelleProve,
    intestazioni: (): Record<string, string> => {
      const t = token?.();
      return t ? { Authorization: `Bearer ${t}` } : {};
    },
  });
}

/**
 * Il contesto pronto: credenziali decifrate e rinnovate se serve, client
 * HTTP con l'intestazione giusta. Esiste solo dentro la chiamata che lo
 * crea, e non esce mai da questo modulo verso una rotta.
 */
export async function contestoFresco(
  i: IntegrationInstallation,
  origine: string,
  correlationId = nuovoCorrelationId(),
): Promise<ContestoAdattatore> {
  const adattatore = adattatoreObbligatorio(i.integrationSlug);
  if (sospensioneDi(i)) {
    // Ogni chiamata a un fornitore passa da qui (anche il rinnovo dei token).
    throw new ErroreIntegrazione("INVALID_CONFIGURATION", "Integrazione sospesa da Foodtech");
  }
  const vista = vistaPerAdattatore(i);

  const lette: CredenzialiLette = await credenzialiFresche(i, adattatore, async (segreti) => {
    const ctxRinnovo: ContestoAdattatore = {
      installazione: vista,
      segreti,
      http: clientPer(i.integrationSlug, correlationId),
      correlationId,
      origine,
    };
    return adattatore.rinnovaAutenticazione!(ctxRinnovo);
  });

  const segreti = lette.segreti;
  return {
    installazione: vista,
    segreti,
    http: clientPer(i.integrationSlug, correlationId, () =>
      lette.kind === "OAUTH2" || lette.kind === "TOKEN" ? segreti.accessToken : undefined,
    ),
    correlationId,
    origine,
  };
}

/* -------------------------------------------------------------------------- */
/*  Scrivere uno stato                                                        */
/* -------------------------------------------------------------------------- */

/**
 * L'unico posto che scrive `status`. Passa sempre dalla tabella delle
 * transizioni, e ricalcola la salute nella stessa scrittura: salute e stato
 * non possono andare fuori sincrono.
 *
 * La scrittura è **condizionata allo stato letto** (`updateMany` con
 * `status` nel filtro): se nel frattempo qualcun altro l'ha cambiato — una
 * disinstallazione mentre una prova era in corso — non si resuscita
 * niente.
 */
/* -------------------------------------------------------------------------- */
/*  Sospensione da parte di Foodtech                                          */
/* -------------------------------------------------------------------------- */

/**
 * La sospensione decisa da un Super Admin: il freno d'emergenza. Vive nei
 * metadati dell'installazione (e sopravvive alla disinstallazione, che
 * altrimenti basterebbe a toglierla) e tiene l'integrazione in DISABLED:
 * nessuna chiamata al fornitore, nessuna sincronizzazione, nessun ordine in
 * uscita, webhook conservati e ignorati. Configurazione e mappature restano.
 */
export type Sospensione = { da: string; il: string; motivo: string | null };

export function sospensioneDi(i: Pick<IntegrationInstallation, "metadata">): Sospensione | null {
  const m = i.metadata && typeof i.metadata === "object" ? (i.metadata as Record<string, unknown>) : {};
  const s = m.sospensione as Sospensione | undefined;
  return s && typeof s === "object" && typeof s.da === "string" ? s : null;
}

function bloccaSeSospesa(i: Pick<IntegrationInstallation, "metadata">) {
  const s = sospensioneDi(i);
  if (s) {
    throw erroreServizio(
      "integration_suspended",
      "Integrazione sospesa da Foodtech: nessuna operazione verso il fornitore finché la sospensione non viene revocata.",
      { sospesaIl: s.il },
    );
  }
}

async function applicaEvento(
  i: IntegrationInstallation,
  evento: Evento,
  extra: Prisma.IntegrationInstallationUpdateManyMutationInput = {},
): Promise<IntegrationInstallation> {
  const nuovo = transizione(i.status as StatoInstallazione, evento);
  // Ultima difesa: da sospesa si resta spenta (o si disinstalla), per qualunque strada.
  if (sospensioneDi(i) && nuovo !== "DISABLED" && nuovo !== "NOT_INSTALLED") bloccaSeSospesa(i);
  const dopo = { ...i, ...(extra as Partial<IntegrationInstallation>), status: nuovo };
  const salute = saluteDi(dopo);
  const voce = voceDi(i.integrationSlug);
  const { count } = await db.integrationInstallation.updateMany({
    where: { id: i.id, venueId: i.venueId, status: i.status },
    data: {
      ...extra,
      status: nuovo,
      healthStatus: salute,
      healthMessage: fraseDiSalute(salute, dopo.lastErrorCode, voce?.nome ?? i.integrationSlug, voce?.messaggi),
    },
  });
  if (count === 0) {
    throw erroreServizio("conflict", "L'integrazione è cambiata nel frattempo. Ricarica la pagina.");
  }
  return db.integrationInstallation.findFirstOrThrow({ where: { id: i.id, venueId: i.venueId } });
}

export function fraseDiSalute(
  salute: string,
  codice: string | null | undefined,
  nome: string,
  messaggi?: VoceCatalogo["messaggi"],
): string | null {
  if (salute === "AUTH_REQUIRED" || salute === "ERROR" || (salute === "DEGRADED" && codice)) {
    const m = messaggioPerIlRistoratore(codice, nome, messaggi);
    return m.spiegazione.slice(0, 300);
  }
  if (salute === "DEGRADED") return "L'ultima sincronizzazione riuscita è di più di un giorno fa.";
  return null;
}

/** I campi di errore, da un errore normalizzato. Mai il messaggio grezzo del fornitore. */
function campiErrore(e: ErroreIntegrazione) {
  return { lastErrorAt: new Date(), lastErrorCode: e.codice, lastError: e.riassunto() };
}

/* -------------------------------------------------------------------------- */
/*  1. Installare                                                             */
/* -------------------------------------------------------------------------- */

/** Perché questa voce non si può installare adesso, o `null` se si può. */
export function motivoNonInstallabile(voce: VoceCatalogo): { codice: string; messaggio: string } | null {
  if (voce.nativa) {
    return { codice: "native", messaggio: "Questa integrazione si collega dalla sua pagina." };
  }
  if (voce.disponibilita === "COMING_SOON" || !adattatoreDi(voce.slug)) {
    return { codice: "coming_soon", messaggio: "Non ancora disponibile: il collegamento è in preparazione." };
  }
  if (requisitiMancanti(voce).length > 0) {
    return {
      codice: "platform_not_configured",
      messaggio: "Richiede un accordo con il fornitore che su Foodtech non è ancora attivo.",
    };
  }
  if (!custodiaPronta()) {
    return {
      codice: "encryption_unavailable",
      messaggio: "Questa installazione di Foodtech non può ancora custodire credenziali in modo sicuro.",
    };
  }
  return null;
}

/**
 * Il primo passo del percorso. Crea la riga, o riusa quella di una
 * disinstallazione precedente **ripartendo da zero**: niente configurazione,
 * niente capacità, un indirizzo webhook nuovo (quello vecchio smette di
 * valere, e un fornitore che ci manda ancora eventi riceve 404).
 */
export async function installa(a: Attore, slug: string): Promise<IntegrationInstallation> {
  const voce = voceObbligatoria(slug);
  const adattatore = adattatoreObbligatorio(slug);
  // Un'anteprima si installa solo dove Foodtech l'ha concessa (`certificazione/accesso.ts`).
  const motivo = motivoNonInstallabile(voce) ?? (await motivoRilascio(voce, a.venueId));
  if (motivo) throw erroreServizio(`integration_${motivo.codice}`, motivo.messaggio);

  const esistente = await trovaInstallazione(a.venueId, slug);
  if (esistente) bloccaSeSospesa(esistente);
  if (esistente && esistente.status !== "NOT_INSTALLED") return esistente;

  const webhookKey = randomBytes(18).toString("base64url");
  const preferenze = preferenzeDi(esistente);
  const base = {
    adapterVersion: adattatore.versione,
    status: "INSTALLING" as const,
    healthStatus: "UNKNOWN" as const,
    healthMessage: null,
    configuration: {},
    enabledCapabilities: [],
    externalAccountId: null,
    externalAccountName: null,
    externalLocationId: null,
    externalLocationName: null,
    /* Da zero davvero: `undefined` per Prisma vuol dire «non toccare», e i
       metadati della vecchia installazione (webhook registrati, segreto
       presente) sopravvivrebbero alla disinstallazione. Sopravvivono solo le
       scelte del cliente su che cosa sincronizzare: il wizard le ripropone,
       e un interruttore spento resta spento. */
    metadata: preferenze ? ({ gruppiCliente: preferenze } as Prisma.InputJsonValue) : PrismaValori.DbNull,
    webhookKey,
    installedAt: new Date(),
    installedById: a.userId,
    activatedAt: null,
    disabledAt: null,
    lastTestAt: null,
    lastTestOk: null,
    lastSyncAt: null,
    lastSuccessfulSyncAt: null,
    lastErrorAt: null,
    lastErrorCode: null,
    lastError: null,
  };

  let i: IntegrationInstallation;
  if (esistente) {
    transizione("NOT_INSTALLED", { tipo: "installa" });
    i = await db.integrationInstallation.update({ where: { id: esistente.id }, data: base });
  } else {
    i = await db.integrationInstallation.create({
      data: { ...base, venueId: a.venueId, orgId: a.orgId, integrationSlug: slug },
    });
  }

  await recordAudit(a.audit, "integration.install", "integration", i.id, { slug, reinstallata: !!esistente });
  logEvento("integrazione.installata", { slug, venue: a.venueId, installazione: i.id });
  return i;
}

/* -------------------------------------------------------------------------- */
/*  2. Autenticarsi                                                           */
/* -------------------------------------------------------------------------- */

export function redirectUriPer(origine: string, slug: string): string {
  return `${origine}/api/integrations/oauth/callback/${slug}`;
}

/** OAuth: l'indirizzo del fornitore, e il nonce da mettere nel cookie. */
export async function iniziaOAuth(a: Attore, slug: string, origine: string) {
  const voce = voceObbligatoria(slug);
  const adattatore = adattatoreObbligatorio(slug);
  if (voce.autenticazione.modalita !== "OAUTH2" || !adattatore.iniziaAutorizzazione) {
    throw erroreServizio("validation_failed", "Questa integrazione non si collega con l'accesso al fornitore.");
  }
  const i = await installazioneObbligatoria(a.venueId, slug);
  bloccaSeSospesa(i);
  const { state, nonce } = creaState({ installationId: i.id, venueId: a.venueId, userId: a.userId, slug });
  try {
    const { url } = adattatore.iniziaAutorizzazione({ state, redirectUri: redirectUriPer(origine, slug) });
    return { url, nonce };
  } catch (err) {
    throw erroreVersoLaRotta(normalizzaErrore(err), voce);
  }
}

/**
 * OAuth: il ritorno. `contenuto` è lo `state` già verificato dalla rotta
 * (firma, scadenza, browser); qui si controlla che parli di **questo**
 * locale e di **questa** installazione, e solo allora si scambia il codice.
 */
export async function completaOAuth(
  a: Attore,
  slug: string,
  input: { code: string; origine: string; installationId: string },
): Promise<IntegrationInstallation> {
  const voce = voceObbligatoria(slug);
  const adattatore = adattatoreObbligatorio(slug);
  const i = await installazioneObbligatoria(a.venueId, slug);
  if (i.id !== input.installationId) {
    throw erroreServizio("forbidden", "Questa autorizzazione non appartiene a questa installazione.");
  }
  if (!adattatore.completaAutorizzazione) throw erroreServizio("validation_failed", "Autorizzazione non prevista.");
  bloccaSeSospesa(i);

  const correlationId = nuovoCorrelationId();
  let nuove: CredenzialiNuove;
  try {
    nuove = await adattatore.completaAutorizzazione({
      code: input.code,
      redirectUri: redirectUriPer(input.origine, slug),
      http: clientPer(slug, correlationId),
    });
    await salvaCredenziali(i, nuove);
  } catch (err) {
    const e = normalizzaErrore(err, correlationId);
    await db.integrationInstallation.updateMany({ where: { id: i.id, venueId: a.venueId }, data: campiErrore(e) });
    throw erroreVersoLaRotta(e, voce);
  }

  const dopo = await applicaEvento(i, { tipo: "autenticato" }, { lastErrorCode: null, lastError: null, lastErrorAt: null });
  // Mai i token nel registro: solo che è successo, e con quali permessi.
  await recordAudit(a.audit, "integration.authorize", "integration", i.id, { slug, scopes: nuove.scopes });
  return dopo;
}

/** Chiave API, utente e password, token: dal modulo alle credenziali. */
export async function connettiConCampi(a: Attore, slug: string, campi: Record<string, string>) {
  const voce = voceObbligatoria(slug);
  const adattatore = adattatoreObbligatorio(slug);
  if (!adattatore.connetti) throw erroreServizio("validation_failed", "Questa integrazione non si collega con una chiave.");
  const i = await installazioneObbligatoria(a.venueId, slug);
  bloccaSeSospesa(i);
  const correlationId = nuovoCorrelationId();
  try {
    const nuove = await adattatore.connetti({ campi, http: clientPer(slug, correlationId) });
    await salvaCredenziali(i, nuove);
  } catch (err) {
    throw erroreVersoLaRotta(normalizzaErrore(err, correlationId), voce);
  }
  const dopo = await applicaEvento(i, { tipo: "autenticato" });
  await recordAudit(a.audit, "integration.authorize", "integration", i.id, { slug, campi: Object.keys(campi) });
  return dopo;
}

/**
 * Il segreto dei webhook configurati dal ristoratore nel pannello del
 * fornitore (`webhook.configurazioneManuale`). Si aggiunge alle credenziali
 * cifrate dell'installazione, e come ogni segreto non torna più indietro.
 * Sostituirlo è riscriverlo; toglierlo è salvarlo vuoto.
 */
export async function aggiornaSegretoWebhook(a: Attore, slug: string, segreto: string) {
  const voce = voceObbligatoria(slug);
  if (!voce.webhook.configurazioneManuale) {
    throw erroreServizio("validation_failed", "Questa integrazione registra i suoi webhook da sola.");
  }
  const i = await installazioneObbligatoria(a.venueId, slug);
  try {
    await aggiungiSegreti(i, { webhookSecret: segreto.trim() });
  } catch (err) {
    throw erroreVersoLaRotta(normalizzaErrore(err), voce);
  }
  /* Un indicatore, non il segreto: l'interfaccia deve poter dire «c'è» senza
     decifrare niente (`vista.ts` non legge mai i segreti). */
  const meta = i.metadata && typeof i.metadata === "object" ? (i.metadata as Record<string, unknown>) : {};
  await db.integrationInstallation.updateMany({
    where: { id: i.id, venueId: a.venueId },
    data: { metadata: { ...meta, segretoWebhookPresente: !!segreto.trim() } },
  });
  await recordAudit(a.audit, "integration.configure", "integration", i.id, {
    slug,
    segretoWebhook: segreto.trim() ? "sostituito" : "rimosso",
  });
}

/* -------------------------------------------------------------------------- */
/*  3. Configurare                                                            */
/* -------------------------------------------------------------------------- */

export async function opzioniConfigurazione(a: Attore, slug: string, origine: string) {
  const voce = voceObbligatoria(slug);
  const adattatore = adattatoreObbligatorio(slug);
  const i = await installazioneObbligatoria(a.venueId, slug);
  if (!adattatore.opzioniConfigurazione) return {};
  try {
    return await adattatore.opzioniConfigurazione(await contestoFresco(i, origine));
  } catch (err) {
    const e = normalizzaErrore(err);
    await registraErrore(i, e);
    throw erroreVersoLaRotta(e, voce);
  }
}

/**
 * La configurazione: sede, sala, e gli altri campi che la voce dichiara.
 *
 * Cambiarla rimette l'installazione **da provare**: una sede diversa è un
 * collegamento diverso, e l'esito della prova di prima non vale più.
 */
export async function salvaConfigurazione(
  a: Attore,
  slug: string,
  input: { configurazione: Record<string, string>; etichette?: Record<string, string> },
) {
  const voce = voceObbligatoria(slug);
  const i = await installazioneObbligatoria(a.venueId, slug);

  // Solo i campi dichiarati, e mai segreti in chiaro in `configuration`.
  const configurazione: Record<string, string> = {};
  for (const campo of voce.configurazione) {
    if (campo.tipo === "segreto" || campo.fase === "autenticazione") continue;
    const v = input.configurazione[campo.chiave]?.trim();
    if (!v && campo.obbligatorio) {
      throw erroreServizio("validation_failed", `Manca «${campo.etichetta}».`);
    }
    if (v) configurazione[campo.chiave] = v.slice(0, 200);
  }

  const campoSede = voce.configurazione.find((c) => c.opzioniDa === "locations");
  const sede = campoSede ? configurazione[campoSede.chiave] ?? null : null;

  const dopo = await applicaEvento(i, { tipo: "configurato" }, {
    configuration: configurazione,
    externalLocationId: sede,
    externalLocationName: sede ? input.etichette?.[campoSede!.chiave]?.slice(0, 200) ?? null : null,
    adapterVersion: adattatoreObbligatorio(slug).versione,
    lastTestOk: null,
  });
  await recordAudit(a.audit, "integration.configure", "integration", i.id, { slug, configurazione });
  return dopo;
}

/**
 * Cosa sincronizzare: un sottoinsieme delle capacità che la voce dichiara.
 *
 * Non tocca lo stato: scegliere di non leggere le aliquote non cambia il
 * collegamento. Su un'integrazione **già attiva** si ripete il passo di
 * attivazione dell'adattatore (per Lightspeed: registrare l'indirizzo degli
 * esiti degli ordini, una chiamata idempotente), perché accendere «Invio
 * ordini» senza quell'indirizzo manderebbe ordini di cui non sapremmo mai
 * l'esito.
 */
export async function salvaCapacita(a: Attore, slug: string, capacita: string[], origine: string) {
  const voce = voceObbligatoria(slug);
  const i = await installazioneObbligatoria(a.venueId, slug);

  const ammesse = new Set<string>(voce.capacita);
  const fuori = capacita.filter((c) => !ammesse.has(c));
  if (fuori.length) {
    throw erroreServizio("validation_failed", `Capacità non offerte da ${voce.nome}: ${fuori.join(", ")}.`);
  }
  const uniche = [...new Set(capacita)] as Capacita[];

  const { count } = await db.integrationInstallation.updateMany({
    where: { id: i.id, venueId: a.venueId, NOT: { status: "NOT_INSTALLED" } },
    data: { enabledCapabilities: uniche },
  });
  if (count === 0) throw erroreServizio("conflict", "L'integrazione è cambiata nel frattempo. Ricarica la pagina.");
  await recordAudit(a.audit, "integration.configure", "integration", i.id, {
    slug,
    capacita: { da: i.enabledCapabilities, a: uniche },
  });

  const adattatore = adattatoreDi(slug);
  if (i.status === "ACTIVE" && adattatore?.attiva) {
    const aggiornata = { ...i, enabledCapabilities: uniche };
    try {
      const esito = await adattatore.attiva(await contestoFresco(aggiornata, origine));
      if (esito.segretiAggiunti) await aggiungiSegreti(i, esito.segretiAggiunti);
    } catch (err) {
      const e = normalizzaErrore(err);
      await registraErrore(aggiornata, e);
      throw erroreVersoLaRotta(e, voce);
    }
  }
}

/* -------------------------------------------------------------------------- */
/*  4. Provare                                                                */
/* -------------------------------------------------------------------------- */

export type EsitoProvaPerIlRistoratore =
  | {
      ok: true;
      account: string | null;
      sede: string | null;
      /** Tutti: quelli dell'adattatore (tecnici, per la console) e quelli del gruppo. */
      avvisi: string[];
      /** Solo quelli scritti per il ristoratore: la stessa sede collegata a un altro locale del gruppo. */
      avvisiGruppo: string[];
    }
  | { ok: false; titolo: string; spiegazione: string; azione: string | null; correlationId: string };

/**
 * `adapter.provaConnessione()` davvero: una chiamata al fornitore con le
 * credenziali salvate. Il risultato si scrive sull'installazione (quando,
 * se è riuscita) e muove lo stato secondo la tabella.
 */
export async function provaConnessione(
  a: Attore,
  slug: string,
  origine: string,
  /** Il filo della correlazione di chi chiede la prova (la console di certificazione). */
  correlazione?: string,
): Promise<EsitoProvaPerIlRistoratore> {
  const voce = voceObbligatoria(slug);
  const adattatore = adattatoreObbligatorio(slug);
  const i = await installazioneObbligatoria(a.venueId, slug);
  bloccaSeSospesa(i);

  const correlationId = correlazione ?? nuovoCorrelationId();
  try {
    const esito = await adattatore.provaConnessione(await contestoFresco(i, origine, correlationId));
    const sede = esito.sedi.find((s) => s.externalId === i.externalLocationId) ?? null;
    const avvisiGruppo = await avvisiMultiSede(i);
    const avvisi = [...esito.avvisi, ...avvisiGruppo];

    await applicaEvento(i, { tipo: "prova_riuscita" }, {
      lastTestAt: new Date(),
      lastTestOk: true,
      externalAccountId: esito.account?.externalId ?? i.externalAccountId,
      externalAccountName: esito.account?.nome ?? i.externalAccountName,
      ...(sede ? { externalLocationName: sede.nome } : {}),
      lastErrorCode: null,
      lastError: null,
    });
    await recordAudit(a.audit, "integration.test", "integration", i.id, { slug, ok: true });
    return { ok: true, account: esito.account?.nome ?? null, sede: sede?.nome ?? null, avvisi, avvisiGruppo };
  } catch (err) {
    const e = normalizzaErrore(err, correlationId);
    await applicaEvento(i, { tipo: "prova_fallita", codice: e.codice }, {
      lastTestAt: new Date(),
      lastTestOk: false,
      ...campiErrore(e),
    }).catch(() => registraErrore(i, e));
    await recordAudit(a.audit, "integration.test", "integration", i.id, { slug, ok: false, codice: e.codice });
    const m = messaggioPerIlRistoratore(e.codice, voce.nome, voce.messaggi);
    return { ok: false, titolo: m.titolo, spiegazione: m.spiegazione, azione: m.azione, correlationId: e.correlationId };
  }
}

/**
 * Gruppi con più sedi: la stessa sede del fornitore collegata a due locali
 * dello **stesso gruppo** è quasi sempre uno sbaglio (ordini di Torino sulla
 * cassa di Milano). Lo si dice, senza bloccare — e solo dentro il gruppo:
 * dire a un ristorante che la sua sede è collegata al locale di un altro
 * cliente sarebbe una fuga di dati.
 */
async function avvisiMultiSede(i: IntegrationInstallation): Promise<string[]> {
  if (!i.externalLocationId) return [];
  const altre = await db.integrationInstallation.findMany({
    where: {
      orgId: i.orgId,
      integrationSlug: i.integrationSlug,
      externalLocationId: i.externalLocationId,
      NOT: [{ id: i.id }, { status: "NOT_INSTALLED" }],
    },
    select: { venue: { select: { name: true } } },
  });
  return altre.map((x) => `Questa sede è collegata anche al locale «${x.venue.name}» del gruppo.`);
}

/* -------------------------------------------------------------------------- */
/*  5-6. Attivare, disattivare, riattivare                                    */
/* -------------------------------------------------------------------------- */

export async function attiva(a: Attore, slug: string, origine: string) {
  const voce = voceObbligatoria(slug);
  const adattatore = adattatoreObbligatorio(slug);
  const i = await installazioneObbligatoria(a.venueId, slug);

  if (i.status !== "CONNECTED" || i.lastTestOk !== true) {
    throw erroreServizio("invalid_transition", "Prima di attivare serve una prova di connessione riuscita.");
  }
  bloccaSeSospesa(i);
  /* Accesso beta revocato: niente attivazioni NUOVE. Chi era già attivo e si
     ricollega (token scaduto, poi «attiva» di nuovo) non si interrompe:
     activatedAt c'è, e la revoca non è un freno d'emergenza (quello è la
     sospensione). */
  if (!i.activatedAt) {
    const rilascio = await motivoRilascio(voce, a.venueId);
    if (rilascio) throw erroreServizio("integration_" + rilascio.codice, rilascio.messaggio);
  }
  if (i.enabledCapabilities.length === 0) {
    throw erroreServizio("validation_failed", "Scegli almeno una cosa da sincronizzare.");
  }

  const correlationId = nuovoCorrelationId();
  let metadata: Record<string, unknown> | undefined;
  try {
    if (adattatore.attiva) {
      const esito = await adattatore.attiva(await contestoFresco(i, origine, correlationId));
      if (esito.segretiAggiunti) await aggiungiSegreti(i, esito.segretiAggiunti);
      metadata = esito.metadata;
    }
  } catch (err) {
    const e = normalizzaErrore(err, correlationId);
    await registraErrore(i, e);
    throw erroreVersoLaRotta(e, voce);
  }

  const dopo = await applicaEvento(i, { tipo: "attiva" }, {
    activatedAt: new Date(),
    disabledAt: null,
    ...(metadata ? { metadata: metadata as Prisma.InputJsonValue } : {}),
  });
  await recordAudit(a.audit, "integration.activate", "integration", i.id, { slug, capacita: i.enabledCapabilities });
  await accodaSincronizzazione(dopo, "INITIAL_IMPORT");
  return dopo;
}

export async function disattiva(a: Attore, slug: string) {
  const i = await installazioneObbligatoria(a.venueId, slug);
  const dopo = await applicaEvento(i, { tipo: "disattiva" }, { disabledAt: new Date() });
  await recordAudit(a.audit, "integration.disable", "integration", i.id, { slug });
  return dopo;
}

/** Riaccendere passa da una prova: in un mese spenta la password può essere cambiata. */
export async function riattiva(a: Attore, slug: string, origine: string) {
  const voce = voceObbligatoria(slug);
  const adattatore = adattatoreObbligatorio(slug);
  const i = await installazioneObbligatoria(a.venueId, slug);
  if (i.status !== "DISABLED") throw erroreServizio("invalid_transition", "L'integrazione non è disattivata.");
  bloccaSeSospesa(i);
  // Riaccendere dopo la revoca dell'accesso beta è un'attivazione nuova: non si può.
  const rilascio = await motivoRilascio(voce, a.venueId);
  if (rilascio) throw erroreServizio("integration_" + rilascio.codice, rilascio.messaggio);

  try {
    await adattatore.provaConnessione(await contestoFresco(i, origine));
  } catch (err) {
    const e = normalizzaErrore(err);
    await applicaEvento(i, { tipo: "prova_fallita", codice: e.codice }, campiErrore(e)).catch(() => undefined);
    throw erroreVersoLaRotta(e, voce);
  }
  const dopo = await applicaEvento(i, { tipo: "riattiva" }, { disabledAt: null, lastTestAt: new Date(), lastTestOk: true });
  await recordAudit(a.audit, "integration.enable", "integration", i.id, { slug });
  return dopo;
}

/** Solo Super Admin (lo controlla la rotta). Spegne e segna: niente si cancella. */
export async function sospendi(a: Attore, slug: string, input: { email: string; motivo?: string | null }) {
  const i = await installazioneObbligatoria(a.venueId, slug);
  if (i.status === "NOT_INSTALLED") throw erroreServizio("not_found", "Integrazione non installata.");
  let dopo = i;
  if (i.status !== "DISABLED" && i.status !== "INSTALLING") {
    dopo = await applicaEvento(i, { tipo: "disattiva" }, { disabledAt: new Date() });
  }
  const meta = dopo.metadata && typeof dopo.metadata === "object" ? (dopo.metadata as Record<string, unknown>) : {};
  const sospensione: Sospensione = { da: input.email, il: new Date().toISOString(), motivo: input.motivo?.slice(0, 500) ?? null };
  await db.integrationInstallation.updateMany({
    where: { id: i.id, venueId: a.venueId },
    data: { metadata: { ...meta, sospensione } as Prisma.InputJsonValue },
  });
  await recordAudit(a.audit, "integration.suspend", "integration", i.id, {
    slug,
    da: input.email,
    motivo: sospensione.motivo,
    statoPrima: i.status,
  });
  return db.integrationInstallation.findFirstOrThrow({ where: { id: i.id, venueId: a.venueId } });
}

/** Toglie la sospensione. L'integrazione resta spenta: si riaccende con «Riattiva», che passa da una prova. */
export async function revocaSospensione(a: Attore, slug: string, input: { email: string }) {
  // Anche su un'installazione disinstallata: la sospensione sopravvive alla disinstallazione.
  const i = await trovaInstallazione(a.venueId, slug);
  if (!i) throw erroreServizio("not_found", "Integrazione mai installata su questo locale.");
  const s = sospensioneDi(i);
  if (!s) throw erroreServizio("invalid_transition", "L'integrazione non è sospesa.");
  const { sospensione: _via, ...resto } = (i.metadata ?? {}) as Record<string, unknown>;
  await db.integrationInstallation.updateMany({
    where: { id: i.id, venueId: a.venueId },
    data: { metadata: Object.keys(resto).length ? (resto as Prisma.InputJsonValue) : PrismaValori.DbNull },
  });
  await recordAudit(a.audit, "integration.resume", "integration", i.id, { slug, da: input.email, sospesaDa: s.da, sospesaIl: s.il });
  return db.integrationInstallation.findFirstOrThrow({ where: { id: i.id, venueId: a.venueId } });
}

/* -------------------------------------------------------------------------- */
/*  Disinstallare                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Via credenziali e mappature, riga riportata a `NOT_INSTALLED`.
 *
 * La revoca presso il fornitore si **prova** ma non blocca: un fornitore che
 * non risponde non deve tenere i suoi token nel nostro database. I token si
 * cancellano comunque, e il registro dice se la revoca è riuscita.
 *
 * Registro delle sincronizzazioni ed eventi ricevuti restano: sono la storia
 * di cosa è successo, e servono proprio quando qualcuno chiede «ma era
 * collegata, quel giorno?».
 */
export async function disinstalla(a: Attore, slug: string, origine: string) {
  const i = await installazioneObbligatoria(a.venueId, slug);
  const adattatore = adattatoreDi(slug);

  let revocata: boolean | null = null;
  if (adattatore?.disconnetti) {
    try {
      await adattatore.disconnetti(await contestoFresco(i, origine));
      revocata = true;
    } catch {
      revocata = false;
    }
  }

  transizione(i.status as StatoInstallazione, { tipo: "disinstalla" });
  await db.$transaction([
    db.integrationCredential.deleteMany({ where: { installationId: i.id, venueId: a.venueId } }),
    db.externalEntityMapping.deleteMany({ where: { installationId: i.id, venueId: a.venueId } }),
    db.integrationInstallation.update({
      where: { id: i.id },
      data: {
        status: "NOT_INSTALLED",
        healthStatus: "UNKNOWN",
        healthMessage: null,
        configuration: {},
        enabledCapabilities: [],
        externalAccountId: null,
        externalAccountName: null,
        externalLocationId: null,
        externalLocationName: null,
        activatedAt: null,
        disabledAt: new Date(),
        lastTestOk: null,
        // Gli id dei webhook presso il fornitore sono serviti a `disconnetti`:
        // da qui in poi non valgono più niente.
        // La sospensione di Foodtech resta: disinstallare non deve bastare a toglierla.
        // E restano le scelte del cliente su che cosa sincronizzare (`preferenzeDi`).
        metadata: metadatiDopoDisinstallazione(i),
        // Un indirizzo nuovo e mai consegnato: gli eventi che il fornitore
        // manda ancora al vecchio trovano un 404.
        webhookKey: randomBytes(18).toString("base64url"),
      },
    }),
  ]);
  // Doppia sicurezza: se la transazione è passata, non restano credenziali.
  await cancellaCredenziali(i);
  await recordAudit(a.audit, "integration.uninstall", "integration", i.id, { slug, revocata });
}

/**
 * Che cosa il cliente aveva scelto di sincronizzare, con le parole dei suoi
 * interruttori (`GRUPPI_SYNC`): dalle capacità accese, o — su una riga
 * disinstallata — da quelle ricordate. `null` se non ha mai scelto.
 */
export function preferenzeDi(i: Pick<IntegrationInstallation, "integrationSlug" | "enabledCapabilities" | "metadata"> | null): string[] | null {
  if (!i) return null;
  const voce = voceDi(i.integrationSlug);
  if (voce && i.enabledCapabilities.length) return gruppiAccesi(voce.capacita, i.enabledCapabilities);
  const m = i.metadata && typeof i.metadata === "object" ? (i.metadata as Record<string, unknown>) : {};
  return Array.isArray(m.gruppiCliente) ? m.gruppiCliente.filter((g): g is string => typeof g === "string") : null;
}

function metadatiDopoDisinstallazione(i: IntegrationInstallation) {
  const s = sospensioneDi(i);
  const gruppiCliente = preferenzeDi(i);
  if (!s && !gruppiCliente) return PrismaValori.DbNull;
  return { ...(s ? { sospensione: s } : {}), ...(gruppiCliente ? { gruppiCliente } : {}) } as Prisma.InputJsonValue;
}

/* -------------------------------------------------------------------------- */
/*  Sincronizzazioni ed errori                                                */
/* -------------------------------------------------------------------------- */

export async function registraErrore(i: IntegrationInstallation, e: ErroreIntegrazione) {
  const voce = voceDi(i.integrationSlug);
  let prossimo: StatoInstallazione | null = null;
  try {
    prossimo = transizione(i.status as StatoInstallazione, { tipo: "errore", codice: e.codice });
  } catch {
    prossimo = null;
  }
  const dopo = { ...i, status: prossimo ?? (i.status as StatoInstallazione), ...campiErrore(e) };
  const salute = saluteDi(dopo);
  await db.integrationInstallation.updateMany({
    where: { id: i.id, venueId: i.venueId, status: i.status },
    data: {
      ...campiErrore(e),
      ...(prossimo ? { status: prossimo } : {}),
      healthStatus: salute,
      healthMessage: fraseDiSalute(salute, e.codice, voce?.nome ?? i.integrationSlug, voce?.messaggi),
    },
  });
}

export const TIPO_LAVORO_SYNC = "integration.sync";

export async function accodaSincronizzazione(
  i: Pick<IntegrationInstallation, "id" | "venueId">,
  trigger: "MANUAL" | "SCHEDULED" | "INITIAL_IMPORT" | "WEBHOOK",
  operazione: string = "full",
) {
  return enqueueJob({
    kind: TIPO_LAVORO_SYNC,
    venueId: i.venueId,
    payload: { installationId: i.id, venueId: i.venueId, operazione, trigger },
    // Un clic ripetuto su «Sincronizza ora» non ne mette in coda due.
    dedupeKey: `${TIPO_LAVORO_SYNC}:${i.id}:${operazione}`,
    maxAttempts: 4,
  });
}

export async function chiediSincronizzazione(a: Attore, slug: string) {
  const i = await installazioneObbligatoria(a.venueId, slug);
  if (i.status !== "ACTIVE" && i.status !== "ERROR") {
    throw erroreServizio("invalid_transition", "Si sincronizza solo un'integrazione attiva.");
  }
  const esito = await accodaSincronizzazione(i, "MANUAL");
  await recordAudit(a.audit, "integration.sync_requested", "integration", i.id, { slug });
  return esito;
}
