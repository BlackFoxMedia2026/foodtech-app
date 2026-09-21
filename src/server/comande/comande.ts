import { Prisma, type ComandaStatus, type ComandaRigaStatus } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { ALLERGENI } from "@/server/menu";
import { recordAudit, type AuditActor } from "@/server/audit";
import { avvisaPiattiPronti, avvisaPresaInCarico } from "@/server/staff-app/notifiche";
import { fornitorePerLocale, type ComandaDaInviare } from "./fornitore";

/**
 * **Il dominio della comanda.**
 *
 * Una comanda è una tranche di piatti che va in cucina. Vive **dentro** un
 * `Order` — il conto del tavolo — e in una serata ne partono quattro o cinque
 * dallo stesso tavolo. Il perché di questa forma sta nel commento di `Comanda`
 * in `schema.prisma`; qui stanno le regole.
 *
 * ## Le cinque regole
 *
 * 1. **Una bozza sola per conto.** Due camerieri sullo stesso tavolo devono
 *    ritrovarsi nella stessa comanda in corso, come già succede per il conto
 *    (`openOrderForBooking`). Altrimenti a fine serata ci sono due fogli e la
 *    cucina ne ha visto uno.
 * 2. **Il prezzo si fotografa quando si ordina.** Nome e prezzo si copiano
 *    dal menu in quel momento, e gli extra a pagamento entrano subito in
 *    `OrderItem.priceCents` — così il totale del conto, il food cost e il
 *    conto diviso continuano a tornare senza sapere che esistono i
 *    modificatori.
 * 3. **Inviare non si fa due volte.** L'idempotenza è nel database
 *    (`Comanda.invioKey`, unico), non in un controllo applicativo che due
 *    richieste in parallelo si scambierebbero senza vedersi.
 * 4. **Una comanda in preparazione non si modifica in silenzio.** Si può, ma
 *    chi lo fa deve dichiararlo, e la cucina lo viene a sapere.
 * 5. **Il totale si ricalcola dalle righe**, dentro la stessa transazione che
 *    le cambia. Vale la stessa regola di `server/orders.ts`, ed è la sua
 *    funzione che si riusa.
 */

/* -------------------------------------------------------------------------- */
/*  Errori                                                                    */
/* -------------------------------------------------------------------------- */

export class ComandaError extends Error {
  constructor(
    readonly code:
      | "not_found"
      | "already_closed"
      | "not_available"
      | "empty_comanda"
      | "gia_inviata"
      | "modifica_da_confermare"
      | "transizione_non_valida"
      | "allergene_sconosciuto",
    readonly detail?: unknown,
  ) {
    super(code);
    this.name = "ComandaError";
  }
}

/** Il messaggio che si legge in sala. Uno per codice, senza gergo. */
export const MESSAGGIO_COMANDA: Record<ComandaError["code"], string> = {
  not_found: "Questa comanda non esiste più.",
  already_closed: "Il conto di questo tavolo è già chiuso.",
  not_available: "Questo piatto è finito: la cucina l'ha segnato non disponibile.",
  empty_comanda: "Non c'è niente da inviare: aggiungi almeno un piatto.",
  gia_inviata: "Questa comanda è già partita.",
  modifica_da_confermare: "Questa comanda è già in cucina: conferma per farlo sapere alla brigata.",
  transizione_non_valida: "Questo passaggio di stato non è possibile.",
  allergene_sconosciuto: "Allergene non riconosciuto.",
};

/* -------------------------------------------------------------------------- */
/*  Le transizioni ammesse                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Da dove si può andare dove.
 *
 * Scritta come tabella e non come catena di `if` perché è l'unica cosa che
 * impedisce a due schermate — la sala e la futura cucina — di raccontare due
 * storie diverse dello stesso foglio. `ANNULLATA` è raggiungibile da quasi
 * tutto: un tavolo che si alza a metà cena succede.
 *
 * `SERVITA` non torna indietro: un piatto uscito dalla cucina e messo in
 * tavola è un fatto, e disfarlo vorrebbe dire che lo storico del tavolo non
 * si può leggere.
 */
export const TRANSIZIONI: Record<ComandaStatus, ComandaStatus[]> = {
  BOZZA: ["INVIATA", "ANNULLATA"],
  INVIATA: ["RICEVUTA", "IN_PREPARAZIONE", "PRONTA", "ANNULLATA"],
  RICEVUTA: ["IN_PREPARAZIONE", "PRONTA", "ANNULLATA"],
  IN_PREPARAZIONE: ["PRONTA", "ANNULLATA"],
  PRONTA: ["SERVITA", "IN_PREPARAZIONE", "ANNULLATA"],
  SERVITA: [],
  ANNULLATA: [],
};

export function transizionePossibile(da: ComandaStatus, a: ComandaStatus): boolean {
  return TRANSIZIONI[da].includes(a);
}

/** Gli stati in cui la comanda è **già in mano alla cucina**. */
export const IN_CUCINA: ComandaStatus[] = ["INVIATA", "RICEVUTA", "IN_PREPARAZIONE"];

/** Gli stati che si vedono nella schermata Comande: tutto quello che è vivo. */
export const VIVE: ComandaStatus[] = ["INVIATA", "RICEVUTA", "IN_PREPARAZIONE", "PRONTA"];

/** La riga segue la comanda, ma non ha `RICEVUTA`: la presa in carico è del foglio. */
const RIGA_PER_COMANDA: Partial<Record<ComandaStatus, ComandaRigaStatus>> = {
  INVIATA: "INVIATA",
  RICEVUTA: "INVIATA",
  IN_PREPARAZIONE: "IN_PREPARAZIONE",
  PRONTA: "PRONTA",
  SERVITA: "SERVITA",
  ANNULLATA: "ANNULLATA",
};

/* -------------------------------------------------------------------------- */
/*  Come viaggia verso l'interfaccia                                          */
/* -------------------------------------------------------------------------- */

export type ModificaView = {
  id: string;
  kind: Prisma.OrderItemModificaGetPayload<object>["kind"];
  label: string;
  priceCents: number;
};

export type RigaComandaView = {
  id: string;
  menuItemId: string | null;
  nome: string;
  quantita: number;
  /** Prezzo unitario **con** gli extra già dentro. */
  priceCents: number;
  totalCents: number;
  note: string | null;
  status: ComandaRigaStatus;
  allergeni: string[];
  notaAllergia: string | null;
  ospiteId: string | null;
  ospiteLabel: string | null;
  modifiche: ModificaView[];
  readyAt: string | null;
  servedAt: string | null;
};

export type ComandaView = {
  id: string;
  numero: number;
  status: ComandaStatus;
  nota: string | null;
  righe: RigaComandaView[];
  /** Quanti pezzi, non quante righe: «6 articoli» è la somma delle quantità. */
  articoli: number;
  totalCents: number;
  createdAt: string;
  sentAt: string | null;
  acknowledgedAt: string | null;
  readyAt: string | null;
  servedAt: string | null;
  camerieraId: string | null;
  cameriere: string | null;
  /** Vero finché si può aggiungere o togliere senza avvisare nessuno. */
  modificabile: boolean;
  /** Vero se per modificarla bisogna dichiararlo: è già in cucina. */
  richiedeConferma: boolean;
};

export type OspiteView = { id: string; ordering: number; label: string };

const INCLUDE_COMANDA = {
  righe: {
    orderBy: [{ ospite: { ordering: "asc" } }, { id: "asc" }],
    include: { modifiche: { orderBy: { ordering: "asc" } }, ospite: true },
  },
  waiter: { select: { firstName: true, lastName: true } },
} satisfies Prisma.ComandaInclude;

type ComandaCompleta = Prisma.ComandaGetPayload<{ include: typeof INCLUDE_COMANDA }>;

function vistaComanda(c: ComandaCompleta): ComandaView {
  const righe: RigaComandaView[] = c.righe.map((r) => ({
    id: r.id,
    menuItemId: r.menuItemId,
    nome: r.name,
    quantita: r.quantity,
    priceCents: r.priceCents,
    totalCents: r.priceCents * r.quantity,
    note: r.notes,
    status: r.status,
    allergeni: r.allergens,
    notaAllergia: r.allergyNote,
    ospiteId: r.orderGuestId,
    ospiteLabel: r.ospite?.label ?? null,
    modifiche: r.modifiche.map((m) => ({
      id: m.id,
      kind: m.kind,
      label: m.label,
      priceCents: m.priceCents,
    })),
    readyAt: r.readyAt?.toISOString() ?? null,
    servedAt: r.servedAt?.toISOString() ?? null,
  }));

  return {
    id: c.id,
    numero: c.numero,
    status: c.status,
    nota: c.nota,
    righe,
    articoli: righe.reduce((s, r) => s + r.quantita, 0),
    totalCents: righe.reduce((s, r) => s + r.totalCents, 0),
    createdAt: c.createdAt.toISOString(),
    sentAt: c.sentAt?.toISOString() ?? null,
    acknowledgedAt: c.acknowledgedAt?.toISOString() ?? null,
    readyAt: c.readyAt?.toISOString() ?? null,
    servedAt: c.servedAt?.toISOString() ?? null,
    camerieraId: c.waiterId,
    cameriere: c.waiter ? `${c.waiter.firstName} ${c.waiter.lastName}`.trim() : null,
    modificabile: c.status === "BOZZA",
    richiedeConferma: IN_CUCINA.includes(c.status),
  };
}

/* -------------------------------------------------------------------------- */
/*  Il totale del conto                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Ricalcola `Order.totalCents` dalle righe, dentro la transazione che le ha
 * cambiate. Copiata da `server/orders.ts` e non importata perché là è privata:
 * il giorno in cui una delle due cambi, questa riga di commento è il posto in
 * cui si scopre che sono due.
 *
 * Le righe annullate non contano: un piatto tolto prima di uscire dalla
 * cucina non si paga.
 */
async function ricalcolaConto(tx: Prisma.TransactionClient, orderId: string): Promise<number> {
  const righe = await tx.orderItem.findMany({
    where: { orderId, NOT: { status: "ANNULLATA" } },
    select: { priceCents: true, quantity: true },
  });
  const totale = righe.reduce((s, r) => s + r.priceCents * r.quantity, 0);
  await tx.order.update({ where: { id: orderId }, data: { totalCents: totale } });
  return totale;
}

/* -------------------------------------------------------------------------- */
/*  Lettura                                                                   */
/* -------------------------------------------------------------------------- */

export async function comandeDelConto(venueId: string, orderId: string): Promise<ComandaView[]> {
  const righe = await db.comanda.findMany({
    where: { venueId, orderId },
    orderBy: { numero: "asc" },
    include: INCLUDE_COMANDA,
  });
  return righe.map(vistaComanda);
}

export async function getComanda(venueId: string, comandaId: string): Promise<ComandaView | null> {
  const c = await db.comanda.findFirst({
    where: { id: comandaId, venueId },
    include: INCLUDE_COMANDA,
  });
  return c ? vistaComanda(c) : null;
}

async function comandaOEccezione(
  tx: Prisma.TransactionClient,
  venueId: string,
  comandaId: string,
) {
  const c = await tx.comanda.findFirst({ where: { id: comandaId, venueId } });
  if (!c) throw new ComandaError("not_found");
  return c;
}

/* -------------------------------------------------------------------------- */
/*  I commensali                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Crea i commensali mancanti per arrivare a `coperti`, e li restituisce tutti.
 *
 * Non ne toglie mai. Se il tavolo era di quattro e due se ne vanno, i piatti
 * già assegnati a «Ospite 4» resterebbero senza destinatario; e soprattutto un
 * commensale rinominato «Laura» sparirebbe perché qualcuno ha corretto i
 * coperti. Chi ne ha uno di troppo lo ignora: costa uno scorrimento, non un
 * dato perso.
 */
export async function assicuraOspiti(orderId: string, coperti: number): Promise<OspiteView[]> {
  const quanti = Math.max(0, Math.min(40, Math.floor(coperti)));
  const esistenti = await db.orderGuest.findMany({
    where: { orderId },
    orderBy: { ordering: "asc" },
  });
  if (esistenti.length >= quanti) {
    return esistenti.map((o) => ({ id: o.id, ordering: o.ordering, label: o.label }));
  }

  const daCreare = [];
  for (let i = esistenti.length + 1; i <= quanti; i += 1) {
    daCreare.push({ orderId, ordering: i, label: `Ospite ${i}` });
  }
  // `skipDuplicates`: due camerieri che aprono lo stesso tavolo nello stesso
  // istante arrivano entrambi qui, e il secondo non deve vedere un errore.
  await db.orderGuest.createMany({ data: daCreare, skipDuplicates: true });

  const tutti = await db.orderGuest.findMany({ where: { orderId }, orderBy: { ordering: "asc" } });
  return tutti.map((o) => ({ id: o.id, ordering: o.ordering, label: o.label }));
}

export const RinominaOspiteInput = z.object({ label: z.string().trim().min(1).max(60) });

export async function rinominaOspite(
  venueId: string,
  ospiteId: string,
  raw: unknown,
  opts: { actor?: AuditActor } = {},
): Promise<OspiteView> {
  const { label } = RinominaOspiteInput.parse(raw);
  const ospite = await db.orderGuest.findFirst({
    where: { id: ospiteId, order: { venueId } },
  });
  if (!ospite) throw new ComandaError("not_found");

  const aggiornato = await db.orderGuest.update({ where: { id: ospiteId }, data: { label } });
  await recordAudit(opts.actor, "comanda.guest_rename", "order", ospite.orderId, {
    ospite: ospiteId,
    da: ospite.label,
    a: label,
  });
  return { id: aggiornato.id, ordering: aggiornato.ordering, label: aggiornato.label };
}

/* -------------------------------------------------------------------------- */
/*  La bozza                                                                  */
/* -------------------------------------------------------------------------- */

/** Gli stati in cui il conto accetta ancora righe. Come in `server/orders.ts`. */
const CONTI_APERTI = ["RECEIVED", "PREPARING", "READY"] as const;

/**
 * La comanda in bozza di questo conto: quella esistente, o una nuova.
 *
 * È il «+ Aggiungi ordine» del §9, ed è **idempotente per costruzione**: due
 * camerieri che lo premono insieme finiscono nella stessa bozza. Il vincolo
 * unico `(orderId, numero)` regge la corsa; il ciclo riprova col numero dopo,
 * come fa `riferimentoDelGiorno` per il conto.
 */
export async function bozzaDelConto(
  venueId: string,
  orderId: string,
  opts: { waiterId?: string | null } = {},
): Promise<ComandaView> {
  const conto = await db.order.findFirst({
    where: { id: orderId, venueId },
    select: { id: true, status: true, bookingId: true, booking: { select: { tableId: true } } },
  });
  if (!conto) throw new ComandaError("not_found");
  if (!(CONTI_APERTI as readonly string[]).includes(conto.status)) {
    throw new ComandaError("already_closed");
  }

  const esistente = await db.comanda.findFirst({
    where: { venueId, orderId, status: "BOZZA" },
    orderBy: { numero: "asc" },
    include: INCLUDE_COMANDA,
  });
  if (esistente) return vistaComanda(esistente);

  const massimo = await db.comanda.aggregate({ where: { orderId }, _max: { numero: true } });
  let numero = (massimo._max.numero ?? 0) + 1;

  for (;;) {
    try {
      const creata = await db.comanda.create({
        data: {
          venueId,
          orderId,
          numero,
          bookingId: conto.bookingId,
          tableId: conto.booking?.tableId ?? null,
          waiterId: opts.waiterId ?? null,
          status: "BOZZA",
          eventi: { create: { a: "BOZZA", waiterId: opts.waiterId ?? null } },
        },
        include: INCLUDE_COMANDA,
      });
      return vistaComanda(creata);
    } catch (err) {
      const occupato =
        err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
      if (!occupato || numero > (massimo._max.numero ?? 0) + 50) throw err;
      /* Qualcuno è arrivato un istante prima: la sua bozza è quella buona. */
      const altrui = await db.comanda.findFirst({
        where: { venueId, orderId, status: "BOZZA" },
        include: INCLUDE_COMANDA,
      });
      if (altrui) return vistaComanda(altrui);
      numero += 1;
    }
  }
}

/* -------------------------------------------------------------------------- */
/*  Le righe                                                                  */
/* -------------------------------------------------------------------------- */

const ModificaInput = z.object({
  kind: z.enum(["VARIANTE", "SENZA", "EXTRA", "COTTURA", "PORZIONE"]),
  label: z.string().trim().min(1).max(80),
  priceCents: z.coerce.number().int().min(0).max(100_00).default(0),
});

export const RigaInput = z.object({
  /** Un piatto in carta, oppure un nome libero per il fuori carta. */
  menuItemId: z.string().min(1).optional(),
  name: z.string().trim().min(1).max(120).optional(),
  priceCents: z.coerce.number().int().min(0).max(1_000_00).optional(),
  quantity: z.coerce.number().int().min(1).max(99).default(1),
  notes: z.string().trim().max(200).optional().nullable(),
  orderGuestId: z.string().min(1).optional().nullable(),
  modifiche: z.array(ModificaInput).max(20).default([]),
  allergeni: z.array(z.string().trim().min(1).max(40)).max(14).default([]),
  notaAllergia: z.string().trim().max(300).optional().nullable(),
  /** Obbligatorio quando la comanda è già in cucina: vedi la regola 4. */
  confermaModifica: z.boolean().optional(),
});

export type RigaPayload = z.infer<typeof RigaInput>;

/**
 * Gli allergeni si validano contro l'elenco chiuso dei quattordici: su questo
 * non si improvvisa, e una stringa libera in questo campo vorrebbe dire che la
 * cucina legge un codice che non sa tradurre. Le note di allergia, quelle sì,
 * sono testo libero — «allergia grave alle arachidi» non sta in un enum.
 */
function validaAllergeni(codici: string[]): string[] {
  const puliti = [...new Set(codici.map((c) => c.trim().toLowerCase()))];
  for (const c of puliti) {
    if (!(c in ALLERGENI)) throw new ComandaError("allergene_sconosciuto", { codice: c });
  }
  return puliti;
}

/** Il prezzo unitario con gli extra dentro. Vedi la regola 2. */
function prezzoConExtra(base: number, modifiche: { priceCents: number }[]): number {
  return base + modifiche.reduce((s, m) => s + m.priceCents, 0);
}

/**
 * Una comanda già in cucina si può ancora toccare, ma non in silenzio.
 *
 * Il §24 chiede una conferma esplicita e un avviso alla brigata. Qui c'è
 * l'errore che l'interfaccia intercetta per mostrare la conferma; l'avviso lo
 * manda chi chiama, dopo (`notificaModificaComanda`).
 */
function verificaModificabile(status: ComandaStatus, conferma: boolean | undefined) {
  if (status === "BOZZA") return { avvisaCucina: false };
  if (status === "SERVITA" || status === "ANNULLATA") throw new ComandaError("gia_inviata");
  if (!conferma) throw new ComandaError("modifica_da_confermare");
  return { avvisaCucina: true };
}

export async function aggiungiRiga(
  venueId: string,
  comandaId: string,
  raw: unknown,
  opts: { actor?: AuditActor } = {},
): Promise<{ comanda: ComandaView; avvisaCucina: boolean }> {
  const data = RigaInput.parse(raw);
  const allergeni = validaAllergeni(data.allergeni);

  const esito = await db.$transaction(async (tx) => {
    const comanda = await comandaOEccezione(tx, venueId, comandaId);
    const { avvisaCucina } = verificaModificabile(comanda.status, data.confermaModifica);

    let name = data.name?.trim() ?? "";
    let base = data.priceCents ?? 0;
    let menuItemId: string | null = null;

    if (data.menuItemId) {
      const piatto = await tx.menuItem.findFirst({ where: { id: data.menuItemId, venueId } });
      if (!piatto) throw new ComandaError("not_found");
      if (!piatto.available) throw new ComandaError("not_available");
      menuItemId = piatto.id;
      name = piatto.name;
      base = piatto.priceCents;
    } else if (!name) {
      throw new ComandaError("not_found");
    }

    if (data.orderGuestId) {
      const ospite = await tx.orderGuest.findFirst({
        where: { id: data.orderGuestId, orderId: comanda.orderId },
      });
      if (!ospite) throw new ComandaError("not_found");
    }

    /* Una riga aggiunta a una comanda già partita nasce già «inviata»: è
       partita adesso, insieme all'avviso alla cucina. Nasce «bozza» solo se
       la comanda è ancora in bozza. */
    const statoRiga: ComandaRigaStatus =
      comanda.status === "BOZZA" ? "BOZZA" : (RIGA_PER_COMANDA[comanda.status] ?? "INVIATA");

    /*
      **Due tap sullo stesso piatto fanno «2 ×», non due righe.**

      Vale solo per le righe **identiche e semplici**: stesso piatto, stesso
      commensale, nessuna variazione, nessuna nota, nessuna allergia, e
      ancora in bozza. Due carbonare uguali sono due carbonare; una al sangue
      e una ben cotta sono due righe, e vanno tenute separate perché in cucina
      sono due piatti diversi.

      Senza questo, il gesto più frequente del servizio — il «+» premuto tre
      volte per tre acque — produceva tre righe uguali da scorrere nel
      riepilogo, e il §11 chiede esplicitamente la quantità.
    */
    const semplice =
      menuItemId !== null &&
      data.modifiche.length === 0 &&
      !data.notes &&
      allergeni.length === 0 &&
      !data.notaAllergia;

    if (semplice && comanda.status === "BOZZA") {
      const gemella = await tx.orderItem.findFirst({
        where: {
          comandaId,
          menuItemId,
          orderGuestId: data.orderGuestId ?? null,
          status: "BOZZA",
          notes: null,
          allergyNote: null,
          allergens: { isEmpty: true },
          modifiche: { none: {} },
        },
        orderBy: { id: "asc" },
      });

      if (gemella) {
        await tx.orderItem.update({
          where: { id: gemella.id },
          data: { quantity: Math.min(99, gemella.quantity + data.quantity) },
        });
        await ricalcolaConto(tx, comanda.orderId);
        const aggiornata = await tx.comanda.findFirstOrThrow({
          where: { id: comandaId },
          include: INCLUDE_COMANDA,
        });
        return { comanda: vistaComanda(aggiornata), avvisaCucina };
      }
    }

    await tx.orderItem.create({
      data: {
        orderId: comanda.orderId,
        comandaId,
        menuItemId,
        name,
        priceCents: prezzoConExtra(base, data.modifiche),
        quantity: data.quantity,
        notes: data.notes ?? null,
        orderGuestId: data.orderGuestId ?? null,
        status: statoRiga,
        allergens: allergeni,
        allergyNote: data.notaAllergia ?? null,
        sentAt: statoRiga === "BOZZA" ? null : new Date(),
        modifiche: {
          create: data.modifiche.map((m, i) => ({
            kind: m.kind,
            label: m.label,
            priceCents: m.priceCents,
            ordering: i,
          })),
        },
      },
    });

    await ricalcolaConto(tx, comanda.orderId);
    const finale = await tx.comanda.findFirstOrThrow({
      where: { id: comandaId },
      include: INCLUDE_COMANDA,
    });
    return { comanda: vistaComanda(finale), avvisaCucina };
  });

  await recordAudit(opts.actor, "comanda.line_add", "comanda", comandaId, {
    piatto: data.menuItemId ?? data.name,
    quantita: data.quantity,
    allergeni,
    aCucinaGiaAperta: esito.avvisaCucina,
  });
  return esito;
}

export const AggiornaRigaInput = RigaInput.partial().extend({
  quantity: z.coerce.number().int().min(0).max(99).optional(),
});

/**
 * Cambia una riga: quantità, note, variazioni, ospite, allergie.
 *
 * A quantità zero la riga **si toglie**, com'è già per il conto
 * (`setLineQuantity`): è il gesto che il cameriere fa con il meno finché non
 * sparisce, e chiedergli di cercare un cestino dopo averlo premuto tre volte
 * sarebbe un passaggio in più durante il servizio.
 */
export async function aggiornaRiga(
  venueId: string,
  comandaId: string,
  rigaId: string,
  raw: unknown,
  opts: { actor?: AuditActor } = {},
): Promise<{ comanda: ComandaView; avvisaCucina: boolean }> {
  const data = AggiornaRigaInput.parse(raw);
  const allergeni = data.allergeni ? validaAllergeni(data.allergeni) : undefined;

  const esito = await db.$transaction(async (tx) => {
    const comanda = await comandaOEccezione(tx, venueId, comandaId);
    const { avvisaCucina } = verificaModificabile(comanda.status, data.confermaModifica);

    const riga = await tx.orderItem.findFirst({
      where: { id: rigaId, comandaId },
      include: { modifiche: true },
    });
    if (!riga) throw new ComandaError("not_found");

    if (data.quantity === 0) {
      /* Una riga già partita non si cancella: si annulla, e resta a
         raccontare che era stata ordinata. In bozza invece sparisce — non è
         mai esistita per nessuno fuori da questo telefono. */
      if (comanda.status === "BOZZA") {
        await tx.orderItem.delete({ where: { id: rigaId } });
      } else {
        await tx.orderItem.update({
          where: { id: rigaId },
          data: { status: "ANNULLATA", quantity: riga.quantity },
        });
      }
    } else {
      const modifiche = data.modifiche;
      if (modifiche) {
        await tx.orderItemModifica.deleteMany({ where: { orderItemId: rigaId } });
        await tx.orderItemModifica.createMany({
          data: modifiche.map((m, i) => ({
            orderItemId: rigaId,
            kind: m.kind,
            label: m.label,
            priceCents: m.priceCents,
            ordering: i,
          })),
        });
      }

      /* Il prezzo si ricompone solo se cambiano le variazioni: il prezzo base
         resta quello fotografato all'ordine, anche se in carta è cambiato. */
      const prezzo = modifiche
        ? prezzoConExtra(
            riga.priceCents - riga.modifiche.reduce((s, m) => s + m.priceCents, 0),
            modifiche,
          )
        : riga.priceCents;

      await tx.orderItem.update({
        where: { id: rigaId },
        data: {
          quantity: data.quantity ?? riga.quantity,
          notes: data.notes === undefined ? undefined : data.notes,
          orderGuestId: data.orderGuestId === undefined ? undefined : data.orderGuestId,
          allergens: allergeni ?? undefined,
          allergyNote: data.notaAllergia === undefined ? undefined : data.notaAllergia,
          priceCents: prezzo,
        },
      });
    }

    await ricalcolaConto(tx, comanda.orderId);
    const finale = await tx.comanda.findFirstOrThrow({
      where: { id: comandaId },
      include: INCLUDE_COMANDA,
    });
    return { comanda: vistaComanda(finale), avvisaCucina };
  });

  await recordAudit(
    opts.actor,
    data.quantity === 0 ? "comanda.line_remove" : "comanda.line_update",
    "comanda",
    comandaId,
    { riga: rigaId, quantita: data.quantity, aCucinaGiaAperta: esito.avvisaCucina },
  );
  return esito;
}

/* -------------------------------------------------------------------------- */
/*  L'invio                                                                   */
/* -------------------------------------------------------------------------- */

export const InvioInput = z.object({
  /**
   * La chiave del tentativo, generata dal client. Due tap sullo stesso
   * pulsante la mandano identica, e il secondo trova la comanda già partita.
   */
  invioKey: z.string().trim().min(8).max(64),
  nota: z.string().trim().max(500).optional().nullable(),
});

export type EsitoInvioComanda = {
  comanda: ComandaView;
  /** Vero quando questa chiamata **ha davvero** inviato. Falso al secondo tap. */
  inviataAdesso: boolean;
};

/**
 * Manda la comanda in cucina.
 *
 * Tre cose in ordine, e l'ordine conta:
 *
 * 1. si marca la comanda inviata **nel database**, con la chiave di
 *    idempotenza. Se questa scrittura fallisce perché la chiave c'è già,
 *    qualcuno ha già inviato: si restituisce quella, e non si manda niente;
 * 2. si consegna al fornitore (`server/comande/fornitore.ts`). Oggi è la
 *    cucina di Tavolo e non fa niente, perché la coda **è** questa tabella;
 * 3. se il fornitore rifiuta, si torna indietro: la comanda resta in bozza e
 *    il cameriere vede un errore su cui può ripremere.
 *
 * Il passo 1 prima del 2 è deliberato. Al contrario — chiamare il fornitore e
 * poi scrivere — una rete che cade fra i due passi lascerebbe la cucina con un
 * foglio che la sala crede ancora in bozza, e il tavolo riceverebbe tutto due
 * volte.
 */
export async function inviaComanda(
  venueId: string,
  comandaId: string,
  raw: unknown,
  opts: { waiterId?: string | null; userId?: string | null; actor?: AuditActor } = {},
): Promise<EsitoInvioComanda> {
  const data = InvioInput.parse(raw);

  /* Il secondo tap: la chiave c'è già, la comanda è partita. Non è un errore
     e non deve sembrarlo — chi guarda lo schermo vede la stessa conferma. */
  const gia = await db.comanda.findUnique({
    where: { invioKey: data.invioKey },
    include: INCLUDE_COMANDA,
  });
  if (gia) {
    if (gia.venueId !== venueId) throw new ComandaError("not_found");
    return { comanda: vistaComanda(gia), inviataAdesso: false };
  }

  const preparata = await db.$transaction(async (tx) => {
    const comanda = await comandaOEccezione(tx, venueId, comandaId);
    if (comanda.status !== "BOZZA") throw new ComandaError("gia_inviata");

    const righe = await tx.orderItem.count({ where: { comandaId, NOT: { status: "ANNULLATA" } } });
    if (righe === 0) throw new ComandaError("empty_comanda");

    const adesso = new Date();
    await tx.comanda.update({
      where: { id: comandaId },
      data: {
        status: "INVIATA",
        sentAt: adesso,
        invioKey: data.invioKey,
        nota: data.nota ?? comanda.nota,
        eventi: {
          create: { da: "BOZZA", a: "INVIATA", waiterId: opts.waiterId ?? null, userId: opts.userId ?? null },
        },
      },
    });
    await tx.orderItem.updateMany({
      where: { comandaId, status: "BOZZA" },
      data: { status: "INVIATA", sentAt: adesso },
    });

    return tx.comanda.findFirstOrThrow({
      where: { id: comandaId },
      include: {
        ...INCLUDE_COMANDA,
        table: { select: { label: true } },
        booking: { select: { partySize: true } },
      },
    });
  });

  const fornitore = await fornitorePerLocale(venueId);
  const daInviare: ComandaDaInviare = {
    comandaId: preparata.id,
    venueId,
    numero: preparata.numero,
    tavolo: preparata.table?.label ?? null,
    coperti: preparata.booking?.partySize ?? null,
    cameriere: preparata.waiter
      ? `${preparata.waiter.firstName} ${preparata.waiter.lastName}`.trim()
      : null,
    nota: preparata.nota,
    invioKey: data.invioKey,
    righe: preparata.righe
      .filter((r) => r.status !== "ANNULLATA")
      .map((r) => ({
        menuItemId: r.menuItemId,
        nome: r.name,
        quantita: r.quantity,
        modifiche: r.modifiche.map((m) => ({ kind: m.kind, label: m.label })),
        ospite: r.ospite?.label ?? null,
        note: r.notes,
        allergeni: r.allergens,
        notaAllergia: r.allergyNote,
      })),
  };

  const esito = await fornitore.invia(daInviare);

  if (!esito.ok) {
    /* Si torna in bozza e si **libera la chiave**: il cameriere deve poter
       ripremere, e con la chiave ancora attaccata il secondo tentativo
       sembrerebbe un doppione già andato a buon fine. */
    await db.comanda.update({
      where: { id: comandaId },
      data: {
        status: "BOZZA",
        sentAt: null,
        invioKey: null,
        eventi: { create: { da: "INVIATA", a: "BOZZA", nota: esito.errore.slice(0, 300) } },
      },
    });
    await db.orderItem.updateMany({
      where: { comandaId, status: "INVIATA" },
      data: { status: "BOZZA", sentAt: null },
    });
    throw new ComandaError("transizione_non_valida", { fornitore: esito.errore });
  }

  if (esito.riferimento || esito.presaInCarico) {
    await db.comanda.update({
      where: { id: comandaId },
      data: {
        fornitoreRef: esito.riferimento ?? undefined,
        ...(esito.presaInCarico ? { status: "RICEVUTA", acknowledgedAt: new Date() } : {}),
      },
    });
  }

  await recordAudit(opts.actor, "comanda.send", "comanda", comandaId, {
    numero: preparata.numero,
    articoli: daInviare.righe.reduce((s, r) => s + r.quantita, 0),
    fornitore: fornitore.kind,
  });

  const finale = await getComanda(venueId, comandaId);
  return { comanda: finale!, inviataAdesso: true };
}

/* -------------------------------------------------------------------------- */
/*  Gli stati                                                                 */
/* -------------------------------------------------------------------------- */

const ISTANTE_PER_STATO: Record<ComandaStatus, string | null> = {
  BOZZA: null,
  INVIATA: "sentAt",
  RICEVUTA: "acknowledgedAt",
  IN_PREPARAZIONE: "preparingAt",
  PRONTA: "readyAt",
  SERVITA: "servedAt",
  ANNULLATA: "cancelledAt",
};

/**
 * Sposta una comanda da uno stato all'altro, registrando chi e quando.
 *
 * Le righe seguono il foglio, **tranne quelle già annullate**: un piatto
 * tolto non torna in preparazione perché il resto della comanda va avanti.
 */
export async function cambiaStatoComanda(
  venueId: string,
  comandaId: string,
  nuovo: ComandaStatus,
  opts: { waiterId?: string | null; userId?: string | null; nota?: string; actor?: AuditActor } = {},
): Promise<ComandaView> {
  const esito = await db.$transaction(async (tx) => {
    const comanda = await comandaOEccezione(tx, venueId, comandaId);
    if (comanda.status === nuovo) {
      return tx.comanda.findFirstOrThrow({ where: { id: comandaId }, include: INCLUDE_COMANDA });
    }
    if (!transizionePossibile(comanda.status, nuovo)) {
      throw new ComandaError("transizione_non_valida", { da: comanda.status, a: nuovo });
    }

    const adesso = new Date();
    const campo = ISTANTE_PER_STATO[nuovo];

    await tx.comanda.update({
      where: { id: comandaId },
      data: {
        status: nuovo,
        ...(campo ? { [campo]: adesso } : {}),
        eventi: {
          create: {
            da: comanda.status,
            a: nuovo,
            waiterId: opts.waiterId ?? null,
            userId: opts.userId ?? null,
            nota: opts.nota?.slice(0, 300) ?? null,
          },
        },
      },
    });

    const statoRiga = RIGA_PER_COMANDA[nuovo];
    if (statoRiga) {
      await tx.orderItem.updateMany({
        where: { comandaId, NOT: { status: "ANNULLATA" } },
        data: {
          status: statoRiga,
          ...(statoRiga === "PRONTA" ? { readyAt: adesso } : {}),
          ...(statoRiga === "SERVITA" ? { servedAt: adesso } : {}),
        },
      });
    }

    if (nuovo === "ANNULLATA") await ricalcolaConto(tx, comanda.orderId);

    return tx.comanda.findFirstOrThrow({ where: { id: comandaId }, include: INCLUDE_COMANDA });
  });

  await recordAudit(
    opts.actor,
    nuovo === "ANNULLATA" ? "comanda.cancel" : "comanda.status",
    "comanda",
    comandaId,
    { a: nuovo },
  );

  /*
    L'avviso parte **dopo** la transizione, fuori dalla transazione.

    Dentro, un errore nella scrittura della notifica farebbe tornare indietro
    il cambio di stato: la cucina avrebbe segnato «pronto» e la sala vedrebbe
    ancora «in preparazione», per colpa di un avviso. `avvisa()` non solleva
    mai, ma il punto resta l'ordine: prima il fatto, poi chi lo racconta.
  */
  if (nuovo === "PRONTA" || nuovo === "RICEVUTA") {
    const c = await db.comanda.findUnique({
      where: { id: comandaId },
      select: {
        waiterId: true,
        numero: true,
        tableId: true,
        table: { select: { label: true } },
        righe: {
          where: { status: "PRONTA" },
          select: { name: true, quantity: true },
        },
      },
    });
    if (c) {
      const comune = {
        waiterId: c.waiterId,
        tavolo: c.table?.label ?? null,
        tableId: c.tableId,
      };
      if (nuovo === "PRONTA") {
        await avvisaPiattiPronti(venueId, {
          ...comune,
          comandaId,
          piatti: c.righe.map((r) => ({ nome: r.name, quantita: r.quantity })),
        });
      } else {
        await avvisaPresaInCarico(venueId, { ...comune, numero: c.numero });
      }
    }
  }

  return vistaComanda(esito);
}

/**
 * Segna servite **alcune** righe, non tutta la comanda.
 *
 * È il gesto del §20: la cucina manda fuori due piatti su quattro, il runner
 * li porta, e il cameriere segna quei due. La comanda passa a `SERVITA` solo
 * quando non resta più niente da portare — dedotto dalle righe, non
 * dichiarato, perché dichiararlo significherebbe poterlo sbagliare.
 */
export async function segnaRigheServite(
  venueId: string,
  comandaId: string,
  rigaIds: string[],
  opts: { waiterId?: string | null; userId?: string | null; actor?: AuditActor } = {},
): Promise<ComandaView> {
  const esito = await db.$transaction(async (tx) => {
    const comanda = await comandaOEccezione(tx, venueId, comandaId);
    const adesso = new Date();

    await tx.orderItem.updateMany({
      where: {
        comandaId,
        ...(rigaIds.length > 0 ? { id: { in: rigaIds } } : {}),
        NOT: { status: { in: ["ANNULLATA", "SERVITA"] } },
      },
      data: { status: "SERVITA", servedAt: adesso },
    });

    const restanti = await tx.orderItem.count({
      where: { comandaId, NOT: { status: { in: ["ANNULLATA", "SERVITA"] } } },
    });

    if (restanti === 0 && comanda.status !== "SERVITA" && comanda.status !== "ANNULLATA") {
      await tx.comanda.update({
        where: { id: comandaId },
        data: {
          status: "SERVITA",
          servedAt: adesso,
          eventi: {
            create: {
              da: comanda.status,
              a: "SERVITA",
              waiterId: opts.waiterId ?? null,
              userId: opts.userId ?? null,
            },
          },
        },
      });
    }

    return tx.comanda.findFirstOrThrow({ where: { id: comandaId }, include: INCLUDE_COMANDA });
  });

  await recordAudit(opts.actor, "comanda.status", "comanda", comandaId, {
    a: "SERVITA",
    righe: rigaIds.length || "tutte",
  });
  return vistaComanda(esito);
}

/* -------------------------------------------------------------------------- */
/*  L'elenco delle comande vive                                               */
/* -------------------------------------------------------------------------- */

export type ComandaInElenco = ComandaView & {
  tavolo: string | null;
  tableId: string | null;
};

/**
 * **Quante comande di questa persona sono pronte al passe.**
 *
 * La Home ne fa una riga di «Da fare», e per una riga non si caricano
 * sessanta comande complete con righe, modifiche e allergeni: `comandeVive`
 * serve la schermata Comande, dove quel peso si paga perché si disegna
 * tutto. Qui basta un conteggio, e lo fa il database.
 *
 * Contava anche le comande **vive** — quelle in cucina — finché la Home
 * aveva un riquadro «2 comande in corso». Quel riquadro è stato tolto: «in
 * corso» non chiede niente a nessuno, e una riga che non chiede niente in
 * cima a una schermata operativa è una riga da scorrere. Con il riquadro è
 * uscito anche il conteggio, invece di restare a fare un giro nel database
 * per un numero che nessuno legge più.
 */
export async function contaComandePronte(venueId: string, waiterId: string): Promise<number> {
  return db.comanda.count({ where: { venueId, waiterId, status: "PRONTA" } });
}

/**
 * Le comande vive del locale, per la schermata «Comande».
 *
 * `waiterId` filtra su chi le ha battute — non su chi è assegnato al tavolo.
 * È la scelta giusta per questa schermata: risponde a «cosa ho mandato io in
 * cucina», che è la domanda di chi la apre. Chi deve vedere tutta la sala ha
 * `view_all_tables` e non passa il filtro.
 */
export async function comandeVive(
  venueId: string,
  opts: { waiterId?: string | null; stati?: ComandaStatus[]; limite?: number } = {},
): Promise<ComandaInElenco[]> {
  const righe = await db.comanda.findMany({
    where: {
      venueId,
      status: { in: opts.stati ?? VIVE },
      ...(opts.waiterId ? { waiterId: opts.waiterId } : {}),
    },
    orderBy: [{ sentAt: "desc" }, { createdAt: "desc" }],
    take: Math.min(opts.limite ?? 60, 200),
    include: { ...INCLUDE_COMANDA, table: { select: { id: true, label: true } } },
  });

  return righe.map((c) => ({
    ...vistaComanda(c),
    tavolo: c.table?.label ?? null,
    tableId: c.table?.id ?? null,
  }));
}
