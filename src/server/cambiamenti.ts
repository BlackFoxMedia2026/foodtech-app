import { db } from "@/lib/db";
import type { AuditAction } from "./audit";

/**
 * Chi ha cambiato cosa, negli ultimi minuti.
 *
 * La schermata del Servizio si aggiorna da sola: ogni cinque secondi chiede
 * «è cambiato qualcosa?» e ricarica solo se la risposta cambia. Funziona, ma
 * il cambiamento **appariva senza dire chi**: due persone che lavorano lo
 * stesso servizio da due tablet vedevano un tavolo assegnarsi da solo, e la
 * seconda rifaceva il lavoro della prima o si fermava a chiedere.
 *
 * Il §65 lo chiede così: «T10 è stato assegnato da Anna». Il dato c'era già —
 * il registro delle azioni ha attore, entità e ora — e non serviva nessuna
 * colonna nuova: serviva leggerlo.
 *
 * Tre scelte:
 *
 * 1. **solo le azioni del servizio.** Un menu modificato o un coupon creato
 *    non riguardano chi è in sala adesso. L'elenco sta qui sotto ed è chiuso:
 *    aggiungere un'azione è una decisione, non un effetto collaterale;
 * 2. **il nome di battesimo, non l'email.** In sala le persone si chiamano
 *    «Anna», non «anna@ristorante.it». Se il nome non c'è si usa la parte
 *    prima della chiocciola, che è la cosa più vicina a un nome che abbiamo;
 * 3. **una riga per soggetto.** Chi tocca tre volte la stessa prenotazione in
 *    un minuto — arrivato, seduto, tavolo — produce tre righe di registro e
 *    **un** cambiamento da leggere: si tiene la più recente.
 */

/** Da quanti minuti indietro si guarda. Oltre, non è più «adesso». */
export const FINESTRA_MIN = 30;

/** Quante righe si mostrano: è una riga discreta, non un registro. */
export const MAX_CAMBIAMENTI = 4;

/**
 * Le azioni che cambiano il servizio in corso, e come si raccontano.
 *
 * `frase` riceve il soggetto — «Marta Bianchi (T10)» — e restituisce la parte
 * che segue il nome di chi ha agito: «Anna » + «ha assegnato un tavolo a
 * Marta Bianchi». Ogni azione scrive la frase per intero, con e senza
 * soggetto: la preposizione cambia da verbo a verbo («a Marta», «il conto di
 * Marta»), e ricavarla da una regola generale voleva dire scriverne una che
 * sbaglia su qualche caso.
 *
 * Il soggetto manca quando la prenotazione è stata cancellata dopo il
 * cambiamento: meglio «Anna ha disdetto una prenotazione» che una frase con un
 * buco dentro.
 *
 * `tipo` dice **dove cercare il soggetto**, perché il registro conserva solo
 * un identificativo e non dice di che cosa: una prenotazione, una riga della
 * lista d'attesa, o un conto — e il conto porta all'ospite passando dalla
 * prenotazione a cui è attaccato.
 */
const AZIONI: Partial<
  Record<AuditAction, { frase: (soggetto: string | null) => string; tipo: "prenotazione" | "attesa" | "conto" }>
> = {
  "booking.create": {
    frase: (s) => (s ? `ha preso la prenotazione di ${s}` : "ha preso una prenotazione"),
    tipo: "prenotazione",
  },
  "booking.create_forced": {
    frase: (s) => (s ? `ha forzato la prenotazione di ${s}` : "ha forzato una prenotazione"),
    tipo: "prenotazione",
  },
  "booking.walk_in": {
    frase: (s) => (s ? `ha accomodato ${s} come walk-in` : "ha accomodato un walk-in"),
    tipo: "prenotazione",
  },
  "booking.update": {
    frase: (s) => (s ? `ha aggiornato ${s}` : "ha aggiornato una prenotazione"),
    tipo: "prenotazione",
  },
  "booking.cancel": {
    frase: (s) => (s ? `ha disdetto ${s}` : "ha disdetto una prenotazione"),
    tipo: "prenotazione",
  },
  "booking.assign_table": {
    frase: (s) => (s ? `ha assegnato un tavolo a ${s}` : "ha assegnato un tavolo"),
    tipo: "prenotazione",
  },
  "booking.assign_table_forced": {
    frase: (s) => (s ? `ha forzato il tavolo di ${s}` : "ha forzato un tavolo"),
    tipo: "prenotazione",
  },
  "booking.combine_tables": {
    frase: (s) => (s ? `ha unito i tavoli per ${s}` : "ha unito dei tavoli"),
    tipo: "prenotazione",
  },
  "booking.split_tables": {
    frase: (s) => (s ? `ha diviso i tavoli di ${s}` : "ha diviso dei tavoli"),
    tipo: "prenotazione",
  },
  "order.open": {
    frase: (s) => (s ? `ha aperto il conto di ${s}` : "ha aperto un conto"),
    tipo: "conto",
  },
  "order.close": {
    frase: (s) => (s ? `ha chiuso il conto di ${s}` : "ha chiuso un conto"),
    tipo: "conto",
  },
  "waitlist.add": {
    frase: (s) => (s ? `ha messo in lista ${s}` : "ha messo qualcuno in lista"),
    tipo: "attesa",
  },
  "waitlist.notify": {
    frase: (s) => (s ? `ha avvisato ${s}` : "ha avvisato chi aspetta"),
    tipo: "attesa",
  },
  "waitlist.confirm": {
    frase: (s) => (s ? `ha confermato ${s}` : "ha confermato una riga in lista"),
    tipo: "attesa",
  },
  "waitlist.seat": {
    frase: (s) => (s ? `ha accomodato ${s} dalla lista` : "ha accomodato qualcuno dalla lista"),
    tipo: "attesa",
  },
  "waitlist.close": {
    frase: (s) => (s ? `ha chiuso la riga di ${s}` : "ha chiuso una riga in lista"),
    tipo: "attesa",
  },
};

export type Cambiamento = {
  id: string;
  /** Il nome di chi l'ha fatto, come lo si chiama in sala. */
  chi: string;
  /** La frase completa: «ha assegnato un tavolo a Marta Bianchi». */
  cosa: string;
  quando: Date;
};

/** Il nome di battesimo: «Anna Conti» → «Anna», «anna@x.it» → «anna». */
function primoNome(nome: string | null | undefined, email: string | null | undefined): string {
  const dal = (nome ?? "").trim().split(/\s+/)[0];
  if (dal) return dal;
  const prima = (email ?? "").split("@")[0]?.trim();
  return prima || "Qualcuno";
}

export async function ultimiCambiamenti(
  venueId: string,
  opts: { now?: Date; escludiUtente?: string } = {},
): Promise<Cambiamento[]> {
  const now = opts.now ?? new Date();
  const chiavi = Object.keys(AZIONI);

  const righe = await db.auditLog.findMany({
    where: {
      venueId,
      action: { in: chiavi },
      createdAt: { gte: new Date(now.getTime() - FINESTRA_MIN * 60_000) },
      // Le proprie azioni non sono una notizia: chi le ha fatte le ha viste
      // succedere. Serve sapere cosa ha fatto **l'altro**.
      ...(opts.escludiUtente ? { actorId: { not: opts.escludiUtente } } : {}),
    },
    orderBy: { createdAt: "desc" },
    // Si leggono più righe di quelle che si mostrano perché poi si accorpano
    // per soggetto: tre tocchi sulla stessa prenotazione sono un cambiamento.
    take: MAX_CAMBIAMENTI * 6,
    select: {
      id: true,
      action: true,
      entityType: true,
      entityId: true,
      actorId: true,
      actorEmail: true,
      createdAt: true,
    },
  });
  if (righe.length === 0) return [];

  /* ---- una riga per soggetto, la più recente ---- */
  const perSoggetto = new Map<string, (typeof righe)[number]>();
  for (const r of righe) {
    const chiave = `${r.entityType}:${r.entityId ?? r.id}`;
    if (!perSoggetto.has(chiave)) perSoggetto.set(chiave, r);
  }
  const scelte = [...perSoggetto.values()].slice(0, MAX_CAMBIAMENTI);

  /* ---- i nomi: di chi ha agito, e di chi ha subìto ---- */
  const utenti = await db.user.findMany({
    where: { id: { in: [...new Set(scelte.map((r) => r.actorId).filter((v): v is string => !!v))] } },
    select: { id: true, name: true, email: true },
  });
  const nomeUtente = new Map(utenti.map((u) => [u.id, primoNome(u.name, u.email)]));

  const diTipo = (t: "prenotazione" | "attesa" | "conto") =>
    scelte.filter((r) => AZIONI[r.action as AuditAction]?.tipo === t && r.entityId).map((r) => r.entityId!);

  const idPrenotazioni = diTipo("prenotazione");
  const prenotazioni = idPrenotazioni.length
    ? await db.booking.findMany({
        where: { id: { in: idPrenotazioni }, venueId },
        select: {
          id: true,
          partySize: true,
          guest: { select: { firstName: true, lastName: true } },
          table: { select: { label: true } },
        },
      })
    : [];
  const perId = new Map(prenotazioni.map((b) => [b.id, b]));

  /*
    I conti: l'identificativo nel registro è quello dell'ordine, non della
    prenotazione. Il nome dell'ospite sta un salto più in là, e senza questo
    passaggio «ha chiuso il conto di Marta» diventava «ha chiuso un conto».
  */
  const idConti = diTipo("conto");
  const conti = idConti.length
    ? await db.order.findMany({
        where: { id: { in: idConti }, venueId },
        select: {
          id: true,
          booking: {
            select: {
              partySize: true,
              guest: { select: { firstName: true, lastName: true } },
              table: { select: { label: true } },
            },
          },
        },
      })
    : [];
  const perIdConto = new Map(conti.map((o) => [o.id, o.booking]));

  const idAttese = diTipo("attesa");
  const attese = idAttese.length
    ? await db.waitlistEntry.findMany({
        where: { id: { in: idAttese }, venueId },
        select: { id: true, guestName: true },
      })
    : [];
  const perIdAttesa = new Map(attese.map((e) => [e.id, e]));

  /* ---- le frasi ---- */
  return scelte
    .map((r) => {
      const regola = AZIONI[r.action as AuditAction];
      if (!regola) return null;

      /** «Marta Bianchi (T10)»: il tavolo fa capire di chi si parla senza aprire. */
      const descrivi = (b: {
        partySize: number;
        guest: { firstName: string; lastName: string | null } | null;
        table: { label: string } | null;
      }) => {
        const nome = b.guest
          ? `${b.guest.firstName}${b.guest.lastName ? ` ${b.guest.lastName}` : ""}`
          : `${b.partySize} ${b.partySize === 1 ? "coperto" : "coperti"}`;
        return b.table ? `${nome} (${b.table.label})` : nome;
      };

      let soggetto: string | null = null;
      if (regola.tipo === "attesa") {
        soggetto = perIdAttesa.get(r.entityId ?? "")?.guestName ?? null;
      } else if (regola.tipo === "conto") {
        const b = perIdConto.get(r.entityId ?? "");
        soggetto = b ? descrivi(b) : null;
      } else {
        const b = perId.get(r.entityId ?? "");
        if (b) soggetto = descrivi(b);
      }

      return {
        id: r.id,
        chi: r.actorId ? (nomeUtente.get(r.actorId) ?? primoNome(null, r.actorEmail)) : primoNome(null, r.actorEmail),
        cosa: regola.frase(soggetto),
        quando: r.createdAt,
      };
    })
    .filter((c): c is Cambiamento => c !== null);
}
