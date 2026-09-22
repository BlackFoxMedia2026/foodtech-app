import { Prisma, type EventRequestStatus } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { recordAudit, type AuditActor } from "@/server/audit";
import { trovaOCreaOspite, trovaOspite } from "@/server/guest-match";
import { createNotification } from "@/server/notifications";

/**
 * Eventi e gruppi: dalla richiesta alla prenotazione.
 *
 * ## Perché è il pezzo che manca di più
 *
 * Perché è dove i concorrenti fanno margine, e in Tavolo non c'era niente.
 * «Siamo quaranta per una laurea, un sabato di dicembre, quanto viene?» è la
 * telefonata che vale dieci coperti normali — e fino a ieri finiva in un
 * «richiameranno» detto a voce, senza che rimanesse una riga da nessuna parte.
 *
 * E tre campi che lo dicevano da mesi: `Booking.isGroup`, `eventType` e
 * `budgetCents` stavano nello schema e **non li scriveva nessuno**. Adesso li
 * scrive l'accettazione di una richiesta.
 *
 * ## Le quattro cose che questo modulo tiene ferme
 *
 * 1. **Una richiesta non è una prenotazione.** Finché è una trattativa non
 *    occupa niente: quaranta coperti bloccati per qualcosa che forse non si fa
 *    sono mezza sala persa ogni volta che qualcuno chiede un preventivo.
 * 2. **Accettare scrive la prenotazione, e una sola.** Il vincolo è nel
 *    database (`EventRequest.bookingId` unico), non in un controllo prima
 *    della scrittura: due persone che accettano la stessa richiesta nello
 *    stesso momento non tengono il tavolo due volte.
 * 3. **Perdere una trattativa si scrive, con il motivo.** «Perse: 12» non
 *    insegna niente; «otto perse per il prezzo» cambia il listino.
 * 4. **L'acconto non c'è, e non si finge.** Serve un incasso vero; quando
 *    arriverà, l'acconto sta sulla prenotazione, che è dove vive il denaro.
 */

/** Quanti coperti fanno di una prenotazione un evento, per difetto. */
export const COPERTI_DA_EVENTO = 12;

export const RichiestaInput = z.object({
  nome: z.string().min(1).max(120),
  telefono: z.string().max(40).nullish(),
  email: z.string().email().max(200).nullish(),
  persone: z.coerce.number().int().min(1).max(500),
  /** L'istante, quando una data c'è. */
  quando: z.coerce.date().nullish(),
  /** «un sabato di dicembre», quando non c'è. */
  quandoTesto: z.string().max(160).nullish(),
  tipo: z.string().max(60).nullish(),
  budgetCents: z.coerce.number().int().nonnegative().nullish(),
  note: z.string().max(1000).nullish(),
  /** La telefonata da cui nasce: è anche la chiave anti-doppione. */
  callId: z.string().max(120).nullish(),
});

export const PreventivoInput = z.object({
  preventivoCents: z.coerce.number().int().nonnegative().nullish(),
  perPersonaCents: z.coerce.number().int().nonnegative().nullish(),
  menuConcordato: z.string().max(2000).nullish(),
  note: z.string().max(1000).nullish(),
  /** Quando la data si fissa durante la trattativa. */
  quando: z.coerce.date().nullish(),
  persone: z.coerce.number().int().min(1).max(500).nullish(),
});

export class EventoError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = "EventoError";
  }
}

/**
 * Apre una trattativa.
 *
 * ## Perché l'ospite si cerca ma non si pretende
 *
 * Perché chi chiama per un evento spesso non è un cliente: è la figlia che
 * organizza la laurea, la segretaria che prenota per l'ufficio. Si prova a
 * riconoscerla dal contatto — se c'è già, la trattativa si attacca alla sua
 * scheda e il locale vede la storia — ma se non c'è **non si crea una scheda
 * nuova**: un preventivo non chiesto da nessuno non deve riempire la rubrica
 * di persone che non sono mai venute. La scheda nasce quando la richiesta si
 * accetta, che è quando diventa un cliente.
 *
 * ## Idempotente sulla telefonata
 *
 * Il centralino ritenta: la stessa chiamata non apre due trattative. Il
 * vincolo è l'indice unico, non un controllo prima della scrittura — due
 * ritentativi in parallelo passerebbero entrambi.
 */
export async function apriRichiestaEvento(
  venueId: string,
  raw: unknown,
  opz: { actor?: AuditActor; da?: "telefono" | "sala" | "sito" } = {},
): Promise<{ id: string; giaAperta: boolean }> {
  const dati = RichiestaInput.parse(raw);

  const guestId = await ospiteGiaConosciuto(venueId, dati.telefono, dati.email);

  try {
    const creata = await db.eventRequest.create({
      data: {
        venueId,
        guestId,
        nome: dati.nome.trim(),
        telefono: dati.telefono?.trim() || null,
        email: dati.email?.trim() || null,
        persone: dati.persone,
        quando: dati.quando ?? null,
        quandoTesto: dati.quandoTesto?.trim() || null,
        tipo: dati.tipo?.trim() || null,
        budgetCents: dati.budgetCents ?? null,
        note: dati.note?.trim() || null,
        callId: dati.callId?.trim() || null,
      },
      select: { id: true },
    });

    await recordAudit(opz.actor, "evento.richiesta", "event_request", creata.id, {
      persone: dati.persone,
      da: opz.da ?? "sala",
    });

    /*
      La campanella, perché una richiesta di evento **scade**.

      Chi chiede un preventivo per quaranta persone lo chiede a tre ristoranti
      lo stesso pomeriggio: chi risponde domani ha già perso. È esattamente il
      caso in cui una notifica serve — c'è un lavoro da fare e nessuna
      schermata aperta lo mostrerebbe.
    */
    await createNotification(venueId, {
      kind: "EVENT_REQUEST",
      title: `Richiesta evento: ${dati.persone} persone`,
      body: `${dati.nome.trim()}${dati.quandoTesto ? ` · ${dati.quandoTesto.trim()}` : ""}. Chi chiede un preventivo lo chiede a tre ristoranti: rispondere oggi vale più che rispondere bene.`,
      link: "/eventi",
      meta: { eventRequestId: creata.id },
    });

    return { id: creata.id, giaAperta: false };
  } catch (err) {
    /* P2002: la stessa telefonata è già diventata una trattativa. Si
       restituisce quella — chi ritenta voleva che esistesse, e esiste. */
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002" && dati.callId) {
      const esistente = await db.eventRequest.findFirst({
        where: { venueId, callId: dati.callId.trim() },
        select: { id: true },
      });
      if (esistente) return { id: esistente.id, giaAperta: true };
    }
    throw err;
  }
}

/**
 * La scheda di chi chiede, **solo se esiste già**.
 *
 * Si riusa il riconoscimento degli ospiti: se qui si confrontassero i contatti
 * a modo proprio, la stessa persona risulterebbe nuova chiedendo un preventivo
 * e conosciuta prenotando.
 */
async function ospiteGiaConosciuto(
  venueId: string,
  telefono?: string | null,
  email?: string | null,
): Promise<string | null> {
  if (!telefono?.trim() && !email?.trim()) return null;
  return trovaOspite(venueId, { email, phone: telefono });
}

export type RichiestaInElenco = {
  id: string;
  nome: string;
  telefono: string | null;
  email: string | null;
  persone: number;
  quando: Date | null;
  quandoTesto: string | null;
  tipo: string | null;
  stato: EventRequestStatus;
  budgetCents: number | null;
  preventivoCents: number | null;
  perPersonaCents: number | null;
  menuConcordato: string | null;
  note: string | null;
  motivo: string | null;
  creata: Date;
  /** La prenotazione nata dall'accettazione, quando c'è. */
  bookingId: string | null;
  /** Da quanti giorni è ferma senza risposta: è la misura che conta. */
  giorniFerma: number;
};

const APERTE: EventRequestStatus[] = ["NUOVA", "PREVENTIVO"];

/**
 * Le trattative, le aperte per prime.
 *
 * L'ordine non è per data di arrivo ma per **quanto sono ferme**: una
 * richiesta di tre giorni fa senza risposta è il lavoro più urgente della
 * pagina, e metterla in fondo perché è vecchia è il modo di perderla.
 */
export async function elencaRichieste(
  venueId: string,
  opz: { stato?: "aperte" | "tutte" } = {},
  adesso: Date = new Date(),
): Promise<RichiestaInElenco[]> {
  const righe = await db.eventRequest.findMany({
    where: {
      venueId,
      ...(opz.stato === "tutte" ? {} : { stato: { in: APERTE } }),
    },
    orderBy: [{ stato: "asc" }, { createdAt: "asc" }],
    take: 200,
  });

  return righe.map((r) => ({
    id: r.id,
    nome: r.nome,
    telefono: r.telefono,
    email: r.email,
    persone: r.persone,
    quando: r.quando,
    quandoTesto: r.quandoTesto,
    tipo: r.tipo,
    stato: r.stato,
    budgetCents: r.budgetCents,
    preventivoCents: r.preventivoCents,
    perPersonaCents: r.perPersonaCents,
    menuConcordato: r.menuConcordato,
    note: r.note,
    motivo: r.motivo,
    creata: r.createdAt,
    bookingId: r.bookingId,
    giorniFerma: Math.floor((adesso.getTime() - r.createdAt.getTime()) / 86_400_000),
  }));
}

/** Quante trattative aspettano una risposta: serve al pallino in barra. */
export function contaRichiesteAperte(venueId: string): Promise<number> {
  return db.eventRequest.count({ where: { venueId, stato: { in: APERTE } } });
}

/**
 * Scrive il preventivo.
 *
 * Passare per `PREVENTIVO` non è burocrazia: distingue «nessuno l'ha ancora
 * guardata» da «abbiamo risposto e aspettiamo», e sono le due code di lavoro
 * diverse di chi vende eventi. Una richiesta accettata o persa non si
 * ritocca — la condizione sta dentro la scrittura.
 */
export async function scriviPreventivo(
  venueId: string,
  id: string,
  raw: unknown,
  opz: { actor?: AuditActor } = {},
): Promise<RichiestaInElenco> {
  const dati = PreventivoInput.parse(raw);

  const aggiornate = await db.eventRequest.updateMany({
    where: { id, venueId, stato: { in: APERTE } },
    data: {
      stato: "PREVENTIVO",
      preventivoCents: dati.preventivoCents ?? undefined,
      perPersonaCents: dati.perPersonaCents ?? undefined,
      menuConcordato: dati.menuConcordato?.trim() ?? undefined,
      note: dati.note?.trim() ?? undefined,
      quando: dati.quando ?? undefined,
      persone: dati.persone ?? undefined,
    },
  });
  if (aggiornate.count === 0) throw new EventoError("non_modificabile");

  await recordAudit(opz.actor, "evento.preventivo", "event_request", id, {
    preventivoCents: dati.preventivoCents ?? null,
    perPersonaCents: dati.perPersonaCents ?? null,
  });

  return unaRichiesta(venueId, id);
}

/**
 * Il lucchetto: lega **una** prenotazione a una richiesta.
 *
 * Sta in una funzione sua e non dentro `accettaRichiesta` per una ragione
 * precisa: e l'unico pezzo che protegge dalla corsa, e da dentro
 * `accettaRichiesta` **non si puo provare**. Due chiamate in parallelo nei
 * test si mettono in fila da sole — il controllo che rilegge la riga cattura
 * il secondo tentativo, e il lucchetto non viene mai messo alla prova. Cosi
 * invece si chiama due volte e si guarda: la seconda risponde `false`.
 *
 * La condizione (`bookingId: null`) sta **dentro** la scrittura: due persone
 * che accettano lo stesso evento nello stesso istante leggono entrambe una
 * riga libera, e senza questo il sabato di dicembre finirebbe con due tavolate
 * da quaranta persone.
 *
 * Restituisce `false` a chi perde: chi perde cancella la prenotazione che
 * aveva appena creato.
 */
export async function legaLaPrenotazione(
  venueId: string,
  id: string,
  bookingId: string,
  dati: {
    persone: number;
    quando: Date;
    guestId: string;
    decisoDa: string | null;
    preventivoCents: number | null;
  },
): Promise<boolean> {
  const esito = await db.eventRequest.updateMany({
    where: { id, venueId, bookingId: null },
    data: {
      stato: "ACCETTATA",
      bookingId,
      persone: dati.persone,
      quando: dati.quando,
      guestId: dati.guestId,
      decisoDa: dati.decisoDa,
      decisoIl: new Date(),
      ...(dati.preventivoCents !== null ? { preventivoCents: dati.preventivoCents } : {}),
    },
  });
  return esito.count === 1;
}

/**
 * Accetta: nasce la prenotazione, e i tre campi morti si riempiono.
 *
 * ## Perché la prenotazione si scrive qui e non da `createBooking`
 *
 * Perché `createBooking` **controlla la disponibilità**, e un evento da
 * quaranta coperti la sfonda quasi sempre: è concordato col locale, spesso a
 * sala chiusa o in una sala privata. Rifiutarlo per capienza vorrebbe dire che
 * la funzione non si può usare proprio per gli eventi grandi, che sono il suo
 * motivo di esistere.
 *
 * Non è una scorciatoia silenziosa: chi accetta lo sta decidendo, resta scritto
 * nel registro, e la prenotazione nasce marcata come evento (`isGroup`), quindi
 * in agenda si vede cos'è.
 *
 * ## Una sola prenotazione, garantita dal database
 *
 * `bookingId` è unico su `EventRequest`: due persone che accettano la stessa
 * richiesta nello stesso istante non tengono il tavolo due volte. La seconda
 * trova la riga già legata e si ferma.
 */
export async function accettaRichiesta(
  venueId: string,
  id: string,
  raw: unknown,
  opz: { actor?: AuditActor } = {},
): Promise<{ bookingId: string }> {
  const dati = PreventivoInput.parse(raw);

  const richiesta = await db.eventRequest.findFirst({
    where: { id, venueId },
    select: {
      id: true,
      nome: true,
      telefono: true,
      email: true,
      persone: true,
      quando: true,
      tipo: true,
      note: true,
      guestId: true,
      bookingId: true,
      preventivoCents: true,
      menuConcordato: true,
    },
  });
  if (!richiesta) throw new EventoError("non_trovata");
  if (richiesta.bookingId) throw new EventoError("gia_accettata");

  const quando = dati.quando ?? richiesta.quando;
  /* Senza una data non c'è una prenotazione: un evento «verso Natale» si
     accetta quando il giorno è deciso, e chiederlo qui è l'unico modo di non
     scrivere in agenda una riga senza quando. */
  if (!quando) throw new EventoError("senza_data");

  const persone = dati.persone ?? richiesta.persone;

  /* L'ospite nasce **adesso**: chi ha accettato un preventivo è un cliente.
     Prima era solo qualcuno che chiedeva un prezzo. */
  const ospite = richiesta.guestId
    ? { guestId: richiesta.guestId }
    : await trovaOCreaOspite(venueId, {
        firstName: richiesta.nome,
        email: richiesta.email,
        phone: richiesta.telefono,
      });

  const prenotazione = await db.booking.create({
    data: {
      venueId,
      guestId: ospite.guestId,
      partySize: persone,
      startsAt: quando,
      status: "CONFIRMED",
      source: "PHONE",
      /* I tre campi che stavano nello schema e non scriveva nessuno. */
      isGroup: true,
      eventType: richiesta.tipo,
      budgetCents: dati.preventivoCents ?? richiesta.preventivoCents,
      /* Il menu concordato va nelle note **interne**: è un accordo fra il
         locale e chi organizza, non una richiesta del cliente da leggere in
         sala insieme alle allergie. */
      internalNotes: richiesta.menuConcordato,
      notes: richiesta.note,
    },
    select: { id: true },
  });

  const legata = await legaLaPrenotazione(venueId, id, prenotazione.id, {
    persone,
    quando,
    guestId: ospite.guestId,
    decisoDa: opz.actor?.userId ?? null,
    preventivoCents: dati.preventivoCents ?? null,
  });

  if (!legata) {
    await db.booking.delete({ where: { id: prenotazione.id } }).catch(() => undefined);
    throw new EventoError("gia_accettata");
  }

  await recordAudit(opz.actor, "evento.accettata", "event_request", id, {
    prenotazione: prenotazione.id,
    persone,
    quando: quando.toISOString(),
  });

  return { bookingId: prenotazione.id };
}

/**
 * Persa, con il motivo.
 *
 * Il motivo è obbligatorio e non è burocrazia: «perse: dodici» non insegna
 * niente a nessuno, «otto perse per il prezzo» cambia il listino degli eventi.
 * È l'unico numero di questa pagina che può far guadagnare qualcosa.
 */
export async function perdiRichiesta(
  venueId: string,
  id: string,
  motivo: string,
  opz: { actor?: AuditActor } = {},
): Promise<void> {
  const pulito = motivo.trim().slice(0, 300);
  if (!pulito) throw new EventoError("motivo_mancante");

  const aggiornate = await db.eventRequest.updateMany({
    where: { id, venueId, stato: { in: APERTE } },
    data: {
      stato: "PERSA",
      motivo: pulito,
      decisoDa: opz.actor?.userId ?? null,
      decisoIl: new Date(),
    },
  });
  if (aggiornate.count === 0) throw new EventoError("non_modificabile");

  await recordAudit(opz.actor, "evento.persa", "event_request", id, { motivo: pulito });
}

async function unaRichiesta(venueId: string, id: string): Promise<RichiestaInElenco> {
  const tutte = await elencaRichieste(venueId, { stato: "tutte" });
  const mia = tutte.find((r) => r.id === id);
  if (!mia) throw new EventoError("non_trovata");
  return mia;
}
