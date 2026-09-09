import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import {
  GIORNI_AVANTI,
  GIORNI_INDIETRO,
  MAX_PER_TIPO,
  MINIMO_CIFRE,
  MINIMO_LETTERE,
  soloCifre,
  type EsitoRicerca,
  type OspiteTrovato,
  type PrenotazioneTrovata,
} from "@/lib/ricerca-tipi";

/* Ri-esportate: chi legge questo modulo si aspetta di trovarle qui. */
export {
  GIORNI_AVANTI,
  GIORNI_INDIETRO,
  MAX_PER_TIPO,
  MINIMO_LETTERE,
  soloCifre,
} from "@/lib/ricerca-tipi";
export type { EsitoRicerca, OspiteTrovato, PrenotazioneTrovata } from "@/lib/ricerca-tipi";

/**
 * Cercare una persona da qualunque schermata.
 *
 * Il compito «trovare un ospite» era l'unico dei sette del §123 senza una
 * strada: bisognava andare in Ospiti, e da lì cercare. Con una prenotazione al
 * telefono in corso, «vado nel CRM» sono tre gesti e una schermata di
 * contesto perso.
 *
 * Tre scelte che tengono questa ricerca onesta:
 *
 * 1. **cerca due cose e lo dice.** Ospiti e prenotazioni: sono le due cose che
 *    si cercano per nome. Un tavolo lo si cerca guardando la sala, un piatto
 *    dal menu. Una ricerca che finge di cercare tutto e non trova qualcosa
 *    insegna a non fidarsi;
 * 2. **il telefono si cerca a cifre.** In archivio i numeri stanno come li ha
 *    scritti chi li ha scritti — «+39 335 8842910» — e cercare «3358842»
 *    con un semplice `contains` non trovava niente perché in mezzo ci sono
 *    gli spazi. L'audit lo aveva segnalato come difetto della ricerca del CRM;
 * 3. **le prenotazioni si cercano in una finestra dichiarata.** Una settimana
 *    indietro e un mese avanti: chi cerca «Bianchi» sta rispondendo al
 *    telefono adesso, non facendo ricerca storica. Lo storico completo di una
 *    persona sta nella sua scheda, ed è a un clic dal risultato.
 */

const VUOTO = (q: string): EsitoRicerca => ({
  q,
  ospiti: [],
  prenotazioni: [],
  ospitiTotali: 0,
  prenotazioniTotali: 0,
});

function nomeDi(g: { firstName: string; lastName: string | null }): string {
  return `${g.firstName}${g.lastName ? ` ${g.lastName}` : ""}`;
}

export async function cercaNelLocale(
  venueId: string,
  domanda: string,
  opts: { now?: Date } = {},
): Promise<EsitoRicerca> {
  const q = domanda.trim();
  if (q.length < MINIMO_LETTERE) return VUOTO(q);

  const now = opts.now ?? new Date();
  const cifre = soloCifre(q);

  /*
    Gli ospiti: nome, cognome, email come sono scritti, e il telefono **a
    cifre**.

    Il confronto a cifre passa da una query grezza perché va fatto sulla
    colonna trasformata (`regexp_replace`), e Prisma non esprime una funzione
    dentro un `where`. Due letture invece di una, unite per id: la prima
    trova «Bianchi», la seconda trova «3358842» dentro «+39 335 8842910».
  */
  /*
    Il telefono **non** sta fra questi campi, e non è una dimenticanza.

    Con `phone: { contains: q }` cercare «33» restituiva tutti i numeri che
    contengono «33» da qualche parte — mezzo archivio — e cercare «3358842»
    non trovava «+39 335 8842910» per colpa degli spazi. Cioè il contrario di
    quello che serve: rumore sulle domande corte, silenzio su quelle giuste.
    Il numero si cerca solo a cifre, e solo da quattro in su.
  */
  const perNome: Prisma.GuestWhereInput = {
    venueId,
    OR: [
      { firstName: { contains: q, mode: "insensitive" } },
      { lastName: { contains: q, mode: "insensitive" } },
      { email: { contains: q, mode: "insensitive" } },
    ],
  };

  const idPerTelefono =
    cifre.length >= MINIMO_CIFRE
      ? (
          await db.$queryRaw<{ id: string }[]>`
            SELECT id FROM "Guest"
            WHERE "venueId" = ${venueId}
              AND "phone" IS NOT NULL
              AND regexp_replace("phone", '[^0-9]', '', 'g') LIKE ${`%${cifre}%`}
            LIMIT ${MAX_PER_TIPO * 3}
          `
        ).map((r) => r.id)
      : [];

  const dove: Prisma.GuestWhereInput =
    idPerTelefono.length > 0 ? { OR: [perNome, { venueId, id: { in: idPerTelefono } }] } : perNome;

  const [ospiti, ospitiTotali] = await Promise.all([
    db.guest.findMany({
      where: dove,
      // Prima chi viene più spesso: fra due «Rossi», quello che il locale
      // conosce è quello che si sta cercando.
      orderBy: [{ totalVisits: "desc" }, { firstName: "asc" }],
      take: MAX_PER_TIPO,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        phone: true,
        email: true,
        totalVisits: true,
        loyaltyTier: true,
      },
    }),
    db.guest.count({ where: dove }),
  ]);

  /*
    Le prenotazioni della finestra, di ospiti che corrispondono.

    Una prenotazione senza scheda ospite — un walk-in segnato in fretta — non
    si trova per nome, perché il nome non c'è da nessuna parte. È un limite
    vero, e la schermata lo dice invece di far cercare a vuoto.
  */
  const dovePrenotazioni: Prisma.BookingWhereInput = {
    venueId,
    deletedAt: null,
    startsAt: {
      gte: new Date(now.getTime() - GIORNI_INDIETRO * 86_400_000),
      lte: new Date(now.getTime() + GIORNI_AVANTI * 86_400_000),
    },
    guest: dove,
  };

  const [prenotazioni, prenotazioniTotali] = await Promise.all([
    db.booking.findMany({
      where: dovePrenotazioni,
      orderBy: { startsAt: "asc" },
      take: MAX_PER_TIPO,
      select: {
        id: true,
        startsAt: true,
        partySize: true,
        status: true,
        table: { select: { label: true } },
        guest: { select: { firstName: true, lastName: true } },
      },
    }),
    db.booking.count({ where: dovePrenotazioni }),
  ]);

  return {
    q,
    ospiti: ospiti.map((g) => ({
      id: g.id,
      nome: nomeDi(g),
      telefono: g.phone,
      email: g.email,
      visite: g.totalVisits,
      livello: g.loyaltyTier,
    })),
    prenotazioni: prenotazioni.map((b) => ({
      id: b.id,
      nome: b.guest ? nomeDi(b.guest) : "Senza scheda",
      quando: b.startsAt,
      partySize: b.partySize,
      stato: b.status,
      tavolo: b.table?.label ?? null,
    })),
    ospitiTotali,
    prenotazioniTotali,
  };
}
