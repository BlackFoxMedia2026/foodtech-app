import { z } from "zod";
import { db } from "@/lib/db";
import { dateKeyInVenue } from "@/lib/venue-time";
import { deriveTableLiveStatus } from "@/lib/table-status";
import {
  riassumiComande,
  richiamoTavolo,
  statoTavoloStaff,
  TONO_STATO,
  type Richiamo,
  type StatoTavoloStaff,
  type TonoStato,
} from "@/lib/stato-tavolo-staff";
import { sommeDelConto } from "@/server/conto-tavolo";
import { openOrderForBooking } from "@/server/orders";
import { recordAudit, type AuditActor } from "@/server/audit";
import { assicuraOspiti, comandeDelConto, type ComandaView, type OspiteView } from "@/server/comande/comande";
import { copertureDelServizio, servizioCorrente, type Copertura } from "./sala";

/**
 * **Il tavolo aperto.**
 *
 * §7 del brief: toccando una card si apre una vista operativa dedicata, non un
 * riquadro minuscolo. Questo è quello che quella vista legge.
 *
 * Tutto quello che c'è dentro esisteva già in cinque posti diversi — la
 * prenotazione, il conto, le comande, i pagamenti, le assegnazioni — e la sola
 * cosa nuova è metterli in fila in **una lettura**, perché chi apre un tavolo
 * in mezzo alla sala non può aspettare cinque giri di rete.
 *
 * Non è `getProfiloTavolo`: quello è il pannello del back office e legge anche
 * lo storico dei servizi passati, il personale assegnato con le sue capacità,
 * i singoli pagamenti col metodo. Servono a chi analizza; a chi serve il tavolo
 * costano righe da scorrere e millisecondi da aspettare.
 */

export type NotaTavolo = {
  /** `ospite` viene dal CRM, `prenotazione` è la nota di questa serata. */
  origine: "ospite" | "prenotazione" | "interna";
  testo: string;
  /** Vero per le note che vanno lette prima di servire: allergie, occasioni. */
  importante: boolean;
};

export type ContoTavoloStaff = {
  orderId: string;
  totaleCents: number;
  pagatoCents: number;
  inCorsoCents: number;
  residuoCents: number;
  contoRichiestoAt: string | null;
  /** Quante righe sono state battute in tutto, comande comprese. */
  righe: number;
};

export type TavoloAperto = {
  tableId: string;
  label: string;
  posti: number;
  roomId: string | null;
  roomName: string | null;
  stato: StatoTavoloStaff;
  tono: TonoStato;
  mio: boolean;
  /**
   * **Chi segue questo tavolo**, per nome. Vuoto quando non lo segue nessuno.
   *
   * Sta nella testata del tavolo aperto perché è la prima domanda di chi
   * arriva su un tavolo che non è suo — «ce l'ha già qualcuno?» — e perché
   * senza risposta il tasto «prendo io» sarebbe un tasto che si preme al
   * buio.
   */
  coperto: Copertura[];
  /** Seduti e senza nessun cameriere assegnato: si può prendere in carico. */
  scoperto: boolean;
  servizio: string;
  /** Chi c'è adesso. Nullo su un tavolo libero. */
  seduta: {
    bookingId: string;
    ospite: string;
    coperti: number;
    startsAt: string;
    seatedAt: string | null;
    daMinuti: number | null;
    /** L'ora in cui si sono seduti, nel fuso del locale: «11:15». */
    dalle: string | null;
    status: string;
  } | null;
  conto: ContoTavoloStaff | null;
  ospiti: OspiteView[];
  comande: ComandaView[];
  /** La comanda in bozza, se ce n'è una aperta. */
  bozza: ComandaView | null;
  note: NotaTavolo[];
  /** Piatti pronti al passe su questo tavolo, in pezzi. */
  piattiPronti: number;
  /**
   * **Cosa chiede questo tavolo adesso**, calcolato con la stessa funzione
   * della dashboard e della Sala.
   *
   * Non è una ripetizione di quello che si legge scorrendo la pagina: è la
   * riga che si legge *senza* scorrere, in testata, e soprattutto è la
   * garanzia che il tavolo dica la stessa cosa in tutte e tre le schermate.
   * Un tavolo che in Home è «appena seduti» e aprendolo è «occupato» sono due
   * prodotti.
   */
  richiamo: Richiamo | null;
  /** Da quanti minuti dura la situazione corrente. Vedi `Richiamo.daMinuti`. */
  daMinutiStato: number | null;
};

export class TavoloError extends Error {
  constructor(readonly code: "not_found" | "nessuna_seduta" | "non_assegnato") {
    super(code);
    this.name = "TavoloError";
  }
}

export const MESSAGGIO_TAVOLO: Record<TavoloError["code"], string> = {
  not_found: "Questo tavolo non esiste in questo locale.",
  nessuna_seduta: "Su questo tavolo non c'è nessuno seduto: accomoda prima la prenotazione.",
  non_assegnato: "Questo tavolo non è fra i tuoi.",
};

function noteDa(opts: {
  allergie: string | null;
  preferenze: string | null;
  noteBooking: string | null;
  noteInterne: string | null;
  occasione: string | null;
}): NotaTavolo[] {
  const note: NotaTavolo[] = [];
  /* L'ordine è quello in cui vanno lette: quello che fa male prima di quello
     che fa piacere. Un'allergia sotto un «compleanno» è un'allergia che si
     legge dopo aver già portato il piatto. */
  if (opts.allergie) note.push({ origine: "ospite", testo: `Allergie: ${opts.allergie}`, importante: true });
  if (opts.occasione) note.push({ origine: "prenotazione", testo: opts.occasione, importante: true });
  if (opts.noteBooking) note.push({ origine: "prenotazione", testo: opts.noteBooking, importante: false });
  if (opts.noteInterne) note.push({ origine: "interna", testo: opts.noteInterne, importante: false });
  if (opts.preferenze) note.push({ origine: "ospite", testo: opts.preferenze, importante: false });
  return note;
}

const OCCASIONI: Record<string, string> = {
  BIRTHDAY: "Compleanno",
  ANNIVERSARY: "Anniversario",
  BUSINESS: "Cena di lavoro",
  DATE: "Cena romantica",
  CELEBRATION: "Festeggiamento",
  OTHER: "Occasione speciale",
};

export async function apriTavolo(
  ctx: { venueId: string; timezone: string; waiterId: string },
  tableId: string,
  opts: { adesso?: Date } = {},
): Promise<TavoloAperto> {
  const adesso = opts.adesso ?? new Date();
  const giorno = dateKeyInVenue(adesso, ctx.timezone);

  const tavolo = await db.table.findFirst({
    where: { id: tableId, venueId: ctx.venueId },
    select: {
      id: true,
      label: true,
      seats: true,
      active: true,
      roomId: true,
      room: { select: { id: true, name: true } },
    },
  });
  if (!tavolo) throw new TavoloError("not_found");

  const inizio = new Date(adesso);
  inizio.setHours(0, 0, 0, 0);
  const fine = new Date(adesso);
  fine.setHours(23, 59, 59, 999);

  /* Il servizio si risolve prima e una volta sola: serve sia come etichetta
     sia come chiave per leggere le assegnazioni, e chiederlo due volte
     vorrebbe dire due letture delle fasce per la stessa risposta. */
  const servizio = await servizioCorrente(ctx.venueId, ctx.timezone, adesso);

  const [prenotazioni, blocchi, coperture] = await Promise.all([
    db.booking.findMany({
      where: {
        venueId: ctx.venueId,
        tableId,
        startsAt: { gte: inizio, lte: fine },
        deletedAt: null,
        status: { notIn: ["CANCELLED"] },
      },
      orderBy: { startsAt: "asc" },
      include: {
        guest: {
          select: { firstName: true, lastName: true, allergies: true, preferences: true },
        },
      },
    }),
    db.tableBlock.findMany({
      where: { venueId: ctx.venueId, tableId, startsAt: { lte: adesso }, endsAt: { gte: adesso } },
      select: { id: true },
    }),
    copertureDelServizio(ctx.venueId, giorno, servizio),
  ]);

  const chiCopre = coperture.get(tableId) ?? [];

  const base = deriveTableLiveStatus(
    tavolo,
    prenotazioni.map((b) => ({
      status: b.status,
      startsAt: b.startsAt,
      durationMin: b.durationMin,
      closedAt: b.closedAt,
    })),
    adesso,
    { blocked: blocchi.length > 0 },
  );

  const corrente = prenotazioni.find((b) => b.status === "SEATED" && !b.closedAt) ?? null;

  let conto: ContoTavoloStaff | null = null;
  let ospiti: OspiteView[] = [];
  let comande: ComandaView[] = [];

  if (corrente) {
    const order = await db.order.findFirst({
      where: {
        venueId: ctx.venueId,
        bookingId: corrente.id,
        status: { in: ["RECEIVED", "PREPARING", "READY"] },
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        totalCents: true,
        contoRichiestoAt: true,
        _count: { select: { OrderItem: true } },
      },
    });

    if (order) {
      const somme = await sommeDelConto(db, order.id, adesso);
      conto = {
        orderId: order.id,
        totaleCents: order.totalCents,
        pagatoCents: somme.pagatoCents,
        inCorsoCents: somme.inCorsoCents,
        residuoCents: Math.max(0, order.totalCents - somme.pagatoCents - somme.inCorsoCents),
        contoRichiestoAt: order.contoRichiestoAt?.toISOString() ?? null,
        righe: order._count.OrderItem,
      };
      [ospiti, comande] = await Promise.all([
        assicuraOspiti(order.id, corrente.partySize),
        comandeDelConto(ctx.venueId, order.id),
      ]);
    }
  }

  const riassunto = riassumiComande(
    comande.map((c) => ({ status: c.status, righe: c.righe.length })),
  );
  const piattiPronti = comande
    .flatMap((c) => c.righe)
    .filter((r) => r.status === "PRONTA")
    .reduce((s, r) => s + r.quantita, 0);

  const stato = statoTavoloStaff(base, riassunto, {
    contoRichiesto: !!conto?.contoRichiestoAt,
    pagamentoInCorso: (conto?.inCorsoCents ?? 0) > 0,
  });

  /*
    **Il cronometro dello stato**, dalle stesse date che la Sala legge in
    blocco — qui però su una sola serie di comande, quindi si leggono a mano
    invece di aggregarle in `comandePerTavolo`.

    La regola è la stessa e vale la pena ripeterla: per i piatti al passe
    conta il **più vecchio**, perché è quello che si fredda. Prendere l'ultimo
    azzererebbe il conteggio ogni volta che la cucina manda fuori qualcos'altro
    dello stesso tavolo.
  */
  const istante = (s: string | null | undefined) => (s ? new Date(s).getTime() : null);
  const minimo = (valori: (number | null)[]) => {
    const buoni = valori.filter((v): v is number => v !== null);
    return buoni.length > 0 ? Math.min(...buoni) : null;
  };
  const massimo = (valori: (number | null)[]) => {
    const buoni = valori.filter((v): v is number => v !== null);
    return buoni.length > 0 ? Math.max(...buoni) : null;
  };

  const vive = comande.filter((c) => c.status !== "ANNULLATA");
  const sedutiDa = corrente?.seatedAt?.getTime() ?? null;
  const primoPronto = minimo(vive.filter((c) => c.status === "PRONTA").map((c) => istante(c.readyAt)));
  const ultimoInvio = massimo(vive.map((c) => istante(c.sentAt)));
  const ultimoServito = massimo(vive.map((c) => istante(c.servedAt)));
  const bozzaAperta = minimo(
    vive.filter((c) => c.status === "BOZZA" && c.righe.length > 0).map((c) => istante(c.createdAt)),
  );
  const inizioStato =
    stato === "CONTO" || stato === "PAGAMENTO"
      ? istante(conto?.contoRichiestoAt ?? null)
      : stato === "IN_SERVIZIO"
        ? (primoPronto ?? ultimoInvio)
        : stato === "COMANDA_INVIATA"
          ? ultimoInvio
          : stato === "ORDINAZIONE"
            ? bozzaAperta
            : stato === "SERVITO" || stato === "VERSO_IL_CONTO"
              ? (ultimoServito ?? sedutiDa)
              : sedutiDa;

  const daMinutiStato =
    inizioStato === null ? null : Math.max(0, Math.round((adesso.getTime() - inizioStato) / 60_000));

  const allergie =
    comande
      .flatMap((c) => c.righe)
      .filter((r) => r.status !== "ANNULLATA" && r.status !== "SERVITA")
      .filter((r) => r.allergeni.length > 0 || r.notaAllergia).length +
    (corrente?.guest?.allergies ? 1 : 0);

  return {
    tableId: tavolo.id,
    label: tavolo.label,
    posti: tavolo.seats,
    roomId: tavolo.roomId,
    roomName: tavolo.room?.name ?? null,
    stato,
    tono: TONO_STATO[stato],
    mio: chiCopre.some((c) => c.waiterId === ctx.waiterId),
    coperto: chiCopre,
    scoperto: chiCopre.length === 0 && !!corrente,
    servizio,
    seduta: corrente
      ? {
          bookingId: corrente.id,
          ospite:
            `${corrente.guest?.firstName ?? ""} ${corrente.guest?.lastName ?? ""}`.trim() ||
            "Senza nome",
          coperti: corrente.partySize,
          startsAt: corrente.startsAt.toISOString(),
          seatedAt: corrente.seatedAt?.toISOString() ?? null,
          daMinuti: corrente.seatedAt
            ? Math.max(0, Math.round((adesso.getTime() - corrente.seatedAt.getTime()) / 60_000))
            : null,
          dalle: corrente.seatedAt
            ? new Intl.DateTimeFormat("it-IT", {
                timeZone: ctx.timezone,
                hour: "2-digit",
                minute: "2-digit",
                hour12: false,
              }).format(corrente.seatedAt)
            : null,
          status: corrente.status,
        }
      : null,
    conto,
    ospiti,
    comande,
    bozza: comande.find((c) => c.status === "BOZZA") ?? null,
    note: corrente
      ? noteDa({
          allergie: corrente.guest?.allergies ?? null,
          /* `Guest.preferences` è una colonna JSON: nel prodotto ci finisce
             quasi sempre una frase, ma il tipo ammette anche un oggetto. Una
             card di servizio non è il posto per renderizzare JSON — o è una
             stringa o non si mostra. */
          preferenze:
            typeof corrente.guest?.preferences === "string" ? corrente.guest.preferences : null,
          noteBooking: corrente.notes,
          noteInterne: corrente.internalNotes,
          occasione: corrente.occasion ? (OCCASIONI[corrente.occasion] ?? null) : null,
        })
      : [],
    piattiPronti,
    richiamo: richiamoTavolo({
      stato,
      piattiPronti,
      contoRichiesto: !!conto?.contoRichiestoAt,
      allergie,
      dettaglioAllergia: corrente?.guest?.allergies ?? null,
      notaImportante: null,
      daMinuti: daMinutiStato,
    }),
    daMinutiStato,
  };
}

/* -------------------------------------------------------------------------- */
/*  Le azioni sul tavolo                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Apre (o ritrova) il conto del tavolo.
 *
 * Passa da `openOrderForBooking`, che è già idempotente: due camerieri che
 * premono «aggiungi ordine» sullo stesso tavolo finiscono nello stesso conto.
 * Riusarla invece di riscriverla è il punto — un secondo modo di aprire un
 * conto significherebbe due totali sullo stesso tavolo a fine serata.
 */
export async function contoDelTavolo(
  venueId: string,
  tableId: string,
  opts: { actor?: AuditActor } = {},
): Promise<{ orderId: string; bookingId: string; coperti: number }> {
  const seduta = await db.booking.findFirst({
    where: { venueId, tableId, status: "SEATED", closedAt: null, deletedAt: null },
    orderBy: { startsAt: "desc" },
    select: { id: true, partySize: true },
  });
  if (!seduta) throw new TavoloError("nessuna_seduta");

  const order = await openOrderForBooking(venueId, seduta.id, { actor: opts.actor });
  await assicuraOspiti(order.id, seduta.partySize);
  return { orderId: order.id, bookingId: seduta.id, coperti: seduta.partySize };
}

export const NotaTavoloInput = z.object({
  testo: z.string().trim().max(1000),
});

/**
 * La nota di servizio sul tavolo — «compleanno», «portare la torta alle 22:30».
 *
 * Va su `Booking.internalNotes`, che esiste già ed è il campo che il back
 * office mostra sotto «note interne». Una tabella nuova per le note del tavolo
 * avrebbe creato due posti in cui la stessa frase può stare, e la sala e
 * l'agenda avrebbero raccontato due cose diverse dello stesso tavolo.
 */
export async function scriviNotaTavolo(
  venueId: string,
  tableId: string,
  raw: unknown,
  opts: { actor?: AuditActor } = {},
): Promise<{ testo: string }> {
  const { testo } = NotaTavoloInput.parse(raw);
  const seduta = await db.booking.findFirst({
    where: { venueId, tableId, status: "SEATED", closedAt: null, deletedAt: null },
    orderBy: { startsAt: "desc" },
    select: { id: true, internalNotes: true },
  });
  if (!seduta) throw new TavoloError("nessuna_seduta");

  await db.booking.update({
    where: { id: seduta.id },
    data: { internalNotes: testo || null },
  });
  await db.bookingEvent.create({
    data: {
      bookingId: seduta.id,
      kind: "NOTES_UPDATED",
      message: testo.slice(0, 200) || "Nota rimossa",
      actorId: opts.actor?.userId ?? null,
    },
  });
  await recordAudit(opts.actor, "booking.update", "booking", seduta.id, {
    internalNotes: { da: seduta.internalNotes, a: testo || null },
  });
  return { testo };
}

/**
 * Segna che il tavolo ha chiesto il conto.
 *
 * Scrive un fatto (`Order.contoRichiestoAt`) invece di lasciare che la sala lo
 * deduca dalla durata della seduta: un tavolo può stare due ore senza chiedere
 * niente, e uno chiedere il conto dopo quaranta minuti. La stima resta per i
 * tavoli su cui nessuno ha premuto niente — vedi `lib/stato-tavolo-staff.ts`.
 */
export async function richiediConto(
  venueId: string,
  tableId: string,
  opts: { actor?: AuditActor; annulla?: boolean } = {},
): Promise<ContoTavoloStaff> {
  const { orderId } = await contoDelTavolo(venueId, tableId, { actor: opts.actor });
  const order = await db.order.update({
    where: { id: orderId },
    data: { contoRichiestoAt: opts.annulla ? null : new Date() },
    select: {
      id: true,
      totalCents: true,
      contoRichiestoAt: true,
      _count: { select: { OrderItem: true } },
    },
  });
  const somme = await sommeDelConto(db, orderId);

  await recordAudit(opts.actor, "order.line_update", "order", orderId, {
    contoRichiesto: !opts.annulla,
  });

  return {
    orderId: order.id,
    totaleCents: order.totalCents,
    pagatoCents: somme.pagatoCents,
    inCorsoCents: somme.inCorsoCents,
    residuoCents: Math.max(0, order.totalCents - somme.pagatoCents - somme.inCorsoCents),
    contoRichiestoAt: order.contoRichiestoAt?.toISOString() ?? null,
    righe: order._count.OrderItem,
  };
}
