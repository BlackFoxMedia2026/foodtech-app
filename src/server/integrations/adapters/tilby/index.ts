import { ErroreIntegrazione } from "../../errori";
import type {
  ContestoAdattatore,
  PosIntegrationAdapter,
  RisultatoSincronizzazione,
  WebhookRicevuto,
} from "../tipi";
import type { ClientFornitore, RichiestaFornitore } from "../http";
import { jsonConInteriSicuri } from "../http";
import { MASSIMO_PAGINE, PER_PAGINA, WEBHOOK_REGISTRATI, ambienteDa, emailWebhook, hostApi } from "./config";
import {
  aliquote,
  categorie,
  clienti,
  corpoVendita,
  documentiDi,
  elenco,
  leggiNotifica,
  metodiDiPagamento,
  pagamentiDi,
  pagamentoTilby,
  prodotti,
  saleETavoli,
  sessione,
  uuidDa,
  vendita,
  venditaConAggiunta,
  vendite,
  type TavoloTilby,
} from "./traduzione";

/**
 * **Tilby — il terzo adattatore POS.**
 *
 * Stesso contratto degli altri due, e la differenza con Cassa in Cloud sta
 * tutta qui dentro: Tilby documenta **una sola risorsa per ordini e conti**,
 * la vendita (`/sales`, l'endpoint `/orders` è deprecato dal 1° luglio 2024),
 * e la documenta in tutto il ciclo — crearla, aggiornarla, cancellarla,
 * pagarla. La guida ufficiale alla stampa automatica (PDF, 5 aprile 2024)
 * aggiunge i due pezzi che mancano allo schema:
 *
 * - `auto_print_order: true` + `sale_items[].exit` → la comanda si stampa nei
 *   centri di produzione;
 * - pagamenti (`paid: true`) che coprono il totale → lo scontrino si stampa da
 *   sé.
 *
 * Tutti e due **solo se** sul negozio c'è un dispositivo Tilby con la stampa
 * automatica attiva e sempre connesso. Nessuna di queste cose è mai stata
 * provata: né in sandbox (non abbiamo accesso al Developer Program) né su una
 * cassa. Da qui la voce `IN_DEVELOPMENT`.
 *
 * ## Autenticazione
 *
 * Un **token statico** per negozio, in `Authorization: Bearer`. Lo rilascia
 * Tilby dopo la certificazione dell'integrazione; il proprietario del negozio
 * lo consegna a chi integra. Nessuna scadenza e nessun rinnovo documentati;
 * nessuno scope (i permessi li decide la certificazione del Client ID).
 * Revocarlo si fa presso Tilby.
 */

export const VERSIONE = "0.1.0";

const ambiente = (ctx: ContestoAdattatore) => ambienteDa(ctx.installazione.configuration.ambiente);
const url = (ctx: ContestoAdattatore, percorso: string) => `${hostApi(ambiente(ctx))}${percorso}`;

function negozio(ctx: ContestoAdattatore): string {
  const id = (ctx.installazione.configuration.shopId as string | undefined) ?? ctx.installazione.externalLocationId;
  if (!id) throw new ErroreIntegrazione("INVALID_CONFIGURATION", "Nessun negozio Tilby confermato per questa installazione");
  return id;
}

/** Un 401 con un token statico non è «scaduto»: è revocato o sbagliato. */
function traduci(err: unknown): never {
  if (err instanceof ErroreIntegrazione && err.dettaglio.status === 401) {
    throw new ErroreIntegrazione("AUTH_INVALID", "Tilby non riconosce il token", err.dettaglio, err.correlationId);
  }
  throw err;
}

async function chiama<T = unknown>(ctx: ContestoAdattatore, r: RichiestaFornitore): Promise<T> {
  try {
    return await ctx.http.richiesta<T>({ ...r, url: url(ctx, r.url) });
  } catch (err) {
    return traduci(err);
  }
}

/** Tutte le pagine di un elenco (`pagination=true&per_page&page`, pagine da 0). */
async function tutte(ctx: ContestoAdattatore, percorso: string, filtri: Record<string, string> = {}) {
  const righe: unknown[] = [];
  for (let pagina = 0; pagina < MASSIMO_PAGINE; pagina++) {
    const q = new URLSearchParams({ pagination: "true", per_page: String(PER_PAGINA), page: String(pagina), ...filtri });
    const { righe: qui, pagine } = elenco(await chiama(ctx, { url: `${percorso}?${q.toString()}` }));
    righe.push(...qui);
    if (qui.length < PER_PAGINA || (pagine !== null && pagina + 1 >= pagine)) break;
  }
  return righe;
}

async function leggiSessione(http: ClientFornitore, token: string, host: string) {
  try {
    return sessione(await http.richiesta({ url: `${host}/sessions/me`, intestazioni: { Authorization: `Bearer ${token}` } }));
  } catch (err) {
    if (err instanceof ErroreIntegrazione && [401, 403].includes(err.dettaglio.status ?? 0)) {
      throw new ErroreIntegrazione("AUTH_INVALID", "Token Tilby rifiutato", err.dettaglio, err.correlationId);
    }
    throw err;
  }
}

/** Il tavolo Tilby con la sua sala, dalla pianta del negozio. */
async function tavoloTilby(ctx: ContestoAdattatore, tableId: string | null | undefined): Promise<TavoloTilby | null> {
  if (!tableId) return null;
  const { tavoli } = saleETavoli(await tutte(ctx, "/rooms"));
  const t = tavoli.find((x) => x.externalId === tableId);
  if (!t) throw new ErroreIntegrazione("INVALID_CONFIGURATION", `Il tavolo ${tableId} non esiste più su Tilby`);
  return { tableId: Number(t.externalId), tableName: t.etichetta, roomId: Number(t.salaExternalId), roomName: t.salaNome ?? "" };
}

async function leggiVendita(ctx: ContestoAdattatore, id: string): Promise<Record<string, unknown>> {
  const v = await chiama<Record<string, unknown>>(ctx, { url: `/sales/${encodeURIComponent(id)}` });
  if (!v || typeof v !== "object" || Array.isArray(v)) throw new ErroreIntegrazione("UNKNOWN", "Risposta inattesa da Tilby: vendita non leggibile");
  return v;
}

/** Cerca una vendita per un campo del suo schema (`uuid`, `external_id`): i filtri delle query string. */
async function cercaVendita(ctx: ContestoAdattatore, campo: "uuid" | "external_id", valore: string) {
  const righe = await tutte(ctx, "/sales", { [campo]: valore });
  return (righe[0] as Record<string, unknown> | undefined) ?? null;
}

export const tilby: PosIntegrationAdapter = {
  slug: "tilby",
  versione: VERSIONE,
  /* Nessun limite documentato: ogni sei ore, più i webhook che chiedono una
     sincronizzazione quando cambiano prodotti, categorie o sale. */
  minutiSyncProgrammata: 360,

  /* ------------------------------------------------------------------ */
  /*  Autenticazione — token statico del negozio                         */
  /* ------------------------------------------------------------------ */

  /**
   * Il token si verifica subito con `GET /sessions/me`, che dice anche **di
   * quale negozio** è: un token vale per uno solo.
   */
  async connetti({ campi, http }) {
    const token = campi.token?.trim();
    if (!token) throw new ErroreIntegrazione("VALIDATION", "Manca il token");
    await leggiSessione(http, token, hostApi(ambienteDa(campi.ambiente)));
    return { kind: "TOKEN", segreti: { accessToken: token }, scopes: [], accessTokenExpiresAt: null, refreshTokenExpiresAt: null };
  },

  /* ------------------------------------------------------------------ */
  /*  Prova e configurazione                                             */
  /* ------------------------------------------------------------------ */

  async provaConnessione(ctx) {
    const s = await leggiSessione(ctx.http, ctx.segreti.accessToken ?? "", hostApi(ambiente(ctx)));
    const scelto = (ctx.installazione.configuration.shopId as string | undefined) ?? null;
    if (scelto && scelto !== s.negozio.id) {
      throw new ErroreIntegrazione("INVALID_CONFIGURATION", `Il token è del negozio ${s.negozio.id}, non di ${scelto}`);
    }
    return {
      account: { externalId: s.negozio.id, nome: s.negozio.nome },
      sedi: [{ externalId: s.negozio.id, nome: s.negozio.nome, account: null }],
      avvisi: ambiente(ctx) === "sandbox" ? ["Collegata alla sandbox di Tilby: niente di ciò che succede qui arriva su una cassa vera."] : [],
    };
  },

  async opzioniConfigurazione(ctx) {
    const s = await leggiSessione(ctx.http, ctx.segreti.accessToken ?? "", hostApi(ambiente(ctx)));
    return { locations: [{ value: s.negozio.id, label: s.negozio.nome }] };
  },

  /**
   * I webhook, registrati da Foodtech con il token del negozio
   * (`POST /webhooks`). Uno per negozio per coppia entità/evento: se ne
   * esiste già uno **nostro** (una vecchia installazione), si toglie e si
   * rifà con l'indirizzo nuovo; uno di un altro integratore non si tocca.
   * Serve un'email a cui Tilby scrive quando un invio fallisce
   * (`TILBY_WEBHOOK_EMAIL`): senza, i webhook non si registrano e la
   * sincronizzazione programmata fa il lavoro da sola.
   */
  async attiva(ctx) {
    const email = emailWebhook();
    if (!email) return { metadata: { webhooks: [], avvisoWebhook: "TILBY_WEBHOOK_EMAIL non configurata: webhook non registrati" } };

    const indirizzo = `${ctx.origine}/api/integrations/webhooks/tilby/${ctx.installazione.webhookKey}`;
    const nostri = `/api/integrations/webhooks/tilby/`;
    const esistenti = elenco(await chiama(ctx, { url: "/webhooks" })).righe;
    const registrati: { id: string; entity_type: string; event_type: string }[] = [];
    const saltati: string[] = [];

    for (const w of WEBHOOK_REGISTRATI) {
      const gia = esistenti.find((e) => e.entity_type === w.entity_type && e.event_type === w.event_type && !e.deleted_at);
      if (gia) {
        const suo = String(gia.url ?? "");
        if (suo === indirizzo) {
          registrati.push({ id: String(gia.id), ...w });
          continue;
        }
        if (!suo.includes(nostri)) {
          saltati.push(`${w.entity_type}/${w.event_type}`);
          continue;
        }
        await chiama(ctx, { metodo: "DELETE", url: "/webhooks", corpo: { id: Number(gia.id) } });
      }
      const r = await chiama<{ result?: { id?: unknown } }>(ctx, { metodo: "POST", url: "/webhooks", corpo: { ...w, url: indirizzo, email } });
      registrati.push({ id: String(r?.result?.id ?? ""), ...w });
    }
    return { metadata: { webhooks: registrati, webhookGiaDiAltri: saltati } };
  },

  /** Alla disinstallazione si tolgono i webhook registrati da Foodtech. */
  async disconnetti(ctx) {
    const w = Array.isArray(ctx.installazione.metadata?.webhooks) ? (ctx.installazione.metadata!.webhooks as { id: string }[]) : [];
    for (const { id } of w) {
      if (id) await chiama(ctx, { metodo: "DELETE", url: "/webhooks", corpo: { id: Number(id) } });
    }
  },

  /* ------------------------------------------------------------------ */
  /*  Sincronizzazione (solo lettura: scrive mappature, mai la cassa)    */
  /* ------------------------------------------------------------------ */

  async sincronizza(ctx, operazione): Promise<RisultatoSincronizzazione> {
    negozio(ctx);
    const accese = new Set(ctx.installazione.enabledCapabilities);
    const vuole = (cap: string, op: string) => accese.has(cap) && (operazione === "full" || operazione === op);
    const out: RisultatoSincronizzazione = { entita: [], scartati: [] };

    if (vuole("tables", "tables")) {
      const { sale, tavoli } = saleETavoli(await tutte(ctx, "/rooms"));
      for (const s of sale) out.entita.push({ tipo: "FLOOR", externalId: s.externalId, etichetta: s.nome });
      for (const t of tavoli) {
        out.entita.push({ tipo: "TABLE", externalId: t.externalId, etichetta: t.etichetta, metadata: { sala: t.salaExternalId, salaNome: t.salaNome, posti: t.posti } });
      }
    }
    if (vuole("menu", "menu")) {
      for (const c of categorie(await tutte(ctx, "/categories"))) out.entita.push({ tipo: "CATEGORY", externalId: c.externalId, etichetta: c.nome });
      const listini = new Set<number>();
      for (const p of prodotti(await tutte(ctx, "/items"))) {
        p.listini.forEach((l) => listini.add(l.listino));
        out.entita.push({
          tipo: "PRODUCT",
          externalId: p.externalId,
          etichetta: p.nome,
          metadata: {
            nome: p.nome,
            prezzoCents: p.prezzoCents,
            aliquota: p.aliquotaPercentuale,
            repartoId: p.repartoId,
            repartoNome: p.repartoNome,
            categoria: p.categoriaExternalId,
            listini: p.listini,
            inVendita: p.inVendita,
            varianti: p.varianti,
            sku: p.codice,
          },
        });
      }
      /* I listini di Tilby non hanno un nome né un endpoint: sono i campi
         `price1`…`price10` dei prodotti. Si elencano quelli usati. */
      for (const n of [...listini].sort((a, b) => a - b)) {
        out.entita.push({ tipo: "PRICE_LIST", externalId: `price${n}`, etichetta: `Listino ${n}` });
      }
    }
    if (vuole("tax_rates", "tax_rates")) {
      for (const a of aliquote(await tutte(ctx, "/vat"))) out.entita.push({ tipo: "TAX_RATE", externalId: a.externalId, etichetta: a.descrizione, metadata: { percentuale: a.percentuale } });
    }
    if (vuole("payment_methods", "payment_methods")) {
      for (const m of metodiDiPagamento(await tutte(ctx, "/payment_methods"))) {
        out.entita.push({ tipo: "PAYMENT_METHOD", externalId: m.externalId, etichetta: m.nome, metadata: { tipoId: m.tipoId } });
      }
    }
    if (vuole("customers", "full")) {
      for (const c of clienti(await tutte(ctx, "/customers"))) {
        out.entita.push({ tipo: "CUSTOMER", externalId: c.externalId, etichetta: [c.nome, c.cognome].filter(Boolean).join(" ") || c.email || c.externalId });
      }
    }
    return out;
  },

  /* ------------------------------------------------------------------ */
  /*  Webhook                                                            */
  /* ------------------------------------------------------------------ */

  /**
   * **La documentazione non prevede una firma** sulle notifiche: niente
   * segreto condiviso, niente HMAC. L'unica prova che la chiamata arrivi a
   * nome di questa installazione è l'indirizzo, che contiene una chiave
   * casuale diversa per ogni installazione e che cambia alla
   * reinstallazione (la rotta risponde 404 a una chiave sconosciuta).
   *
   * Qui si controlla che il corpo sia una notifica Tilby ben formata. Il
   * confronto fra `environment_id` e il negozio collegato è DA VERIFICARE:
   * la documentazione lo chiama «id_of_the_shop», ma l'esempio mostra un
   * nome di database (`s3_e2e_restaurant`), non l'`id` della sessione.
   * Controllarlo alla cieca vorrebbe dire scartare tutti gli eventi veri.
   */
  verificaWebhook(_ctx, w: WebhookRicevuto) {
    try {
      const c = jsonConInteriSicuri(w.corpo) as Record<string, unknown>;
      return typeof c?.type === "string" && typeof c?.entity_name === "string";
    } catch {
      return false;
    }
  },

  riceviWebhook(_ctx, w) {
    let corpo: unknown;
    try {
      corpo = jsonConInteriSicuri(w.corpo);
    } catch {
      throw new ErroreIntegrazione("VALIDATION", "Il corpo della notifica non è JSON");
    }
    const n = leggiNotifica(corpo);
    return { idEvento: n.idEvento, tipo: n.tipo, evento: n.evento, sedeExternalId: null };
  },

  /* ------------------------------------------------------------------ */
  /*  Operazioni di cassa                                                */
  /* ------------------------------------------------------------------ */

  pos: {
    async getLocations(ctx) {
      const s = await leggiSessione(ctx.http, ctx.segreti.accessToken ?? "", hostApi(ambiente(ctx)));
      return [{ externalId: s.negozio.id, nome: s.negozio.nome, account: null }];
    },
    async getFloors(ctx) {
      return saleETavoli(await tutte(ctx, "/rooms")).sale;
    },
    async getTables(ctx) {
      return saleETavoli(await tutte(ctx, "/rooms")).tavoli;
    },
    async getMenu(ctx) {
      const [c, p] = [categorie(await tutte(ctx, "/categories")), prodotti(await tutte(ctx, "/items"))];
      return [{ externalId: `shop-${negozio(ctx)}`, nome: "Catalogo Tilby", categorie: c, prodotti: p }];
    },
    async getProducts(ctx) {
      return prodotti(await tutte(ctx, "/items"));
    },
    async getCategories(ctx) {
      return categorie(await tutte(ctx, "/categories"));
    },
    async getTaxRates(ctx) {
      return aliquote(await tutte(ctx, "/vat"));
    },
    async getPaymentMethods(ctx) {
      return metodiDiPagamento(await tutte(ctx, "/payment_methods"));
    },
    async syncCustomers(ctx) {
      return clienti(await tutte(ctx, "/customers"));
    },

    async getOrder(ctx, externalId) {
      return vendita(await leggiVendita(ctx, externalId));
    },
    async getOrders(ctx, { da, a }) {
      return vendite(await tutte(ctx, "/sales", { open_at_since: da.toISOString(), open_at_max: a.toISOString() }));
    },
    async getPayments(ctx, { da, a }) {
      const righe = await tutte(ctx, "/sales", { status: "closed", closed_at_since: da.toISOString(), closed_at_max: a.toISOString() });
      return righe.flatMap((v) => pagamentiDi(v as Record<string, unknown>));
    },
    async getReceipt(ctx, externalId) {
      return documentiDi(await leggiVendita(ctx, externalId));
    },

    /**
     * Crea la vendita aperta con la prima comanda (`POST /sales`, «Caso 1»).
     *
     * Idempotente: `uuid` derivato dal riferimento. Se la creazione fallisce
     * perché la vendita esiste già (un primo invio arrivato, e la risposta
     * persa), la si ritrova per `uuid` e si restituisce quella. Se non c'è,
     * l'errore resta: mai un secondo tentativo alla cieca.
     */
    async createOrder(ctx, o) {
      negozio(ctx);
      const corpo = corpoVendita(o, { tavolo: await tavoloTilby(ctx, o.tavoloExternalId) });
      try {
        const r = await chiama<Record<string, unknown>>(ctx, { metodo: "POST", url: "/sales", corpo });
        return { accettato: true, externalId: r?.id !== undefined && r?.id !== null ? String(r.id) : null };
      } catch (err) {
        if (!(err instanceof ErroreIntegrazione) || !["VALIDATION", "CONFLICT"].includes(err.codice)) throw err;
        const esistente = await cercaVendita(ctx, "uuid", String(corpo.uuid));
        if (!esistente) throw err;
        return { accettato: true, externalId: String(esistente.id) };
      }
    },

    /**
     * Le aggiunte allo stesso conto («Caso 3 — tavolo aperto con riordino
     * continuo»): si legge la vendita, si accodano le righe nuove con
     * l'uscita successiva, si manda `PUT /sales/{id}`. Le righe già presenti
     * (stesso `uuid`) non si rimandano.
     */
    async updateOrder(ctx, externalId, o) {
      const { corpo } = venditaConAggiunta(await leggiVendita(ctx, externalId), o);
      if (!corpo) return;
      await chiama(ctx, { metodo: "PUT", url: `/sales/${encodeURIComponent(externalId)}`, corpo });
    },

    /**
     * `DELETE /sales/{id}`. Documentato; cosa succede a una comanda già
     * stampata in cucina non lo è. DA VERIFICARE SU POS REALE.
     */
    async cancelOrder(ctx, externalId) {
      await chiama(ctx, { metodo: "DELETE", url: `/sales/${encodeURIComponent(externalId)}` });
    },

    /**
     * Aggiunge un pagamento alla vendita (`PUT /sales/{id}` con
     * `payments[]`). Dalla guida: se i pagamenti coprono il totale, la
     * vendita si chiude e lo scontrino si stampa da sé — sul dispositivo
     * Tilby con la stampa automatica attiva; se non lo coprono, resta aperta
     * e l'operatore riceve una notifica. **Nessuna schermata di Foodtech lo
     * chiama**: il documento fiscale non si tocca prima di una prova su una
     * cassa vera.
     */
    async createPayment(ctx, p) {
      if (!p.metodo) throw new ErroreIntegrazione("INVALID_CONFIGURATION", "Manca il metodo di pagamento Tilby");
      const v = await leggiVendita(ctx, p.riferimentoOrdine);
      if (v.status !== "open") throw new ErroreIntegrazione("CONFLICT", "Il conto su Tilby non è aperto");
      const esistenti = Array.isArray(v.payments) ? v.payments : [];
      const nuovo = pagamentoTilby({ importoCents: p.importoCents, metodo: p.metodo });
      await chiama(ctx, {
        metodo: "PUT",
        url: `/sales/${encodeURIComponent(p.riferimentoOrdine)}`,
        corpo: { ...v, payments: [...esistenti, nuovo] },
      });
    },
  },
};

/** Per le prove e per chi deve ritrovare una vendita dal riferimento Foodtech. */
export const uuidVenditaDi = (riferimento: string) => uuidDa(riferimento);
