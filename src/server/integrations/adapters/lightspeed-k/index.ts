import { createHash, timingSafeEqual, randomBytes } from "node:crypto";
import { ErroreIntegrazione } from "../../errori";
import type {
  ContestoAdattatore,
  CredenzialiNuove,
  PosIntegrationAdapter,
  RisultatoSincronizzazione,
  WebhookRicevuto,
} from "../tipi";
import { jsonConInteriSicuri, type ClientFornitore } from "../http";
import {
  HOST,
  LUNGHEZZA_ENDPOINT,
  SCOPE,
  ambienteConfigurato,
  ambienteDa,
  clientOAuth,
  type AmbienteLightspeed,
} from "./config";
import {
  aliquote,
  corpoOrdineLocale,
  idDeiMenu,
  leggiNotifica,
  leggiToken,
  menuDaLightspeed,
  metodiDiPagamento,
  saleETavoli,
  sediDaBusinesses,
} from "./traduzione";

/**
 * **Lightspeed Restaurant K-Series — il primo adattatore POS.**
 *
 * ## Quale Lightspeed
 *
 * Lightspeed ha più prodotti con API diverse: Retail (X-Series), eCom, e per
 * la ristorazione la **K-Series** (l'ex iKentoo), che è la linea venduta ai
 * ristoranti in Europa e in Italia. È quella giusta per Foodtech, e questo
 * file parla solo con lei. Le API della vecchia linea L-Series/U-Series non
 * c'entrano.
 *
 * ## Cosa è verificato e cosa no
 *
 * Ogni indirizzo, parametro e campo viene dalla documentazione pubblica
 * ufficiale (api-portal.lsk.lightspeed.app e api-docs.lsk.lightspeed.app,
 * letta il 23 settembre 2026). **Nessuna chiamata è mai partita verso
 * Lightspeed**: serve un client OAuth che Lightspeed rilascia ai partner, e
 * Foodtech non lo ha ancora. Per questo la voce del catalogo resta
 * `IN_DEVELOPMENT`, e le letture difensive in `traduzione.ts` hanno scritto
 * accanto cosa controllare alla prima prova.
 *
 * ## Cosa **non** fa, di proposito
 *
 * - **Leggere ordini e pagamenti dalla cassa.** L'API li offre (Financial
 *   API), ma non ne abbiamo letto i formati: dichiararlo sarebbe una capacità
 *   finta. Mancano `orders.read` e `payments.read`.
 * - **Registrare un pagamento o chiudere il conto** («Apply a Payment»):
 *   esiste, ma senza aver letto il formato non si scrive denaro nella cassa
 *   di un ristorante.
 * - **Revocare il token alla disconnessione.** Il server di autorizzazione è
 *   Keycloak, che ha un indirizzo di revoca standard, ma la documentazione di
 *   Lightspeed non lo cita: non si chiama un indirizzo non documentato. Alla
 *   disconnessione i token si cancellano da Foodtech; quello di accesso
 *   muore da solo in 25 minuti, e il ristoratore può revocare l'accesso anche
 *   dal pannello Lightspeed.
 */

export const VERSIONE = "0.1.0";

type SegretiLightspeed = {
  accessToken?: string;
  refreshToken?: string;
  ambiente?: string;
  webhookUsername?: string;
  webhookPassword?: string;
};

function segretiDi(ctx: ContestoAdattatore): SegretiLightspeed {
  return ctx.segreti as SegretiLightspeed;
}

function ambienteDelContesto(ctx: ContestoAdattatore): AmbienteLightspeed {
  return ambienteDa(segretiDi(ctx).ambiente);
}

function api(ctx: ContestoAdattatore): string {
  return HOST[ambienteDelContesto(ctx)].api;
}

function sede(ctx: ContestoAdattatore): string {
  const id =
    (ctx.installazione.configuration.businessLocationId as string | undefined) ??
    ctx.installazione.externalLocationId ??
    null;
  if (!id || !/^\d+$/.test(id)) {
    throw new ErroreIntegrazione("INVALID_CONFIGURATION", "Nessuna sede Lightspeed scelta per questa installazione");
  }
  return id;
}

function clientObbligatorio() {
  const c = clientOAuth();
  if (!c) {
    throw new ErroreIntegrazione(
      "PLATFORM_NOT_CONFIGURED",
      "Mancano LIGHTSPEED_K_CLIENT_ID e LIGHTSPEED_K_CLIENT_SECRET",
    );
  }
  return c;
}

/** L'identificativo del webhook presso Lightspeed: al massimo 50 caratteri. */
export function endpointIdDi(webhookKey: string): string {
  return `foodtech-${webhookKey}`.slice(0, LUNGHEZZA_ENDPOINT);
}

async function scambiaToken(
  http: ClientFornitore,
  ambiente: AmbienteLightspeed,
  parametri: Record<string, string>,
): Promise<CredenzialiNuove> {
  const client = clientObbligatorio();
  const risposta = await http.richiesta({
    metodo: "POST",
    url: `${HOST[ambiente].auth}/token`,
    corpo: new URLSearchParams({ ...parametri, client_id: client.id, client_secret: client.segreto }),
  });
  const token = leggiToken(risposta);
  if (!token) {
    throw new ErroreIntegrazione("AUTH_INVALID", "Il server di autorizzazione non ha restituito un token");
  }
  return {
    kind: "OAUTH2",
    segreti: {
      accessToken: token.accessToken,
      ...(token.refreshToken ? { refreshToken: token.refreshToken } : {}),
      ambiente,
    },
    scopes: token.scopes,
    accessTokenExpiresAt: token.accessTokenExpiresAt,
    refreshTokenExpiresAt: token.refreshTokenExpiresAt,
  };
}

function confrontaCostante(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

export const lightspeedK: PosIntegrationAdapter = {
  slug: "lightspeed-k",
  versione: VERSIONE,
  minutiSyncProgrammata: 360,

  /* ------------------------------------------------------------------ */
  /*  Autenticazione — OAuth 2, authorization code                       */
  /* ------------------------------------------------------------------ */

  iniziaAutorizzazione({ state, redirectUri }) {
    const client = clientObbligatorio();
    const u = new URL(`${HOST[ambienteConfigurato()].auth}/auth`);
    u.searchParams.set("response_type", "code");
    u.searchParams.set("client_id", client.id);
    u.searchParams.set("scope", SCOPE.join(" "));
    u.searchParams.set("redirect_uri", redirectUri);
    u.searchParams.set("state", state);
    return { url: u.toString() };
  },

  completaAutorizzazione({ code, redirectUri, http }) {
    return scambiaToken(http, ambienteConfigurato(), {
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
    });
  },

  /**
   * Ogni token di rinnovo vale **una volta**: la risposta porta il nuovo, e
   * il vecchio è già morto. Il lucchetto contro i rinnovi paralleli sta nella
   * piattaforma (`credenziali.ts`), non qui.
   */
  async rinnovaAutenticazione(ctx) {
    const s = segretiDi(ctx);
    if (!s.refreshToken) {
      throw new ErroreIntegrazione("AUTH_EXPIRED", "Nessun token di rinnovo salvato");
    }
    const nuove = await scambiaToken(ctx.http, ambienteDelContesto(ctx), {
      grant_type: "refresh_token",
      refresh_token: s.refreshToken,
    });
    // I segreti del webhook non vengono dal server di autorizzazione: si
    // portano avanti, altrimenti un rinnovo spegnerebbe le notifiche.
    return {
      ...nuove,
      segreti: {
        ...nuove.segreti,
        ...(s.webhookUsername ? { webhookUsername: s.webhookUsername } : {}),
        ...(s.webhookPassword ? { webhookPassword: s.webhookPassword } : {}),
      },
    };
  },

  /* ------------------------------------------------------------------ */
  /*  Prova e configurazione                                             */
  /* ------------------------------------------------------------------ */

  async provaConnessione(ctx) {
    const sedi = sediDaBusinesses(await ctx.http.richiesta({ url: `${api(ctx)}/o/op/data/businesses` }));
    const avvisi: string[] = [];
    if (sedi.length === 0) avvisi.push("L'account non ha nessuna sede visibile con questi permessi.");

    const scelta = (ctx.installazione.configuration.businessLocationId as string | undefined) ?? null;
    if (scelta && !sedi.some((s) => s.externalId === scelta)) {
      throw new ErroreIntegrazione(
        "INVALID_CONFIGURATION",
        `La sede ${scelta} non è fra quelle dell'account`,
      );
    }
    const account = sedi.find((s) => s.externalId === scelta)?.account ?? sedi[0]?.account ?? null;
    return { account, sedi, avvisi };
  },

  async opzioniConfigurazione(ctx) {
    const sedi = sediDaBusinesses(await ctx.http.richiesta({ url: `${api(ctx)}/o/op/data/businesses` }));
    return {
      locations: sedi.map((s) => ({
        value: s.externalId,
        label: s.account ? `${s.nome} · ${s.account.nome}` : s.nome,
      })),
    };
  },

  /**
   * All'attivazione, se il ristoratore ha acceso «Invio ordini», si registra
   * presso Lightspeed l'indirizzo a cui mandare l'esito degli ordini
   * (`PUT /o/wh/1/webhook`). La documentazione non prevede firme: prevede
   * l'autenticazione HTTP Basic, con utente e password che scegliamo noi.
   * Si generano qui, casuali, **una coppia per installazione**.
   */
  async attiva(ctx) {
    if (!ctx.installazione.enabledCapabilities.includes("orders.write")) return {};
    const s = segretiDi(ctx);
    const webhookUsername = s.webhookUsername ?? `ft_${randomBytes(6).toString("hex")}`;
    const webhookPassword = s.webhookPassword ?? randomBytes(24).toString("base64url");
    const endpointId = endpointIdDi(ctx.installazione.webhookKey);

    await ctx.http.richiesta({
      metodo: "PUT",
      url: `${api(ctx)}/o/wh/1/webhook`,
      corpo: {
        endpointId,
        url: `${ctx.origine}/api/integrations/webhooks/lightspeed-k/${ctx.installazione.webhookKey}`,
        withBasicAuth: true,
        username: webhookUsername,
        password: webhookPassword,
      },
    });
    return { segretiAggiunti: { webhookUsername, webhookPassword }, metadata: { endpointId } };
  },

  /* ------------------------------------------------------------------ */
  /*  Sincronizzazione                                                   */
  /* ------------------------------------------------------------------ */

  async sincronizza(ctx, operazione): Promise<RisultatoSincronizzazione> {
    const accese = new Set(ctx.installazione.enabledCapabilities);
    const vuole = (cap: string, op: string) => accese.has(cap) && (operazione === "full" || operazione === op);
    const out: RisultatoSincronizzazione = { entita: [], scartati: [] };

    if (vuole("tables", "tables")) {
      const { sale, tavoli } = saleETavoli(
        await ctx.http.richiesta({ url: `${api(ctx)}/o/op/data/${sede(ctx)}/floorplans?expandTables=true` }),
      );
      for (const s of sale) out.entita.push({ tipo: "FLOOR", externalId: s.externalId, etichetta: s.nome });
      for (const t of tavoli) {
        out.entita.push({
          tipo: "TABLE",
          externalId: t.externalId,
          etichetta: t.etichetta,
          metadata: { sala: t.salaExternalId, posti: t.posti, attivo: t.attivo },
        });
      }
    }

    if (vuole("menu", "menu")) {
      const blId = sede(ctx);
      const menu = idDeiMenu(
        await ctx.http.richiesta({ url: `${api(ctx)}/o/op/1/menu/list?businessLocationId=${blId}` }),
      );
      for (const m of menu) {
        const dettaglio = menuDaLightspeed(
          m.id,
          await ctx.http.richiesta({ url: `${api(ctx)}/o/op/1/menu/load/${m.id}?businessLocationId=${blId}` }),
        );
        out.entita.push({ tipo: "MENU", externalId: dettaglio.externalId, etichetta: dettaglio.nome });
        for (const c of dettaglio.categorie) {
          out.entita.push({ tipo: "CATEGORY", externalId: c.externalId, etichetta: c.nome, metadata: { padre: c.padreExternalId } });
        }
        for (const p of dettaglio.prodotti) {
          out.entita.push({
            tipo: "PRODUCT",
            externalId: p.externalId,
            etichetta: p.nome,
            metadata: {
              menu: m.id,
              prezzoCents: p.prezzoCents,
              categoria: p.categoriaExternalId,
              aliquota: p.aliquotaPercentuale,
              ivaInclusa: p.ivaInclusa,
            },
          });
        }
      }
    }

    if (vuole("tax_rates", "tax_rates")) {
      for (const a of aliquote(await ctx.http.richiesta({ url: `${api(ctx)}/f/finance/${sede(ctx)}/tax-rates` }))) {
        out.entita.push({
          tipo: "TAX_RATE",
          externalId: a.externalId,
          etichetta: a.descrizione,
          metadata: { percentuale: a.percentuale, inclusa: a.inclusa, rateOriginale: a.rateOriginale },
        });
      }
    }

    if (vuole("payment_methods", "payment_methods")) {
      for (const p of metodiDiPagamento(
        await ctx.http.richiesta({ url: `${api(ctx)}/f/finance/${sede(ctx)}/paymentMethods` }),
      )) {
        out.entita.push({ tipo: "PAYMENT_METHOD", externalId: p.externalId, etichetta: p.nome, metadata: { codice: p.codice } });
      }
    }

    return out;
  },

  /* ------------------------------------------------------------------ */
  /*  Webhook «Order and Pay»                                            */
  /* ------------------------------------------------------------------ */

  verificaWebhook(ctx, w: WebhookRicevuto) {
    const s = segretiDi(ctx);
    if (!s.webhookUsername || !s.webhookPassword) return false;
    const intestazione = w.intestazioni.get("authorization") ?? "";
    const m = /^Basic\s+(.+)$/i.exec(intestazione);
    if (!m) return false;
    let decodificato = "";
    try {
      decodificato = Buffer.from(m[1]!, "base64").toString("utf8");
    } catch {
      return false;
    }
    return confrontaCostante(decodificato, `${s.webhookUsername}:${s.webhookPassword}`);
  },

  riceviWebhook(_ctx, w) {
    let corpo: unknown;
    try {
      corpo = jsonConInteriSicuri(w.corpo);
    } catch {
      throw new ErroreIntegrazione("VALIDATION", "Il corpo della notifica non è JSON");
    }
    const n = leggiNotifica(corpo);
    return {
      idEvento: createHash("sha256").update(n.chiave.join("|")).digest("hex").slice(0, 40),
      tipo: n.tipo,
      evento: n.evento,
      sedeExternalId: n.sede,
    };
  },

  /* ------------------------------------------------------------------ */
  /*  Operazioni di cassa                                                */
  /* ------------------------------------------------------------------ */

  pos: {
    async getLocations(ctx) {
      return sediDaBusinesses(await ctx.http.richiesta({ url: `${api(ctx)}/o/op/data/businesses` }));
    },

    async getFloors(ctx) {
      return saleETavoli(
        await ctx.http.richiesta({ url: `${api(ctx)}/o/op/data/${sede(ctx)}/floorplans?expandTables=false` }),
      ).sale;
    },

    async getTables(ctx) {
      return saleETavoli(
        await ctx.http.richiesta({ url: `${api(ctx)}/o/op/data/${sede(ctx)}/floorplans?expandTables=true` }),
      ).tavoli;
    },

    async getMenu(ctx) {
      const blId = sede(ctx);
      const menu = idDeiMenu(
        await ctx.http.richiesta({ url: `${api(ctx)}/o/op/1/menu/list?businessLocationId=${blId}` }),
      );
      const out = [];
      for (const m of menu) {
        out.push(
          menuDaLightspeed(
            m.id,
            await ctx.http.richiesta({ url: `${api(ctx)}/o/op/1/menu/load/${m.id}?businessLocationId=${blId}` }),
          ),
        );
      }
      return out;
    },

    async getProducts(ctx) {
      return (await lightspeedK.pos.getMenu!(ctx)).flatMap((m) => m.prodotti);
    },

    async getCategories(ctx) {
      return (await lightspeedK.pos.getMenu!(ctx)).flatMap((m) => m.categorie);
    },

    async getTaxRates(ctx) {
      return aliquote(await ctx.http.richiesta({ url: `${api(ctx)}/f/finance/${sede(ctx)}/tax-rates` }));
    },

    async getPaymentMethods(ctx) {
      return metodiDiPagamento(
        await ctx.http.richiesta({ url: `${api(ctx)}/f/finance/${sede(ctx)}/paymentMethods` }),
      );
    },

    /**
     * «Create Local Order» è **asincrono**: `{ status: "ok" }` vuol dire
     * «ricevuto», non «in cassa». L'esito vero arriva con la notifica
     * all'`endpointId`, e per questo senza webhook registrato non si manda
     * niente — un ordine di cui non sapremo mai se è arrivato è peggio di un
     * ordine non mandato.
     */
    async createOrder(ctx, ordine) {
      const s = segretiDi(ctx);
      if (!s.webhookUsername) {
        throw new ErroreIntegrazione(
          "INVALID_CONFIGURATION",
          "Webhook non registrato: attiva l'integrazione con «Invio ordini» acceso",
        );
      }
      await ctx.http.richiesta({
        metodo: "POST",
        url: `${api(ctx)}/o/op/1/order/local`,
        corpo: corpoOrdineLocale(ordine, {
          businessLocationId: sede(ctx),
          endpointId: endpointIdDi(ctx.installazione.webhookKey),
        }),
      });
      return { accettato: true, externalId: null };
    },
  },
};
