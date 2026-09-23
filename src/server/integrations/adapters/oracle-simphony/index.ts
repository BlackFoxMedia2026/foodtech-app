import { randomBytes, randomUUID } from "node:crypto";
import type {
  ContestoAdattatore,
  CredenzialiNuove,
  PosIntegrationAdapter,
  RisultatoSincronizzazione,
} from "../tipi";
import type { RichiestaFornitore } from "../http";
import type { OrdineDaInviare } from "../../dominio";
import { ErroreIntegrazione } from "../../errori";
import { controllaPrimaDiChiamare, validaIndirizzo } from "../../indirizzi";
import { accedi, rinnova, type TokenOracle } from "./autenticazione";
import {
  ANTICIPO_RINNOVO_MS,
  DURATA_ID_TOKEN_S,
  DURATA_REFRESH_MS,
  NOTIFICHE,
  TIMEOUT_CHECK_MS,
  TLD_NOTIFICHE,
  regoleIndirizzo,
} from "./config";
import {
  aliquote,
  check,
  checks,
  corpoCheck,
  corpoPagamento,
  corpoRound,
  destinazione,
  disponibile,
  idempotencyId,
  leggiDestinazione,
  leggiNotifica,
  locations,
  menu,
  menuSommario,
  nonDisponibili,
  ordineDaCheck,
  organizzazioni,
  pagamentiDi,
  revenueCenter,
  revenueCenters,
  sconti,
  tavoliDi,
  tender,
  totali,
  firmaValida,
  type ContestoCheck,
  type RevenueCenter,
  type VoceMenu,
} from "./traduzione";

/**
 * **Oracle MICROS Simphony — Transaction Services Gen2.** Quarto adattatore
 * POS, in anteprima: scritto sulla guida ufficiale e sul suo `swagger.json`,
 * **mai provato con un ambiente Oracle vero**.
 *
 * ## Cosa usa, e perché solo STS Gen2
 *
 * STS Gen2 contiene già, con gli stessi identificativi dei check, tutto ciò
 * che serve a mandare comande: Organization API (location, revenue center,
 * tavoli, tipi d'ordine), Configuration API in sola lettura (menu,
 * condimenti, tasse, tender, sconti, maggiorazioni, disponibilità), Checks
 * API, Notifications API, Employees API. La Configuration and Content API
 * (CCAPI) è un altro prodotto: un API account di un altro tipo, pensato per
 * **gestire** la configurazione, con identificativi diversi (hierUnitId,
 * objectNum) e nessuna corrispondenza ufficiale con quelli dei check. Non si
 * usa.
 *
 * ## Il modello
 *
 * ```
 * Venue Foodtech  ↔  un revenue center (orgShortName + locRef + rvcRef)
 * Conto del tavolo ↔  un check (checkRef)       — mappatura ORDER
 * Prima comanda    →  POST /checks
 * Aggiunta         →  POST /checks/{checkRef}/round
 * ```
 *
 * Solo la Cloud API: la Location API on-premises (porta 5443) vive nella rete
 * del ristorante, dove Foodtech non arriva, e non ha notifiche né
 * `connectionStatus`.
 */

const VERSIONE = "0.1.0";

type SegretiOracle = {
  sts?: string;
  auth?: string;
  clientId?: string;
  utente?: string;
  organizzazione?: string;
  accessToken?: string;
  refreshToken?: string;
  hmacKey?: string;
  keyId?: string;
};

/* -------------------------------------------------------------------------- */
/*  Indirizzi, credenziali, contesto                                          */
/* -------------------------------------------------------------------------- */

/** L'indirizzo dei servizi, senza `/api/v1` finale (EMC a volte lo include). */
function baseServizi(valore: string): string {
  return validaIndirizzo(valore, regoleIndirizzo()).replace(/\/api\/v1$/i, "");
}

function credenziali(s: Required<Pick<SegretiOracle, "sts" | "auth" | "clientId" | "utente" | "organizzazione">>, t: TokenOracle, extra: SegretiOracle = {}): CredenzialiNuove {
  const scade = Math.min(t.scadeTraSecondi, DURATA_ID_TOKEN_S) * 1000;
  // Si rinnova con anticipo, come consiglia Oracle (3–7 giorni prima).
  const rinnovoTra = Math.max(scade - ANTICIPO_RINNOVO_MS, scade / 2);
  return {
    kind: "OAUTH2",
    segreti: {
      ...extra,
      sts: s.sts,
      auth: s.auth,
      clientId: s.clientId,
      utente: s.utente,
      organizzazione: s.organizzazione,
      accessToken: t.idToken,
      refreshToken: t.refreshToken,
    } as Record<string, string>,
    scopes: ["openid"],
    accessTokenExpiresAt: new Date(Date.now() + rinnovoTra),
    refreshTokenExpiresAt: new Date(Date.now() + DURATA_REFRESH_MS),
  };
}

function segreti(ctx: ContestoAdattatore): Required<Pick<SegretiOracle, "sts" | "auth" | "clientId" | "organizzazione">> & SegretiOracle {
  const s = ctx.segreti as SegretiOracle;
  if (!s.sts || !s.auth || !s.clientId || !s.organizzazione) {
    throw new ErroreIntegrazione("AUTH_INVALID", "Credenziali Simphony incomplete: serve ricollegarsi");
  }
  return s as Required<Pick<SegretiOracle, "sts" | "auth" | "clientId" | "organizzazione">> & SegretiOracle;
}

/** Dove vanno le comande: dalla configurazione dell'installazione. */
function contestoCheck(ctx: ContestoAdattatore): ContestoCheck {
  const s = segreti(ctx);
  const d = leggiDestinazione(ctx.installazione.configuration.destinazione ?? ctx.installazione.externalLocationId);
  const tipo = String(ctx.installazione.configuration.tipoOrdine ?? "").split(":").pop();
  const dipendente = Number(ctx.installazione.configuration.dipendente);
  if (!d) throw new ErroreIntegrazione("INVALID_CONFIGURATION", "Manca il revenue center");
  if (!tipo || !Number.isInteger(Number(tipo))) throw new ErroreIntegrazione("INVALID_CONFIGURATION", "Manca il tipo d'ordine");
  if (!Number.isInteger(dipendente) || dipendente < 1) throw new ErroreIntegrazione("INVALID_CONFIGURATION", "Manca il dipendente delle transazioni");
  return { orgShortName: s.organizzazione, locRef: d.locRef, rvcRef: d.rvcRef, dipendente, tipoOrdine: Number(tipo) };
}

/**
 * Ogni chiamata passa da qui: indirizzo ricontrollato (anche il DNS, adesso),
 * redirect vietati, tempi lunghi per i check.
 */
type RichiestaOracle = Omit<RichiestaFornitore, "url" | "redirect"> & { percorso: string };
async function chiama<T = unknown>(ctx: ContestoAdattatore, r: RichiestaOracle & { completa?: false }): Promise<T>;
async function chiama<T = unknown>(ctx: ContestoAdattatore, r: RichiestaOracle & { completa: true }): Promise<{ status: number; dati: T; intestazioni: Headers }>;
async function chiama<T = unknown>(ctx: ContestoAdattatore, r: RichiestaOracle & { completa?: boolean }) {
  const url = `${baseServizi(segreti(ctx).sts)}/api/v1${r.percorso}`;
  await controllaPrimaDiChiamare(url, regoleIndirizzo());
  const { percorso: _p, completa: _c, ...resto } = r;
  const richiesta: RichiestaFornitore = { ...resto, url, redirect: "error" };
  try {
    return r.completa ? await ctx.http.richiestaCompleta<T>(richiesta) : await ctx.http.richiesta<T>(richiesta);
  } catch (err) {
    if (err instanceof ErroreIntegrazione && err.codice === "VALIDATION" && /duplicate[_ ]request/i.test(err.dettaglio.estratto ?? "")) {
      // La stessa richiesta è ancora in lavorazione presso il POS (attesa di 30 s scaduta): si riprova.
      throw new ErroreIntegrazione("PROVIDER_UNAVAILABLE", "Simphony sta ancora lavorando la stessa richiesta", err.dettaglio);
    }
    throw err;
  }
}

/** Le intestazioni richieste da tutti i Checks endpoint e da `GET /menus/{menuId}`. */
function intestazioniRvc(c: Pick<ContestoCheck, "orgShortName" | "locRef" | "rvcRef">): Record<string, string> {
  return { "Simphony-OrgShortName": c.orgShortName, "Simphony-LocRef": c.locRef, "Simphony-RvcRef": String(c.rvcRef) };
}

/** Le query delle Configuration API v1 (`OrgShortName`, `LocRef`, `RvcRef`). */
function queryRvc(c: Pick<ContestoCheck, "orgShortName" | "locRef" | "rvcRef">): string {
  return new URLSearchParams({ OrgShortName: c.orgShortName, LocRef: c.locRef, RvcRef: String(c.rvcRef) }).toString();
}

async function leggiRvc(ctx: ContestoAdattatore, org: string, locRef: string, rvcRef: number): Promise<RevenueCenter> {
  const r = revenueCenter(
    await chiama(ctx, { percorso: `/organizations/${encodeURIComponent(org)}/locations/${encodeURIComponent(locRef)}/revenueCenters/${rvcRef}` }),
  );
  if (!r) throw new ErroreIntegrazione("UNKNOWN", "Risposta inattesa da Simphony: revenue center senza riferimenti");
  return r;
}

async function rvcConfigurato(ctx: ContestoAdattatore): Promise<RevenueCenter> {
  const d = leggiDestinazione(ctx.installazione.configuration.destinazione ?? ctx.installazione.externalLocationId);
  if (!d) throw new ErroreIntegrazione("INVALID_CONFIGURATION", "Manca il revenue center");
  return leggiRvc(ctx, segreti(ctx).organizzazione, d.locRef, d.rvcRef);
}

/**
 * `HEAD /checks/connectionStatus` → `Simphony-POS-Connected`. Distingue «l'API
 * risponde» da «il revenue center è collegato». È l'ultimo stato noto, e solo
 * della Cloud API: `null` quando Oracle non lo dice.
 */
async function posCollegato(ctx: ContestoAdattatore, c: ContestoCheck): Promise<boolean | null> {
  try {
    const r = await chiama(ctx, { metodo: "HEAD", percorso: "/checks/connectionStatus", intestazioni: intestazioniRvc(c), completa: true });
    const v = r.intestazioni.get("simphony-pos-connected");
    return v === null ? null : /^true$/i.test(v.trim());
  } catch (err) {
    if (err instanceof ErroreIntegrazione && err.codice === "NOT_FOUND") return null;
    throw err;
  }
}

async function leggiCheck(ctx: ContestoAdattatore, c: ContestoCheck, checkRef: string) {
  return check(
    await chiama(ctx, { percorso: `/checks/${encodeURIComponent(checkRef)}`, intestazioni: intestazioniRvc(c), timeoutMs: TIMEOUT_CHECK_MS }),
  );
}

/**
 * Il check che porta il nostro riferimento, fra quelli del tavolo dal giorno
 * prima (anche chiusi). Serve oltre i 300 secondi in cui Oracle riconosce da
 * solo una richiesta ripetuta, e oltre la singola workstation a cui quella
 * protezione è limitata.
 */
async function cercaCheck(ctx: ContestoAdattatore, c: ContestoCheck, o: OrdineDaInviare): Promise<string | null> {
  const q = new URLSearchParams({ includeClosed: "true", sinceTime: new Date(Date.now() - 24 * 3600_000).toISOString().slice(0, 16) + "Z" });
  if (o.tavoloExternalId) q.set("tableName", o.tavoloExternalId);
  const elenco = checks(await chiama(ctx, { percorso: `/checks?${q}`, intestazioni: intestazioniRvc(c), timeoutMs: TIMEOUT_CHECK_MS }));
  return elenco.find((k) => k.riferimento === o.riferimento)?.checkRef ?? null;
}

const seme = (ctx: ContestoAdattatore, riferimento: string, operazione: string) =>
  `${ctx.installazione.venueId}:${riferimento}:${operazione}`;

/* -------------------------------------------------------------------------- */
/*  Menu e configurazione                                                     */
/* -------------------------------------------------------------------------- */

async function leggiMenu(ctx: ContestoAdattatore, c: ContestoCheck) {
  const sommario = menuSommario(await chiama(ctx, { percorso: `/menus/summary?${queryRvc(c)}` }));
  const voci = new Map<string, VoceMenu>();
  const condimenti = new Map<string, VoceMenu>();
  const famiglie = new Map<string, { externalId: string; nome: string; padreExternalId: null }>();
  for (const m of sommario) {
    const letto = menu(await chiama(ctx, { percorso: `/menus/${encodeURIComponent(m.menuId)}`, intestazioni: intestazioniRvc(c) }));
    for (const v of letto.voci) voci.set(v.externalId, v);
    for (const v of letto.condimenti) condimenti.set(v.externalId, v);
    for (const f of letto.famiglie) famiglie.set(f.externalId, { ...f, padreExternalId: null });
  }
  const fuori = nonDisponibili(await chiama(ctx, { percorso: `/menus/items/unavailable?${queryRvc(c)}` }));
  return { voci: [...voci.values()], condimenti: [...condimenti.values()], famiglie: [...famiglie.values()], fuori };
}

const prezzoBase = (v: VoceMenu) => [...v.prezzi].sort((a, b) => a.priceSequence - b.priceSequence)[0]?.prezzoCents ?? null;

/* -------------------------------------------------------------------------- */
/*  L'adattatore                                                              */
/* -------------------------------------------------------------------------- */

export const oracleSimphony: PosIntegrationAdapter = {
  slug: "oracle-simphony",
  versione: VERSIONE,
  // La configurazione si rilegge ogni 6 ore; tiene viva anche la catena dei rinnovi.
  minutiSyncProgrammata: 360,

  async connetti({ campi, http }) {
    const regole = regoleIndirizzo();
    const sts = validaIndirizzo(campi.sts ?? "", regole).replace(/\/api\/v1$/i, "");
    const auth = validaIndirizzo(campi.auth ?? "", regole).replace(/\/oidc-provider.*$/i, "");
    const clientId = campi.clientId?.trim();
    const utente = campi.utente?.trim();
    const organizzazione = campi.organizzazione?.trim().toLowerCase();
    const password = campi.password ?? "";
    if (!clientId || !utente || !organizzazione || !password) {
      throw new ErroreIntegrazione("INVALID_CONFIGURATION", "Servono Client ID, utente, password e organizzazione dell'API account");
    }
    // La password va solo all'OpenID Provider, dopo il controllo dell'indirizzo e del DNS.
    await controllaPrimaDiChiamare(`${auth}/oidc-provider/v1/oauth2/authorize`, regole);
    const t = await accedi(http, { auth, clientId, utente, password, organizzazione });
    return credenziali({ sts, auth, clientId, utente, organizzazione }, t);
  },

  async rinnovaAutenticazione(ctx) {
    const s = segreti(ctx);
    if (!s.refreshToken) throw new ErroreIntegrazione("AUTH_EXPIRED", "Manca il refresh token: serve ricollegarsi");
    await controllaPrimaDiChiamare(`${s.auth}/oidc-provider/v1/oauth2/token`, regoleIndirizzo());
    const t = await rinnova(ctx.http, { auth: s.auth, clientId: s.clientId, refreshToken: s.refreshToken });
    const { hmacKey, keyId } = s;
    return credenziali(
      { sts: s.sts, auth: s.auth, clientId: s.clientId, utente: s.utente ?? "", organizzazione: s.organizzazione },
      t,
      { ...(hmacKey ? { hmacKey } : {}), ...(keyId ? { keyId } : {}) },
    );
  },

  async provaConnessione(ctx) {
    const s = segreti(ctx);
    const orgs = organizzazioni(await chiama(ctx, { percorso: "/organizations" }));
    const org = orgs.find((o) => o.orgShortName.toLowerCase() === s.organizzazione.toLowerCase());
    if (!org) {
      throw new ErroreIntegrazione("PERMISSION_DENIED", `L'API account non è autorizzato sull'organizzazione ${s.organizzazione}`);
    }
    const account = { externalId: org.orgShortName, nome: org.nome };
    const d = leggiDestinazione(ctx.installazione.configuration.destinazione);
    if (!d) return { account, sedi: [], avvisi: ["Scegli il revenue center nella configurazione."] };

    const c = contestoCheck(ctx);
    const rvc = await leggiRvc(ctx, org.orgShortName, d.locRef, d.rvcRef);
    const tipo = String(ctx.installazione.configuration.tipoOrdine ?? "");
    if (!tipo.startsWith(`${destinazione(d.locRef, d.rvcRef)}:`) || !rvc.tipiOrdine.some((t) => t.ref === c.tipoOrdine)) {
      throw new ErroreIntegrazione("INVALID_CONFIGURATION", "Il tipo d'ordine scelto non appartiene a questo revenue center");
    }
    try {
      await chiama(ctx, {
        percorso: `/employees?${new URLSearchParams({ OrgShortName: c.orgShortName, LocRef: c.locRef, EmployeeId: String(c.dipendente) })}`,
      });
    } catch (err) {
      if (err instanceof ErroreIntegrazione && (err.codice === "NOT_FOUND" || err.codice === "VALIDATION")) {
        throw new ErroreIntegrazione("INVALID_CONFIGURATION", `Il dipendente ${c.dipendente} non esiste su Simphony`);
      }
      throw err;
    }
    const collegato = await posCollegato(ctx, c);
    const avvisi: string[] = [];
    if (collegato === false) avvisi.push(`STS risponde, ma il revenue center «${rvc.nome}» non risulta collegato al POS: le comande resterebbero in attesa.`);
    if (collegato === null) avvisi.push("Simphony non ha indicato se il POS è collegato (connectionStatus).");
    return { account, sedi: [{ externalId: destinazione(d.locRef, d.rvcRef), nome: rvc.nome, account }], avvisi };
  },

  async opzioniConfigurazione(ctx) {
    const org = segreti(ctx).organizzazione;
    const locs = locations(await chiama(ctx, { percorso: `/organizations/${encodeURIComponent(org)}/locations` }));
    const sedi: { value: string; label: string }[] = [];
    const tipi: { value: string; label: string }[] = [];
    for (const l of locs) {
      const rvcs = revenueCenters(
        await chiama(ctx, { percorso: `/organizations/${encodeURIComponent(org)}/locations/${encodeURIComponent(l.locRef)}/revenueCenters` }),
      );
      for (const r of rvcs) {
        const dest = destinazione(l.locRef, r.rvcRef);
        sedi.push({ value: dest, label: `${l.nome} · ${r.nome}` });
        for (const t of r.tipiOrdine) tipi.push({ value: `${dest}:${t.ref}`, label: `${r.nome} — ${t.nome}` });
      }
    }
    return { locations: sedi, order_types: tipi };
  },

  /**
   * Le notifiche: si registra una chiave HMAC (`PUT /notifications/registration`,
   * il metodo che Oracle preferisce, anche per ruotarla) e ci si iscrive ai
   * quattro tipi documentati per questo revenue center. La registrazione è
   * **per API client**: un API account dedicato a ogni locale Foodtech,
   * altrimenti due locali si ruoterebbero la chiave a vicenda.
   */
  async attiva(ctx) {
    const c = contestoCheck(ctx);
    const callback = `${ctx.origine}/api/integrations/webhooks/oracle-simphony/${ctx.installazione.webhookKey}`;
    const u = new URL(callback);
    const tld = u.hostname.split(".").pop() ?? "";
    if (u.protocol !== "https:" || (u.port && u.port !== "443") || !TLD_NOTIFICHE.includes(tld)) {
      return {
        metadata: {
          sottoscrizioni: [],
          avvisoNotifiche: `Oracle consegna le notifiche solo in HTTPS sulla porta 443 e sui domini .${TLD_NOTIFICHE.join(", .")}: ${u.origin} non va bene. Notifiche non attivate.`,
        },
      };
    }
    const keyId = randomUUID();
    const hmacKey = randomBytes(32).toString("base64");
    await chiama(ctx, { metodo: "PUT", percorso: "/notifications/registration", corpo: { keyId, hmacKey, keyType: "hmac-sha256" } });

    // Le nostre iscrizioni di prima (stesso percorso, indirizzo vecchio o uguale) si tolgono.
    const esistenti = await chiama<unknown>(ctx, { percorso: "/notifications/subscriptions" }).catch(() => null);
    const elenco = Array.isArray(esistenti)
      ? esistenti
      : Array.isArray((esistenti as { items?: unknown[] } | null)?.items)
        ? (esistenti as { items: unknown[] }).items
        : [];
    for (const e of elenco as { subscriptionId?: string; callbackUri?: string }[]) {
      if (e.subscriptionId && e.callbackUri?.includes("/api/integrations/webhooks/oracle-simphony/")) {
        await chiama(ctx, { metodo: "DELETE", percorso: `/notifications/subscriptions/${encodeURIComponent(e.subscriptionId)}` });
      }
    }

    const sottoscrizioni: { id: string; tipo: string }[] = [];
    for (const n of NOTIFICHE) {
      const r = await chiama<{ subscriptionId?: string }>(ctx, {
        metodo: "POST",
        percorso: "/notifications/subscriptions",
        corpo: {
          callbackUri: callback,
          messageType: { id: n.id },
          postOfficeOptions: { PostOfficeType: "PushOnePostOffice" },
          orgShortName: c.orgShortName,
          locRef: c.locRef,
          ...(n.livello === "rvc" ? { rvcRef: String(c.rvcRef) } : {}),
        },
      });
      if (r?.subscriptionId) sottoscrizioni.push({ id: r.subscriptionId, tipo: n.id });
    }
    return { segretiAggiunti: { hmacKey, keyId }, metadata: { sottoscrizioni } };
  },

  /**
   * Via le iscrizioni e la registrazione. Oracle **non documenta** un endpoint
   * per revocare i token: restano validi fino alla scadenza (id_token 14
   * giorni), ma Foodtech li cancella subito dal suo database.
   */
  async disconnetti(ctx) {
    const s = Array.isArray(ctx.installazione.metadata?.sottoscrizioni)
      ? (ctx.installazione.metadata!.sottoscrizioni as { id: string }[])
      : [];
    for (const x of s) {
      await chiama(ctx, { metodo: "DELETE", percorso: `/notifications/subscriptions/${encodeURIComponent(x.id)}` }).catch((err) => {
        if (!(err instanceof ErroreIntegrazione && err.codice === "NOT_FOUND")) throw err;
      });
    }
    if (s.length) {
      await chiama(ctx, { metodo: "DELETE", percorso: "/notifications/registration" }).catch((err) => {
        if (!(err instanceof ErroreIntegrazione && err.codice === "NOT_FOUND")) throw err;
      });
    }
  },

  async sincronizza(ctx, operazione): Promise<RisultatoSincronizzazione> {
    const c = contestoCheck(ctx);
    const out: RisultatoSincronizzazione = { entita: [], scartati: [] };
    const tutto = operazione === "full";

    if (tutto) {
      // «API raggiungibile» non vuol dire «revenue center collegato»: lo si scrive nel registro.
      const collegato = await posCollegato(ctx, c);
      if (collegato === false) out.scartati.push({ motivo: "STS risponde, ma il POS del revenue center non risulta collegato (connectionStatus)" });
    }
    if (tutto || operazione === "tables") {
      const rvc = await leggiRvc(ctx, c.orgShortName, c.locRef, c.rvcRef);
      for (const t of tavoliDi(rvc)) out.entita.push({ tipo: "TABLE", externalId: t.externalId, etichetta: t.etichetta });
    }
    if (tutto || operazione === "menu") {
      const m = await leggiMenu(ctx, c);
      for (const f of m.famiglie) out.entita.push({ tipo: "CATEGORY", externalId: f.externalId, etichetta: f.nome });
      for (const v of m.voci) {
        out.entita.push({
          tipo: "PRODUCT",
          externalId: v.externalId,
          etichetta: v.nome,
          metadata: {
            nome: v.nome,
            menuItemId: v.menuItemId,
            definitionSequence: v.definitionSequence,
            prezzoCents: prezzoBase(v),
            prezzi: v.prezzi,
            famiglia: v.famigliaRef,
            taxClassRef: v.taxClassRef,
            condimentiObbligatori: v.gruppiCondimenti.some((g) => g.minimo > 0),
            disponibile: disponibile(v, m.fuori),
          },
        });
      }
      for (const v of m.condimenti) {
        out.entita.push({
          tipo: "MODIFIER",
          externalId: `c${v.externalId}`,
          etichetta: v.nome,
          metadata: { condimentId: v.menuItemId, definitionSequence: v.definitionSequence, prezzoCents: prezzoBase(v) },
        });
      }
      for (const d of sconti(await chiama(ctx, { percorso: `/discounts/collection?${queryRvc(c)}` }), "discountId")) {
        out.entita.push({ tipo: "DISCOUNT", externalId: d.externalId, etichetta: d.nome, metadata: { tipo: d.tipo, valore: d.valore, aperto: d.aperto } });
      }
      for (const d of sconti(await chiama(ctx, { percorso: `/serviceCharges/collection?${queryRvc(c)}` }), "serviceChargeId")) {
        out.entita.push({ tipo: "SERVICE_CHARGE", externalId: d.externalId, etichetta: d.nome, metadata: { tipo: d.tipo, valore: d.valore, aperto: d.aperto } });
      }
    }
    if (tutto || operazione === "tax_rates") {
      for (const a of aliquote(await chiama(ctx, { percorso: `/taxes?${queryRvc(c)}` }))) {
        out.entita.push({ tipo: "TAX_RATE", externalId: a.externalId, etichetta: a.descrizione, metadata: { percentuale: a.percentuale, inclusa: a.inclusa } });
      }
    }
    if (tutto || operazione === "payment_methods") {
      for (const t of tender(await chiama(ctx, { percorso: `/tenders/collection?${queryRvc(c)}` }))) {
        out.entita.push({ tipo: "PAYMENT_METHOD", externalId: t.externalId, etichetta: t.nome, metadata: { tipo: t.tipo } });
      }
    }
    return out;
  },

  /** Nessuna firma da verificare senza la chiave registrata: chi arriva senza `Digest` valido è fuori. */
  verificaWebhook(ctx, w) {
    const s = ctx.segreti as SegretiOracle;
    if (!s.hmacKey || !s.keyId) return false;
    if ((w.intestazioni.get("key-id") ?? "").trim() !== s.keyId) return false;
    return firmaValida(w.corpo, w.intestazioni.get("digest"), s.hmacKey);
  },

  riceviWebhook(_ctx, w) {
    let corpo: unknown;
    try {
      corpo = JSON.parse(w.corpo);
    } catch {
      throw new ErroreIntegrazione("VALIDATION", "Notifica Simphony non leggibile");
    }
    const n = leggiNotifica(corpo);
    return { idEvento: n.idEvento, tipo: n.tipo, evento: n.evento, sedeExternalId: n.sede };
  },

  codiceProdottoPerOrdine(m) {
    return m.externalId;
  },

  pos: {
    async getLocations(ctx) {
      const o = await oracleSimphony.opzioniConfigurazione!(ctx);
      const org = segreti(ctx).organizzazione;
      return (o.locations ?? []).map((l) => ({ externalId: l.value, nome: l.label, account: { externalId: org, nome: org } }));
    },
    async getTables(ctx) {
      return tavoliDi(await rvcConfigurato(ctx));
    },
    async getMenu(ctx) {
      const c = contestoCheck(ctx);
      const m = await leggiMenu(ctx, c);
      return [
        {
          externalId: `${c.locRef}:${c.rvcRef}`,
          nome: "Menu Simphony",
          categorie: m.famiglie,
          prodotti: m.voci.map((v) => ({
            externalId: v.externalId,
            codice: v.externalId,
            nome: v.nome,
            prezzoCents: prezzoBase(v),
            categoriaExternalId: v.famigliaRef,
            aliquotaPercentuale: null,
            ivaInclusa: null,
            modificatori: [],
          })),
        },
      ];
    },
    async getProducts(ctx) {
      return (await oracleSimphony.pos.getMenu!(ctx)).flatMap((m) => m.prodotti);
    },
    async getCategories(ctx) {
      return (await oracleSimphony.pos.getMenu!(ctx)).flatMap((m) => m.categorie);
    },
    async getTaxRates(ctx) {
      return aliquote(await chiama(ctx, { percorso: `/taxes?${queryRvc(contestoCheck(ctx))}` }));
    },
    async getPaymentMethods(ctx) {
      return tender(await chiama(ctx, { percorso: `/tenders/collection?${queryRvc(contestoCheck(ctx))}` })).map(({ tipo: _t, ...m }) => m);
    },
    async getOrder(ctx, checkRef) {
      try {
        return ordineDaCheck(await leggiCheck(ctx, contestoCheck(ctx), checkRef));
      } catch (err) {
        if (err instanceof ErroreIntegrazione && err.codice === "NOT_FOUND") return null;
        throw err;
      }
    },
    async getOrders(ctx, { da }) {
      const c = contestoCheck(ctx);
      const q = new URLSearchParams({ includeClosed: "true", sinceTime: da.toISOString().slice(0, 16) + "Z" });
      return checks(await chiama(ctx, { percorso: `/checks?${q}`, intestazioni: intestazioniRvc(c), timeoutMs: TIMEOUT_CHECK_MS })).map(ordineDaCheck);
    },
    async getPayments(ctx, { da }) {
      const c = contestoCheck(ctx);
      const q = new URLSearchParams({ includeClosed: "true", sinceTime: da.toISOString().slice(0, 16) + "Z" });
      return checks(await chiama(ctx, { percorso: `/checks?${q}`, intestazioni: intestazioniRvc(c), timeoutMs: TIMEOUT_CHECK_MS })).flatMap(pagamentiDi);
    },

    /**
     * La prima comanda: un check nuovo. Prima si guarda che il POS sia
     * collegato (altrimenti la comanda resta in attesa e si riprova), poi che
     * il check non esista già (risposta persa oltre i 300 secondi della
     * protezione di Oracle), poi `POST /checks` con
     * `Simphony-Features: detect-duplicate-request` e un `idempotencyId`
     * derivato dalla comanda: lo stesso a ogni tentativo.
     */
    async createOrder(ctx, o) {
      const c = contestoCheck(ctx);
      if ((await posCollegato(ctx, c)) === false) {
        throw new ErroreIntegrazione("PROVIDER_UNAVAILABLE", "Il revenue center non è collegato al POS (connectionStatus)");
      }
      const esistente = await cercaCheck(ctx, c, o);
      if (esistente) return { accettato: true, externalId: esistente };
      const risposta = check(
        await chiama(ctx, {
          metodo: "POST",
          percorso: "/checks",
          intestazioni: { ...intestazioniRvc(c), "Simphony-Features": "detect-duplicate-request" },
          corpo: corpoCheck(c, o, idempotencyId(seme(ctx, o.riferimento, "create"))),
          timeoutMs: TIMEOUT_CHECK_MS,
        }),
      );
      return { accettato: true, externalId: risposta.checkRef };
    },

    /**
     * Un'aggiunta: `POST /checks/{checkRef}/round`, che «non altera le voci
     * dei round precedenti». Prima si legge il check: se è chiuso (pagato) o
     * non esiste più, lo si dice con `contoChiuso` e il servizio apre un check
     * nuovo; se il round c'è già (stesso riferimento nelle estensioni delle
     * righe), non si manda di nuovo.
     */
    async updateOrder(ctx, checkRef, o) {
      const c = contestoCheck(ctx);
      let attuale;
      try {
        attuale = await leggiCheck(ctx, c, checkRef);
      } catch (err) {
        if (err instanceof ErroreIntegrazione && err.codice === "NOT_FOUND") {
          throw new ErroreIntegrazione("CONFLICT", "Il check su Simphony non esiste più", { contoChiuso: true });
        }
        throw err;
      }
      if (!attuale.aperto) throw new ErroreIntegrazione("CONFLICT", "Il check su Simphony è chiuso (pagato)", { contoChiuso: true });
      if (attuale.riferimentiRound.has(o.riferimento)) return;
      await chiama(ctx, {
        metodo: "POST",
        percorso: `/checks/${encodeURIComponent(checkRef)}/round`,
        intestazioni: { ...intestazioniRvc(c), "Simphony-Features": "detect-duplicate-request" },
        corpo: corpoRound(c, checkRef, o, idempotencyId(seme(ctx, o.riferimento, "round"))),
        timeoutMs: TIMEOUT_CHECK_MS,
      });
    },

    /** `DELETE /checks/{checkRef}` (voidCheck): «se in uno stato in cui l'annullamento è permesso». */
    async cancelOrder(ctx, checkRef) {
      const c = contestoCheck(ctx);
      await chiama(ctx, { metodo: "DELETE", percorso: `/checks/${encodeURIComponent(checkRef)}`, intestazioni: intestazioniRvc(c), timeoutMs: TIMEOUT_CHECK_MS });
    },

    /**
     * Un pagamento: un round con soli `tenders[]`. Documentato nella forma;
     * cosa fa il POS (stampa, chiusura quando il dovuto arriva a zero,
     * fiscalizzazione) è da provare su un Simphony vero. **Nessuna schermata
     * lo usa.**
     */
    async createPayment(ctx, p) {
      if (!p.idOperazione) throw new ErroreIntegrazione("VALIDATION", "Un pagamento Simphony richiede un idOperazione stabile");
      if (!p.metodo) throw new ErroreIntegrazione("VALIDATION", "Manca il tender");
      const tenderId = Number(p.metodo.externalId);
      if (!Number.isInteger(tenderId)) throw new ErroreIntegrazione("VALIDATION", "Tender non valido");
      if (p.manciaCents) throw new ErroreIntegrazione("NOT_SUPPORTED", "Mance su Simphony (chargedTipTotal) non gestite");
      const c = contestoCheck(ctx);
      const attuale = await leggiCheck(ctx, c, p.riferimentoOrdine);
      const marca = `pagamento:${p.idOperazione}`;
      // Già applicato (anche se nel frattempo il check si è chiuso): non si ripete.
      if (attuale.riferimentiTender.has(marca)) return;
      if (!attuale.aperto) throw new ErroreIntegrazione("CONFLICT", "Il check su Simphony è già chiuso", { contoChiuso: true });
      await chiama(ctx, {
        metodo: "POST",
        percorso: `/checks/${encodeURIComponent(p.riferimentoOrdine)}/round`,
        intestazioni: { ...intestazioniRvc(c), "Simphony-Features": "detect-duplicate-request" },
        corpo: corpoPagamento(c, p.riferimentoOrdine, {
          tenderId,
          importoCents: p.importoCents,
          idempotenza: idempotencyId(seme(ctx, p.idOperazione, "payment")),
          marca,
        }),
        timeoutMs: TIMEOUT_CHECK_MS,
      });
    },

    /** `POST /checks/calculator`: i totali di Oracle senza creare niente. */
    async calculateOrder(ctx, o) {
      const c = contestoCheck(ctx);
      const r = await chiama<{ totals?: unknown }>(ctx, {
        metodo: "POST",
        percorso: "/checks/calculator",
        intestazioni: intestazioniRvc(c),
        corpo: corpoCheck(c, o, idempotencyId(seme(ctx, o.riferimento, "calculate"))),
        timeoutMs: TIMEOUT_CHECK_MS,
      });
      return totali(r?.totals);
    },

    /** `GET /checks/{checkRef}/printed`: 40 colonne, come le stampa il POS. Non è un documento fiscale. */
    async getPrintedCheck(ctx, checkRef) {
      const c = contestoCheck(ctx);
      const r = await chiama<{ items?: unknown }>(ctx, {
        percorso: `/checks/${encodeURIComponent(checkRef)}/printed`,
        intestazioni: intestazioniRvc(c),
        timeoutMs: TIMEOUT_CHECK_MS,
      });
      if (!Array.isArray(r?.items)) throw new ErroreIntegrazione("UNKNOWN", "Risposta inattesa da Simphony: printed senza items");
      return r.items.map((x) => String(x));
    },
  },
};
