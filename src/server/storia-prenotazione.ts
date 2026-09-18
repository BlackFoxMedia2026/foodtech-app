import { db } from "@/lib/db";
import { primoNome } from "@/server/cambiamenti";
import { STATUS_LABELS } from "@/components/bookings/status-badge";
import { telefonoLeggibile } from "@/lib/telefono";

/**
 * Cos'è successo a questa prenotazione, dal primo momento a adesso.
 *
 * ## La decisione che conta: non si accende `BookingEvent`
 *
 * La tabella `BookingEvent` esiste dal primo giorno del progetto, con undici
 * categorie di evento, e **non l'ha mai scritta né letta nessuno**. La quarta
 * tabella morta trovata in questo prodotto (le prime tre erano del telefono).
 *
 * Il piano diceva di accenderla. Guardando cosa ci sarebbe finito dentro, si è
 * scoperto che **ogni evento ha già la sua casa**:
 *
 * | Cosa | Dove sta già |
 * |---|---|
 * | com'è nata | la riga stessa: `createdAt` e `source` |
 * | la telefonata da cui è nata | `PhoneCall.bookingId` |
 * | i messaggi mandati | `MessageLog` (`bookingId` + `kind` + esito) |
 * | chi ha cambiato cosa | `AuditLog`, con l'attore e la **differenza** |
 * | il cliente che conferma o disdice dal suo link | `AuditLog`, con attore «guest» |
 *
 * Accenderla avrebbe voluto dire scrivere una seconda copia di roba che c'è,
 * e in questo prodotto «due posti che dicono la stessa cosa sono un posto in
 * cui uno dei due invecchia» è una regola scritta — quella che ha tenuto fuori
 * dalla campanella le notifiche che il centro controllo dice meglio.
 *
 * Quindi: `BookingEvent` resta segnata **superata** nello schema, come le tre
 * del telefono, e questa storia si **legge dai fatti**. Nessuna colonna nuova,
 * nessuna migrazione, e niente che possa divergere dalla verità: se una
 * modifica non è nel registro, non è avvenuta.
 *
 * ## Perché non basta il registro delle azioni
 *
 * Perché `recordAudit` **non scrive senza un attore** — è la sua prima riga di
 * codice, e ha ragione: un registro di responsabilità senza responsabile non
 * serve a niente. Ma le cose che capitano senza una persona sono proprio
 * quelle che un cliente vive: la prenotazione arrivata dal sito alle due di
 * notte, quella raccolta dal risponditore, il promemoria mandato dal cron.
 *
 * Per quelle il fatto è la riga: `Booking.createdAt` con la sua fonte,
 * `MessageLog` con il suo esito. Messe in fila con il registro, la storia è
 * intera.
 */

export type TipoVoce =
  | "nascita"
  | "telefonata"
  | "messaggio"
  | "modifica"
  | "stato"
  | "disdetta";

export type VoceStoria = {
  /** Un identificativo stabile: serve solo a React per le chiavi. */
  id: string;
  quando: Date;
  /** La frase, già scritta per intero. */
  cosa: string;
  /** Chi l'ha fatto, quando c'è un chi. Nullo per quello che è successo da sé. */
  chi: string | null;
  tipo: TipoVoce;
};

/* -------------------------------------------------------------------------- */
/*  Come si racconta una fonte                                                */
/* -------------------------------------------------------------------------- */

/**
 * La nascita, detta come si dice.
 *
 * Non sono le etichette delle pillole (`SourceBadge` dice «Telefono» sia per
 * `PHONE` sia per `VOICE`): là serve la categoria, qui serve il **fatto**. In
 * una storia «presa al telefono da una persona» e «raccolta dal risponditore»
 * sono due cose diverse, ed è l'unico posto del prodotto dove la differenza si
 * legge.
 */
const NASCITA: Record<string, string> = {
  WIDGET: "Prenotata dal sito",
  PHONE: "Presa al telefono",
  VOICE: "Raccolta dal risponditore del centralino",
  WALK_IN: "Arrivata senza prenotare",
  GOOGLE: "Arrivata da Google",
  SOCIAL: "Arrivata dai social",
  CONCIERGE: "Passata da un concierge",
  EVENT: "Nata da un evento",
};

/** Che messaggio era, in italiano. Le chiavi sono quelle di `MessageLog.kind`. */
const MESSAGGIO: Record<string, string> = {
  "booking.confirmation": "Conferma mandata al cliente",
  "booking.reminder_24h": "Promemoria mandato il giorno prima",
  "booking.reminder": "Promemoria mandato al cliente",
  "booking.cancelled": "Disdetta comunicata al cliente",
  "booking.waitlist_seated": "Avviso che il tavolo era libero",
};

const CANALE: Record<string, string> = {
  EMAIL: "per email",
  SMS: "per SMS",
  WHATSAPP: "su WhatsApp",
  PUSH: "con una notifica",
};

/* -------------------------------------------------------------------------- */

export async function storiaPrenotazione(
  venueId: string,
  bookingId: string,
  /**
   * Il fuso del locale.
   *
   * Le frasi con un'ora dentro — «spostata dalle 20:00 alle 21:00» — si
   * compongono **qui**, e non nella schermata: la frase è una sola cosa, e
   * spezzarla in pezzi da ricucire nel componente vorrebbe dire una struttura
   * dati per ogni frase possibile. Il fuso lo sa il locale, e il server ce
   * l'ha davanti.
   */
  fuso = "Europe/Rome",
): Promise<VoceStoria[]> {
  const orario = new Intl.DateTimeFormat("it-IT", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: fuso,
  });
  const prenotazione = await db.booking.findFirst({
    where: { id: bookingId, venueId },
    select: {
      id: true,
      createdAt: true,
      source: true,
      campaignId: true,
      guest: { select: { firstName: true } },
    },
  });
  if (!prenotazione) return [];

  const [chiamate, messaggi, registro, tavoli] = await Promise.all([
    db.phoneCall.findMany({
      where: { venueId, bookingId },
      orderBy: { startedAt: "asc" },
      select: {
        id: true,
        startedAt: true,
        fromNumber: true,
        guest: { select: { firstName: true } },
      },
    }),
    db.messageLog.findMany({
      where: { bookingId, deletedAt: null },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        kind: true,
        channel: true,
        status: true,
        createdAt: true,
        sentAt: true,
      },
    }),
    /* Indice: `[entityType, entityId]`. È la lettura per cui quell'indice
       esiste da sempre e che nessuno faceva. */
    db.auditLog.findMany({
      where: { entityType: "booking", entityId: bookingId },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        action: true,
        diff: true,
        actorId: true,
        actorEmail: true,
        createdAt: true,
      },
    }),
    db.table.findMany({
      where: { venueId },
      select: { id: true, label: true },
    }),
  ]);

  const etichettaTavolo = new Map(tavoli.map((t) => [t.id, t.label]));

  /* I nomi degli utenti in un colpo solo: il registro conserva
     l'identificativo, e una lettura per riga su una storia di venti righe
     sarebbe venti letture. */
  const idUtenti = [
    ...new Set(
      registro
        .map((r) => r.actorId)
        .filter((v): v is string => typeof v === "string" && v !== "guest"),
    ),
  ];
  const utenti = idUtenti.length
    ? await db.user.findMany({
        where: { id: { in: idUtenti } },
        select: { id: true, name: true, email: true },
      })
    : [];
  const nomeUtente = new Map(
    utenti.map((u) => [u.id, primoNome(u.name, u.email)]),
  );

  const voci: VoceStoria[] = [];

  /* --- la nascita, dalla riga ------------------------------------------- */
  voci.push({
    id: `nascita-${prenotazione.id}`,
    quando: prenotazione.createdAt,
    cosa:
      (NASCITA[prenotazione.source] ?? "Prenotazione creata") +
      (prenotazione.campaignId ? ", da una campagna" : ""),
    chi: null,
    tipo: "nascita",
  });

  /* --- la telefonata da cui è nata -------------------------------------- */
  for (const c of chiamate) {
    const chi =
      c.guest?.firstName ??
      telefonoLeggibile(c.fromNumber) ??
      "un numero riservato";
    voci.push({
      id: `chiamata-${c.id}`,
      quando: c.startedAt,
      cosa: `Telefonata di ${chi}`,
      chi: null,
      tipo: "telefonata",
    });
  }

  /* --- i messaggi, con il loro esito ------------------------------------ */
  for (const m of messaggi) {
    const cosa = MESSAGGIO[m.kind ?? ""] ?? "Messaggio mandato al cliente";
    const canale = CANALE[m.channel] ?? "";
    /* L'esito fa parte del fatto: «conferma mandata» su un messaggio non
       consegnato è una bugia, e nella storia di una prenotazione è il genere
       di bugia che fa dire «ma io gliel'ho scritto». */
    const esito =
      m.status === "FAILED"
        ? " — non è partito"
        : m.status === "QUEUED"
          ? " — in coda"
          : "";
    voci.push({
      id: `messaggio-${m.id}`,
      quando: m.sentAt ?? m.createdAt,
      cosa: `${cosa}${canale ? ` ${canale}` : ""}${esito}`,
      chi: null,
      tipo: "messaggio",
    });
  }

  /* --- chi ha cambiato cosa --------------------------------------------- */
  for (const r of registro) {
    const chi =
      r.actorId === "guest"
        ? (prenotazione.guest?.firstName ?? "Il cliente")
        : r.actorId
          ? (nomeUtente.get(r.actorId) ?? primoNome(null, r.actorEmail))
          : primoNome(null, r.actorEmail);

    const frasi = frasiDalRegistro(r.action, r.diff, etichettaTavolo, orario);
    /* Una riga di registro può contenere **più cambiamenti**: chi sposta l'ora
       e aggiunge due coperti nella stessa modifica produce una riga sola. Si
       raccontano separati, perché separati si leggono. */
    frasi.forEach((frase, i) => {
      voci.push({
        id: `registro-${r.id}-${i}`,
        quando: r.createdAt,
        cosa: frase.cosa,
        chi,
        tipo: frase.tipo,
      });
    });
  }

  /* Dal più recente: una storia si legge da cosa è successo per ultimo, ed è
     il verso in cui la si apre quando si vuole sapere «com'è adesso». */
  return voci.sort((a, b) => b.quando.getTime() - a.quando.getTime());
}

/* -------------------------------------------------------------------------- */
/*  Dal registro alla frase                                                   */
/* -------------------------------------------------------------------------- */

type Frase = { cosa: string; tipo: TipoVoce };

/**
 * Le frasi di una riga del registro.
 *
 * Si parte dalla **differenza** e non dall'azione: l'azione dice «ha
 * aggiornato», la differenza dice *cosa*. «Anna ha aggiornato» non serve a
 * nessuno — «Anna ha spostato dalle 20:00 alle 21:00» è l'informazione, e sta
 * già nel registro da mesi senza che nessuno la leggesse.
 *
 * Quando la differenza non c'è o non parla di campi che sappiamo raccontare,
 * si ricade sull'azione: meglio «Anna ha aggiornato la prenotazione» che una
 * riga muta.
 */
function frasiDalRegistro(
  azione: string,
  diff: unknown,
  etichettaTavolo: Map<string, string>,
  orario: Intl.DateTimeFormat,
): Frase[] {
  if (azione === "booking.delete") {
    return [{ cosa: "Prenotazione cancellata", tipo: "disdetta" }];
  }

  const campi =
    diff && typeof diff === "object" && !Array.isArray(diff)
      ? (diff as Record<string, { da?: unknown; a?: unknown }>)
      : {};

  const frasi: Frase[] = [];

  const stato = campi.status;
  if (stato && typeof stato.a === "string") {
    const nuovo =
      STATUS_LABELS[stato.a as keyof typeof STATUS_LABELS] ?? stato.a;
    frasi.push(
      stato.a === "CANCELLED"
        ? { cosa: "Disdetta", tipo: "disdetta" }
        : { cosa: `Segnata «${nuovo.toLowerCase()}»`, tipo: "stato" },
    );
  }

  const quando = campi.startsAt;
  if (quando && typeof quando.a === "string" && typeof quando.da === "string") {
    frasi.push({
      cosa: `Spostata da ${orario.format(new Date(quando.da))} a ${orario.format(new Date(quando.a))}`,
      tipo: "modifica",
    });
  }

  const coperti = campi.partySize;
  if (coperti && typeof coperti.a === "number") {
    frasi.push({
      cosa: `Coperti da ${coperti.da} a ${coperti.a}`,
      tipo: "modifica",
    });
  }

  const tavolo = campi.tableId;
  if (tavolo) {
    const a =
      typeof tavolo.a === "string" ? etichettaTavolo.get(tavolo.a) : null;
    frasi.push({
      cosa: a ? `Tavolo ${a}` : "Tavolo togliato",
      tipo: "modifica",
    });
  }

  const durata = campi.durationMin;
  if (durata && typeof durata.a === "number") {
    frasi.push({ cosa: `Durata ${durata.a} minuti`, tipo: "modifica" });
  }

  if (campi.notes || campi.internalNotes) {
    frasi.push({ cosa: "Note aggiornate", tipo: "modifica" });
  }

  if (frasi.length > 0) return frasi;

  /* Nessun campo che sappiamo raccontare: si dice l'azione. Le due del
     cliente si dicono per intero, perché sono le uniche righe del registro
     scritte da chi non lavora nel locale. */
  if (azione === "booking.guest_confirmed") {
    return [{ cosa: "Ha confermato dal suo link", tipo: "stato" }];
  }
  if (azione === "booking.guest_cancelled") {
    return [{ cosa: "Ha disdetto dal suo link", tipo: "disdetta" }];
  }
  if (azione === "booking.create" || azione === "booking.create_forced") {
    /* La nascita è già la prima voce, letta dalla riga: questa la
     **attribuisce**, e non si raddoppia. */
    return [{ cosa: "L'ha presa", tipo: "nascita" }];
  }
  if (azione === "booking.walk_in") {
    return [{ cosa: "L'ha accomodata come walk-in", tipo: "nascita" }];
  }
  if (azione.startsWith("booking.assign_table")) {
    return [{ cosa: "Ha assegnato il tavolo", tipo: "modifica" }];
  }
  if (azione === "booking.cancel") {
    return [{ cosa: "Disdetta", tipo: "disdetta" }];
  }
  return [{ cosa: "Ha aggiornato la prenotazione", tipo: "modifica" }];
}
