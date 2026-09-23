import { createHash } from "node:crypto";
import type {
  AliquotaEsterna,
  CategoriaEsterna,
  ClienteEsterno,
  EventoNormalizzato,
  MetodoPagamentoEsterno,
  OrdineDaInviare,
  OrdineEsterno,
  PagamentoEsterno,
  ProdottoEsterno,
  RigaOrdine,
  SalaEsterna,
  StatoOrdineEsterno,
  TavoloEsterno,
} from "../../dominio";
import type { DocumentoEsterno } from "../tipi";
import { ErroreIntegrazione } from "../../errori";
import { USCITA_MASSIMA, VENDITORE } from "./config";

/**
 * **Da Tilby a Foodtech, e ritorno. Funzioni pure.**
 *
 * L'unico posto dove si leggono i nomi dei campi di Tilby (`sale_items`,
 * `auto_print_order`, `exit`, `price1`, …). Nomi presi dagli schemi OpenAPI
 * del reference ufficiale e dalla guida «Stampa automatica comande e
 * scontrini» (PDF ufficiale, 5 aprile 2024). Nessuna risposta vera è mai
 * stata letta: dove resta un dubbio, c'è scritto DA VERIFICARE.
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
const due = (n: number) => Math.round(n * 100) / 100;

export function centesimi(v: unknown): number | null {
  const n = numero(v);
  return n === null ? null : Math.round(n * 100);
}

/**
 * Una risposta di elenco. Due forme documentate: l'array semplice (gli
 * esempi di categorie e metodi di pagamento) e, con `pagination=true`,
 * `{ page, pages, per_page, results: [...] }` (l'esempio delle sale).
 * Qualunque altra cosa non è una risposta documentata: ci si ferma.
 */
export function elenco(corpo: unknown): { righe: Json[]; pagine: number | null } {
  if (Array.isArray(corpo)) return { righe: lista(corpo), pagine: 1 };
  const c = oggetto(corpo);
  if (Array.isArray(c.results)) return { righe: lista(c.results), pagine: numero(c.pages) };
  throw new ErroreIntegrazione("UNKNOWN", "Risposta inattesa da Tilby: non è un elenco");
}

/**
 * Un UUID con la forma della versione 4, **derivato** da un seme.
 *
 * Tilby vuole un `uuid` v4 sulla vendita e su ogni riga, diverso per ogni
 * riga. Derivarlo dal riferimento Foodtech invece di tirarlo a sorte è la
 * nostra idempotenza: la stessa comanda rimandata porta gli stessi uuid, e
 * la cassa li riconosce. DA VERIFICARE come Tilby risponde a un `uuid` di
 * vendita già usato (la documentazione dice solo «must be unique»).
 */
export function uuidDa(seme: string): string {
  const h = createHash("sha256").update(`foodtech:${seme}`).digest("hex");
  const variante = ((parseInt(h[16]!, 16) & 0x3) | 0x8).toString(16);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-${variante}${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

/* -------------------------------------------------------------------------- */
/*  Sessione, sale e tavoli                                                   */
/* -------------------------------------------------------------------------- */

/** `GET /sessions/me` → `{ id, username, client_id, shop: { id, name, uuid } }`. */
export function sessione(corpo: unknown): { negozio: { id: string; nome: string; uuid: string | null }; clientId: string | null } {
  const s = oggetto(corpo);
  const shop = oggetto(s.shop);
  const id = testo(shop.id);
  if (!id) throw new ErroreIntegrazione("UNKNOWN", "Risposta inattesa da Tilby: la sessione non indica il negozio");
  return { negozio: { id, nome: testo(shop.name) ?? `Negozio ${id}`, uuid: testo(shop.uuid) }, clientId: testo(s.client_id) };
}

/** `GET /rooms` → sale con i loro `tables` (`id`, `name`, `covers`, `room_id`). */
export function saleETavoli(corpo: unknown): { sale: SalaEsterna[]; tavoli: (TavoloEsterno & { salaNome: string | null })[] } {
  const sale: SalaEsterna[] = [];
  const tavoli: (TavoloEsterno & { salaNome: string | null })[] = [];
  for (const r of elenco(corpo).righe) {
    const idSala = testo(r.id);
    if (!idSala || r.deleted_at) continue;
    const nomeSala = testo(r.name) ?? `Sala ${idSala}`;
    sale.push({ externalId: idSala, nome: nomeSala });
    for (const t of lista(r.tables)) {
      const id = testo(t.id);
      if (!id || t.deleted_at) continue;
      tavoli.push({
        externalId: id,
        etichetta: testo(t.name) ?? id,
        salaExternalId: idSala,
        salaNome: nomeSala,
        posti: numero(t.covers),
        attivo: true,
      });
    }
  }
  return { sale, tavoli };
}

/* -------------------------------------------------------------------------- */
/*  Catalogo                                                                  */
/* -------------------------------------------------------------------------- */

export function categorie(corpo: unknown): CategoriaEsterna[] {
  return elenco(corpo)
    .righe.filter((c) => !c.deleted_at)
    .map((c) => ({ externalId: testo(c.id) ?? "", nome: testo(c.name) ?? "Categoria", padreExternalId: null }))
    .filter((c) => c.externalId);
}

export type ProdottoTilby = ProdottoEsterno & {
  repartoId: string | null;
  repartoNome: string | null;
  /** I dieci listini di Tilby: `price1` … `price10`, solo quelli valorizzati. */
  listini: { listino: number; prezzoCents: number }[];
  inVendita: boolean;
  varianti: { externalId: string; nome: string }[];
};

/**
 * `GET /items`. Il prezzo base è `price1` (obbligatorio); `price2…price10`
 * sono i listini, ognuno col suo reparto (`department2_id`…). Aliquota:
 * `vat_perc`, o quella del reparto incluso.
 */
export function prodotti(corpo: unknown): ProdottoTilby[] {
  return elenco(corpo)
    .righe.filter((p) => !p.deleted_at)
    .map((p): ProdottoTilby | null => {
      const id = testo(p.id);
      if (!id) return null;
      const reparto = oggetto(p.department);
      const listini: { listino: number; prezzoCents: number }[] = [];
      for (let n = 1; n <= 10; n++) {
        const c = centesimi(p[`price${n}`]);
        if (c !== null) listini.push({ listino: n, prezzoCents: c });
      }
      return {
        externalId: id,
        codice: testo(p.sku),
        nome: testo(p.name) ?? "Prodotto",
        prezzoCents: centesimi(p.price1),
        categoriaExternalId: testo(p.category_id),
        aliquotaPercentuale: numero(p.vat_perc) ?? numero(oggetto(reparto.vat).value),
        ivaInclusa: null,
        modificatori: [],
        repartoId: testo(p.department_id) ?? testo(reparto.id),
        repartoNome: testo(reparto.name),
        listini,
        inVendita: p.on_sale !== false,
        varianti: lista(p.variations).map((v) => ({ externalId: testo(v.id) ?? "", nome: testo(v.name) ?? "" })).filter((v) => v.externalId),
      };
    })
    .filter((p): p is ProdottoTilby => !!p);
}

/** `GET /vat` → `[{ id, code, value }]`: `value` è la percentuale. */
export function aliquote(corpo: unknown): AliquotaEsterna[] {
  return elenco(corpo)
    .righe.map((v) => ({
      externalId: testo(v.id) ?? "",
      descrizione: testo(v.code) ? `${testo(v.code)} · ${numero(v.value) ?? "?"}%` : `IVA ${numero(v.value) ?? "?"}%`,
      percentuale: numero(v.value),
      inclusa: null,
    }))
    .filter((v) => v.externalId);
}

/** `GET /payment_methods` → `[{ id, name, payment_method_type_id, … }]`. */
export function metodiDiPagamento(corpo: unknown): (MetodoPagamentoEsterno & { tipoId: string | null })[] {
  return elenco(corpo)
    .righe.filter((m) => m.hidden !== true)
    .map((m) => ({ externalId: testo(m.id) ?? "", nome: testo(m.name) ?? "Metodo", codice: null, tipoId: testo(m.payment_method_type_id) }))
    .filter((m) => m.externalId);
}

export function clienti(corpo: unknown): ClienteEsterno[] {
  return elenco(corpo)
    .righe.filter((c) => !c.deleted_at)
    .map((c) => ({
      externalId: testo(c.id) ?? "",
      nome: testo(c.first_name) ?? testo(c.company_name),
      cognome: testo(c.last_name),
      email: testo(c.email),
      telefono: testo(c.mobile) ?? testo(c.phone),
    }))
    .filter((c) => c.externalId);
}

/* -------------------------------------------------------------------------- */
/*  Vendite (ordini e conti)                                                  */
/* -------------------------------------------------------------------------- */

export type TavoloTilby = { tableId: number; tableName: string; roomId: number; roomName: string };

/**
 * Una riga Foodtech → una `sale_item`.
 *
 * Obbligatori per lo schema: `uuid`, `type`, `price`, `quantity`,
 * `vat_perc`, `department_id`, `final_price`, `final_net_price`,
 * `seller_id`, `seller_name`. Reparto, aliquota e prezzo vengono dalla
 * **mappatura** del prodotto (`datiProdotto`), cioè da Tilby: il prezzo che
 * va sullo scontrino lo decide la cassa, non Foodtech.
 */
export function rigaVendita(r: RigaOrdine, uscita: number, uuid: string): Json {
  const d = r.datiProdotto ?? {};
  const reparto = numero(d.repartoId);
  const iva = numero(d.aliquota);
  const prezzo = numero(d.prezzoCents) ?? r.prezzoUnitarioCents;
  if (reparto === null || iva === null || prezzo === null) {
    throw new ErroreIntegrazione(
      "INVALID_CONFIGURATION",
      `Il prodotto ${r.codiceProdotto} non ha reparto, aliquota o prezzo nelle mappature: risincronizza il menu da Tilby`,
    );
  }
  const unitario = prezzo / 100;
  return {
    uuid,
    type: "sale",
    item_id: Number(r.codiceProdotto),
    name: r.nome || testo(d.nome) || r.codiceProdotto,
    price: unitario,
    quantity: r.quantita,
    vat_perc: iva,
    department_id: reparto,
    ...(testo(d.repartoNome) ? { department_name: testo(d.repartoNome) } : {}),
    final_price: unitario,
    final_net_price: due(unitario / (1 + iva / 100)),
    seller_id: VENDITORE.id,
    seller_name: VENDITORE.nome,
    exit: uscita,
    ...(r.note ? { notes: r.note.slice(0, 250) } : {}),
  };
}

function totali(righe: Json[]) {
  let lordo = 0;
  let netto = 0;
  for (const r of righe) {
    if (r.deleted_at) continue;
    lordo += (numero(r.final_price) ?? 0) * (numero(r.quantity) ?? 0);
    netto += (numero(r.final_net_price) ?? 0) * (numero(r.quantity) ?? 0);
  }
  return { amount: due(lordo), final_amount: due(lordo), final_net_amount: due(netto) };
}

/**
 * Da `OrdineDaInviare` al corpo di `POST /sales`, nella forma del «Caso 1»
 * della guida alla stampa automatica: `auto_print_order: true` e ogni riga
 * con `exit: 1`. Stato `open`: la comanda va in cucina, lo scontrino no.
 *
 * `external_id` = riferimento Foodtech (campo pensato per le integrazioni e
 * filtrabile); `uuid` derivato dallo stesso riferimento (vedi `uuidDa`).
 */
export function corpoVendita(o: OrdineDaInviare, opzioni: { tavolo: TavoloTilby | null; adesso?: Date }): Json {
  if (o.righe.length === 0) throw new ErroreIntegrazione("VALIDATION", "Ordine senza righe");
  const righe = o.righe.map((r, i) => rigaVendita(r, 1, uuidDa(`${o.riferimento}#${i}`)));
  const t = opzioni.tavolo;
  return {
    uuid: uuidDa(o.riferimento),
    external_id: o.riferimento,
    name: t ? `Tavolo ${t.tableName}` : `Foodtech ${o.riferimento.slice(-8)}`,
    status: "open",
    open_at: (opzioni.adesso ?? new Date()).toISOString(),
    currency: "EUR",
    order_type: "normal",
    auto_print_order: true,
    seller_id: VENDITORE.id,
    seller_name: VENDITORE.nome,
    ...(o.coperti ? { covers: o.coperti } : {}),
    ...(o.nota ? { notes: o.nota.slice(0, 500) } : {}),
    ...(t
      ? {
          table_id: t.tableId,
          table_name: t.tableName,
          room_id: t.roomId,
          room_name: t.roomName,
          tables: [{ table_id: t.tableId, table_name: t.tableName, room_id: t.roomId, room_name: t.roomName }],
        }
      : {}),
    sale_items: righe,
    payments: [],
    ...totali(righe),
  };
}

/**
 * Il «Caso 3 — tavolo aperto con riordino continuo»: la vendita letta con
 * `GET /sales/{id}`, più le righe nuove con l'uscita successiva, da mandare
 * con `PUT /sales/{id}`. «Il contatore va incrementato ad ogni stampa.»
 *
 * Idempotente: le righe il cui `uuid` è già nella vendita non si aggiungono
 * di nuovo (una PUT ripetuta dopo una risposta persa non raddoppia i piatti).
 */
export function venditaConAggiunta(vendita: Json, o: OrdineDaInviare): { corpo: Json | null; uscita: number | null } {
  if (testo(vendita.status) !== "open") {
    throw new ErroreIntegrazione("CONFLICT", "Il conto su Tilby non è più aperto: le aggiunte non si possono accodare", {
      contoChiuso: true,
    });
  }
  const esistenti = lista(vendita.sale_items);
  const giaPresenti = new Set(esistenti.map((r) => testo(r.uuid)));
  const nuove = o.righe
    .map((r, i) => ({ r, uuid: uuidDa(`${o.riferimento}#${i}`) }))
    .filter((x) => !giaPresenti.has(x.uuid));
  if (nuove.length === 0) return { corpo: null, uscita: null };

  const uscita = Math.max(0, ...esistenti.map((r) => numero(r.exit) ?? 0)) + 1;
  if (uscita > USCITA_MASSIMA) {
    throw new ErroreIntegrazione(
      "NOT_SUPPORTED",
      `Tilby ammette al massimo ${USCITA_MASSIMA} uscite per conto: questa aggiunta andrebbe nell'uscita ${uscita}`,
    );
  }
  const righe = [...esistenti, ...nuove.map((x) => rigaVendita(x.r, uscita, x.uuid))];
  return {
    corpo: { ...vendita, auto_print_order: true, sale_items: righe, ...totali(righe) },
    uscita,
  };
}

const STATO: Record<string, StatoOrdineEsterno> = { open: "IN_PROGRESS", stored: "IN_PROGRESS", closed: "CLOSED" };

/**
 * Stato di una vendita. `stored` si legge come «in corso»: la documentazione
 * dice solo «open, closed or stored». DA VERIFICARE.
 */
export function statoVendita(v: Json): StatoOrdineEsterno {
  if (v.deleted_at) return "CANCELLED";
  return STATO[testo(v.status) ?? ""] ?? "UNKNOWN";
}

export function vendita(v: Json): OrdineEsterno {
  return {
    externalId: testo(v.id),
    riferimento: testo(v.external_id),
    stato: statoVendita(v),
    tavolo: testo(v.table_name) ?? testo(oggetto(lista(v.tables)[0]).table_name),
    totaleCents: centesimi(v.final_amount),
    righe: lista(v.sale_items)
      .filter((r) => !r.deleted_at)
      .map((r) => ({
        codiceProdotto: testo(r.item_id) ?? "",
        nome: testo(r.name) ?? "",
        quantita: numero(r.quantity) ?? 0,
        prezzoUnitarioCents: centesimi(r.final_price),
        note: testo(r.notes),
      })),
  };
}

export function vendite(corpo: unknown): OrdineEsterno[] {
  return elenco(corpo).righe.map(vendita);
}

/** I pagamenti di una vendita (`payments[]`). */
export function pagamentiDi(v: Json): PagamentoEsterno[] {
  return lista(v.payments)
    .filter((p) => !p.deleted_at)
    .map((p) => ({
      externalId: testo(p.id),
      riferimento: testo(v.external_id),
      importoCents: centesimi(p.amount),
      mancia: p.is_tip === true ? centesimi(p.amount) : null,
      metodo: testo(p.payment_method_name),
      riuscito: p.paid === true,
    }));
}

/** I documenti emessi (`sale_documents[]`): tipo, numero, data, indirizzo pubblico. */
export function documentiDi(v: Json): DocumentoEsterno[] {
  return lista(v.sale_documents)
    .filter((d) => !d.deleted_at)
    .map((d) => ({
      externalId: testo(d.id) ?? "",
      tipo: testo(d.document_type) ?? "sconosciuto",
      numero: testo(d.sequential_number) ? `${testo(d.sequential_number_prefix) ?? ""}${testo(d.sequential_number)}` : null,
      data: testo(d.date),
      url: testo(d.document_url),
    }));
}

/**
 * Un pagamento da aggiungere a `payments[]`. Dalla guida: `paid: true`, e la
 * **coppia** `payment_method_id` / `payment_method_type_id` di un metodo che
 * esiste sul negozio. Se la somma dei pagamenti copre il totale, la vendita
 * si chiude e lo scontrino si stampa da sé — solo se sul negozio c'è una cassa
 * con la stampa automatica attiva e sempre connessa.
 */
export function pagamentoTilby(p: {
  importoCents: number;
  metodo: { externalId: string; nome: string; tipoId?: string | null; tipoNome?: string | null };
  data?: Date;
}): Json {
  if (!p.metodo.tipoId) {
    throw new ErroreIntegrazione("INVALID_CONFIGURATION", "Manca il tipo del metodo di pagamento: risincronizza i metodi da Tilby");
  }
  return {
    amount: p.importoCents / 100,
    paid: true,
    payment_method_id: Number(p.metodo.externalId),
    payment_method_name: p.metodo.nome,
    payment_method_type_id: Number(p.metodo.tipoId),
    payment_method_type_name: p.metodo.tipoNome ?? p.metodo.nome,
    date: (p.data ?? new Date()).toISOString(),
  };
}

/* -------------------------------------------------------------------------- */
/*  Webhook                                                                   */
/* -------------------------------------------------------------------------- */

const CATALOGO: Record<string, "menu" | "tables"> = {
  items: "menu",
  categories: "menu",
  departments: "menu",
  rooms: "tables",
};

/**
 * Una notifica: `{ type, entity_name, time, notification_uuid,
 * environment_id, client_id, from_user, entities: [...], nRetry }`.
 * Alla registrazione arriva `{ type: "SUBSCRIBED", … }`, che va solo
 * accolto con un 200.
 */
export function leggiNotifica(corpo: unknown): { idEvento: string; tipo: string; ambiente: string | null; evento: EventoNormalizzato } {
  const n = oggetto(corpo);
  const tipo = (testo(n.type) ?? "").toUpperCase();
  const entita = testo(n.entity_name) ?? "";
  const ambiente = testo(n.environment_id);
  if (!tipo || !entita) throw new ErroreIntegrazione("VALIDATION", "Notifica Tilby senza tipo o entità");

  if (tipo === "SUBSCRIBED") {
    return {
      idEvento: `subscribed:${entita}:${testo(n.time) ?? ""}`,
      tipo: `${entita}/SUBSCRIBED`,
      ambiente,
      evento: { tipo: "sconosciuto", tipoOriginale: `${entita}/SUBSCRIBED` },
    };
  }
  const id = testo(n.notification_uuid);
  if (!id) throw new ErroreIntegrazione("VALIDATION", "Notifica Tilby senza notification_uuid");

  const righe = lista(n.entities);
  let eventi: EventoNormalizzato[];
  if (entita === "sales") {
    eventi = righe.flatMap((v): EventoNormalizzato[] => {
      const rif = testo(v.external_id);
      const idVendita = testo(v.id);
      if (tipo === "DELETED") return [{ tipo: "pos.order.status", riferimento: rif, externalId: idVendita, stato: "CANCELLED", motivo: null }];
      if (tipo === "CLOSED") {
        return [
          { tipo: "pos.order.status", riferimento: rif, externalId: idVendita, stato: "CLOSED", motivo: null },
          { tipo: "pos.payment.status", riferimento: rif, externalId: idVendita, riuscito: true, motivo: null },
        ];
      }
      return [{ tipo: "pos.order.status", riferimento: rif, externalId: idVendita, stato: statoVendita(v), motivo: null }];
    });
  } else if (CATALOGO[entita]) {
    eventi = [{ tipo: "catalogo.cambiato", risorsa: CATALOGO[entita]!, externalId: testo(righe[0]?.id) }];
  } else {
    eventi = [{ tipo: "sconosciuto", tipoOriginale: `${entita}/${tipo}` }];
  }
  return {
    idEvento: id,
    tipo: `${entita}/${tipo}`,
    ambiente,
    evento: eventi.length === 1 ? eventi[0]! : { tipo: "multipli", eventi },
  };
}
