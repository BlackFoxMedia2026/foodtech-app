import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import type {
  AliquotaEsterna,
  CategoriaEsterna,
  EventoNormalizzato,
  MetodoPagamentoEsterno,
  OrdineDaInviare,
  OrdineEsterno,
  PagamentoEsterno,
  StatoOrdineEsterno,
  TavoloEsterno,
} from "../../dominio";
import type { TotaliEsterni } from "../tipi";
import { ErroreIntegrazione } from "../../errori";
import { APP_ESTENSIONE } from "./config";

/**
 * **Da Simphony STS Gen2 a Foodtech, e ritorno. Funzioni pure.**
 *
 * L'unico posto dove si leggono i nomi dei campi di Oracle (`checkRef`,
 * `menuItemId`, `definitionSequence`, `orderTypeRef`, `totals.totalDue`, …),
 * presi dallo `swagger.json` ufficiale (2026.08.15). Nessuna risposta vera è
 * mai stata letta: dove resta un dubbio, c'è scritto DA VERIFICARE.
 */

type Json = Record<string, unknown>;
const oggetto = (v: unknown): Json => (v && typeof v === "object" && !Array.isArray(v) ? (v as Json) : {});
const lista = (v: unknown): Json[] => (Array.isArray(v) ? (v.filter((x) => x && typeof x === "object") as Json[]) : []);
const testo = (v: unknown): string | null => (v === null || v === undefined || v === "" ? null : String(v));
const numero = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
};
const centesimi = (v: unknown): number | null => {
  const n = numero(v);
  return n === null ? null : Math.round(n * 100);
};

/**
 * `TranslatedString`: `{ "en-US": "coffee", "de-DE": "kaffee" }`. Si
 * preferisce l'italiano, poi l'inglese, poi la prima lingua presente.
 * Alcuni campi (`RevenueCenter.name`) sono stringhe semplici.
 */
export function tradotto(v: unknown, riserva = ""): string {
  if (typeof v === "string") return v || riserva;
  const o = oggetto(v);
  const chiavi = Object.keys(o);
  const scelta = chiavi.find((k) => /^it/i.test(k)) ?? chiavi.find((k) => /^en/i.test(k)) ?? chiavi[0];
  return (scelta ? testo(o[scelta]) : null) ?? riserva;
}

/* -------------------------------------------------------------------------- */
/*  Organizzazione: org → location → revenue center                           */
/* -------------------------------------------------------------------------- */

/**
 * La «destinazione» di un'installazione: una location e un revenue center.
 * I due riferimenti non sono unici da soli (la guida lo dice: per questo i
 * percorsi sono annidati), quindi viaggiano insieme: `locRef:rvcRef`.
 * `locRef` in minuscolo, come lo forzano le intestazioni `Simphony-LocRef`.
 */
export function destinazione(locRef: string, rvcRef: string | number): string {
  return `${locRef.toLowerCase()}:${rvcRef}`;
}
export function leggiDestinazione(v: unknown): { locRef: string; rvcRef: number } | null {
  const m = /^([^:]+):(\d+)$/.exec(String(v ?? ""));
  return m ? { locRef: m[1]!, rvcRef: Number(m[2]) } : null;
}

export function organizzazioni(corpo: unknown): { orgShortName: string; nome: string }[] {
  const c = oggetto(corpo);
  if (!Array.isArray(c.organization)) throw new ErroreIntegrazione("UNKNOWN", "Risposta inattesa da Simphony: manca organization");
  return lista(c.organization)
    .map((o) => ({ orgShortName: testo(o.orgShortName) ?? "", nome: testo(o.name) ?? testo(o.orgShortName) ?? "" }))
    .filter((o) => o.orgShortName);
}

export function locations(corpo: unknown): { locRef: string; nome: string }[] {
  const c = oggetto(corpo);
  if (!Array.isArray(c.location)) throw new ErroreIntegrazione("UNKNOWN", "Risposta inattesa da Simphony: manca location");
  return lista(c.location)
    .map((l) => ({ locRef: testo(l.locRef) ?? "", nome: testo(l.name) ?? testo(l.locRef) ?? "" }))
    .filter((l) => l.locRef);
}

export type RevenueCenter = {
  locRef: string;
  rvcRef: number;
  nome: string;
  tipiOrdine: { ref: number; nome: string }[];
  tavoli: string[];
};

export function revenueCenter(r: unknown): RevenueCenter | null {
  const o = oggetto(r);
  const rvcRef = numero(o.rvcRef);
  const locRef = testo(o.locRef);
  if (rvcRef === null || !locRef) return null;
  return {
    locRef,
    rvcRef,
    nome: tradotto(o.name, `Revenue center ${rvcRef}`),
    tipiOrdine: lista(o.orderTypes)
      .map((t) => ({ ref: numero(t.orderTypeRef) ?? 0, nome: testo(t.name) ?? `Tipo ${t.orderTypeRef}` }))
      .filter((t) => t.ref > 0),
    tavoli: Array.isArray(o.tables) ? o.tables.map((t) => String(t)).filter(Boolean) : [],
  };
}

export function revenueCenters(corpo: unknown): RevenueCenter[] {
  const c = oggetto(corpo);
  if (!Array.isArray(c.revenueCenter)) throw new ErroreIntegrazione("UNKNOWN", "Risposta inattesa da Simphony: manca revenueCenter");
  return c.revenueCenter.map(revenueCenter).filter((r): r is RevenueCenter => !!r);
}

/**
 * I tavoli del revenue center: `RevenueCenter.tables`, un elenco di
 * identificativi («Array of restaurant table identifiers»). Nessuna sala,
 * nessun numero di posti: STS Gen2 non li espone.
 */
export function tavoliDi(rvc: RevenueCenter): TavoloEsterno[] {
  return rvc.tavoli.map((t) => ({ externalId: t, etichetta: t, salaExternalId: null, posti: null, attivo: true }));
}

/* -------------------------------------------------------------------------- */
/*  Configurazione: menu, condimenti, tasse, tender, sconti, servizi          */
/* -------------------------------------------------------------------------- */

export type VoceMenu = {
  /** `menuItemId-definitionSequence`: ogni definizione si ordina a sé. */
  externalId: string;
  menuItemId: number;
  definitionSequence: number;
  nome: string;
  famigliaRef: string | null;
  prezzi: { priceSequence: number; prezzoCents: number; nome: string | null; livello: number | null }[];
  taxClassRef: string | null;
  /** I gruppi di condimenti della definizione: con `minimo` > 0 la scelta è obbligatoria. */
  gruppiCondimenti: { ref: string; minimo: number }[];
};

export function menuSommario(corpo: unknown): { menuId: string; nome: string }[] {
  const c = oggetto(corpo);
  if (!Array.isArray(c.items)) throw new ErroreIntegrazione("UNKNOWN", "Risposta inattesa da Simphony: il sommario dei menu non ha items");
  return lista(c.items)
    .map((m) => ({ menuId: testo(m.menuId) ?? "", nome: tradotto(m.name, testo(m.menuId) ?? "Menu") }))
    .filter((m) => m.menuId);
}

/** `GET /menus/{menuId}`: voci (una per definizione), famiglie, condimenti. */
export function menu(corpo: unknown): { voci: VoceMenu[]; famiglie: CategoriaEsterna[]; condimenti: VoceMenu[] } {
  const c = oggetto(corpo);
  if (!Array.isArray(c.menuItems)) throw new ErroreIntegrazione("UNKNOWN", "Risposta inattesa da Simphony: il menu non ha menuItems");
  const voci = (elenco: Json[], campoId: "menuItemId" | "condimentId"): VoceMenu[] =>
    elenco.flatMap((mi) => {
      const id = numero(mi[campoId]);
      if (id === null) return [];
      const nomeBase = tradotto(mi.name, `Voce ${id}`);
      const definizioni = lista(mi.definitions);
      return definizioni
        .map((d): VoceMenu | null => {
          const seq = numero(d.definitionSequence);
          if (seq === null) return null;
          const nomeDef = tradotto(d.name, "");
          return {
            externalId: `${id}-${seq}`,
            menuItemId: id,
            definitionSequence: seq,
            nome: definizioni.length > 1 && nomeDef && nomeDef !== nomeBase ? `${nomeBase} · ${nomeDef}` : nomeBase,
            famigliaRef: testo(mi.familyGroupRef),
            prezzi: lista(d.prices)
              .map((p) => ({
                priceSequence: numero(p.priceSequence) ?? 0,
                prezzoCents: centesimi(p.price) ?? 0,
                nome: testo(p.name),
                livello: numero(p.level),
              }))
              .filter((p) => p.priceSequence > 0 || p.prezzoCents > 0),
            taxClassRef: testo(d.taxClassRef),
            gruppiCondimenti: lista(d.condimentGroupRules)
              .map((g) => ({ ref: testo(g.condimentGroupRef) ?? "", minimo: numero(g.minimumCount) ?? 0 }))
              .filter((g) => g.ref),
          };
        })
        .filter((v): v is VoceMenu => !!v);
    });
  return {
    voci: voci(lista(c.menuItems), "menuItemId"),
    condimenti: voci(lista(c.condimentItems), "condimentId"),
    famiglie: lista(c.familyGroups)
      .map((f) => ({ externalId: testo(f.familyGroupItemId) ?? "", nome: tradotto(f.name, "Famiglia"), padreExternalId: null }))
      .filter((f) => f.externalId),
  };
}

/** `GET /menus/items/unavailable`: le definizioni non disponibili adesso. */
export function nonDisponibili(corpo: unknown): Set<string> {
  const out = new Set<string>();
  for (const i of lista(oggetto(corpo).items)) {
    const id = numero(i.menuItemId);
    if (id === null) continue;
    const defs = lista(i.definitions);
    if (!defs.length) out.add(`${id}-*`);
    for (const d of defs) out.add(`${id}-${numero(d.definitionSequence)}`);
  }
  return out;
}

export function disponibile(v: Pick<VoceMenu, "menuItemId" | "definitionSequence">, fuori: Set<string>): boolean {
  return !fuori.has(`${v.menuItemId}-${v.definitionSequence}`) && !fuori.has(`${v.menuItemId}-*`);
}

/** `GET /taxes` → `taxRates[]`. `includedPercent` è l'IVA inclusa nel prezzo. */
export function aliquote(corpo: unknown): AliquotaEsterna[] {
  return lista(oggetto(corpo).taxRates)
    .filter((t) => t.taxType !== "disabled")
    .map((t) => ({
      externalId: testo(t.taxRateId) ?? "",
      descrizione: tradotto(t.name, `Tassa ${t.taxRateId}`),
      percentuale: numero(t.percentage),
      inclusa: t.taxType === "includedPercent" ? true : t.taxType === "addonPercent" ? false : null,
    }))
    .filter((t) => t.externalId);
}

/**
 * `GET /tenders/collection`. `type` è `payment` oppure `serviceTotal`
 * («used to submit an order without payment»).
 */
export function tender(corpo: unknown): (MetodoPagamentoEsterno & { tipo: string | null })[] {
  return lista(oggetto(corpo).items)
    .map((t) => ({
      externalId: testo(t.tenderId) ?? "",
      nome: tradotto(t.name, `Tender ${t.tenderId}`),
      codice: null,
      tipo: testo(t.type),
    }))
    .filter((t) => t.externalId);
}

/** Sconti e maggiorazioni di servizio: `type` amount|percentage, `value` 0 = aperto. */
export function sconti(corpo: unknown, campoId: "discountId" | "serviceChargeId") {
  return lista(oggetto(corpo).items)
    .map((d) => ({
      externalId: testo(d[campoId]) ?? "",
      nome: tradotto(d.name, `${campoId} ${d[campoId]}`),
      tipo: testo(d.type),
      valore: numero(d.value),
      aperto: !numero(d.value),
    }))
    .filter((d) => d.externalId);
}

/* -------------------------------------------------------------------------- */
/*  Il check                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * `idempotencyId`: «UUID v4 formatted value minus dashes». **Derivato**,
 * non casuale: la stessa operazione (stesso locale, stessa comanda, stessa
 * operazione) produce sempre lo stesso valore, anche dopo un riavvio.
 */
export function idempotencyId(seme: string): string {
  const h = createHash("sha256").update(`foodtech:${seme}`).digest("hex");
  const variante = ((parseInt(h[16]!, 16) & 0x3) | 0x8).toString(16);
  return `${h.slice(0, 12)}4${h.slice(13, 16)}${variante}${h.slice(17, 32)}`;
}

export type ContestoCheck = {
  orgShortName: string;
  locRef: string;
  rvcRef: number;
  dipendente: number;
  tipoOrdine: number;
};

/** L'estensione con cui ritroviamo i nostri check e i nostri round nelle risposte. */
function estensione(riferimento: string) {
  return {
    appName: APP_ESTENSIONE,
    dataName: "riferimento",
    dataType: "string",
    data: riferimento,
    // Non stampata né mostrata: solo restituita dalle API. DA VERIFICARE su un ambiente vero.
    options: ["includeInApiResponse"],
  };
}

/** Il riferimento Foodtech scritto in un elenco di estensioni, se c'è. */
export function riferimentoIn(estensioni: unknown): string | null {
  const e = lista(estensioni).find((x) => x.appName === APP_ESTENSIONE && x.dataName === "riferimento");
  return e ? testo(e.data) : null;
}

/**
 * Le righe: `menuItemId` + `definitionSequence` dalla mappatura, quantità,
 * e la nota in `referenceText`, che Oracle limita a **20 caratteri**. Una nota
 * più lunga non si tronca in silenzio (potrebbe essere un'allergia): la
 * comanda non parte e lo si dice.
 */
export function righeCheck(o: OrdineDaInviare, riferimentoRound: string | null) {
  return o.righe.map((r) => {
    const d = r.datiProdotto ?? {};
    const menuItemId = numero(d.menuItemId);
    const definitionSequence = numero(d.definitionSequence);
    if (menuItemId === null || definitionSequence === null) {
      throw new ErroreIntegrazione("INVALID_CONFIGURATION", `«${r.nome}»: la mappatura non indica menuItemId e definitionSequence`);
    }
    if (d.condimentiObbligatori === true) {
      // `CondimentGroupRule.minimumCount` ≥ 1: Foodtech non mappa ancora i condimenti.
      throw new ErroreIntegrazione("NOT_SUPPORTED", `«${r.nome}»: su Simphony richiede condimenti obbligatori, che Foodtech non invia ancora`);
    }
    if (r.note && r.note.length > 20) {
      throw new ErroreIntegrazione("NOT_SUPPORTED", `«${r.nome}»: la nota supera i 20 caratteri che Simphony accetta (referenceText)`);
    }
    return {
      menuItemId,
      definitionSequence,
      quantity: r.quantita,
      ...(r.note ? { referenceText: r.note } : {}),
      ...(riferimentoRound ? { extensions: [estensione(riferimentoRound)] } : {}),
    };
  });
}

function intestazione(c: ContestoCheck, o: OrdineDaInviare, id: string) {
  return {
    orgShortName: c.orgShortName,
    locRef: c.locRef,
    rvcRef: c.rvcRef,
    idempotencyId: id,
    checkEmployeeRef: c.dipendente,
    orderTypeRef: c.tipoOrdine,
    ...(o.tavoloExternalId ? { tableName: o.tavoloExternalId } : {}),
    ...(o.coperti ? { guestCount: o.coperti } : {}),
  };
}

/** `POST /checks`: un check nuovo, con la prima comanda. */
export function corpoCheck(c: ContestoCheck, o: OrdineDaInviare, idempotenza: string) {
  return {
    header: intestazione(c, o, idempotenza),
    menuItems: righeCheck(o, null),
    extensions: [estensione(o.riferimento)],
  };
}

/** `POST /checks/{checkRef}/round`: una comanda in più sullo stesso check. */
export function corpoRound(c: ContestoCheck, checkRef: string, o: OrdineDaInviare, idempotenza: string) {
  return {
    header: { ...intestazione(c, o, idempotenza), checkRef },
    menuItems: righeCheck(o, o.riferimento),
  };
}

/** `POST /checks/{checkRef}/round` con soli tender: un pagamento. */
export function corpoPagamento(
  c: ContestoCheck,
  checkRef: string,
  p: { tenderId: number; importoCents: number; idempotenza: string; marca: string },
) {
  return {
    header: {
      orgShortName: c.orgShortName,
      locRef: c.locRef,
      rvcRef: c.rvcRef,
      idempotencyId: p.idempotenza,
      checkEmployeeRef: c.dipendente,
      orderTypeRef: c.tipoOrdine,
      checkRef,
    },
    // `total: 0` vorrebbe dire «tutto il dovuto»: un importo esplicito, sempre.
    // CheckTenderItem ha `extensions[]`: lì la marca con cui riconosciamo un pagamento già applicato.
    tenders: [{ tenderId: p.tenderId, total: Math.round(p.importoCents) / 100, extensions: [estensione(p.marca)] }],
  };
}

export function totali(v: unknown): TotaliEsterni {
  const t = oggetto(v);
  return {
    subtotaleCents: centesimi(t.subtotal),
    scontiCents: centesimi(t.subtotalDiscountTotal),
    serviziCents:
      t.serviceChargeTotal === undefined && t.autoServiceChargeTotal === undefined
        ? null
        : (centesimi(t.serviceChargeTotal) ?? 0) + (centesimi(t.autoServiceChargeTotal) ?? 0),
    tasseCents: centesimi(t.taxTotal),
    pagatoCents: centesimi(t.paymentTotal),
    daPagareCents: centesimi(t.totalDue),
  };
}

export type CheckLetto = {
  checkRef: string;
  numero: number | null;
  aperto: boolean;
  preparazione: string | null;
  tavolo: string | null;
  riferimento: string | null;
  riferimentiRound: Set<string>;
  riferimentiTender: Set<string>;
  totali: TotaliEsterni;
  righe: { nome: string; quantita: number; totaleCents: number | null }[];
  tender: { tenderId: string; nome: string; importoCents: number | null }[];
  daCache: boolean;
};

export function check(corpo: unknown): CheckLetto {
  const c = oggetto(corpo);
  const h = oggetto(c.header);
  const checkRef = testo(h.checkRef);
  if (!checkRef) throw new ErroreIntegrazione("UNKNOWN", "Risposta inattesa da Simphony: il check non ha checkRef");
  const righe = lista(c.menuItems);
  return {
    checkRef,
    numero: numero(h.checkNumber),
    aperto: h.status !== "closed",
    preparazione: testo(h.preparationStatus),
    tavolo: testo(h.tableName),
    riferimento: riferimentoIn(c.extensions),
    riferimentiRound: new Set(righe.map((r) => riferimentoIn(r.extensions)).filter((x): x is string => !!x)),
    riferimentiTender: new Set(lista(c.tenders).map((t) => riferimentoIn(t.extensions)).filter((x): x is string => !!x)),
    totali: totali(c.totals),
    righe: righe.map((r) => ({ nome: testo(r.name) ?? `Voce ${r.menuItemId}`, quantita: numero(r.quantity) ?? 1, totaleCents: centesimi(r.total) })),
    tender: lista(c.tenders).map((t) => ({ tenderId: testo(t.tenderId) ?? "", nome: testo(t.name) ?? "", importoCents: centesimi(t.total) })),
    daCache: h.isCachedResponse === true,
  };
}

export function checks(corpo: unknown): CheckLetto[] {
  const c = oggetto(corpo);
  if (!Array.isArray(c.items)) throw new ErroreIntegrazione("UNKNOWN", "Risposta inattesa da Simphony: l'elenco dei check non ha items");
  return c.items.map(check);
}

export function ordineDaCheck(k: CheckLetto): OrdineEsterno {
  return {
    externalId: k.checkRef,
    riferimento: k.riferimento,
    stato: statoCheck(k),
    tavolo: k.tavolo,
    totaleCents:
      k.totali.daPagareCents !== null && k.totali.pagatoCents !== null ? k.totali.daPagareCents + k.totali.pagatoCents : null,
    righe: k.righe.map((r) => ({ codiceProdotto: "", nome: r.nome, quantita: r.quantita, prezzoUnitarioCents: null, note: null })),
    totali: k.totali,
  };
}

/** `status` closed = «paid in full … cannot be modified». Aperto: dice la preparazione. */
export function statoCheck(k: Pick<CheckLetto, "aperto" | "preparazione">): StatoOrdineEsterno {
  if (!k.aperto) return "CLOSED";
  return statoPreparazione(k.preparazione);
}

export function statoPreparazione(p: string | null): StatoOrdineEsterno {
  switch (p) {
    case "Submitted":
      return "IN_PROGRESS";
    case "Prepared":
    case "AllPrepared":
    case "Packaged":
      return "READY";
    case "Uninitialized":
      return "ACCEPTED";
    default:
      return "UNKNOWN";
  }
}

export function pagamentiDi(k: CheckLetto): PagamentoEsterno[] {
  return k.tender.map((t, n) => ({
    externalId: `${k.checkRef}:${n}`,
    riferimento: k.riferimento,
    importoCents: t.importoCents,
    mancia: null,
    metodo: t.nome || t.tenderId,
    riuscito: true,
  }));
}

/* -------------------------------------------------------------------------- */
/*  Notifiche                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * `Digest`: Base64 dell'HMAC-SHA256 del corpo **codificato ASCII**, con la
 * chiave registrata decodificata da Base64; `Key-Id`: la chiave usata.
 * L'ASCII di .NET sostituisce i caratteri non ASCII con «?»: se il corpo ne
 * contiene, si prova anche quella forma. DA VERIFICARE con una notifica vera.
 */
export function firmaValida(corpo: string, digest: string | null, chiaveBase64: string): boolean {
  if (!digest || !chiaveBase64) return false;
  const chiave = Buffer.from(chiaveBase64, "base64");
  const atteso = Buffer.from(digest.trim(), "base64");
  const prova = (testoCorpo: Buffer) => {
    const h = createHmac("sha256", chiave).update(testoCorpo).digest();
    return h.length === atteso.length && timingSafeEqual(h, atteso);
  };
  if (prova(Buffer.from(corpo, "utf8"))) return true;
  return /[^\x00-\x7f]/.test(corpo) && prova(Buffer.from(corpo.replace(/[^\x00-\x7f]/g, "?"), "ascii"));
}

const RISORSA_CONFIGURAZIONE: Record<string, "menu" | "tax_rates" | "payment_methods"> = {
  Menus: "menu",
  MenuItemAvailability: "menu",
  Discounts: "menu",
  ServiceCharges: "menu",
  Barcodes: "menu",
  Taxes: "tax_rates",
  TenderItems: "payment_methods",
};

export function leggiNotifica(corpo: unknown): { idEvento: string; tipo: string; evento: EventoNormalizzato; sede: string | null } {
  const messaggi = lista(oggetto(corpo).messages);
  if (!messaggi.length) throw new ErroreIntegrazione("VALIDATION", "Notifica Simphony senza messages");
  const eventi: EventoNormalizzato[] = [];
  const sedi = new Set<string>();
  const ids: string[] = [];
  for (const m of messaggi) {
    const id = testo(m.id);
    if (!id) throw new ErroreIntegrazione("VALIDATION", "Messaggio Simphony senza id");
    ids.push(id);
    const tipo = testo(oggetto(m.messageType).id) ?? "";
    const r = oggetto(m.resource);
    const d = oggetto(m.data);
    if (testo(r.locRef) && testo(r.rvcRef)) sedi.add(destinazione(String(r.locRef), String(r.rvcRef)));
    if (tipo === "CheckNotification") {
      const stato = testo(d.status);
      eventi.push({
        tipo: "pos.order.status",
        riferimento: null,
        externalId: testo(r.checkRef),
        stato: statoPreparazione(stato),
        motivo: null,
        preparazione: stato,
      });
    } else if (tipo === "ConfigurationNotification") {
      const risorsa = RISORSA_CONFIGURAZIONE[String(d.ResourceType)];
      eventi.push(risorsa ? { tipo: "catalogo.cambiato", risorsa, externalId: null } : { tipo: "sconosciuto", tipoOriginale: `${tipo}/${d.ResourceType}` });
    } else if (tipo === "OrganizationsNotification") {
      // Cambia ciò che restituisce l'Organization API: tavoli e tipi d'ordine del revenue center.
      eventi.push({ tipo: "catalogo.cambiato", risorsa: "tables", externalId: null });
    } else {
      // EmployeesNotification: Foodtech non importa il personale di Simphony.
      eventi.push({ tipo: "sconosciuto", tipoOriginale: tipo || "senza tipo" });
    }
  }
  const idEvento = ids.length === 1 ? ids[0]! : createHash("sha256").update([...ids].sort().join(",")).digest("hex");
  return {
    idEvento,
    tipo: messaggi.length === 1 ? testo(oggetto(messaggi[0]!.messageType).id) ?? "sconosciuto" : "lotto",
    evento: eventi.length === 1 ? eventi[0]! : { tipo: "multipli", eventi },
    // Un lotto con messaggi di sedi diverse non si attribuisce a una sede sola.
    sede: sedi.size === 1 ? [...sedi][0]! : null,
  };
}
