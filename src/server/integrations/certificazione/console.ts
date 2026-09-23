import { createHash, randomBytes } from "node:crypto";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { recordAudit, type AuditActor } from "@/server/audit";
import { adattatoreDi } from "../adapters";
import { chiamateDellErrore, conRegistrazione, ripulisciPerConsole, type ChiamataRegistrata } from "../adapters/http";
import { eAdattatorePos, type ContestoAdattatore, type PosIntegrationAdapter } from "../adapters/tipi";
import { hostApi as hostCassaInCloud, HOST as HOST_CASSA_IN_CLOUD } from "../adapters/cassa-in-cloud/config";
import { AMBIENTI as AMBIENTI_TILBY, ambienteDa as ambienteTilby, hostApi as hostTilby } from "../adapters/tilby/config";
import { regoleIndirizzo as regoleOracle } from "../adapters/oracle-simphony/config";
import type { OrdineDaInviare, RigaOrdine } from "../dominio";
import { normalizzaErrore, nuovoCorrelationId } from "../errori";
import { PREFISSO_ORDINE_DI_PROVA } from "../fornitore-integrazione";
import { contestoFresco, fetchDiProvaAttivo, provaConnessione, sospensioneDi, trovaInstallazione } from "../installazioni";
import { inviaOrdine, statoInvio } from "../ordini";
import { voceDi } from "../registry";
import { accessoBeta, faseDi } from "./accesso";
import { capacitaDi, ErroreCertificazione, evidenzeDi, registraEvidenza, statoProvider } from "./evidenze";
import { capacitaCertificabile, superata, type Livello } from "./livelli";

/**
 * **La console di certificazione.** Solo Super Admin (lo controllano le
 * rotte), sul locale attivo. Serve a noi durante l'onboarding di una cassa:
 *
 * 1. prova la connessione vera, legge sedi, sale, tavoli, menu, IVA, metodi;
 * 2. sceglie un tavolo e dei prodotti veri;
 * 3. manda un **ordine di prova** riconoscibile (`ft-test-…`), dopo
 *    un'anteprima e una conferma esplicita, passando da `inviaOrdine` — lo
 *    stesso percorso di una comanda vera, con idempotenza e PENDING_SYNC;
 * 4. traccia tutto: payload normalizzato, richieste e risposte (ripulite),
 *    id esterno, webhook, mappatura, stato finale;
 * 5. chiede a una persona che cosa è successo sul POS (cucina, righe nuove):
 *    **REAL_POS lo dice solo lei**, mai un 200;
 * 6. seconda comanda, lettura del conto con le differenze in vista, e — solo
 *    se autorizzato — un pagamento di prova.
 *
 * Nessuna azione modifica dati di Foodtech (menu, tavoli, prezzi): si
 * scrivono solo le mappature ORDER dell'ordine di prova, le prove e le
 * evidenze.
 */

export type Chiamante = { venueId: string; email: string; audit?: AuditActor; origine: string };

export const FRASE_ORDINE = "CREA ORDINE DI TEST";
export const FRASE_PAGAMENTO = "CONFERMO PAGAMENTO DI PROVA";
export const NOTA_ORDINE_DI_PROVA = "ORDINE DI PROVA FOODTECH - NON PREPARARE";

/** Le operazioni che POTREBBERO avere un effetto fiscale: chiudere, emettere, fiscalizzare. */
export const FISCAL_SIDE_EFFECT_POSSIBLE = new Set(["payment", "close_bill", "fiscal_document"]);

/* -------------------------------------------------------------------------- */
/*  Ambiente vero o finto                                                     */
/* -------------------------------------------------------------------------- */

let fetchDiProvaComeReale = false;
/** Solo nelle prove: fa contare il `fetch` finto come un fornitore vero, per provare le regole delle evidenze. */
export function trattaFetchDiProvaComeReale(v: boolean) {
  if (process.env.NODE_ENV === "production") throw new Error("solo_nelle_prove");
  fetchDiProvaComeReale = v;
}

/**
 * Perché questa chiamata **non** va a un fornitore vero, oppure `null`.
 * Un ambiente finto non produce mai evidenze oltre le fixture, e non esegue
 * operazioni con possibile effetto fiscale.
 */
export function motivoAmbienteFinto(slug: string, ctx?: Pick<ContestoAdattatore, "installazione" | "segreti">): string | null {
  if (fetchDiProvaAttivo() && !fetchDiProvaComeReale) return "Le chiamate vanno a un fornitore finto (prove automatiche).";
  if (slug === "tilby") {
    const amb = ambienteTilby(ctx?.installazione.configuration.ambiente);
    if (hostTilby(amb) !== AMBIENTI_TILBY[amb].host) return "TILBY_API_BASE punta a un server finto su questa macchina.";
  }
  if (slug === "cassa-in-cloud" && hostCassaInCloud() !== HOST_CASSA_IN_CLOUD) {
    return "CASSA_IN_CLOUD_API_BASE punta a un server finto su questa macchina.";
  }
  if (slug === "oracle-simphony") {
    const prova = regoleOracle().originePerProve;
    const sts = (ctx?.segreti as { sts?: string } | undefined)?.sts;
    if (prova && sts?.startsWith(prova)) return "ORACLE_SIMPHONY_ORIGINE_PROVA: l'indirizzo è il server finto su questa macchina.";
  }
  return null;
}

function ambienteDi(slug: string, ctx: Pick<ContestoAdattatore, "installazione" | "segreti">): string {
  const conf = ctx.installazione.configuration;
  if (slug === "tilby") return ambienteTilby(conf.ambiente);
  if (slug === "lightspeed-k") return String((ctx.segreti as { ambiente?: string }).ambiente ?? "trial");
  if (slug === "oracle-simphony") return "cloud";
  return String(conf.ambiente ?? "produzione");
}

/* -------------------------------------------------------------------------- */
/*  Contesto e prove                                                          */
/* -------------------------------------------------------------------------- */

async function preparaContesto(c: Chiamante, slug: string) {
  const voce = voceDi(slug);
  const adattatore = adattatoreDi(slug);
  if (!voce || !adattatore) throw new ErroreCertificazione("not_found", "Integrazione sconosciuta.", 404);
  const i = await trovaInstallazione(c.venueId, slug);
  if (!i || i.status === "NOT_INSTALLED") throw new ErroreCertificazione("non_installata", "Installa e collega l'integrazione prima di certificarla.");
  bloccaSeSpenta(i);
  const correlationId = nuovoCorrelationId();
  const ctx = await contestoFresco(i, c.origine, correlationId);
  const finto = motivoAmbienteFinto(slug, ctx);
  return { voce, adattatore, i, ctx, correlationId, finto, ambiente: ambienteDi(slug, ctx) };
}

/**
 * Sospesa da Foodtech o disattivata: la console non parla con il fornitore.
 * Controllato **prima** di costruire il contesto, che per i fornitori OAuth
 * può già chiamare il fornitore (rinnovo del token).
 */
function bloccaSeSpenta(i: { status: string; metadata: unknown }) {
  if (sospensioneDi(i as never)) {
    throw new ErroreCertificazione("integrazione_sospesa", "Integrazione sospesa da Foodtech: nessuna operazione verso il fornitore.", 423);
  }
  if (i.status === "DISABLED") {
    throw new ErroreCertificazione("integrazione_disattivata", "Integrazione disattivata: riattivala prima di provarla.", 409);
  }
}

function pos(a: ReturnType<typeof adattatoreDi>): PosIntegrationAdapter["pos"] {
  if (!a || !eAdattatorePos(a)) throw new ErroreCertificazione("non_pos", "Questa integrazione non è una cassa.", 400);
  return a.pos;
}

type Passo = { fase: string; titolo: string; il: string; durataMs?: number; dati?: unknown };

const passoChiamata = (x: ChiamataRegistrata): Passo => ({
  fase: "provider",
  titolo: `${x.metodo} ${x.endpoint} → ${x.status ?? x.codiceErrore}`,
  il: x.inizio,
  durataMs: x.durataMs,
  dati: { richiesta: x.richiesta, risposta: x.risposta, status: x.status, codiceErrore: x.codiceErrore },
});

async function salvaRun(input: {
  slug: string;
  c: Chiamante;
  installationId: string;
  kind: string;
  ok: boolean;
  reale: boolean;
  ambiente: string;
  externalLocationId: string | null;
  correlationId: string;
  externalEntityId?: string | null;
  riferimento?: string | null;
  parentRunId?: string | null;
  input?: unknown;
  passi: Passo[];
  esito?: unknown;
}) {
  const run = await db.integrationCertificationRun.create({
    data: {
      integrationSlug: input.slug,
      venueId: input.c.venueId,
      installationId: input.installationId,
      kind: input.kind,
      status: input.ok ? "RIUSCITO" : "FALLITO",
      realEnvironment: input.reale,
      environment: input.ambiente.slice(0, 60),
      externalLocationId: input.externalLocationId,
      correlationId: input.correlationId,
      externalEntityId: input.externalEntityId ?? null,
      riferimento: input.riferimento ?? null,
      parentRunId: input.parentRunId ?? null,
      input: (input.input ?? undefined) as Prisma.InputJsonValue | undefined,
      trace: { passi: input.passi, esito: input.esito ?? null } as unknown as Prisma.InputJsonValue,
      createdByEmail: input.c.email,
    },
  });
  await recordAudit(input.c.audit, "integration.certification_run", "integration", input.slug, {
    run: run.id,
    tipo: input.kind,
    riuscita: input.ok,
    ambienteVero: input.reale,
  });
  return run;
}

/** Evidenza API automatica: solo contro un fornitore vero. */
async function evidenzaApi(
  p: { slug: string; c: Chiamante; reale: boolean; ambiente: string; externalLocationId: string | null; correlationId: string; runId: string; externalEntityId?: string | null },
  capacita: string[],
  esito: "PASSED" | "FAILED",
  note?: string,
) {
  if (!p.reale) return [];
  const scritte = [];
  for (const cap of capacita) {
    if (!capacitaCertificabile(cap)?.livelli.includes("PROVIDER_API")) continue;
    scritte.push(
      await registraEvidenza({
        slug: p.slug,
        capacita: cap,
        livello: "PROVIDER_API",
        esito,
        venueId: p.c.venueId,
        operatore: p.c.email,
        externalLocationId: p.externalLocationId,
        ambiente: p.ambiente,
        correlationId: p.correlationId,
        externalEntityId: p.externalEntityId ?? null,
        runId: p.runId,
        note: note ?? null,
      }),
    );
  }
  return scritte;
}

/* -------------------------------------------------------------------------- */
/*  Lo stato della console                                                    */
/* -------------------------------------------------------------------------- */

export async function statoConsole(c: Chiamante, slug: string) {
  const voce = voceDi(slug);
  if (!voce) throw new ErroreCertificazione("not_found", "Integrazione sconosciuta.", 404);
  const [i, cert, fase, beta, runs, evidenze] = await Promise.all([
    trovaInstallazione(c.venueId, slug),
    statoProvider(slug),
    faseDi(slug),
    accessoBeta(c.venueId, slug),
    db.integrationCertificationRun.findMany({
      where: { venueId: c.venueId, integrationSlug: slug },
      orderBy: { createdAt: "desc" },
      take: 30,
      select: { id: true, kind: true, status: true, realEnvironment: true, environment: true, externalEntityId: true, riferimento: true, parentRunId: true, createdByEmail: true, createdAt: true },
    }),
    evidenzeDi(slug, 100),
  ]);
  const credenziale = i
    ? await db.integrationCredential.findUnique({
        where: { installationId: i.id },
        select: { kind: true, accessTokenExpiresAt: true, refreshTokenExpiresAt: true, updatedAt: true },
      })
    : null;
  return {
    provider: { slug, nome: voce.nome, implementazione: voce.implementazione, disponibilita: voce.disponibilita },
    certificazione: { stato: cert.stato, inviaComanda: cert.inviaComanda },
    rilascio: fase,
    accessoBeta: beta ? { abilitato: beta.enabled, operazioniFiscali: beta.fiscalTestsAuthorized, da: beta.enabledByEmail, il: beta.enabledAt } : null,
    installazione: i
      ? {
          stato: i.status,
          salute: i.healthStatus,
          sede: i.externalLocationName ?? i.externalLocationId,
          account: i.externalAccountName,
          capacitaAccese: i.enabledCapabilities,
          sospensione: sospensioneDi(i),
          credenziale: credenziale
            ? { tipo: credenziale.kind, scadenzaAccesso: credenziale.accessTokenExpiresAt, scadenzaRinnovo: credenziale.refreshTokenExpiresAt, aggiornata: credenziale.updatedAt }
            : null,
        }
      : null,
    capacita: capacitaDi(slug).map((x) => ({ ...x, fiscale: FISCAL_SIDE_EFFECT_POSSIBLE.has(x.chiave) })),
    matrice: cert.righe.map((r) => ({ capacita: r.capacita.chiave, etichetta: r.capacita.etichetta, celle: r.celle })),
    pagamento: await motivoPagamentoBloccato(c, slug),
    prove: runs,
    evidenze: evidenze.map((e) => ({
      id: e.id,
      capacita: e.capability,
      livello: e.level,
      esito: e.result,
      locale: e.venueName,
      sede: e.externalLocationId,
      ambiente: e.environment,
      operatore: e.operatorEmail,
      correlationId: e.correlationId,
      idEsterno: e.externalEntityId,
      run: e.runId,
      manuale: e.manualConfirmation,
      riferimentoProva: e.evidenceRef,
      note: e.notes,
      il: e.createdAt,
    })),
  };
}

/* -------------------------------------------------------------------------- */
/*  3. Connessione reale                                                      */
/* -------------------------------------------------------------------------- */

export async function provaConnessioneReale(c: Chiamante, slug: string) {
  const { i, ctx, correlationId, finto, ambiente } = await preparaContesto(c, slug);
  const inizio = Date.now();
  let esito: Awaited<ReturnType<typeof provaConnessione>> | null = null;
  let chiamate: ChiamataRegistrata[] = [];
  let erroreTecnico: string | null = null;
  try {
    const r = await conRegistrazione(() =>
      provaConnessione({ venueId: c.venueId, orgId: i.orgId, userId: "certificazione", audit: c.audit }, slug, c.origine, correlationId),
    );
    esito = r.risultato;
    chiamate = r.chiamate;
  } catch (err) {
    chiamate = chiamateDellErrore(err);
    erroreTecnico = normalizzaErrore(err).codice;
  }
  const durataMs = Date.now() - inizio;
  const ok = !!esito?.ok;
  const dopo = await trovaInstallazione(c.venueId, slug);
  const credenziale = await db.integrationCredential.findUnique({ where: { installationId: i.id }, select: { kind: true, accessTokenExpiresAt: true } });
  const venue = await db.venue.findUnique({ where: { id: c.venueId }, select: { name: true } });
  const riepilogo = {
    provider: slug,
    workspace: venue?.name ?? c.venueId,
    location: dopo?.externalLocationName ?? dopo?.externalLocationId ?? null,
    ambiente,
    ambienteVero: !finto,
    motivoAmbienteFinto: finto,
    tempoRispostaMs: durataMs,
    autenticazione: credenziale ? { tipo: credenziale.kind, scadenzaAccesso: credenziale.accessTokenExpiresAt } : null,
    salute: { stato: dopo?.healthStatus ?? null, messaggio: dopo?.healthMessage ?? null },
    esito: esito ?? { ok: false, errore: erroreTecnico },
  };
  const run = await salvaRun({
    slug, c, installationId: i.id, kind: "TEST_CONNECTION", ok, reale: !finto, ambiente,
    externalLocationId: dopo?.externalLocationId ?? null, correlationId,
    passi: chiamate.map(passoChiamata), esito: riepilogo,
  });
  const p = { slug, c, reale: !finto, ambiente, externalLocationId: dopo?.externalLocationId ?? null, correlationId, runId: run.id };
  await evidenzaApi(p, ["connection"], ok ? "PASSED" : "FAILED");
  return { run: run.id, ...riepilogo };
}

/* -------------------------------------------------------------------------- */
/*  4. Letture                                                                */
/* -------------------------------------------------------------------------- */

const LETTURE = {
  locations: { metodo: "getLocations", capacita: "locations" },
  floors: { metodo: "getFloors", capacita: "floors" },
  tables: { metodo: "getTables", capacita: "tables" },
  menu: { metodo: "getMenu", capacita: "menu" },
  products: { metodo: "getProducts", capacita: "menu" },
  tax_rates: { metodo: "getTaxRates", capacita: "tax_rates" },
  payment_methods: { metodo: "getPaymentMethods", capacita: "payment_methods" },
} as const;
export type Lettura = keyof typeof LETTURE;
export const RISORSE_LETTURA = Object.keys(LETTURE) as Lettura[];

/** Legge dal fornitore e mostra risposta grezza (ripulita) e normalizzata. Non scrive niente in Foodtech. */
export async function leggi(c: Chiamante, slug: string, risorsa: Lettura) {
  const { adattatore, i, ctx, correlationId, finto, ambiente } = await preparaContesto(c, slug);
  const def = LETTURE[risorsa];
  const metodo = (pos(adattatore) as Record<string, unknown>)[def.metodo] as ((ctx: ContestoAdattatore) => Promise<unknown[]>) | undefined;
  if (!metodo) throw new ErroreCertificazione("non_supportata", `${ctx.installazione.id ? "Questa cassa" : ""} non offre questa lettura.`, 400);
  let normalizzata: unknown[] | null = null;
  let chiamate: ChiamataRegistrata[] = [];
  let errore: string | null = null;
  try {
    const r = await conRegistrazione(() => metodo.call(pos(adattatore), ctx));
    normalizzata = r.risultato;
    chiamate = r.chiamate;
  } catch (err) {
    chiamate = chiamateDellErrore(err);
    errore = normalizzaErrore(err).codice;
  }
  const run = await salvaRun({
    slug, c, installationId: i.id, kind: `READ_${risorsa.toUpperCase()}`, ok: !errore, reale: !finto, ambiente,
    externalLocationId: i.externalLocationId, correlationId,
    passi: chiamate.map(passoChiamata),
    esito: { elementi: normalizzata?.length ?? 0, errore },
  });
  await evidenzaApi({ slug, c, reale: !finto, ambiente, externalLocationId: i.externalLocationId, correlationId, runId: run.id }, [def.capacita], errore ? "FAILED" : "PASSED");
  return {
    run: run.id,
    ambienteVero: !finto,
    motivoAmbienteFinto: finto,
    errore,
    normalizzata: ripulisciPerConsole(normalizzata),
    grezza: chiamate.map((x) => ({ endpoint: `${x.metodo} ${x.endpoint}`, status: x.status, durataMs: x.durataMs, risposta: x.risposta })),
  };
}

/* -------------------------------------------------------------------------- */
/*  5–6. Tavolo e prodotti                                                    */
/* -------------------------------------------------------------------------- */

export async function tavoloDiProva(c: Chiamante, slug: string, externalId: string) {
  const { adattatore, i, ctx } = await preparaContesto(c, slug);
  const tavoli = (await pos(adattatore).getTables?.(ctx)) ?? [];
  const t = tavoli.find((x) => x.externalId === externalId);
  if (!t) throw new ErroreCertificazione("not_found", "Tavolo non trovato presso il fornitore.", 404);
  const sale = pos(adattatore).getFloors ? await pos(adattatore).getFloors!(ctx) : [];
  const mappa = await db.externalEntityMapping.findFirst({
    where: { installationId: i.id, venueId: c.venueId, entityType: "TABLE", externalId },
    select: { internalId: true, manual: true },
  });
  const foodtech = mappa?.internalId
    ? await db.table.findFirst({ where: { id: mappa.internalId, venueId: c.venueId }, select: { id: true, label: true } })
    : null;
  return {
    externalId: t.externalId,
    etichetta: t.etichetta,
    sala: t.salaExternalId ? { externalId: t.salaExternalId, nome: sale.find((s) => s.externalId === t.salaExternalId)?.nome ?? null } : null,
    stato: t.attivo ? "attivo" : "non attivo",
    posti: t.posti,
    mappatura: mappa ? { abbinato: foodtech ? { id: foodtech.id, etichetta: foodtech.label } : null, manuale: mappa.manual } : null,
  };
}

/** I prodotti della cassa già importati (mappature), con quello che serve a scegliere i tre casi di prova. */
export async function prodottiDiProva(c: Chiamante, slug: string) {
  const i = await trovaInstallazione(c.venueId, slug);
  if (!i) throw new ErroreCertificazione("non_installata", "Integrazione non installata.");
  const adattatore = adattatoreDi(slug);
  const righe = await db.externalEntityMapping.findMany({
    where: { installationId: i.id, venueId: c.venueId, entityType: { in: ["PRODUCT", "MODIFIER"] } },
    orderBy: { externalLabel: "asc" },
    take: 500,
    select: { entityType: true, externalId: true, externalLabel: true, internalId: true, metadata: true },
  });
  return righe.map((r) => {
    const m = (r.metadata ?? {}) as Record<string, unknown>;
    let codice: string | null = null;
    let problema: string | null = null;
    try {
      codice = adattatore?.codiceProdottoPerOrdine ? adattatore.codiceProdottoPerOrdine({ externalId: r.externalId, metadata: m }) : r.externalId;
    } catch (err) {
      problema = err instanceof Error ? err.message : String(err);
    }
    const lista = (v: unknown) => (Array.isArray(v) ? v.length : 0);
    return {
      tipo: r.entityType,
      externalId: r.externalId,
      nome: r.externalLabel,
      abbinatoA: r.internalId,
      prezzoCents: typeof m.prezzoCents === "number" ? m.prezzoCents : null,
      codicePerOrdine: codice,
      problema,
      indizi: {
        conVarianti: lista(m.varianti) > 0 || lista(m.variants) > 0 || m.multivariant === true,
        conModificatori: r.entityType === "MODIFIER" || m.condimentiObbligatori === true || lista(m.modificatori) > 0,
      },
      metadata: ripulisciPerConsole(m),
    };
  });
}

/* -------------------------------------------------------------------------- */
/*  7. Ordine di prova                                                        */
/* -------------------------------------------------------------------------- */

export type SceltaOrdine = { tavoloExternalId: string | null; righe: { externalId: string; quantita: number }[] };

const EFFETTI_ATTESI: Record<string, string[]> = {
  tilby: [
    "Una vendita APERTA sul negozio Tilby, al tavolo scelto, con external_id ft-test-….",
    "auto_print_order: la comanda esce sulla stampante di produzione se un dispositivo Tilby con stampa automatica è acceso.",
    "Nessun pagamento, nessuno scontrino: la vendita resta aperta e si chiude a mano sulla cassa.",
  ],
  "cassa-in-cloud": [
    "Un ordine su Cassa in Cloud per il tavolo scelto, con externalId ft-test-….",
    "Cosa succede in sala (stampa, cassa) dipende dalla configurazione del punto vendita: da verificare guardando.",
    "Nessun pagamento, nessuno scontrino.",
  ],
  "oracle-simphony": [
    "Un check APERTO nel revenue center, al tavolo scelto, con il riferimento ft-test-… nelle estensioni.",
    "Può partire verso gli Order Devices / KDS della workstation POSAPI Client.",
    "Nessun tender: il check resta aperto.",
  ],
  "lightspeed-k": ["Un ordine locale sul tavolo scelto (Order and Pay).", "Nessun pagamento."],
};

async function componiOrdine(c: Chiamante, slug: string, i: { id: string }, scelta: SceltaOrdine, riferimento: string) {
  if (!scelta.righe.length) throw new ErroreCertificazione("nessuna_riga", "Scegli almeno un prodotto.", 400);
  if (scelta.righe.length > 10) throw new ErroreCertificazione("troppe_righe", "Al massimo dieci prodotti in un ordine di prova.", 400);
  const adattatore = adattatoreDi(slug);
  const mappe = await db.externalEntityMapping.findMany({
    where: { installationId: i.id, venueId: c.venueId, entityType: "PRODUCT", externalId: { in: scelta.righe.map((r) => r.externalId) } },
    select: { externalId: true, externalLabel: true, metadata: true },
  });
  const righe: RigaOrdine[] = [];
  let atteso: number | null = 0;
  for (const s of scelta.righe) {
    const q = Math.trunc(s.quantita);
    if (q < 1 || q > 20) throw new ErroreCertificazione("quantita", "Quantità fra 1 e 20.", 400);
    const m = mappe.find((x) => x.externalId === s.externalId);
    if (!m) throw new ErroreCertificazione("prodotto_sconosciuto", `Prodotto ${s.externalId} non importato: leggi il menu e sincronizza prima.`, 400);
    const meta = (m.metadata ?? {}) as Record<string, unknown>;
    const codice = adattatore?.codiceProdottoPerOrdine ? adattatore.codiceProdottoPerOrdine({ externalId: m.externalId, metadata: meta }) : m.externalId;
    const prezzo = typeof meta.prezzoCents === "number" ? meta.prezzoCents : null;
    atteso = atteso === null || prezzo === null ? null : atteso + prezzo * q;
    righe.push({ codiceProdotto: codice, nome: m.externalLabel ?? m.externalId, quantita: q, prezzoUnitarioCents: null, note: null, datiProdotto: meta });
  }
  let tavolo: string | null = null;
  if (scelta.tavoloExternalId) {
    const t = await db.externalEntityMapping.findFirst({
      where: { installationId: i.id, venueId: c.venueId, entityType: "TABLE", externalId: scelta.tavoloExternalId },
      select: { externalLabel: true },
    });
    if (!t) throw new ErroreCertificazione("tavolo_sconosciuto", "Tavolo non importato: leggi i tavoli e sincronizza prima.", 400);
    tavolo = t.externalLabel;
  }
  const ordine: OrdineDaInviare = { riferimento, tavolo, tavoloExternalId: scelta.tavoloExternalId, coperti: 2, cliente: null, righe, nota: NOTA_ORDINE_DI_PROVA };
  return { ordine, attesoCents: atteso };
}

/** Un'impronta della scelta: la conferma deve riferirsi esattamente all'anteprima mostrata. */
function impronta(slug: string, venueId: string, s: SceltaOrdine, extra = ""): string {
  const norma = JSON.stringify({ slug, venueId, t: s.tavoloExternalId, r: [...s.righe].map((r) => [r.externalId, Math.trunc(r.quantita)]).sort(), extra });
  return createHash("sha256").update(norma).digest("hex").slice(0, 24);
}

export async function anteprimaOrdine(c: Chiamante, slug: string, scelta: SceltaOrdine, parentRunId?: string) {
  const voce = voceDi(slug);
  const i = await trovaInstallazione(c.venueId, slug);
  if (!voce || !i) throw new ErroreCertificazione("non_installata", "Integrazione non installata.");
  const { ordine, attesoCents } = await componiOrdine(c, slug, i, scelta, `${PREFISSO_ORDINE_DI_PROVA}anteprima`);
  const adattatore = adattatoreDi(slug);
  const accoda = parentRunId && adattatore && eAdattatorePos(adattatore) && adattatore.pos.updateOrder;
  return {
    provider: voce.nome,
    location: i.externalLocationName ?? i.externalLocationId,
    tavolo: ordine.tavolo,
    prodotti: ordine.righe.map((r) => ({ nome: r.nome, quantita: r.quantita, codice: r.codiceProdotto })),
    importoAttesoCents: attesoCents,
    effettiAttesi: parentRunId
      ? [accoda ? "Le righe si AGGIUNGONO allo stesso ordine/check (round o aggiunta)." : "Questa cassa non accetta aggiunte: nasce un ORDINE NUOVO allo stesso tavolo."]
      : EFFETTI_ATTESI[slug] ?? ["Un ordine di prova sul POS, con riferimento ft-test-…"],
    nota: NOTA_ORDINE_DI_PROVA,
    senzaPagamentiNeFiscale: true,
    frase: FRASE_ORDINE,
    impronta: impronta(slug, c.venueId, scelta, parentRunId ?? ""),
  };
}

async function eseguiOrdine(c: Chiamante, slug: string, scelta: SceltaOrdine, conferma: { frase: string; impronta: string }, parent?: { runId: string; riferimento: string }) {
  if (conferma.frase.trim() !== FRASE_ORDINE) throw new ErroreCertificazione("conferma_mancante", `Per inviare scrivi «${FRASE_ORDINE}».`, 400);
  if (conferma.impronta !== impronta(slug, c.venueId, scelta, parent?.runId ?? "")) {
    throw new ErroreCertificazione("anteprima_diversa", "La scelta è cambiata dall'anteprima: rivedila e conferma di nuovo.", 400);
  }
  const { adattatore, i, ctx, correlationId, finto, ambiente } = await preparaContesto(c, slug);
  const riferimento = `${PREFISSO_ORDINE_DI_PROVA}${randomBytes(6).toString("hex")}`;
  const { ordine, attesoCents } = await componiOrdine(c, slug, i, scelta, riferimento);
  const accoda = !!(parent && eAdattatorePos(adattatore) && adattatore.pos.updateOrder);
  const passi: Passo[] = [
    { fase: "foodtech", titolo: parent ? "Seconda comanda di prova creata" : "Ordine di prova creato", il: new Date().toISOString(), dati: { riferimento, tavolo: ordine.tavolo, attesoCents } },
    { fase: "adapter", titolo: "Payload normalizzato (OrdineDaInviare)", il: new Date().toISOString(), dati: ripulisciPerConsole({ ...ordine, righe: ordine.righe.map(({ datiProdotto: _d, ...r }) => r) }) },
  ];
  let esito: Awaited<ReturnType<typeof inviaOrdine>> | null = null;
  let chiamate: ChiamataRegistrata[] = [];
  let errore: string | null = null;
  const inizio = Date.now();
  try {
    const r = await conRegistrazione(() =>
      inviaOrdine(i, `certificazione:${riferimento}`, ordine, { correlationId, ...(accoda ? { aggiuntaA: parent!.riferimento } : {}) }),
    );
    esito = r.risultato;
    chiamate = r.chiamate;
  } catch (err) {
    chiamate = chiamateDellErrore(err);
    errore = normalizzaErrore(err).codice;
  }
  passi.push(...chiamate.map(passoChiamata));
  const idEsterno = esito?.stato === "SYNCED" ? esito.idEsterno : null;
  passi.push({
    fase: "foodtech",
    titolo: esito ? `Esito dell'invio: ${esito.stato}${idEsterno ? ` · id esterno ${idEsterno}` : ""}` : `Invio non riuscito: ${errore}`,
    il: new Date().toISOString(),
    durataMs: Date.now() - inizio,
    dati: esito ?? { errore },
  });
  const ok = esito?.stato === "SYNCED";
  const run = await salvaRun({
    slug, c, installationId: i.id, kind: parent ? "SECOND_ROUND" : "TEST_ORDER", ok, reale: !finto, ambiente,
    externalLocationId: i.externalLocationId, correlationId, externalEntityId: idEsterno, riferimento,
    parentRunId: parent?.runId ?? null, input: { scelta, attesoCents, accodata: accoda }, passi, esito,
  });
  const p = { slug, c, reale: !finto, ambiente, externalLocationId: i.externalLocationId, correlationId, runId: run.id, externalEntityId: idEsterno };
  // PENDING_SYNC non è né un sì né un no: nessuna evidenza finché non arriva.
  if (esito?.stato === "SYNCED" || esito?.stato === "FAILED" || errore) {
    // Un rifiuto dice che l'ordine non è entrato, non che il tavolo sia sbagliato:
    // l'associazione al tavolo si registra solo quando l'ordine arriva.
    const caps = parent ? ["add_round"] : ["create_order", ...(scelta.tavoloExternalId && ok ? ["table_association"] : [])];
    await evidenzaApi(p, caps, ok ? "PASSED" : "FAILED");
  }
  return { run: run.id, riferimento, esito, errore, ambienteVero: !finto, motivoAmbienteFinto: finto, accodata: accoda, contesto: ctx.installazione.externalLocationId };
}

export async function creaOrdineDiProva(c: Chiamante, slug: string, scelta: SceltaOrdine, conferma: { frase: string; impronta: string }) {
  return eseguiOrdine(c, slug, scelta, conferma);
}

async function runDiProva(c: Chiamante, slug: string, runId: string, tipi: string[]) {
  const run = await db.integrationCertificationRun.findFirst({ where: { id: runId, venueId: c.venueId, integrationSlug: slug } });
  if (!run || !tipi.includes(run.kind)) throw new ErroreCertificazione("not_found", "Prova non trovata su questo locale.", 404);
  return run;
}

/** 10. La seconda comanda sullo stesso ordine/check/tavolo. */
export async function secondaComanda(c: Chiamante, slug: string, parentRunId: string, scelta: Omit<SceltaOrdine, "tavoloExternalId">, conferma: { frase: string; impronta: string }) {
  const padre = await runDiProva(c, slug, parentRunId, ["TEST_ORDER"]);
  if (padre.status !== "RIUSCITO" || !padre.riferimento) throw new ErroreCertificazione("ordine_non_riuscito", "La seconda comanda si prova su un ordine di prova arrivato alla cassa.");
  const tavolo = ((padre.input as { scelta?: SceltaOrdine } | null)?.scelta?.tavoloExternalId) ?? null;
  return eseguiOrdine(c, slug, { tavoloExternalId: tavolo, righe: scelta.righe }, conferma, { runId: padre.id, riferimento: padre.riferimento });
}

export async function anteprimaSecondaComanda(c: Chiamante, slug: string, parentRunId: string, scelta: Omit<SceltaOrdine, "tavoloExternalId">) {
  const padre = await runDiProva(c, slug, parentRunId, ["TEST_ORDER"]);
  const tavolo = ((padre.input as { scelta?: SceltaOrdine } | null)?.scelta?.tavoloExternalId) ?? null;
  return anteprimaOrdine(c, slug, { tavoloExternalId: tavolo, righe: scelta.righe }, padre.id);
}

/* -------------------------------------------------------------------------- */
/*  8. Traccia                                                                */
/* -------------------------------------------------------------------------- */

export async function traccia(c: Chiamante, slug: string, runId: string) {
  const run = await runDiProva(c, slug, runId, ["TEST_ORDER", "SECOND_ROUND", "READ_BILL", "PAYMENT", "TEST_CONNECTION", ...RISORSE_LETTURA.map((r) => `READ_${r.toUpperCase()}`)]);
  const passi = [...(((run.trace as { passi?: Passo[] }).passi) ?? [])];
  if (run.riferimento) {
    const mappa = await db.externalEntityMapping.findFirst({
      where: { installationId: run.installationId, venueId: c.venueId, entityType: "ORDER", externalId: run.riferimento },
      select: { createdAt: true, updatedAt: true, metadata: true },
    });
    if (mappa) passi.push({ fase: "foodtech", titolo: "Mappatura ORDER creata", il: mappa.createdAt.toISOString(), dati: { riferimento: run.riferimento } });
    /* Gli eventi che hanno toccato QUESTO ordine, per id: li scrive nello
       storico della mappatura chi li lavora (`stato-mappature.ts`), applicati
       o scartati. Un'aggiunta non ha stato suo presso la cassa: i suoi eventi
       arrivano sul conto base, e si mostrano quelli successivi alla prova. */
    const aggiuntaA = ((mappa?.metadata ?? {}) as { aggiuntaA?: string }).aggiuntaA ?? null;
    const base = aggiuntaA
      ? await db.externalEntityMapping.findFirst({
          where: { installationId: run.installationId, venueId: c.venueId, entityType: "ORDER", externalId: aggiuntaA },
          select: { metadata: true },
        })
      : null;
    type VoceStorico = { eventoId: string | null; stato: string | null; preparazione: string | null; applicato: boolean; motivo: string | null; il: string; fonte: string };
    const storico = (m: unknown) => (Array.isArray((m as { eventi?: unknown } | null)?.eventi) ? ((m as { eventi: VoceStorico[] }).eventi) : []);
    const voci = [
      ...storico(mappa?.metadata).map((v) => ({ ...v, sul: run.riferimento })),
      ...storico(base?.metadata)
        .filter((v) => v.il >= run.createdAt.toISOString())
        .map((v) => ({ ...v, sul: aggiuntaA })),
    ];
    const ids = voci.map((v) => v.eventoId).filter((x): x is string => !!x);
    const righe = ids.length
      ? await db.webhookEvent.findMany({
          where: { id: { in: ids }, installationId: run.installationId, venueId: c.venueId },
          select: { id: true, eventType: true, receivedAt: true, status: true, normalized: true },
        })
      : [];
    for (const v of voci) {
      const e = righe.find((r) => r.id === v.eventoId);
      passi.push({
        fase: v.fonte === "webhook" ? "webhook" : "foodtech",
        titolo: `${v.fonte === "webhook" ? `Webhook ${e?.eventType ?? ""}` : v.fonte} sul conto ${v.sul}: ${v.stato ?? v.preparazione ?? "—"} ${v.applicato ? "applicato" : `scartato (${v.motivo})`}`,
        il: (e?.receivedAt.toISOString() ?? v.il),
        dati: { eventoId: v.eventoId, stato: v.stato, preparazione: v.preparazione, applicato: v.applicato, motivo: v.motivo, evento: e ? ripulisciPerConsole(e.normalized) : null },
      });
    }
    const stato = await statoInvio({ id: run.installationId, venueId: c.venueId }, run.riferimento);
    const m = (mappa?.metadata ?? {}) as Record<string, unknown>;
    passi.push({
      fase: "stato",
      titolo: "Stato finale",
      il: (mappa?.updatedAt ?? run.createdAt).toISOString(),
      dati: { invio: stato, statoPresso: m.stato ?? null, preparazione: m.preparazione ?? null },
    });
  }
  passi.sort((a, b) => a.il.localeCompare(b.il));
  return { run: { id: run.id, tipo: run.kind, esito: run.status, ambienteVero: run.realEnvironment, riferimento: run.riferimento, idEsterno: run.externalEntityId, il: run.createdAt, da: run.createdByEmail }, passi };
}

/* -------------------------------------------------------------------------- */
/*  11. Conto                                                                 */
/* -------------------------------------------------------------------------- */

export async function leggiConto(c: Chiamante, slug: string, parentRunId: string) {
  const padre = await runDiProva(c, slug, parentRunId, ["TEST_ORDER"]);
  if (!padre.externalEntityId) throw new ErroreCertificazione("senza_id_esterno", "L'ordine di prova non ha ancora un id presso la cassa.");
  const { adattatore, i, ctx, correlationId, finto, ambiente } = await preparaContesto(c, slug);
  const getOrder = pos(adattatore).getOrder;
  if (!getOrder) throw new ErroreCertificazione("non_supportata", "Questa cassa non permette di leggere il conto.", 400);
  // Atteso da Foodtech: l'ordine di prova e le sue seconde comande accodate.
  const figli = await db.integrationCertificationRun.findMany({ where: { parentRunId: padre.id, kind: "SECOND_ROUND", status: "RIUSCITO" }, select: { input: true } });
  const attesi = [padre, ...figli].map((r) => (r.input as { attesoCents?: number | null; accodata?: boolean } | null) ?? {});
  const attesoCents = attesi.some((a) => a.attesoCents === null || a.attesoCents === undefined)
    ? null
    : attesi.filter((a, n) => n === 0 || a.accodata).reduce((s, a) => s + (a.attesoCents ?? 0), 0);
  let conto: Awaited<ReturnType<NonNullable<typeof getOrder>>> = null;
  let chiamate: ChiamataRegistrata[] = [];
  let errore: string | null = null;
  try {
    const r = await conRegistrazione(() => getOrder.call(pos(adattatore), ctx, padre.externalEntityId!));
    conto = r.risultato;
    chiamate = r.chiamate;
  } catch (err) {
    chiamate = chiamateDellErrore(err);
    errore = normalizzaErrore(err).codice;
  }
  const totale = conto?.totaleCents ?? null;
  const riepilogo = {
    attesoFoodtechCents: attesoCents,
    totaleProviderCents: totale,
    // Non si corregge niente: la differenza si mostra, e basta.
    differenzaCents: totale !== null && attesoCents !== null ? totale - attesoCents : null,
    totali: conto?.totali ?? null,
    stato: conto?.stato ?? null,
    righe: conto?.righe.map((r) => ({ nome: r.nome, quantita: r.quantita })) ?? [],
    errore,
  };
  const run = await salvaRun({
    slug, c, installationId: i.id, kind: "READ_BILL", ok: !errore && !!conto, reale: !finto, ambiente,
    externalLocationId: i.externalLocationId, correlationId, externalEntityId: padre.externalEntityId, riferimento: padre.riferimento,
    parentRunId: padre.id, passi: chiamate.map(passoChiamata), esito: riepilogo,
  });
  await evidenzaApi({ slug, c, reale: !finto, ambiente, externalLocationId: i.externalLocationId, correlationId, runId: run.id, externalEntityId: padre.externalEntityId }, ["read_bill"], !errore && conto ? "PASSED" : "FAILED");
  return { run: run.id, ambienteVero: !finto, ...riepilogo };
}

/* -------------------------------------------------------------------------- */
/*  12–13. Pagamento di prova: FISCAL_SIDE_EFFECT_POSSIBLE                    */
/* -------------------------------------------------------------------------- */

/** Perché il pagamento di prova non si può fare adesso, o `null`. Disabilitato per difetto. */
export async function motivoPagamentoBloccato(c: Chiamante, slug: string, opzioni: { ambienteFinto?: string | null } = {}): Promise<string | null> {
  const a = adattatoreDi(slug);
  const voce = voceDi(slug);
  // Capacità documentata nel catalogo E metodo nell'adattatore.
  if (!a || !eAdattatorePos(a) || !a.pos.createPayment || !voce?.capacita.includes("payments.write")) {
    return "Questa cassa non registra pagamenti via API.";
  }
  const i = await trovaInstallazione(c.venueId, slug);
  if (!i || sospensioneDi(i)) return "Integrazione sospesa da Foodtech.";
  if (i.status !== "ACTIVE") return "L'integrazione non è attiva.";
  const finto = opzioni.ambienteFinto ?? motivoAmbienteFinto(slug);
  if (finto) return `Ambiente finto: ${finto}`;
  const beta = await accessoBeta(c.venueId, slug);
  if (!beta?.enabled || !beta.fiscalTestsAuthorized) {
    return "Operazioni con possibile effetto fiscale non autorizzate su questo locale (un Super Admin le abilita esplicitamente).";
  }
  const { righe } = await statoProvider(slug);
  if (!superata(righe, "create_order", "PROVIDER_API")) return "Prima serve «Crea ordine» verificato contro l'API vera del fornitore.";
  return null;
}

export async function pagamentoDiProva(
  c: Chiamante,
  slug: string,
  parentRunId: string,
  input: { importoCents: number; tenderExternalId: string },
  conferma: { frase: string },
) {
  const padre = await runDiProva(c, slug, parentRunId, ["TEST_ORDER"]);
  if (!padre.externalEntityId || padre.status !== "RIUSCITO" || !padre.riferimento?.startsWith(PREFISSO_ORDINE_DI_PROVA)) {
    throw new ErroreCertificazione("senza_id_esterno", "Il pagamento si prova su un ordine di prova (ft-test-…) arrivato alla cassa.");
  }
  // Tutte le condizioni PRIMA di costruire il contesto (che può già chiamare il fornitore).
  if (!c.audit) throw new ErroreCertificazione("audit_obbligatorio", "Un'operazione con possibile effetto fiscale richiede un autore registrabile.", 403);
  const primaDelContesto = await motivoPagamentoBloccato(c, slug);
  if (primaDelContesto) throw new ErroreCertificazione("operazione_fiscale_bloccata", primaDelContesto, 403);
  if (conferma.frase.trim() !== FRASE_PAGAMENTO) throw new ErroreCertificazione("conferma_mancante", `Per procedere scrivi «${FRASE_PAGAMENTO}».`, 400);
  if (!Number.isInteger(input.importoCents) || input.importoCents < 1 || input.importoCents > 100_000) {
    throw new ErroreCertificazione("importo", "Importo fra 0,01 e 1.000,00 euro.", 400);
  }
  const { adattatore, i, ctx, correlationId, finto, ambiente } = await preparaContesto(c, slug);
  // L'ambiente finto si riconosce del tutto solo con il contesto (Oracle: l'indirizzo salvato).
  if (finto) throw new ErroreCertificazione("operazione_fiscale_bloccata", `Ambiente finto: ${finto}`, 403);
  const tender = await db.externalEntityMapping.findFirst({
    where: { installationId: i.id, venueId: c.venueId, entityType: "PAYMENT_METHOD", externalId: input.tenderExternalId },
    select: { externalId: true, externalLabel: true, metadata: true },
  });
  if (!tender) throw new ErroreCertificazione("tender_sconosciuto", "Metodo di pagamento non importato.", 400);
  const meta = (tender.metadata ?? {}) as { tipoId?: string | null };
  const intento = {
    operazione: "payment",
    classificazione: "FISCAL_SIDE_EFFECT_POSSIBLE",
    ordine: padre.externalEntityId,
    riferimento: padre.riferimento,
    importoCents: input.importoCents,
    tender: tender.externalId,
    operatore: c.email,
    correlationId,
  };
  // L'intento si scrive PRIMA della richiesta, e deve riuscire: senza, niente pagamento.
  await auditObbligatorio(c, slug, { ...intento, fase: "ATTEMPTED" });
  let errore: string | null = null;
  let chiamate: ChiamataRegistrata[] = [];
  try {
    const r = await conRegistrazione(() =>
      pos(adattatore).createPayment!(ctx, {
        riferimentoOrdine: padre.externalEntityId!,
        importoCents: input.importoCents,
        manciaCents: 0,
        metodo: { externalId: tender.externalId, nome: tender.externalLabel ?? tender.externalId, tipoId: meta.tipoId ?? null },
        idOperazione: `certificazione:${padre.id}:${input.tenderExternalId}:${input.importoCents}`,
      }),
    );
    chiamate = r.chiamate;
  } catch (err) {
    chiamate = chiamateDellErrore(err);
    errore = normalizzaErrore(err).codice;
  }
  // E dopo: l'esito, riuscito o no. L'intento resta comunque.
  await auditObbligatorio(c, slug, { ...intento, fase: errore ? "FAILED" : "SUCCEEDED", errore }).catch((err) =>
    console.error("[audit] esito del pagamento di prova non registrato", err),
  );
  const run = await salvaRun({
    slug, c, installationId: i.id, kind: "PAYMENT", ok: !errore, reale: !finto, ambiente,
    externalLocationId: i.externalLocationId, correlationId, externalEntityId: padre.externalEntityId, riferimento: padre.riferimento,
    parentRunId: padre.id, input, passi: chiamate.map(passoChiamata),
    esito: { errore, classificazione: "FISCAL_SIDE_EFFECT_POSSIBLE" },
  });
  await evidenzaApi({ slug, c, reale: !finto, ambiente, externalLocationId: i.externalLocationId, correlationId, runId: run.id, externalEntityId: padre.externalEntityId }, ["payment"], errore ? "FAILED" : "PASSED");
  return { run: run.id, errore };
}

/**
 * Il registro di controllo di un'operazione con possibile effetto fiscale:
 * **non** si ingoia l'errore come `recordAudit`. Se non si riesce a scrivere,
 * l'operazione non parte.
 */
async function auditObbligatorio(c: Chiamante, slug: string, diff: Record<string, unknown>) {
  if (!c.audit) throw new ErroreCertificazione("audit_obbligatorio", "Autore non registrabile.", 403);
  await db.auditLog.create({
    data: {
      orgId: c.audit.orgId,
      venueId: c.audit.venueId,
      actorId: c.audit.userId,
      actorEmail: c.audit.email ?? c.email,
      action: "integration.fiscal_operation",
      entityType: "integration",
      entityId: slug,
      diff: diff as Prisma.InputJsonValue,
      ip: c.audit.ip ?? null,
      userAgent: c.audit.userAgent ?? null,
    },
  });
}

/* -------------------------------------------------------------------------- */
/*  9–10. Conferme manuali: l'unico modo per arrivare a REAL_POS              */
/* -------------------------------------------------------------------------- */

const CAPACITA_PER_TIPO_DI_PROVA: Record<string, string[]> = {
  TEST_ORDER: ["create_order", "table_association", "kitchen"],
  SECOND_ROUND: ["add_round", "kitchen"],
  PAYMENT: ["payment", "close_bill", "fiscal_document"],
};

export async function confermaManuale(
  c: Chiamante,
  slug: string,
  input: { runId: string; capacita: string; livello: Livello; risposta: "SI" | "NO"; note?: string | null; riferimentoProva?: string | null },
) {
  const run = await runDiProva(c, slug, input.runId, Object.keys(CAPACITA_PER_TIPO_DI_PROVA));
  if (!CAPACITA_PER_TIPO_DI_PROVA[run.kind]!.includes(input.capacita)) {
    throw new ErroreCertificazione("capacita_non_pertinente", "Questa prova non dimostra questa capacità.", 400);
  }
  if (input.livello !== "REAL_POS" && input.livello !== "REAL_POS_ITALY") {
    throw new ErroreCertificazione("livello_non_manuale", "Le conferme manuali valgono solo per il POS vero.", 400);
  }
  if (!run.realEnvironment) throw new ErroreCertificazione("ambiente_finto", "La prova è stata fatta contro un fornitore finto: non certifica un POS vero.");
  if (run.status !== "RIUSCITO" || !run.externalEntityId) {
    throw new ErroreCertificazione("prova_non_riuscita", "Si conferma sul POS solo una prova arrivata alla cassa (con id esterno).");
  }
  const fiscale = FISCAL_SIDE_EFFECT_POSSIBLE.has(input.capacita) || input.livello === "REAL_POS_ITALY";
  if (fiscale) {
    const beta = await accessoBeta(c.venueId, slug);
    if (!beta?.enabled || !beta.fiscalTestsAuthorized) {
      throw new ErroreCertificazione("operazione_fiscale_bloccata", "Evidenze fiscali solo su un locale autorizzato alle operazioni con possibile effetto fiscale.", 403);
    }
  }
  const e = await registraEvidenza({
    slug,
    capacita: input.capacita,
    livello: input.livello,
    esito: input.risposta === "SI" ? "PASSED" : "FAILED",
    venueId: c.venueId,
    operatore: c.email,
    externalLocationId: run.externalLocationId,
    ambiente: run.environment,
    correlationId: run.correlationId,
    externalEntityId: run.externalEntityId,
    runId: run.id,
    confermaManuale: true,
    riferimentoProva: input.riferimentoProva ?? null,
    note: input.note ?? null,
  });
  await recordAudit(c.audit, "integration.certification_evidence", "integration", slug, {
    evidenza: e.id,
    capacita: input.capacita,
    livello: input.livello,
    esito: e.result,
    run: run.id,
    fiscale,
  });
  return e;
}
