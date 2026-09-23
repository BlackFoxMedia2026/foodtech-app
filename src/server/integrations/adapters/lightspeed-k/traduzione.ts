import type {
  AliquotaEsterna,
  CategoriaEsterna,
  EventoNormalizzato,
  MenuEsterno,
  MetodoPagamentoEsterno,
  OrdineDaInviare,
  ProdottoEsterno,
  SalaEsterna,
  SedeEsterna,
  StatoOrdineEsterno,
  TavoloEsterno,
} from "../../dominio";
import { LUNGHEZZA_RIFERIMENTO } from "./config";

/**
 * **Da Lightspeed a Foodtech, e ritorno. Funzioni pure.**
 *
 * Qui dentro e solo qui dentro si leggono i nomi dei campi di Lightspeed
 * (`businessLocations`, `defaultClientCount`, `productPrice`, …). Fuori da
 * questo file esiste solo il modello di `dominio.ts`.
 *
 * I formati sono quelli della documentazione ufficiale
 * (api-docs.lsk.lightspeed.app, settembre 2026). **Non sono stati confrontati
 * con risposte vere**: dove la documentazione lascia un dubbio, la lettura è
 * difensiva e il dubbio è scritto accanto. Ogni dubbio è una cosa da
 * controllare alla prima prova con un account di prova.
 */

type Json = Record<string, unknown>;

const testo = (v: unknown): string | null =>
  v === null || v === undefined || v === "" ? null : String(v);

const numero = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
};

/** Euro con decimali → centesimi interi. Arrotondato una volta, qui. */
export function centesimi(v: unknown): number | null {
  const n = numero(v);
  return n === null ? null : Math.round(n * 100);
}

const lista = (v: unknown): Json[] => (Array.isArray(v) ? (v.filter((x) => x && typeof x === "object") as Json[]) : []);

/* -------------------------------------------------------------------------- */
/*  Sedi                                                                      */
/* -------------------------------------------------------------------------- */

/** `GET /o/op/data/businesses` → `[{ id, name, businessLocations: [{ id, name }] }]` */
export function sediDaBusinesses(corpo: unknown): SedeEsterna[] {
  const sedi: SedeEsterna[] = [];
  for (const b of lista(corpo)) {
    const account = testo(b.id) ? { externalId: String(b.id), nome: testo(b.name) ?? "Account Lightspeed" } : null;
    for (const l of lista(b.businessLocations)) {
      const id = testo(l.id);
      if (!id) continue;
      sedi.push({ externalId: id, nome: testo(l.name) ?? `Sede ${id}`, account });
    }
  }
  return sedi;
}

/* -------------------------------------------------------------------------- */
/*  Sale e tavoli                                                             */
/* -------------------------------------------------------------------------- */

/**
 * `GET /o/op/data/{businessLocationId}/floorplans?expandTables=true`
 * → `[{ id, name, tables: [{ id, number, reference, active, description, defaultClientCount }] }]`
 *
 * L'etichetta del tavolo è `reference` se c'è, altrimenti `number`: è ciò che
 * la sala legge sul segnaposto. Dubbio da verificare: se `reference` sia
 * sempre valorizzato o solo quando il locale lo scrive.
 */
export function saleETavoli(corpo: unknown): { sale: SalaEsterna[]; tavoli: TavoloEsterno[] } {
  const sale: SalaEsterna[] = [];
  const tavoli: TavoloEsterno[] = [];
  for (const f of lista(corpo)) {
    const salaId = testo(f.id);
    if (salaId) sale.push({ externalId: salaId, nome: testo(f.name) ?? `Sala ${salaId}` });
    for (const t of lista(f.tables)) {
      const id = testo(t.id);
      if (!id) continue;
      tavoli.push({
        externalId: id,
        etichetta: testo(t.reference) ?? testo(t.number) ?? id,
        salaExternalId: salaId,
        posti: numero(t.defaultClientCount),
        attivo: t.active !== false,
      });
    }
  }
  return { sale, tavoli };
}

/* -------------------------------------------------------------------------- */
/*  Menu                                                                      */
/* -------------------------------------------------------------------------- */

/** `GET /o/op/1/menu/list?businessLocationId=` → `[{ menuName, ikentooMenuId }]` */
export function idDeiMenu(corpo: unknown): { id: string; nome: string }[] {
  return lista(corpo)
    .map((m) => ({ id: testo(m.ikentooMenuId), nome: testo(m.menuName) ?? "Menu" }))
    .filter((m): m is { id: string; nome: string } => !!m.id);
}

/**
 * `GET /o/op/1/menu/load/{menuId}?businessLocationId=`
 *
 * La documentazione descrive `menuEntryGroups` (le «schermate» della cassa)
 * che contengono voci di tre tipi, riconosciuti da `@type`:
 *
 * - `menuItem` — un prodotto: `productName`, `productPrice`, `sku`,
 *   `defaultTaxPercentage`, `taxIncludedInPrice`, `productionInstructionList`;
 * - `menuDeal` — un menu composto (qui: letto come prodotto, senza le scelte);
 * - `group` — una sotto-schermata, con altre voci dentro (`menuEntry`).
 *
 * Le schermate e le sotto-schermate diventano **categorie**. Dubbio da
 * verificare: la documentazione non dice se i gruppi abbiano un
 * identificativo proprio, quindi l'`externalId` di una categoria è costruito
 * dal menu e dalla posizione (`<menu>/2/0`). Stabile finché nessuno riordina
 * le schermate in cassa; se le riordina, la sincronizzazione successiva vede
 * categorie «nuove» e quelle vecchie restano non viste — nessun abbinamento
 * sbagliato, solo da rifare.
 *
 * Il prodotto si identifica con lo `sku`, che è anche il codice con cui un
 * ordine lo chiede alla cassa (`items[].sku` di «Create Local Order»).
 */
export function menuDaLightspeed(menuId: string, corpo: unknown): MenuEsterno {
  const m = (corpo && typeof corpo === "object" ? corpo : {}) as Json;
  const categorie: CategoriaEsterna[] = [];
  const prodotti: ProdottoEsterno[] = [];
  const visti = new Set<string>();

  function visita(voci: Json[], percorso: string, padre: string | null) {
    voci.forEach((v, i) => {
      const tipo = testo(v["@type"]);
      if (tipo === "group" || (Array.isArray(v.menuEntry) && tipo !== "menuItem")) {
        const id = `${menuId}/${percorso}${i}`;
        categorie.push({
          externalId: id,
          nome: testo(v.name) ?? testo(v.groupName) ?? testo(v.displayName) ?? "Gruppo",
          padreExternalId: padre,
        });
        visita(lista(v.menuEntry), `${percorso}${i}/`, id);
        return;
      }
      if (tipo === "menuItem" || tipo === "menuDeal" || v.sku !== undefined) {
        const sku = testo(v.sku);
        if (!sku || visti.has(sku)) return;
        visti.add(sku);
        prodotti.push({
          externalId: sku,
          codice: sku,
          nome: testo(v.productName) ?? testo(v.name) ?? sku,
          prezzoCents: centesimi(v.productPrice),
          categoriaExternalId: padre,
          aliquotaPercentuale: numero(v.defaultTaxPercentage),
          ivaInclusa: typeof v.taxIncludedInPrice === "boolean" ? v.taxIncludedInPrice : null,
          modificatori: lista(v.productionInstructionList).map((p, j) => ({
            externalId: testo(p.id) ?? `${sku}#${j}`,
            nome: testo(p.name) ?? testo(p.description) ?? "Variante",
            prezzoCents: null,
          })),
        });
      }
    });
  }

  lista(m.menuEntryGroups).forEach((g, i) => {
    const id = `${menuId}/${i}`;
    categorie.push({
      externalId: id,
      nome: testo(g.name) ?? testo(g.groupName) ?? testo(g.displayName) ?? `Schermata ${i + 1}`,
      padreExternalId: null,
    });
    visita(lista(g.menuEntry), `${i}/`, id);
  });

  return { externalId: menuId, nome: testo(m.menuName) ?? "Menu", categorie, prodotti };
}

/* -------------------------------------------------------------------------- */
/*  Aliquote e metodi di pagamento                                            */
/* -------------------------------------------------------------------------- */

/**
 * `GET /f/finance/{businessLocationId}/tax-rates`
 * → `{ taxRateList: [{ code, description, rate, taxIncluded, accountingReference }] }`
 *
 * Dubbio da verificare: la documentazione chiama `rate` «il moltiplicatore».
 * Si legge come frazione (0,10 per il 10%) **solo** se è fra 0 e 1; fuori da
 * quell'intervallo la percentuale resta nulla e il valore originale sta nei
 * metadati. Un'aliquota IVA indovinata finisce su uno scontrino.
 */
export function aliquote(corpo: unknown): (AliquotaEsterna & { rateOriginale: number | null })[] {
  const c = (corpo && typeof corpo === "object" ? corpo : {}) as Json;
  return lista(c.taxRateList)
    .map((t) => {
      const rate = numero(t.rate);
      return {
        externalId: testo(t.code) ?? "",
        descrizione: testo(t.description) ?? testo(t.code) ?? "Aliquota",
        percentuale: rate !== null && rate >= 0 && rate <= 1 ? Math.round(rate * 10_000) / 100 : null,
        inclusa: typeof t.taxIncluded === "boolean" ? t.taxIncluded : null,
        rateOriginale: rate,
      };
    })
    .filter((t) => t.externalId);
}

/**
 * `GET /f/finance/{businessLocationId}/paymentMethods`
 * → `{ _embedded: { paymentMethodList: [{ name, code, accountingReference, pmId }] } }`
 */
export function metodiDiPagamento(corpo: unknown): MetodoPagamentoEsterno[] {
  const c = (corpo && typeof corpo === "object" ? corpo : {}) as Json;
  const e = (c._embedded && typeof c._embedded === "object" ? c._embedded : {}) as Json;
  return lista(e.paymentMethodList)
    .map((p) => ({
      externalId: testo(p.pmId) ?? testo(p.code) ?? "",
      nome: testo(p.name) ?? "Metodo",
      codice: testo(p.code),
    }))
    .filter((p) => p.externalId);
}

/* -------------------------------------------------------------------------- */
/*  Ordini                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Da `OrdineDaInviare` al corpo di `POST /o/op/1/order/local`.
 *
 * Campi obbligatori secondo la documentazione: `businessLocationId`,
 * `thirdPartyReference` (1-48 caratteri, unico: un secondo invio con lo
 * stesso riferimento risponde 409, ed è la nostra idempotenza),
 * `endpointId` (il webhook a cui arriva l'esito) e `customerInfo.firstName`.
 */
export function corpoOrdineLocale(
  ordine: OrdineDaInviare,
  opzioni: { businessLocationId: string; endpointId: string },
): Record<string, unknown> {
  const riferimento = ordine.riferimento.slice(0, LUNGHEZZA_RIFERIMENTO);
  return {
    businessLocationId: Number.isSafeInteger(Number(opzioni.businessLocationId))
      ? Number(opzioni.businessLocationId)
      : opzioni.businessLocationId,
    thirdPartyReference: riferimento,
    endpointId: opzioni.endpointId,
    customerInfo: {
      /* Obbligatorio per Lightspeed. Al tavolo spesso non c'è un nome, e non
         se ne inventa uno che finisca sullo scontrino come un cliente vero:
         si scrive il tavolo. */
      firstName: ordine.cliente?.nome || (ordine.tavolo ? `Tavolo ${ordine.tavolo}` : "Foodtech"),
      /* Solo `firstName`: è l'unico campo del cliente che abbiamo verificato
         nella documentazione. Cognome, email e telefono si aggiungono quando
         qualcuno ha letto il nome esatto dei campi, non prima. */
    },
    ...(ordine.tavolo ? { tableNumber: ordine.tavolo } : {}),
    ...(ordine.nota ? { orderNote: ordine.nota.slice(0, 500) } : {}),
    items: ordine.righe.map((r) => ({ sku: r.codiceProdotto, quantity: r.quantita })),
    maxTimeToAttemptOrderDeliverToPos: 60_000,
  };
}

/* -------------------------------------------------------------------------- */
/*  Notifiche (webhook «Order and Pay»)                                       */
/* -------------------------------------------------------------------------- */

const STATI_ORDINE: Record<string, StatoOrdineEsterno> = {
  SUCCESS: "ACCEPTED",
  FAILURE: "REJECTED",
  IN_DELIVERY: "IN_PROGRESS",
  READY_FOR_PICKUP: "READY",
  CLOSED: "CLOSED",
  ABANDONED: "CANCELLED",
  CANCELLED: "CANCELLED",
};

/**
 * Le notifiche documentate:
 *
 * ```json
 * { "thirdPartyReference": "REF11", "businessLocationId": 247158188015618,
 *   "status": "SUCCESS", "ikentooAccountId": "2114502594134196",
 *   "ikentooAccountIdentifier": "A123080.14", "type": "PAYMENT" }
 * ```
 *
 * Le notifiche **non portano un identificativo dell'evento**. L'idempotenza
 * si costruisce allora con ciò che rende unico un fatto: tipo, riferimento,
 * stato e conto. Lightspeed che ritenta la stessa notifica produce la stessa
 * chiave; un ordine che passa da SUCCESS a CLOSED ne produce due, ed è
 * giusto così.
 */
export function leggiNotifica(corpo: unknown): {
  chiave: string[];
  tipo: string;
  sede: string | null;
  evento: EventoNormalizzato;
} {
  const n = (corpo && typeof corpo === "object" ? corpo : {}) as Json;
  const tipoOriginale = (testo(n.type) ?? "ORDER").toUpperCase();
  const stato = (testo(n.status) ?? "").toUpperCase();
  const riferimento = testo(n.thirdPartyReference);
  const externalId = testo(n.ikentooAccountId) ?? testo(n.ikentooAccountIdentifier);
  const motivo = testo(n.reason);
  const chiave = [tipoOriginale, riferimento ?? "", stato, testo(n.ikentooAccountIdentifier) ?? "", motivo ?? ""];

  if (tipoOriginale === "PAYMENT") {
    return {
      chiave,
      tipo: "payment.status",
      sede: testo(n.businessLocationId),
      evento: { tipo: "pos.payment.status", riferimento, externalId, riuscito: stato === "SUCCESS", motivo },
    };
  }
  if (STATI_ORDINE[stato]) {
    return {
      chiave,
      tipo: "order.status",
      sede: testo(n.businessLocationId),
      evento: { tipo: "pos.order.status", riferimento, externalId, stato: STATI_ORDINE[stato]!, motivo },
    };
  }
  return {
    chiave,
    tipo: `sconosciuto:${tipoOriginale}`,
    sede: testo(n.businessLocationId),
    evento: { tipo: "sconosciuto", tipoOriginale },
  };
}

/* -------------------------------------------------------------------------- */
/*  Token                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * La risposta del server di autorizzazione (Keycloak, standard OAuth 2):
 * `access_token`, `expires_in`, `refresh_token`, `refresh_expires_in`,
 * `scope`. Con `offline_access` Keycloak può rispondere
 * `refresh_expires_in: 0`, che vuol dire «nessuna scadenza fissa» — la
 * documentazione Lightspeed dice 40 giorni di inattività — e si salva come
 * nullo invece che come «scaduto adesso».
 */
export function leggiToken(corpo: unknown, adesso = Date.now()) {
  const t = (corpo && typeof corpo === "object" ? corpo : {}) as Json;
  const accessToken = testo(t.access_token);
  if (!accessToken) return null;
  const scade = numero(t.expires_in);
  const scadeRinnovo = numero(t.refresh_expires_in);
  return {
    accessToken,
    refreshToken: testo(t.refresh_token),
    scopes: (testo(t.scope) ?? "").split(/\s+/).filter(Boolean),
    accessTokenExpiresAt: scade ? new Date(adesso + scade * 1000) : null,
    refreshTokenExpiresAt: scadeRinnovo ? new Date(adesso + scadeRinnovo * 1000) : null,
  };
}
