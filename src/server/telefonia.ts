import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { CIFRE_IDENTITA, codaIdentita, telefonoLeggibile } from "@/lib/telefono";

/**
 * Chi è il numero che sta chiamando.
 *
 * Questo modulo esiste per i tre secondi in cui il telefono squilla e chi
 * risponde non sa ancora chi c'è dall'altra parte. Non serve a mostrare una
 * scheda cliente completa — quella c'è già nel CRM, e chi ha il telefono in
 * mano non ha il tempo di leggerla. Serve a dire tre cose:
 *
 *  - **`blocked`**: questa persona non deve prenotare, e chi risponde deve
 *    saperlo *prima* di dire «sì, a che ora?»;
 *  - **`noShowCount`**: quante volte ha prenotato e non si è presentata;
 *  - **`allergies`**: perché si chiede in fondo alla telefonata, quando
 *    l'informazione c'è già dalla volta prima.
 *
 * Tutto il resto (il nome, le visite, la prossima prenotazione) è cortesia.
 * Quei tre campi sono il motivo per cui questa chiamata esiste.
 *
 * ## Un numero può essere di più persone
 *
 * La famiglia che condivide il fisso, il centralino di un'azienda, il numero
 * dell'albergo che prenota per gli ospiti: nello stesso locale lo stesso
 * numero sta su più schede, e succede spesso. Scegliere la prima e tacere
 * significa salutare la moglie col nome del marito, o — peggio — non vedere
 * che una delle due schede è bloccata.
 *
 * Quindi si risponde con l'ospite **più recente per `lastVisitAt`** e si dice
 * quanti altri ce ne sono, con i loro nomi. Chi risponde al telefono chiede
 * «parlo con Marco o con Anna?», che è quello che farebbe comunque.
 */

/**
 * Quante schede si guardano per un numero.
 *
 * Un tetto senza totale è una bugia — di là si dice anche **quante** ce ne
 * sono in tutto. Dieci perché oltre non è più una famiglia: è un numero da
 * ripulire nel CRM, e questa risposta non è il posto dove farlo.
 */
const SCHEDE_PER_NUMERO = 10;

type SchedaTrovata = {
  id: string;
  firstName: string;
  lastName: string | null;
  lastVisitAt: Date | null;
  blocked: boolean;
};

export type AltraScheda = {
  id: string;
  firstName: string;
  lastName: string | null;
  lastVisitAt: Date | null;
  /** Serve da solo: fra cinque schede, quella bloccata cambia la telefonata. */
  blocked: boolean;
};

export type OspiteAlTelefono = {
  id: string;
  firstName: string;
  lastName: string | null;
  loyaltyTier: string;
  totalVisits: number;
  noShowCount: number;
  lastVisitAt: Date | null;
  allergies: string | null;
  preferences: unknown;
  tags: string[];
  blocked: boolean;
  blockedReason: string | null;
  marketingOptIn: boolean;
  loyaltyCardCode: string | null;
};

export type PrenotazioneInArrivo = {
  id: string;
  reference: string;
  startsAt: Date;
  partySize: number;
  status: string;
  tavolo: string | null;
  notes: string | null;
};

export type UltimaVisita = {
  at: Date;
  /**
   * Nullo quando la data della visita viene dalla scheda e non da una
   * prenotazione — gli ospiti importati da un altro gestionale hanno
   * `lastVisitAt` e nessuna prenotazione dietro. Dire la data senza il numero
   * di coperti è vero; inventare «2» non lo è.
   */
  partySize: number | null;
};

export type EsitoRiconoscimento = {
  /** `null` quando il numero non è di nessuno: è il caso più frequente. */
  guest: OspiteAlTelefono | null;
  prossimaPrenotazione: PrenotazioneInArrivo | null;
  ultimaVisita: UltimaVisita | null;
  /** Le altre schede con lo stesso numero, senza quella scelta. */
  altreSchede: AltraScheda[];
  /** Quante schede hanno questo numero in tutto, tetto compreso. */
  schedeTotali: number;
  /** Il numero come lo si legge a voce, per l'interfaccia. */
  telefono: string | null;
};

const STATI_IN_ARRIVO = ["CONFIRMED", "PENDING", "ARRIVED"] as const;
const STATI_VISITATI = ["SEATED", "COMPLETED"] as const;

/*
  Il numero di cifre entra nell'SQL come **numero scritto**, non come
  parametro, e ci sono due ragioni — la seconda è quella che conta.

   1. Postgres rifiutava la versione col parametro: un numero JavaScript arriva
      come `bigint`, e `right(text, bigint)` non esiste. Il test l'ha visto
      subito.
   2. Un indice su un'espressione combacia solo se l'espressione della lettura
      è **identica** a quella dell'indice. L'indice dice `right(..., 9)`; una
      lettura che dicesse `right(..., $3::int)` non sarebbe la stessa
      espressione: l'indice verrebbe scartato in silenzio e ogni squillo
      leggerebbe l'intera rubrica del locale. Nessun errore, solo lentezza —
      il difetto che non si nota mai.

  `Prisma.raw` qui non apre niente: il valore è una nostra costante numerica e
  non arriva da una richiesta. Il controllo sotto lo dice a chi passerà.
*/
if (!Number.isInteger(CIFRE_IDENTITA)) {
  throw new Error("CIFRE_IDENTITA deve essere un intero: finisce nell'SQL come letterale.");
}
/**
 * Il numero di cifre come letterale SQL.
 *
 * Esportato perché adesso lo usano **due** moduli: la ricerca del chiamante e
 * l'attacco di una chiamata a un contatto. Due copie dello stesso letterale
 * divergono al primo che lo cambia, e il sintomo sarebbe un indice che smette
 * di combaciare in una sola delle due letture — cioè una lenta e l'altra no,
 * che è il modo peggiore di accorgersene.
 */
export const CIFRE_SQL = Prisma.raw(String(CIFRE_IDENTITA));

/**
 * Le schede di un locale che hanno questo numero, dalla più recente.
 *
 * Il confronto è sulle **ultime nove cifre**, calcolate dentro il database
 * dalla stessa espressione su cui poggia l'indice
 * `Guest_venueId_codaTelefono_idx`: se qui e nell'indice l'espressione non
 * fosse identica, l'indice ci sarebbe e nessuna lettura lo userebbe — una
 * scansione di tutti gli ospiti del locale a ogni squillo.
 *
 * Gli ospiti anonimizzati restano fuori: la cancellazione dei dati ha già
 * svuotato quella scheda, e riconoscere qualcuno che ha chiesto di essere
 * dimenticato è esattamente la cosa che non si deve fare.
 */
async function schedeConQuestoNumero(venueId: string, coda: string): Promise<SchedaTrovata[]> {
  return db.$queryRaw<SchedaTrovata[]>`
    SELECT "id", "firstName", "lastName", "lastVisitAt", "blocked"
    FROM "Guest"
    WHERE "venueId" = ${venueId}
      AND "phone" IS NOT NULL
      AND "anonymizedAt" IS NULL
      AND right(regexp_replace("phone", '[^0-9]', '', 'g'), ${CIFRE_SQL}) = ${coda}
    ORDER BY "lastVisitAt" DESC NULLS LAST, "createdAt" DESC
    LIMIT ${SCHEDE_PER_NUMERO}
  `;
}

/**
 * Riconosce un numero che chiama.
 *
 * Non solleva quando il numero non basta a identificare nessuno (meno di nove
 * cifre: un interno, un numero nascosto, un troncone): risponde «non
 * riconosciuto», che è la risposta corretta e non un guasto. Chi risponde al
 * telefono vede la schermata della chiamata anonima, che è una schermata
 * prevista.
 */
export async function riconosciChiamante(
  venueId: string,
  telefono: string | null | undefined,
  adesso: Date = new Date(),
): Promise<EsitoRiconoscimento> {
  const coda = codaIdentita(telefono);
  /* Il numero si mostra riscritto solo quando è un numero: su un troncone di
     tre cifre — un interno, una chiamata nascosta — `telefonoLeggibile` gli
     metterebbe davanti il prefisso italiano e uscirebbe «+39412», che non è
     nessun numero al mondo. Quando non si identifica nessuno si restituisce
     quello che è arrivato, tale e quale. */
  const leggibile = coda ? telefonoLeggibile(telefono) : (telefono?.trim() || null);
  const vuoto: EsitoRiconoscimento = {
    guest: null,
    prossimaPrenotazione: null,
    ultimaVisita: null,
    altreSchede: [],
    schedeTotali: 0,
    telefono: leggibile,
  };
  if (!coda) return vuoto;

  const schede = await schedeConQuestoNumero(venueId, coda);
  if (schede.length === 0) return vuoto;

  /* La scheda scelta è la prima: `lastVisitAt` più recente. Chi ha chiamato
     l'ultima volta è di solito chi chiama adesso. */
  const scelta = schede[0];

  /* Le tre letture che servono davvero, in parallelo. Una telefonata non
     aspetta: in fila sarebbero tre andate e ritorno al database, e il
     centralino abbandona la richiesta dopo 800 ms. */
  const [ospite, inArrivo, visitata] = await Promise.all([
    db.guest.findUnique({
      where: { id: scelta.id },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        loyaltyTier: true,
        totalVisits: true,
        noShowCount: true,
        lastVisitAt: true,
        allergies: true,
        preferences: true,
        tags: true,
        blocked: true,
        blockedReason: true,
        marketingOptIn: true,
        loyaltyCardCode: true,
      },
    }),
    db.booking.findFirst({
      where: {
        venueId,
        guestId: scelta.id,
        deletedAt: null,
        startsAt: { gte: adesso },
        status: { in: [...STATI_IN_ARRIVO] },
      },
      orderBy: { startsAt: "asc" },
      select: {
        id: true,
        reference: true,
        startsAt: true,
        partySize: true,
        status: true,
        notes: true,
        table: { select: { label: true } },
      },
    }),
    db.booking.findFirst({
      where: {
        venueId,
        guestId: scelta.id,
        deletedAt: null,
        startsAt: { lt: adesso },
        status: { in: [...STATI_VISITATI] },
      },
      orderBy: { startsAt: "desc" },
      select: { startsAt: true, partySize: true, seatedAt: true },
    }),
  ]);

  // La scheda è sparita fra le due letture: è possibile, e non è un guasto.
  if (!ospite) return vuoto;

  /* La visita: la prenotazione servita porta con sé i coperti, `lastVisitAt`
     no. Si preferisce la prenotazione; se non c'è ma la scheda dice una data
     (gli ospiti importati), si dice la data e si ammette di non sapere in
     quanti erano. */
  const ultimaVisita: UltimaVisita | null = visitata
    ? { at: visitata.seatedAt ?? visitata.startsAt, partySize: visitata.partySize }
    : ospite.lastVisitAt
      ? { at: ospite.lastVisitAt, partySize: null }
      : null;

  return {
    guest: { ...ospite, loyaltyTier: ospite.loyaltyTier as string },
    prossimaPrenotazione: inArrivo
      ? {
          id: inArrivo.id,
          reference: inArrivo.reference,
          startsAt: inArrivo.startsAt,
          partySize: inArrivo.partySize,
          status: inArrivo.status,
          tavolo: inArrivo.table?.label ?? null,
          notes: inArrivo.notes,
        }
      : null,
    ultimaVisita,
    altreSchede: schede.slice(1).map((s) => ({
      id: s.id,
      firstName: s.firstName,
      lastName: s.lastName,
      lastVisitAt: s.lastVisitAt,
      blocked: s.blocked,
    })),
    schedeTotali: schede.length,
    telefono: leggibile,
  };
}
