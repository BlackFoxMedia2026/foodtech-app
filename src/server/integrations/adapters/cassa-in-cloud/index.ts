import { createHmac, createHash, timingSafeEqual } from "node:crypto";
import { ErroreIntegrazione } from "../../errori";
import type {
  ContestoAdattatore,
  CredenzialiNuove,
  PosIntegrationAdapter,
  RisultatoSincronizzazione,
  WebhookRicevuto,
} from "../tipi";
import type { ClientFornitore, RichiestaFornitore } from "../http";
import { jsonConInteriSicuri } from "../http";
import {
  GIORNI_FINESTRA,
  hostApi,
  LIMITE_PAGINA,
  MASSIMO_PAGINE,
  PERCORSO_TOKEN,
  VERSIONE_API,
  codificaData,
  codificaLista,
} from "./config";
import {
  aliquote,
  categorie,
  corpoOrdine,
  eConflittoDiRiferimento,
  elenco,
  idCreato,
  leggiEvento,
  leggiToken,
  listini,
  ordine,
  ordini,
  pagamentiDaScontrini,
  prodotti,
  puntiVendita,
  sale,
  tavoli,
} from "./traduzione";

/**
 * **Cassa in Cloud (TeamSystem) — il secondo adattatore POS.**
 *
 * Stesso contratto di Lightspeed (`PosIntegrationAdapter`), autenticazione
 * diversa, e la piattaforma non ha dovuto cambiare per questo:
 *
 * - **chiave API, non OAuth.** Il ristoratore incolla la chiave che Cassa in
 *   Cloud gli ha rilasciato; Foodtech la scambia con un token di accesso
 *   (`POST /apikey/token`) che vale un'ora. Non c'è un token di rinnovo:
 *   allo scadere se ne chiede un altro con la stessa chiave. Chiave e token
 *   vivono cifrati in `IntegrationCredential`, come i token di Lightspeed;
 * - **scope decisi dal fornitore.** La documentazione dice che la chiave
 *   porta con sé i permessi (`scope`): non se ne chiedono;
 * - **webhook configurati dal ristoratore**, nel pannello MyCassa in Cloud,
 *   con un segreto che poi riporta in Foodtech.
 *
 * ## Cosa non fa, perché l'API documentata non lo permette
 *
 * - aggiornare o chiudere un ordine: esiste solo la creazione
 *   (`POST /documents/orders/batch`) e la modifica dei dati di prepagamento;
 * - emettere uno scontrino o un documento commerciale: scontrini, conti e
 *   fatture si **leggono** soltanto;
 * - leggere i metodi di pagamento: non c'è un endpoint che li elenchi;
 * - revocare la chiave: si revoca presso Cassa in Cloud.
 *
 * Mai parlato con un account vero: vedi i DA VERIFICARE in `traduzione.ts`
 * e in `config.ts`.
 */

export const VERSIONE = "0.1.0";

type SegretiCassa = { apiKey?: string; accessToken?: string; webhookSecret?: string };

const segretiDi = (ctx: ContestoAdattatore) => ctx.segreti as SegretiCassa;

function sede(ctx: ContestoAdattatore): string {
  const id = (ctx.installazione.configuration.idSalesPoint as string | undefined) ?? ctx.installazione.externalLocationId;
  if (!id || !/^\d+$/.test(id)) {
    throw new ErroreIntegrazione("INVALID_CONFIGURATION", "Nessun punto vendita Cassa in Cloud scelto per questa installazione");
  }
  return id;
}

/**
 * Il token dalla chiave. Un rifiuto qui (400, 401, 403) vuol dire una cosa
 * sola: la chiave non va — «API Key non valida o non autorizzata». Non è un
 * accesso «scaduto» da rinnovare: rinnovarlo con la stessa chiave darebbe
 * lo stesso rifiuto.
 */
async function token(http: ClientFornitore, apiKey: string) {
  let corpo: unknown;
  try {
    corpo = await http.richiesta({
      metodo: "POST",
      url: `${hostApi()}${PERCORSO_TOKEN}`,
      intestazioni: { "X-Requested-With": "*" },
      corpo: { apiKey },
    });
  } catch (err) {
    if (err instanceof ErroreIntegrazione && [400, 401, 403].includes(err.dettaglio.status ?? 0)) {
      throw new ErroreIntegrazione("AUTH_INVALID", "La chiave API è stata rifiutata", err.dettaglio, err.correlationId);
    }
    throw err;
  }
  const t = leggiToken(corpo);
  if (!t) throw new ErroreIntegrazione("AUTH_INVALID", "Il server di autorizzazione non ha restituito un token");
  return t;
}

function credenziali(apiKey: string, t: { accessToken: string; accessTokenExpiresAt: Date | null }, webhookSecret?: string): CredenzialiNuove {
  return {
    kind: "API_KEY",
    segreti: { apiKey, accessToken: t.accessToken, ...(webhookSecret ? { webhookSecret } : {}) },
    scopes: [],
    accessTokenExpiresAt: t.accessTokenExpiresAt,
    refreshTokenExpiresAt: null,
  };
}

/**
 * Ogni chiamata alle risorse: intestazioni documentate e, se il token è
 * scaduto prima del previsto (un 401 con una chiave valida), **un** nuovo
 * token e un nuovo tentativo. Il token nuovo resta nel contesto di questa
 * operazione; quello salvato lo rinnova la piattaforma alla scadenza.
 */
async function chiama<T = unknown>(ctx: ContestoAdattatore, r: RichiestaFornitore): Promise<T> {
  const s = segretiDi(ctx);
  const con = (accessToken: string | undefined) =>
    ctx.http.richiesta<T>({
      ...r,
      url: `${hostApi()}${r.url}`,
      intestazioni: {
        "X-Version": VERSIONE_API,
        "X-Requested-With": "*",
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        ...(r.intestazioni ?? {}),
      },
    });
  try {
    return await con(s.accessToken);
  } catch (err) {
    if (!(err instanceof ErroreIntegrazione) || err.codice !== "AUTH_EXPIRED" || !s.apiKey) throw err;
    const nuovo = await token(ctx.http, s.apiKey);
    s.accessToken = nuovo.accessToken;
    return con(nuovo.accessToken);
  }
}

/** Tutte le pagine di un elenco, fino a `MASSIMO_PAGINE`. */
async function tutte(ctx: ContestoAdattatore, percorso: string, chiave: string, filtri: Record<string, string> = {}) {
  const righe: unknown[] = [];
  for (let pagina = 0; pagina < MASSIMO_PAGINE; pagina++) {
    const q = new URLSearchParams({ start: String(pagina * LIMITE_PAGINA), limit: String(LIMITE_PAGINA), ...filtri });
    const corpo = await chiama(ctx, { url: `${percorso}?${q.toString()}` });
    const { righe: qui, totale } = elenco(corpo, chiave);
    righe.push(...qui);
    if (qui.length < LIMITE_PAGINA || (totale !== null && righe.length >= totale)) break;
  }
  return { [chiave]: righe };
}

const perSede = (ctx: ContestoAdattatore) => ({ idsSalesPoint: codificaLista([Number(sede(ctx))]) });

/** Le finestre di al massimo `GIORNI_FINESTRA` giorni: le ricerche per data ne accettano meno di tre. */
function finestre(da: Date, a: Date): [Date, Date][] {
  const out: [Date, Date][] = [];
  let inizio = new Date(da);
  while (inizio <= a) {
    const fine = new Date(Math.min(a.getTime(), inizio.getTime() + (GIORNI_FINESTRA - 1) * 86_400_000));
    out.push([inizio, fine]);
    inizio = new Date(fine.getTime() + 86_400_000);
  }
  return out;
}

function confrontaCostante(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

export const cassaInCloud: PosIntegrationAdapter = {
  slug: "cassa-in-cloud",
  versione: VERSIONE,
  /* 360 chiamate per API ogni dieci minuti: ogni sei ore basta e avanza, e
     i webhook dei prodotti chiedono una sincronizzazione quando serve. */
  minutiSyncProgrammata: 360,

  /* ------------------------------------------------------------------ */
  /*  Autenticazione — chiave API → token di un'ora                      */
  /* ------------------------------------------------------------------ */

  async connetti({ campi, http }) {
    const apiKey = campi.apiKey?.trim();
    if (!apiKey) throw new ErroreIntegrazione("VALIDATION", "Manca la chiave API");
    return credenziali(apiKey, await token(http, apiKey), campi.webhookSecret?.trim() || undefined);
  },

  async rinnovaAutenticazione(ctx) {
    const s = segretiDi(ctx);
    if (!s.apiKey) throw new ErroreIntegrazione("AUTH_INVALID", "Nessuna chiave API salvata");
    return credenziali(s.apiKey, await token(ctx.http, s.apiKey), s.webhookSecret);
  },

  /* ------------------------------------------------------------------ */
  /*  Prova e configurazione                                             */
  /* ------------------------------------------------------------------ */

  async provaConnessione(ctx) {
    const sedi = puntiVendita(await chiama(ctx, { url: "/salespoint" }));
    const avvisi: string[] = [];
    if (sedi.length === 0) avvisi.push("La chiave API non ha nessun punto vendita abilitato.");
    const scelta = (ctx.installazione.configuration.idSalesPoint as string | undefined) ?? null;
    if (scelta && !sedi.some((s) => s.externalId === scelta)) {
      throw new ErroreIntegrazione("INVALID_CONFIGURATION", `Il punto vendita ${scelta} non è abilitato per questa chiave`);
    }
    return { account: null, sedi, avvisi };
  },

  async opzioniConfigurazione(ctx) {
    const sedi = puntiVendita(await chiama(ctx, { url: "/salespoint" }));
    return { locations: sedi.map((s) => ({ value: s.externalId, label: s.nome })) };
  },

  /* ------------------------------------------------------------------ */
  /*  Sincronizzazione (solo lettura: scrive mappature, mai la cassa)    */
  /* ------------------------------------------------------------------ */

  async sincronizza(ctx, operazione): Promise<RisultatoSincronizzazione> {
    const accese = new Set(ctx.installazione.enabledCapabilities);
    const vuole = (cap: string, op: string) => accese.has(cap) && (operazione === "full" || operazione === op);
    const out: RisultatoSincronizzazione = { entita: [], scartati: [] };

    if (vuole("tables", "tables")) {
      for (const s of sale(await tutte(ctx, "/risto/rooms", "rooms", perSede(ctx)))) {
        out.entita.push({ tipo: "FLOOR", externalId: s.externalId, etichetta: s.nome });
      }
      for (const t of tavoli(await tutte(ctx, "/risto/tables", "tables", perSede(ctx)))) {
        out.entita.push({ tipo: "TABLE", externalId: t.externalId, etichetta: t.etichetta, metadata: { sala: t.salaExternalId, posti: t.posti } });
      }
    }

    if (vuole("menu", "menu")) {
      for (const c of categorie(await tutte(ctx, "/categories", "categories", perSede(ctx)))) {
        out.entita.push({ tipo: "CATEGORY", externalId: c.externalId, etichetta: c.nome });
      }
      for (const p of prodotti(await tutte(ctx, "/products", "products", perSede(ctx)))) {
        out.entita.push({
          tipo: "PRODUCT",
          externalId: p.externalId,
          etichetta: p.nome,
          metadata: {
            prezzoCents: p.prezzoCents,
            categoria: p.categoriaExternalId,
            aliquota: p.aliquotaPercentuale,
            multivariante: p.multivariante,
            varianti: p.varianti,
            prezziPerListino: p.prezziPerListino,
            abilitatoRisto: p.abilitatoRisto,
          },
        });
      }
      for (const l of listini(await tutte(ctx, "/salesmodes", "salesModes", perSede(ctx)))) {
        out.entita.push({ tipo: "PRICE_LIST", externalId: l.externalId, etichetta: l.nome });
      }
    }

    if (vuole("tax_rates", "tax_rates")) {
      for (const a of aliquote(await tutte(ctx, "/taxes", "taxes", perSede(ctx)))) {
        out.entita.push({ tipo: "TAX_RATE", externalId: a.externalId, etichetta: a.descrizione, metadata: { percentuale: a.percentuale } });
      }
    }

    return out;
  },

  /**
   * La riga d'ordine documentata accetta solo `idProductVariant`. Per un
   * prodotto multivariante con **una** variante si usa quella; con più
   * varianti Foodtech dovrebbe sapere quale — oggi non lo sa, e si rifiuta.
   * Per un prodotto semplice la documentazione non dice cosa mettere: si
   * rifiuta, invece di mandare alla cassa un identificativo indovinato.
   * DA VERIFICARE CON ACCOUNT REALE: è la prima cosa da provare, e cambia
   * solo qui.
   */
  codiceProdottoPerOrdine({ externalId, metadata }) {
    const m = metadata ?? {};
    const varianti = Array.isArray(m.varianti) ? (m.varianti as { externalId?: string }[]) : [];
    if (m.multivariante === true && varianti.length === 1 && varianti[0]?.externalId) return varianti[0].externalId;
    throw new ErroreIntegrazione(
      "NOT_SUPPORTED",
      m.multivariante === true
        ? `Il prodotto ${externalId} ha più varianti: serve sapere quale ordinare`
        : `Prodotto ${externalId} non multivariante: la riga d'ordine documentata chiede una variante (DA VERIFICARE CON ACCOUNT REALE)`,
    );
  },

  /* ------------------------------------------------------------------ */
  /*  Webhook — configurati dal ristoratore, firmati HMAC-SHA1           */
  /* ------------------------------------------------------------------ */

  /**
   * «Cassa in Cloud signs the message by computing an HMAC (with SHA-1
   * algorithm) of the secret + request body and placing the signature in
   * the x-cn-signature header.»
   *
   * DA VERIFICARE: la frase si legge come HMAC-SHA1 con il segreto come
   * chiave e il corpo come messaggio, ed è così che si calcola; la codifica
   * della firma (esadecimale o base64) non è detta, e si accettano entrambe.
   */
  verificaWebhook(ctx, w: WebhookRicevuto) {
    const segreto = segretiDi(ctx).webhookSecret;
    const firma = w.intestazioni.get("x-cn-signature")?.trim();
    if (!segreto || !firma) return false;
    const mac = createHmac("sha1", segreto).update(w.corpo, "utf8").digest();
    return confrontaCostante(firma.toLowerCase(), mac.toString("hex")) || confrontaCostante(firma, mac.toString("base64"));
  },

  /**
   * Le notifiche non portano un identificativo dell'evento: la chiave di
   * idempotenza è l'impronta di operazione e corpo. Un ritentativo di Cassa
   * in Cloud (fino a tre) manda lo stesso corpo e si ferma al vincolo.
   */
  riceviWebhook(_ctx, w) {
    const operazione = w.intestazioni.get("x-cn-operation") ?? "";
    if (!/^[A-Za-z]+\/[A-Za-z]+$/.test(operazione)) {
      throw new ErroreIntegrazione("VALIDATION", "Intestazione x-cn-operation mancante o non valida");
    }
    let corpo: unknown;
    try {
      corpo = jsonConInteriSicuri(w.corpo);
    } catch {
      throw new ErroreIntegrazione("VALIDATION", "Il corpo della notifica non è JSON");
    }
    const l = leggiEvento(operazione, corpo);
    return {
      idEvento: createHash("sha256").update(`${operazione.toUpperCase()}|${w.corpo}`).digest("hex").slice(0, 40),
      tipo: l.tipo,
      evento: l.evento,
      sedeExternalId: l.sede,
    };
  },

  /* ------------------------------------------------------------------ */
  /*  Operazioni di cassa                                                */
  /* ------------------------------------------------------------------ */

  pos: {
    async getLocations(ctx) {
      return puntiVendita(await chiama(ctx, { url: "/salespoint" }));
    },
    async getFloors(ctx) {
      return sale(await tutte(ctx, "/risto/rooms", "rooms", perSede(ctx)));
    },
    async getTables(ctx) {
      return tavoli(await tutte(ctx, "/risto/tables", "tables", perSede(ctx)));
    },
    async getMenu(ctx) {
      const [c, p] = [
        categorie(await tutte(ctx, "/categories", "categories", perSede(ctx))),
        prodotti(await tutte(ctx, "/products", "products", perSede(ctx))),
      ];
      return [{ externalId: `salespoint-${sede(ctx)}`, nome: "Catalogo Cassa in Cloud", categorie: c, prodotti: p }];
    },
    async getProducts(ctx) {
      return prodotti(await tutte(ctx, "/products", "products", perSede(ctx)));
    },
    async getCategories(ctx) {
      return categorie(await tutte(ctx, "/categories", "categories", perSede(ctx)));
    },
    async getTaxRates(ctx) {
      return aliquote(await tutte(ctx, "/taxes", "taxes", perSede(ctx)));
    },

    async getOrder(ctx, externalId) {
      const corpo = await chiama<{ order?: unknown }>(ctx, { url: `/documents/orders/${encodeURIComponent(externalId)}` });
      return corpo?.order && typeof corpo.order === "object" ? ordine(corpo.order as Record<string, unknown>) : null;
    },

    async getOrders(ctx, { da, a }) {
      const out = [];
      for (const [x, y] of finestre(da, a)) {
        out.push(
          ...ordini(
            await tutte(ctx, "/documents/orders", "orders", {
              ...perSede(ctx),
              datetimeFrom: codificaData(x),
              datetimeTo: codificaData(y),
            }),
          ),
        );
      }
      return out;
    },

    async getPayments(ctx, { da, a }) {
      const out = [];
      for (const [x, y] of finestre(da, a)) {
        out.push(
          ...pagamentiDaScontrini(
            await tutte(ctx, "/documents/receipts", "receipts", {
              ...perSede(ctx),
              datetimeFrom: codificaData(x),
              datetimeTo: codificaData(y),
            }),
          ),
        );
      }
      return out;
    },

    /**
     * Crea l'ordine. Idempotente per costruzione: `externalId` = riferimento
     * di Foodtech, con vincolo di unicità presso la cassa. Se l'ordine esiste
     * già (un primo invio arrivato, e la risposta persa per strada), la cassa
     * risponde `ConflictValue`: si cerca l'ordine con quel riferimento fra
     * quelli di oggi e ieri, e si restituisce il suo id — mai un doppione.
     *
     * L'elenco degli ordini non ha un filtro per `externalId`: la ricerca
     * scorre gli ordini del tavolo nella finestra, al massimo `MASSIMO_PAGINE`.
     */
    async createOrder(ctx, o) {
      const idSalesPoint = sede(ctx);
      try {
        const corpo = await chiama(ctx, {
          metodo: "POST",
          url: "/documents/orders/batch",
          corpo: corpoOrdine(o, { idSalesPoint }),
        });
        return { accettato: true, externalId: idCreato(corpo, o.riferimento) };
      } catch (err) {
        if (!eConflittoDiRiferimento(err)) throw err;
        const adesso = new Date();
        const ieri = new Date(adesso.getTime() - 86_400_000);
        const trovati = ordini(
          await tutte(ctx, "/documents/orders", "orders", {
            ...perSede(ctx),
            datetimeFrom: codificaData(ieri),
            datetimeTo: codificaData(adesso),
            ...(o.tavoloExternalId ? { idTables: codificaLista([o.tavoloExternalId]) } : {}),
          }),
        );
        const esistente = trovati.find((x) => x.riferimento === o.riferimento);
        if (!esistente) {
          throw new ErroreIntegrazione("CONFLICT", "Riferimento già usato presso la cassa, ma l'ordine non si trova", (err as ErroreIntegrazione).dettaglio);
        }
        return { accettato: true, externalId: esistente.externalId };
      }
    },
  },
};
