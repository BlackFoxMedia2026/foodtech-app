import { db } from "@/lib/db";
import { DEFAULT_VENUE_TIMEZONE } from "@/lib/venue-time";
import { DURATA_PREDEFINITA_MIN, durataUmana } from "@/lib/durata";
import { durataTipica, GIORNI_DI_MISURA, MINIMO_MISURATE, type RigaSeduta } from "./rotazione";

/**
 * Quanto dura **questa** cena, non «una cena».
 *
 * Il motore di disponibilità decide quanti tavoli si possono vendere in base
 * a una durata, e finora quella durata era un numero unico: 105 minuti per
 * tutti. È il compromesso che sbaglia due volte nella stessa giornata —
 * regala ritardi la sera e butta via coperti a pranzo — perché due persone a
 * pranzo di martedì e otto persone il sabato sera non stanno a tavola lo
 * stesso tempo, e nessun ristoratore lo ha mai pensato.
 *
 * Ora la durata si **misura**, e si misura nel contesto: gruppo, fascia,
 * tipo di giorno. Con tre regole che valgono più della statistica:
 *
 * - **si scende di specificità solo quando i numeri lo permettono.** Prima si
 *   guarda «gruppi come questo, in questa fascia, in un giorno come questo»;
 *   se non ci sono almeno dieci cene chiuse, si allarga a «gruppi come
 *   questo, in questa fascia»; poi a «gruppi come questo»; poi al locale
 *   intero. Se nemmeno lì bastano, si torna ai 105 minuti **e si dice**;
 * - **la durata proposta non si impone.** Chi prenota al telefono la vede già
 *   scritta nel modulo con la frase che spiega da dove viene, e se sa qualcosa
 *   che la misura non sa la cambia. Una statistica non sa che stasera quella
 *   tavolata festeggia una laurea;
 * - **si arrotonda a cinque minuti e si tiene dentro limiti umani.** «137
 *   minuti» è precisione finta; e una mediana di quattro ore e mezza — che
 *   nasce da conti chiusi in ritardo, non da cene lunghe — chiuderebbe la
 *   sala. Fra 45 minuti e 4 ore.
 *
 * Non tocca **niente** delle prenotazioni già in agenda: la durata scritta
 * sopra una prenotazione resta quella. Cambia solo quella proposta a chi ne
 * crea una nuova, e quella con cui il motore calcola gli orari liberi.
 */

/** Sotto questo numero di cene chiuse, un contesto non risponde. */
export const MINIMO_CONTESTO = MINIMO_MISURATE;

/** Limiti umani: oltre, non è una cena più lunga, è un conto chiuso tardi. */
export const DURATA_MINIMA_MIN = 45;
export const DURATA_MASSIMA_MIN = 240;

/**
 * I gruppi. Non sono classi statistiche, sono **come si apparecchia**: due
 * persone a un tavolino, quattro a un quadrato, sei a un tondo, e da sette in
 * su è una tavolata, che è un altro mestiere.
 */
export type Gruppo = "1-2" | "3-4" | "5-6" | "7+";

export function gruppoDi(partySize: number): Gruppo {
  if (partySize <= 2) return "1-2";
  if (partySize <= 4) return "3-4";
  if (partySize <= 6) return "5-6";
  return "7+";
}

/**
 * Pranzo o cena, con il taglio alle 16:00 nel fuso del locale: è l'ora in cui
 * nessun ristorante sta servendo, quindi è il posto giusto per tagliare.
 */
export type Fascia = "PRANZO" | "CENA";

export function fasciaDi(istante: Date, timezone: string): Fascia {
  const ora = Number(
    new Intl.DateTimeFormat("en-GB", { timeZone: timezone, hour: "2-digit", hour12: false }).format(
      istante,
    ),
  );
  return ora < 16 ? "PRANZO" : "CENA";
}

/**
 * Fine settimana da venerdì a domenica: per un ristorante il venerdì sera è
 * sabato, non giovedì.
 */
export type TipoGiorno = "SETTIMANA" | "FINE_SETTIMANA";

export function tipoGiornoDi(istante: Date, timezone: string): TipoGiorno {
  const giorno = new Intl.DateTimeFormat("en-US", { timeZone: timezone, weekday: "short" }).format(
    istante,
  );
  return giorno === "Fri" || giorno === "Sat" || giorno === "Sun" ? "FINE_SETTIMANA" : "SETTIMANA";
}

/** Il contesto che ha risposto, dal più specifico al meno. */
export type Contesto = "GRUPPO_FASCIA_GIORNO" | "GRUPPO_FASCIA" | "GRUPPO" | "LOCALE" | "NESSUNO";

export type DurataConsigliata = {
  durataMin: number;
  fonte: "MISURATO" | "PREDEFINITA";
  contesto: Contesto;
  /** Su quante cene chiuse. Nullo quando non si è misurato niente. */
  misurate: number | null;
  /** Frase pronta per chi legge: dice sempre su cosa poggia. */
  spiegazione: string;
};

export type CenaChiusa = {
  partySize: number;
  startsAt: Date;
  seatedAt: Date;
  closedAt: Date;
};

const ETICHETTA: Record<Exclude<Contesto, "NESSUNO">, (g: Gruppo, f: Fascia, t: TipoGiorno) => string> = {
  GRUPPO_FASCIA_GIORNO: (g, f, t) =>
    `${g} persone, ${f === "PRANZO" ? "a pranzo" : "a cena"}, ${t === "FINE_SETTIMANA" ? "nel fine settimana" : "in settimana"}`,
  GRUPPO_FASCIA: (g, f) => `${g} persone, ${f === "PRANZO" ? "a pranzo" : "a cena"}`,
  GRUPPO: (g) => `${g} persone`,
  LOCALE: () => "tutto il locale",
};

/** Arrotondato a cinque minuti e tenuto dentro limiti umani. */
function arrotonda(minuti: number): number {
  const a5 = Math.round(minuti / 5) * 5;
  return Math.min(DURATA_MASSIMA_MIN, Math.max(DURATA_MINIMA_MIN, a5));
}

function comeRigaSeduta(c: CenaChiusa): RigaSeduta {
  // `durataTipica` calcola la mediana e impone il minimo di campioni: la
  // formula della mediana esiste in un posto solo, e questo la riusa.
  return { tableId: null, giorno: "", seatedAt: c.seatedAt, closedAt: c.closedAt, durationMin: 0 };
}

/**
 * La parte pura: dalle cene chiuse alla durata da proporre.
 *
 * Si prova la scala dal contesto più stretto al più largo e si ferma al
 * primo che ha abbastanza cene. Restituisce **sempre** una risposta, perché
 * una prenotazione va accettata anche il primo giorno di un locale nuovo.
 */
export function scegliDurata(
  cene: CenaChiusa[],
  richiesta: { partySize: number; startsAt: Date },
  timezone: string,
): DurataConsigliata {
  const gruppo = gruppoDi(richiesta.partySize);
  const fascia = fasciaDi(richiesta.startsAt, timezone);
  const tipo = tipoGiornoDi(richiesta.startsAt, timezone);

  const scala: { contesto: Exclude<Contesto, "NESSUNO">; filtro: (c: CenaChiusa) => boolean }[] = [
    {
      contesto: "GRUPPO_FASCIA_GIORNO",
      filtro: (c) =>
        gruppoDi(c.partySize) === gruppo &&
        fasciaDi(c.startsAt, timezone) === fascia &&
        tipoGiornoDi(c.startsAt, timezone) === tipo,
    },
    {
      contesto: "GRUPPO_FASCIA",
      filtro: (c) => gruppoDi(c.partySize) === gruppo && fasciaDi(c.startsAt, timezone) === fascia,
    },
    { contesto: "GRUPPO", filtro: (c) => gruppoDi(c.partySize) === gruppo },
    { contesto: "LOCALE", filtro: () => true },
  ];

  for (const gradino of scala) {
    const misura = durataTipica(cene.filter(gradino.filtro).map(comeRigaSeduta));
    if (!misura) continue;

    const durataMin = arrotonda(misura.medianaMin);
    const dove = ETICHETTA[gradino.contesto](gruppo, fascia, tipo);
    const limitata =
      durataMin !== Math.round(misura.medianaMin / 5) * 5
        ? ` La misura è stata tenuta entro ${durataUmana(DURATA_MINIMA_MIN)} e ${durataUmana(DURATA_MASSIMA_MIN)}.`
        : "";

    return {
      durataMin,
      fonte: "MISURATO",
      contesto: gradino.contesto,
      misurate: misura.misurate,
      // «misurata» si accorda con «la durata», che è il soggetto della frase
      // in cui questa spiegazione viene mostrata: «Durata proposta: …».
      spiegazione: `${durataUmana(durataMin)}, misurata su ${misura.misurate} cene chiuse (${dove}).${limitata}`,
    };
  }

  return {
    durataMin: DURATA_PREDEFINITA_MIN,
    fonte: "PREDEFINITA",
    contesto: "NESSUNO",
    misurate: null,
    spiegazione: `${durataUmana(
      DURATA_PREDEFINITA_MIN,
    )}, durata predefinita: non ci sono ancora ${MINIMO_CONTESTO} cene chiuse da cui misurare.`,
  };
}

/**
 * Il prontuario: le cene chiuse lette una volta, e poi tante risposte.
 *
 * Serve al motore di disponibilità, che di una giornata calcola sessanta
 * orari: chiedere «quanto dura questa cena» sessanta volte al database
 * sarebbe la pagina più delicata del prodotto resa lenta per un dettaglio.
 * Le risposte si tengono in cache per contesto — di una giornata i contesti
 * distinti sono due, pranzo e cena — quindi la mediana si calcola due volte,
 * non sessanta.
 */
export type Prontuario = {
  per: (richiesta: { partySize: number; startsAt: Date }) => DurataConsigliata;
  /** Quante cene chiuse ci sono in tutto: serve a chi vuole dichiararlo. */
  cene: number;
};

export function creaProntuario(cene: CenaChiusa[], timezone: string): Prontuario {
  const cache = new Map<string, DurataConsigliata>();
  return {
    cene: cene.length,
    per: (richiesta) => {
      const chiave = `${gruppoDi(richiesta.partySize)}|${fasciaDi(richiesta.startsAt, timezone)}|${tipoGiornoDi(
        richiesta.startsAt,
        timezone,
      )}`;
      const gia = cache.get(chiave);
      if (gia) return gia;
      const esito = scegliDurata(cene, richiesta, timezone);
      cache.set(chiave, esito);
      return esito;
    },
  };
}

/** Legge le cene chiuse degli ultimi novanta giorni e prepara il prontuario. */
export async function prontuarioDurate(
  venueId: string,
  opts: { now?: Date; giorni?: number; timezone?: string } = {},
): Promise<Prontuario> {
  const now = opts.now ?? new Date();
  const from = new Date(now.getTime() - (opts.giorni ?? GIORNI_DI_MISURA) * 24 * 3_600_000);

  const [venue, cene] = await Promise.all([
    opts.timezone
      ? Promise.resolve({ timezone: opts.timezone })
      : db.venue.findUnique({ where: { id: venueId }, select: { timezone: true } }),
    db.booking.findMany({
      where: {
        venueId,
        deletedAt: null,
        seatedAt: { not: null },
        closedAt: { not: null },
        startsAt: { gte: from, lte: now },
      },
      select: { partySize: true, startsAt: true, seatedAt: true, closedAt: true },
      /**
       * Le più recenti, e **con un tetto**.
       *
       * Questa lettura sta sull'endpoint pubblico più caldo che abbiamo:
       * senza tetto, un locale che fa duecento coperti al giorno la
       * trasformerebbe in diciottomila righe a ogni persona che apre il
       * widget. Duemila cene sono più che abbastanza per una mediana in ogni
       * contesto — un locale così ne ha centinaia per gruppo e fascia in
       * dieci giorni — e il lavoro resta limitato per sempre.
       */
      orderBy: { startsAt: "desc" },
      take: 2_000,
    }),
  ]);

  return creaProntuario(
    cene.map((c) => ({
      partySize: c.partySize,
      startsAt: c.startsAt,
      seatedAt: c.seatedAt!,
      closedAt: c.closedAt!,
    })),
    venue?.timezone ?? DEFAULT_VENUE_TIMEZONE,
  );
}

/**
 * La durata da proporre per una prenotazione, letta dal database.
 *
 * Una lettura sola, degli ultimi novanta giorni: la stessa finestra della
 * rotazione, perché è la stessa domanda guardata da un'altra parte.
 */
export async function durataConsigliata(
  venueId: string,
  richiesta: { partySize: number; startsAt: Date },
  opts: { now?: Date; giorni?: number; timezone?: string } = {},
): Promise<DurataConsigliata> {
  return (await prontuarioDurate(venueId, opts)).per(richiesta);
}
