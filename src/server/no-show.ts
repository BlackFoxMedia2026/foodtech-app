import { db } from "@/lib/db";

/**
 * Quanto costano le assenze.
 *
 * Il rischio della singola prenotazione c'era già nel centro controllo, e
 * l'etichetta «a rischio» sulla scheda del cliente. Mancava la domanda che si
 * fa il proprietario a fine mese: **quanto mi costano, e quando succedono.**
 *
 * Un numero come «il 6% di assenze» non muove niente. «Trentadue coperti
 * persi, circa 1.400 €, e metà di martedì» muove: dice dove guardare e cosa
 * cambiare.
 *
 * Il valore di un coperto perso si calcola **dagli incassi veri quando ci
 * sono**: conti chiusi del periodo diviso i coperti che li hanno prodotti. Se
 * non ce ne sono, si usa lo scontrino medio dichiarato dal locale e **si dice
 * che è una stima**. Se non c'è nemmeno quello, il valore non si mostra:
 * inventare un prezzo per un coperto perso è il modo più rapido di far
 * prendere una decisione sbagliata.
 *
 * Le percentuali per giorno della settimana compaiono solo dove ci sono
 * abbastanza prenotazioni. Un martedì con due prenotazioni e un'assenza fa
 * «50% di assenze», che è vero e non significa niente.
 */

/** Sotto questo numero di prenotazioni una percentuale è rumore. */
export const MINIMO_PER_QUOTA = 10;

const GIORNI = ["domenica", "lunedì", "martedì", "mercoledì", "giovedì", "venerdì", "sabato"];

/**
 * «La domenica», «il lunedì».
 *
 * Si leggeva «Il domenica è il giorno peggiore»: domenica è l'unico giorno
 * femminile della settimana italiana, e l'articolo era scritto fisso nel
 * testo. Il fatto che sia uno su sette è esattamente la ragione per cui una
 * cosa così passa i controlli — sei volte su sette la frase è giusta.
 *
 * E l'articolo non è solo grammatica, è il senso: «la domenica» vuol dire le
 * domeniche in generale, che è quello che questo numero misura; «domenica» da
 * solo vuol dire la prossima.
 */
export function giornoConArticolo(giorno: string): string {
  return `${giorno === "domenica" ? "la" : "il"} ${giorno}`;
}

export type AssenzePerGiorno = {
  weekday: number;
  nome: string;
  prenotazioni: number;
  assenze: number;
  copertiPersi: number;
  /** Nulla quando le prenotazioni non bastano a farne una percentuale. */
  quota: number | null;
};

export type Recidivo = {
  guestId: string;
  nome: string;
  assenzeNelPeriodo: number;
  assenzeInTutto: number;
  visite: number;
};

export type ValoreCoperto =
  | { tipo: "misurato"; centesimi: number; suContiChiusi: number }
  | { tipo: "dichiarato"; centesimi: number }
  | { tipo: "sconosciuto" };

export type NoShowReport = {
  prenotazioni: number;
  assenze: number;
  copertiPersi: number;
  /** Nulla quando le prenotazioni del periodo non bastano. */
  quota: number | null;
  /** Come sappiamo quanto vale un coperto, e quanto vale. */
  valoreCoperto: ValoreCoperto;
  /** Quanto sono costate, se il valore di un coperto è noto. */
  costoCents: number | null;
  perGiorno: AssenzePerGiorno[];
  /** Il giorno peggiore, solo se la sua quota è calcolabile e sopra la media. */
  giornoPeggiore: AssenzePerGiorno | null;
  recidivi: Recidivo[];
  /** Quanti clienti hanno almeno due assenze nel periodo, anche oltre l'elenco. */
  recidiviTotali: number;
};

export async function getNoShowReport(venueId: string, from: Date, to: Date): Promise<NoShowReport> {
  const [prenotazioni, venue, contiChiusi] = await Promise.all([
    db.booking.findMany({
      where: { venueId, deletedAt: null, startsAt: { gte: from, lte: to } },
      select: {
        id: true,
        startsAt: true,
        partySize: true,
        status: true,
        guestId: true,
        guest: { select: { firstName: true, lastName: true, noShowCount: true, totalVisits: true } },
      },
    }),
    db.venue.findUnique({ where: { id: venueId }, select: { avgSpendCents: true } }),
    // I conti chiusi del periodo, con i coperti che li hanno prodotti: è da
    // qui che viene il valore misurato di un coperto.
    db.order.findMany({
      where: { venueId, status: "COMPLETED", completedAt: { gte: from, lte: to } },
      select: { totalCents: true, booking: { select: { partySize: true } } },
    }),
  ]);

  const assenti = prenotazioni.filter((b) => b.status === "NO_SHOW");
  const copertiPersi = assenti.reduce((s, b) => s + b.partySize, 0);

  /* ---- quanto vale un coperto ---- */
  const conCoperti = contiChiusi.filter((o) => o.booking != null);
  const copertiServiti = conCoperti.reduce((s, o) => s + (o.booking?.partySize ?? 0), 0);
  const incassoCents = conCoperti.reduce((s, o) => s + o.totalCents, 0);

  let valoreCoperto: ValoreCoperto;
  if (copertiServiti > 0 && incassoCents > 0) {
    valoreCoperto = {
      tipo: "misurato",
      centesimi: Math.round(incassoCents / copertiServiti),
      suContiChiusi: conCoperti.length,
    };
  } else if (venue?.avgSpendCents) {
    valoreCoperto = { tipo: "dichiarato", centesimi: venue.avgSpendCents };
  } else {
    valoreCoperto = { tipo: "sconosciuto" };
  }

  const costoCents =
    valoreCoperto.tipo === "sconosciuto" ? null : copertiPersi * valoreCoperto.centesimi;

  /* ---- per giorno della settimana ---- */
  const perGiorno: AssenzePerGiorno[] = GIORNI.map((nome, weekday) => {
    const delGiorno = prenotazioni.filter((b) => b.startsAt.getDay() === weekday);
    const assenzeDelGiorno = delGiorno.filter((b) => b.status === "NO_SHOW");
    return {
      weekday,
      nome,
      prenotazioni: delGiorno.length,
      assenze: assenzeDelGiorno.length,
      copertiPersi: assenzeDelGiorno.reduce((s, b) => s + b.partySize, 0),
      quota:
        delGiorno.length >= MINIMO_PER_QUOTA
          ? Math.round((assenzeDelGiorno.length / delGiorno.length) * 100)
          : null,
    };
  });

  const quota =
    prenotazioni.length >= MINIMO_PER_QUOTA
      ? Math.round((assenti.length / prenotazioni.length) * 100)
      : null;

  // Il giorno peggiore si nomina solo se c'è una media con cui confrontarlo e
  // se sta davvero sopra: senza, «il peggiore» è solo il primo dell'elenco.
  const candidati = perGiorno.filter((g) => g.quota != null && g.assenze > 0);
  const giornoPeggiore =
    quota != null && candidati.length > 0
      ? candidati.reduce((max, g) => ((g.quota ?? 0) > (max.quota ?? 0) ? g : max))
      : null;

  /* ---- chi non si presenta più di una volta ---- */
  const perOspite = new Map<string, Recidivo>();
  for (const b of assenti) {
    if (!b.guestId || !b.guest) continue;
    const gia = perOspite.get(b.guestId);
    if (gia) {
      gia.assenzeNelPeriodo += 1;
      continue;
    }
    perOspite.set(b.guestId, {
      guestId: b.guestId,
      nome: `${b.guest.firstName}${b.guest.lastName ? ` ${b.guest.lastName}` : ""}`,
      assenzeNelPeriodo: 1,
      assenzeInTutto: b.guest.noShowCount,
      visite: b.guest.totalVisits,
    });
  }
  const recidivi = [...perOspite.values()]
    .filter((r) => r.assenzeNelPeriodo >= 2)
    .sort((a, b) => b.assenzeNelPeriodo - a.assenzeNelPeriodo);

  return {
    prenotazioni: prenotazioni.length,
    assenze: assenti.length,
    copertiPersi,
    quota,
    valoreCoperto,
    costoCents,
    perGiorno,
    giornoPeggiore: giornoPeggiore && quota != null && (giornoPeggiore.quota ?? 0) > quota ? giornoPeggiore : null,
    recidivi: recidivi.slice(0, 8),
    recidiviTotali: recidivi.length,
  };
}
