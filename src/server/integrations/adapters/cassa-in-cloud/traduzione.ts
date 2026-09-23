import type {
  AliquotaEsterna,
  CategoriaEsterna,
  EventoNormalizzato,
  OrdineDaInviare,
  OrdineEsterno,
  PagamentoEsterno,
  ProdottoEsterno,
  SalaEsterna,
  SedeEsterna,
  StatoOrdineEsterno,
  TavoloEsterno,
} from "../../dominio";
import { ErroreIntegrazione } from "../../errori";
import { MINUTI_ANTICIPO_ORDINE } from "./config";

/**
 * **Da Cassa in Cloud a Foodtech, e ritorno. Funzioni pure.**
 *
 * L'unico posto dove si leggono i nomi dei campi di Cassa in Cloud
 * (`salesPoint`, `seatsAvailable`, `idProductVariant`, …). I nomi sono quelli
 * dei modelli della documentazione ufficiale (api-doc.cassanova.com, sezione
 * «Models»); **nessuna risposta vera è mai stata letta**. Dove la
 * documentazione lascia un dubbio, c'è scritto DA VERIFICARE accanto.
 */

type Json = Record<string, unknown>;

const testo = (v: unknown): string | null => (v === null || v === undefined || v === "" ? null : String(v));
const numero = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
};
const oggetto = (v: unknown): Json => (v && typeof v === "object" && !Array.isArray(v) ? (v as Json) : {});
const lista = (v: unknown): Json[] => (Array.isArray(v) ? (v.filter((x) => x && typeof x === "object") as Json[]) : []);

/** Euro con decimali (`BigDecimal`) → centesimi interi. */
export function centesimi(v: unknown): number | null {
  const n = numero(v);
  return n === null ? null : Math.round(n * 100);
}

/**
 * Una risposta di elenco: `{ <chiave>: [...], totalCount }`. Se la chiave
 * non c'è o non è un elenco, la risposta non è quella documentata: meglio
 * fermarsi che scrivere mappature vuote credendo che la cassa sia vuota.
 */
export function elenco(corpo: unknown, chiave: string): { righe: Json[]; totale: number | null } {
  const c = oggetto(corpo);
  if (!Array.isArray(c[chiave])) {
    throw new ErroreIntegrazione("UNKNOWN", `Risposta inattesa da Cassa in Cloud: manca l'elenco «${chiave}»`);
  }
  return { righe: lista(c[chiave]), totale: numero(c.totalCount) };
}

/* -------------------------------------------------------------------------- */
/*  Token                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * `POST /apikey/token` → `{ access_token, expires_in: 3600, token_type: "Bearer" }`.
 * Nessun token di rinnovo: allo scadere se ne chiede un altro con la chiave.
 */
export function leggiToken(corpo: unknown, adesso = Date.now()) {
  const t = oggetto(corpo);
  const accessToken = testo(t.access_token);
  if (!accessToken) return null;
  const scade = numero(t.expires_in);
  return { accessToken, accessTokenExpiresAt: scade ? new Date(adesso + scade * 1000) : null };
}

/* -------------------------------------------------------------------------- */
/*  Punti vendita, sale, tavoli                                               */
/* -------------------------------------------------------------------------- */

/** `GET /salespoint` → `{ salesPoint: [SalesPoint], totalCount }`. `SalesPoint.id` è un `Long`. */
export function puntiVendita(corpo: unknown): SedeEsterna[] {
  return elenco(corpo, "salesPoint")
    .righe.map((s): SedeEsterna | null => {
      const id = testo(s.id);
      if (!id) return null;
      const citta = testo(s.city);
      const nome = testo(s.name) ?? testo(s.description) ?? `Punto vendita ${id}`;
      return { externalId: id, nome: citta && !nome.includes(citta) ? `${nome} · ${citta}` : nome, account: null };
    })
    .filter((s): s is SedeEsterna => !!s);
}

/** `GET /risto/rooms` → `{ rooms: [Room { id, name, idSalesPoint }] }` */
export function sale(corpo: unknown): SalaEsterna[] {
  return elenco(corpo, "rooms")
    .righe.map((r) => ({ externalId: testo(r.id) ?? "", nome: testo(r.name) ?? "Sala" }))
    .filter((r) => r.externalId);
}

/** `GET /risto/tables` → `{ tables: [Table { id, name, idSalesPoint, seatsAvailable, externalId, idRoom }] }` */
export function tavoli(corpo: unknown): TavoloEsterno[] {
  return elenco(corpo, "tables")
    .righe.map((t) => ({
      externalId: testo(t.id) ?? "",
      etichetta: testo(t.name) ?? testo(t.id) ?? "",
      salaExternalId: testo(t.idRoom),
      posti: numero(t.seatsAvailable),
      // Il modello Table non ha un campo «attivo»: si considerano tutti attivi.
      attivo: true,
    }))
    .filter((t) => t.externalId);
}

/* -------------------------------------------------------------------------- */
/*  Catalogo                                                                  */
/* -------------------------------------------------------------------------- */

/** `GET /categories` → `{ categories: [Category { id, description, … }] }` */
export function categorie(corpo: unknown): CategoriaEsterna[] {
  return elenco(corpo, "categories")
    .righe.map((c) => ({ externalId: testo(c.id) ?? "", nome: testo(c.description) ?? "Categoria", padreExternalId: null }))
    .filter((c) => c.externalId);
}

export type ProdottoCassa = ProdottoEsterno & {
  multivariante: boolean;
  varianti: { externalId: string; nome: string }[];
  prezziPerListino: { listino: string; prezzoCents: number | null }[];
  abilitatoRisto: boolean | null;
};

/**
 * `GET /products` → `{ products: [Product] }`.
 *
 * - il prezzo base è quello **senza** modalità di vendita (`prices[]` con
 *   `idSalesMode` vuoto: «Contains at least base price (with no sales mode)»);
 * - l'aliquota sta nel reparto (`department.tax.rate`), quando il reparto
 *   arriva incluso nel prodotto; altrimenti resta nulla;
 * - `variants` c'è solo per i prodotti `multivariant`.
 */
export function prodotti(corpo: unknown): ProdottoCassa[] {
  return elenco(corpo, "products")
    .righe.map((p): ProdottoCassa | null => {
      const id = testo(p.id);
      if (!id) return null;
      const prezzi = lista(p.prices);
      const base = prezzi.find((x) => !testo(x.idSalesMode));
      const reparto = oggetto(p.department);
      const tassa = oggetto(reparto.tax);
      return {
        externalId: id,
        codice: testo(p.internalId) ?? testo(p.externalId),
        nome: testo(p.description) ?? "Prodotto",
        prezzoCents: base ? centesimi(base.value) : null,
        categoriaExternalId: testo(p.idCategory),
        aliquotaPercentuale: numero(tassa.rate),
        // La documentazione non dice se i prezzi siano IVA inclusa: non si indovina.
        ivaInclusa: null,
        modificatori: [],
        multivariante: p.multivariant === true,
        varianti: lista(p.variants)
          .map((v) => ({ externalId: testo(v.id) ?? "", nome: testo(v.description) ?? "" }))
          .filter((v) => v.externalId),
        prezziPerListino: prezzi
          .filter((x) => testo(x.idSalesMode))
          .map((x) => ({ listino: testo(x.idSalesMode)!, prezzoCents: centesimi(x.value) })),
        abilitatoRisto: typeof p.enableForRisto === "boolean" ? p.enableForRisto : null,
      };
    })
    .filter((p): p is ProdottoCassa => !!p);
}

/** `GET /salesmodes` → `{ salesModes: [SalesMode { id, description }] }`: i listini. */
export function listini(corpo: unknown): { externalId: string; nome: string }[] {
  return elenco(corpo, "salesModes")
    .righe.map((s) => ({ externalId: testo(s.id) ?? "", nome: testo(s.description) ?? "Listino" }))
    .filter((s) => s.externalId);
}

/** `GET /taxes` → `{ taxes: [Tax { id, description, rate }] }`. `rate` è già una percentuale. */
export function aliquote(corpo: unknown): AliquotaEsterna[] {
  return elenco(corpo, "taxes")
    .righe.map((t) => ({
      externalId: testo(t.id) ?? "",
      descrizione: testo(t.description) ?? "Aliquota",
      percentuale: numero(t.rate),
      inclusa: null,
    }))
    .filter((t) => t.externalId);
}

/* -------------------------------------------------------------------------- */
/*  Ordini                                                                    */
/* -------------------------------------------------------------------------- */

const DA_FLUSSO_ESTERNO: Record<string, StatoOrdineEsterno> = {
  REQUESTED: "IN_PROGRESS",
  ACCEPTED: "ACCEPTED",
  REJECTED: "REJECTED",
  PROCESSING: "IN_PROGRESS",
  READY: "READY",
  SHIPPING: "IN_PROGRESS",
  SHIPPED: "IN_PROGRESS",
  DELIVERING: "IN_PROGRESS",
  CANCELED: "CANCELLED",
  COMPLETED: "CLOSED",
};

/**
 * Lo stato di un ordine. Prima `externalWorkflowStatus` (il flusso degli
 * ordini esterni), poi `status` (`OrderStatus`).
 *
 * DA VERIFICARE: `PROCESSED` si legge come «chiuso» (trasformato in un
 * documento di vendita). La documentazione elenca i valori senza spiegarli.
 */
export function statoOrdine(o: Json): StatoOrdineEsterno {
  const esterno = testo(o.externalWorkflowStatus);
  if (esterno && DA_FLUSSO_ESTERNO[esterno]) return DA_FLUSSO_ESTERNO[esterno]!;
  switch (testo(o.status)) {
    case "NOT_PROCESSED":
    case "PARTIALLY_PROCESSED":
      return "IN_PROGRESS";
    case "PROCESSED":
      return "CLOSED";
    default:
      return "UNKNOWN";
  }
}

/** `Order` → `OrdineEsterno`. */
export function ordine(o: Json): OrdineEsterno {
  const doc = oggetto(o.document);
  return {
    externalId: testo(o.id),
    riferimento: testo(o.externalId) ?? testo(doc.externalId),
    stato: statoOrdine(o),
    tavolo: testo(o.idTable),
    totaleCents: centesimi(doc.amount),
    righe: lista(doc.rows).map((r) => ({
      codiceProdotto: testo(r.idProductVariant) ?? testo(r.idProduct) ?? "",
      nome: "",
      quantita: numero(r.quantity) ?? 0,
      prezzoUnitarioCents: centesimi(r.price),
      note: testo(r.note),
    })),
  };
}

export function ordini(corpo: unknown): OrdineEsterno[] {
  return elenco(corpo, "orders").righe.map(ordine);
}

/**
 * Da `OrdineDaInviare` a una voce di `create` di `POST /documents/orders/batch`.
 *
 * Scelte, tutte dentro i campi documentati:
 *
 * - `externalId` = il riferimento di Foodtech. È il campo con **vincolo di
 *   unicità** («String code with unique constraint»): un secondo invio con lo
 *   stesso riferimento risponde `ConflictValue` invece di creare un doppione.
 *   È l'idempotenza che la cassa ci dà gratis;
 * - `isExternalOrder: true`: solo gli ordini esterni sono «visibili e
 *   gestibili dall'app POS»; quelli documentali restano nel portale;
 * - `deliveryMode: "TABLE"` e `idTable`: il valore `TABLE` è nell'enum
 *   `DeliveryMode`;
 * - `dueDate`: obbligatoria per gli ordini esterni, futura, secondo le regole
 *   del portale. Si manda in millisecondi, adesso + `MINUTI_ANTICIPO_ORDINE`.
 *   **DA VERIFICARE**: la documentazione dice che le date sono «yyyy-mm-dd»,
 *   ma una data senza ora non può essere «futura» dentro lo stesso giorno;
 * - righe: `idProductVariant`, `quantity`, `price` (euro), `note`.
 *   **DA VERIFICARE**: la riga d'ordine documentata non ha `idProduct`, solo
 *   `idProductVariant`, che il modello `DocumentRow` descrive come «Id of the
 *   ProductVariant if the product is multivariant». Per un prodotto semplice
 *   non è documentato cosa mettere: per questo chi chiama deve passare
 *   l'identificativo di una **variante**, e il servizio rifiuta i prodotti
 *   non multivariante invece di tirare a indovinare.
 *
 * Il cliente (`idCustomer`/`idOrganization`) non si manda: il modello
 * `Document` dice «at least one … is required», ma non è chiaro se valga per
 * gli ordini esterni al tavolo. **DA VERIFICARE.**
 */
export function corpoOrdine(
  o: OrdineDaInviare,
  opzioni: { idSalesPoint: string; adesso?: number },
): Record<string, unknown> {
  if (!o.tavoloExternalId) {
    throw new ErroreIntegrazione("INVALID_CONFIGURATION", "Tavolo non abbinato a un tavolo di Cassa in Cloud");
  }
  if (o.righe.length === 0) throw new ErroreIntegrazione("VALIDATION", "Ordine senza righe");
  const idSalesPoint = Number(opzioni.idSalesPoint);
  return {
    create: [
      {
        externalId: o.riferimento,
        isExternalOrder: true,
        deliveryMode: "TABLE",
        idTable: o.tavoloExternalId,
        dueDate: (opzioni.adesso ?? Date.now()) + MINUTI_ANTICIPO_ORDINE * 60_000,
        document: {
          idSalesPoint: Number.isSafeInteger(idSalesPoint) ? idSalesPoint : opzioni.idSalesPoint,
          ...(o.nota ? { note: o.nota.slice(0, 500) } : {}),
          rows: o.righe.map((r, i) => ({
            rowNumber: i + 1,
            idProductVariant: r.codiceProdotto,
            quantity: r.quantita,
            ...(r.prezzoUnitarioCents !== null ? { price: r.prezzoUnitarioCents / 100 } : {}),
            ...(r.note ? { note: r.note.slice(0, 250) } : {}),
          })),
        },
      },
    ],
  };
}

/** `batchResponse.createDetails[] { index, id, externalId }` → l'id dell'ordine creato. */
export function idCreato(corpo: unknown, riferimento: string): string | null {
  const dettagli = lista(oggetto(oggetto(corpo).batchResponse).createDetails);
  const d = dettagli.find((x) => testo(x.externalId) === riferimento) ?? dettagli[0];
  return d ? testo(d.id) : null;
}

/** Se l'errore della cassa è il vincolo di unicità su `externalId`. */
export function eConflittoDiRiferimento(e: unknown): boolean {
  if (!(e instanceof ErroreIntegrazione)) return false;
  return /ConflictValue/i.test(`${e.dettaglio.codiceFornitore ?? ""} ${e.dettaglio.estratto ?? ""}`) || e.codice === "CONFLICT";
}

/* -------------------------------------------------------------------------- */
/*  Pagamenti                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * `GET /documents/receipts` → `{ receipts: [Receipt { id, document: { payments: [Payment] } }] }`.
 * Un pagamento per riga di `payments` (`paymentType`, `amount`).
 */
export function pagamentiDaScontrini(corpo: unknown): PagamentoEsterno[] {
  return elenco(corpo, "receipts").righe.flatMap((r) => {
    const doc = oggetto(r.document);
    const ordineCollegato = lista(oggetto(doc.documentConnectionSources).orders)[0];
    return lista(doc.payments).map((p) => ({
      externalId: testo(r.id),
      riferimento: ordineCollegato ? testo(ordineCollegato.externalId) : null,
      importoCents: centesimi(p.amount),
      mancia: null,
      metodo: testo(p.paymentType),
      riuscito: true,
    }));
  });
}

/* -------------------------------------------------------------------------- */
/*  Webhook                                                                   */
/* -------------------------------------------------------------------------- */

const CATALOGO_WEBHOOK: Record<string, "menu" | "tax_rates"> = {
  PRODUCT: "menu",
  CATEGORY: "menu",
  MODIFIER: "menu",
  DEPARTMENT: "menu",
  TAX: "tax_rates",
};

/**
 * Un evento: `x-cn-operation: ENTITY/EVENT` e l'entità nel corpo, con la
 * stessa forma dell'API.
 *
 * DA VERIFICARE: per scontrini e conti il riferimento all'ordine Foodtech si
 * cerca in `document.documentConnectionSources.orders[0].externalId`; la
 * documentazione dice che lì ci sono gli ordini collegati, non se arrivano
 * completi o solo come identificativi.
 */
export function leggiEvento(operazione: string, corpo: unknown): { tipo: string; sede: string | null; evento: EventoNormalizzato } {
  const [entita = "", azione = ""] = operazione.toUpperCase().split("/");
  const e = oggetto(corpo);
  const doc = oggetto(e.document);
  const sede = testo(e.idSalesPoint) ?? testo(doc.idSalesPoint);
  const tipo = `${entita}/${azione}`;

  if (entita === "ORDER") {
    return {
      tipo,
      sede,
      evento: {
        tipo: "pos.order.status",
        riferimento: testo(e.externalId) ?? testo(doc.externalId),
        externalId: testo(e.id),
        stato: azione === "DELETE" ? "CANCELLED" : statoOrdine(e),
        motivo: testo(e.rejectionReason),
      },
    };
  }
  if ((entita === "RECEIPT" || entita === "BILL") && azione === "CREATE") {
    const collegato = lista(oggetto(doc.documentConnectionSources).orders)[0];
    return {
      tipo,
      sede,
      evento: {
        tipo: "pos.payment.status",
        riferimento: collegato ? testo(collegato.externalId) : null,
        externalId: testo(e.id),
        riuscito: true,
        motivo: null,
      },
    };
  }
  if (CATALOGO_WEBHOOK[entita]) {
    return { tipo, sede, evento: { tipo: "catalogo.cambiato", risorsa: CATALOGO_WEBHOOK[entita]!, externalId: testo(e.id) } };
  }
  return { tipo, sede, evento: { tipo: "sconosciuto", tipoOriginale: tipo } };
}
