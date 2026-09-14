import { db } from "@/lib/db";
import { eUnaVisita } from "@/lib/visite";

/**
 * Il CRM del cliente: quello che si può dire di lui **partendo dai conti**.
 *
 * `guest-intelligence.ts` risponde alla domanda «che cliente è» leggendo le
 * prenotazioni: quante visite, ogni quanto, che giorno, che tavolo. È tutto
 * quello che si poteva sapere prima che esistessero i conti al tavolo.
 *
 * Adesso i conti esistono — `Order` ha `guestId` **e** `bookingId`, e
 * `OrderItem` ha `menuItemId` — e con loro si possono rispondere le tre
 * domande che mancavano: *quanto spende*, *cosa ordina*, *sta smettendo di
 * venire*. Questo modulo fa solo quelle, e le fa dalle righe.
 *
 * ## La regola, di nuovo
 *
 * Ogni numero qui dentro o è misurato o non c'è. Non c'è una sola costante
 * che assomigli a un dato: dove il calcolo non si può fare — un cliente con
 * una visita sola non ha una «frequenza» — la funzione restituisce `null` e
 * la pagina scrive cosa manca. È la stessa disciplina di `spesa-ospiti.ts`,
 * dove chi non ha conti chiusi non compare nella mappa invece di comparire
 * con uno zero.
 *
 * Due conseguenze visibili, e sono volute:
 *
 * - **la spesa media è per conto chiuso, non per visita.** Sono numeri
 *   diversi: undici visite possono avere otto conti, perché non tutte le
 *   serate sono state battute. Dividere la spesa per le visite darebbe una
 *   media più bassa del vero e nessuno saprebbe perché — quindi si divide per
 *   i conti, e si dice su quanti conti è fatta.
 * - **le percentuali delle categorie sono sulla spesa, non sui piatti.** Un
 *   cliente che prende sei caffè e una bistecca non è un cliente da caffè.
 */

/* -------------------------------------------------------------------------- */
/*  Tipi                                                                      */
/* -------------------------------------------------------------------------- */

export type VisitaStorica = {
  bookingId: string;
  /** L'inizio della prenotazione: è la data che il cliente ricorda. */
  quando: string;
  coperti: number;
  tavolo: string | null;
  sala: string | null;
  /** Quanto ha lasciato quella sera, se quella sera è stata battuta. */
  spesaCents: number | null;
  /** Vero se è arrivato senza prenotare. */
  senzaPrenotazione: boolean;
  /** Quanto è rimasto, in minuti: solo se c'è sia l'accomodamento sia la chiusura. */
  permanenzaMin: number | null;
  /** I piatti di quella sera, i più cari per primi. Vuoto se non c'è conto. */
  piatti: { nome: string; quantita: number }[];
};

export type ProdottoPreferito = {
  menuItemId: string | null;
  nome: string;
  categoria: string | null;
  imageUrl: string | null;
  /** In quanti conti diversi compare: è «quante volte l'ha ordinato». */
  volte: number;
  /** Quanti pezzi in tutto: due tartare in una sera sono due pezzi, una volta. */
  quantita: number;
  spesaCents: number;
};

export type CategoriaPreferita = {
  nome: string;
  spesaCents: number;
  /** Quota sulla spesa totale attribuibile a una categoria, fra 0 e 1. */
  quota: number;
};

export type SpesaCliente = {
  /** La somma dei conti chiusi. È il «valore storico», non una stima. */
  totaleCents: number;
  /** Quanti conti la compongono: senza, la media non si può verificare. */
  conti: number;
  /** Media per conto chiuso. Nulla senza conti. */
  mediaContoCents: number | null;
  /** Il conto più alto di sempre. */
  massimoCents: number | null;
  ultimi30Cents: number;
  /**
   * Novanta giorni contro i novanta precedenti.
   *
   * Nulla quando **uno dei due periodi è vuoto**: una variazione da zero è
   * sempre «+∞%», che non è un'informazione, e una variazione verso zero è
   * «-100%» anche per un cliente che ha solo cambiato mese.
   */
  variazione90: { correnteCents: number; precedenteCents: number; delta: number } | null;
};

export type RitmoVisite = {
  totali: number;
  ultimi30: number;
  ultimi90: number;
  /** Giorni medi fra una visita e l'altra. Nullo con meno di due visite. */
  cadenzaGiorni: number | null;
  giorniDaUltima: number | null;
  /** Ogni visita, dalla più vecchia: la serie che disegna il grafico. */
  date: string[];
};

export type Abitudini = {
  giorno: { label: string; quota: number } | null;
  /** L'ora tipica di arrivo, come intervallo di mezz'ore attorno alla moda. */
  fascia: { da: string; a: string; quota: number } | null;
  copertiMedi: number | null;
  /** Permanenza media in minuti, e su quante serate è misurata. */
  permanenza: { minuti: number; misurataSu: number } | null;
  /** Quota di visite arrivate con una prenotazione, fra 0 e 1. */
  quotaPrenotazioni: { quota: number; su: number } | null;
  posto: { sala: string | null; tavolo: string | null; quota: number } | null;
};

export type StatoCliente = {
  chiave: "attivo" | "regolare" | "da_riattivare" | "nuovo" | "non_misurabile";
  label: string;
  /** Perché: uno stato senza il suo motivo è un'opinione del software. */
  perche: string;
};

export type CrmOspite = {
  visite: RitmoVisite;
  spesa: SpesaCliente;
  prodotti: ProdottoPreferito[];
  categorie: CategoriaPreferita[];
  abitudini: Abitudini;
  storico: VisitaStorica[];
  stato: StatoCliente;
};

/* -------------------------------------------------------------------------- */
/*  Aiutanti                                                                  */
/* -------------------------------------------------------------------------- */

const GIORNI = ["domenica", "lunedì", "martedì", "mercoledì", "giovedì", "venerdì", "sabato"] as const;

/**
 * Giorni di calendario fra due istanti.
 *
 * La stessa funzione di `guest-intelligence`, e per la stessa ragione: contare
 * le ore dà «2 giorni fa» per una cena del 4 guardata il 7, e accanto alla
 * data scritta sembra un errore. Una persona conta i giorni sul calendario.
 */
function giorniDiCalendario(da: Date, a: Date): number {
  const inizio = Date.UTC(da.getFullYear(), da.getMonth(), da.getDate());
  const fine = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
  return Math.max(0, Math.round((fine - inizio) / 86_400_000));
}

/** Il valore più frequente, con la sua quota. `null` su lista vuota. */
function moda<T>(valori: T[], chiave: (v: T) => string): { value: T; count: number; share: number } | null {
  if (valori.length === 0) return null;
  const gruppi = new Map<string, { value: T; count: number }>();
  for (const v of valori) {
    const k = chiave(v);
    const g = gruppi.get(k);
    if (g) g.count += 1;
    else gruppi.set(k, { value: v, count: 1 });
  }
  let migliore: { value: T; count: number } | null = null;
  for (const g of gruppi.values()) if (!migliore || g.count > migliore.count) migliore = g;
  return migliore ? { ...migliore, share: migliore.count / valori.length } : null;
}

function hhmm(minutiDaMezzanotte: number): string {
  const m = ((minutiDaMezzanotte % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

/* -------------------------------------------------------------------------- */
/*  Lo stato del cliente                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Attivo, regolare, da riattivare — **misurato sul suo ritmo, non sul nostro**.
 *
 * È la parte di questo modulo che sarebbe stato più facile inventare: una
 * soglia fissa, «non viene da sessanta giorni, quindi è a rischio», e via.
 * Sarebbe sbagliata per la metà dei clienti. Chi viene ogni sabato e manca da
 * un mese ha saltato quattro appuntamenti; chi viene due volte l'anno e manca
 * da un mese è perfettamente in orario. Lo stesso numero di giorni descrive
 * due situazioni opposte.
 *
 * Quindi il metro è **la cadenza storica di quella persona**: ogni quanti
 * giorni è venuta finora, e quanti ne sono passati dall'ultima volta. Il
 * rapporto fra i due dice tutto.
 *
 * - fino a 1,5 volte la sua cadenza → **attivo**: è nella normalità, anche
 *   con un po' di ritardo;
 * - fino a 3 volte → **regolare**: sta allungando i tempi, ma non è ancora
 *   sparito;
 * - oltre 3 volte → **da riattivare**: un cliente che veniva ogni venti
 *   giorni e non si vede da settanta ha cambiato abitudine, e questo è il
 *   momento in cui un richiamo serve ancora a qualcosa.
 *
 * Con meno di due visite una cadenza non esiste, e non la si inventa: si dice
 * che non c'è abbastanza storia. È il caso più comune in un archivio vero, e
 * scriverlo è più utile che mostrare uno stato a caso.
 */
export function statoCliente(
  visite: number,
  cadenzaGiorni: number | null,
  giorniDaUltima: number | null,
): StatoCliente {
  if (visite === 0) {
    return { chiave: "nuovo", label: "Mai venuto", perche: "Non ha ancora fatto una visita." };
  }
  if (visite < 2 || cadenzaGiorni == null || giorniDaUltima == null) {
    return {
      chiave: "non_misurabile",
      label: "Poca storia",
      perche: "Serve più di una visita per sapere ogni quanto torna.",
    };
  }

  // Una cadenza di zero giorni — due visite nello stesso giorno — spaccherebbe
  // la divisione. Un giorno è il minimo che ha senso come intervallo.
  const cadenza = Math.max(1, cadenzaGiorni);
  const rapporto = giorniDaUltima / cadenza;
  const ritmo = `Viene in media ogni ${cadenza} ${cadenza === 1 ? "giorno" : "giorni"}`;
  const silenzio = `${giorniDaUltima} ${giorniDaUltima === 1 ? "giorno" : "giorni"} dall'ultima volta`;

  if (rapporto <= 1.5) {
    return { chiave: "attivo", label: "Attivo", perche: `${ritmo}: ${silenzio}, è nel suo ritmo.` };
  }
  if (rapporto <= 3) {
    return {
      chiave: "regolare",
      label: "Regolare",
      perche: `${ritmo}, e sono passati ${giorniDaUltima} giorni: sta allungando i tempi.`,
    };
  }
  return {
    chiave: "da_riattivare",
    label: "Da riattivare",
    perche: `${ritmo}, ma non viene da ${giorniDaUltima}: più del triplo del suo intervallo.`,
  };
}

/* -------------------------------------------------------------------------- */
/*  Lettura                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Tutto il CRM di un cliente, in tre interrogazioni.
 *
 * Non una per riquadro: prenotazioni, conti e righe di conto arrivano insieme
 * e tutto il resto è aritmetica in memoria. Sono decine di righe per cliente,
 * non migliaia, e farle contare al database una sezione alla volta
 * significherebbe dieci giri per disegnare una pagina.
 */
export async function getCrmOspite(
  venueId: string,
  guestId: string,
  opts: { now?: Date } = {},
): Promise<CrmOspite> {
  const now = opts.now ?? new Date();

  const [prenotazioni, conti] = await Promise.all([
    db.booking.findMany({
      where: { guestId, venueId, deletedAt: null },
      select: {
        id: true,
        startsAt: true,
        status: true,
        source: true,
        partySize: true,
        seatedAt: true,
        closedAt: true,
        table: { select: { label: true, room: { select: { name: true } } } },
      },
      orderBy: { startsAt: "asc" },
    }),
    /*
      Solo i conti **chiusi**: è l'unico stato in cui il denaro è entrato, la
      stessa regola di `spesa-ospiti.ts`. Un conto aperto è una serata in
      corso, e metterlo nella spesa storica vorrebbe dire che il totale di un
      cliente cambia mentre è seduto.
    */
    db.order.findMany({
      where: { guestId, venueId, status: "COMPLETED" },
      select: {
        id: true,
        bookingId: true,
        totalCents: true,
        completedAt: true,
        scheduledAt: true,
        OrderItem: {
          select: {
            name: true,
            quantity: true,
            priceCents: true,
            menuItemId: true,
            MenuItem: {
              select: { name: true, imageUrl: true, MenuCategory: { select: { name: true } } },
            },
          },
        },
      },
      orderBy: { scheduledAt: "asc" },
    }),
  ]);

  /* ---------------------------------------------------------------- visite */

  const visite = prenotazioni.filter((b) => eUnaVisita(b.status));
  const dateVisite = visite.map((b) => b.startsAt);
  const ultima = dateVisite.at(-1) ?? null;
  const giorniDaUltima = ultima ? giorniDiCalendario(ultima, now) : null;

  let cadenza: number | null = null;
  if (dateVisite.length >= 2) {
    const spazi: number[] = [];
    for (let i = 1; i < dateVisite.length; i++) {
      spazi.push((dateVisite[i].getTime() - dateVisite[i - 1].getTime()) / 86_400_000);
    }
    cadenza = Math.round(spazi.reduce((a, b) => a + b, 0) / spazi.length);
  }

  const entro = (giorni: number) => now.getTime() - giorni * 86_400_000;
  const ritmo: RitmoVisite = {
    totali: visite.length,
    ultimi30: dateVisite.filter((d) => d.getTime() >= entro(30)).length,
    ultimi90: dateVisite.filter((d) => d.getTime() >= entro(90)).length,
    cadenzaGiorni: cadenza,
    giorniDaUltima,
    date: dateVisite.map((d) => d.toISOString()),
  };

  /* ----------------------------------------------------------------- spesa */

  // La data di un conto è quando è stato chiuso; `scheduledAt` è il ripiego
  // per i conti che il POS ha importato senza l'ora di chiusura.
  const quandoConto = (o: (typeof conti)[number]) => o.completedAt ?? o.scheduledAt;

  const totaleCents = conti.reduce((n, o) => n + o.totalCents, 0);
  const correnti = conti.filter((o) => quandoConto(o).getTime() >= entro(90));
  const precedenti = conti.filter((o) => {
    const t = quandoConto(o).getTime();
    return t >= entro(180) && t < entro(90);
  });
  const sommaCorrenti = correnti.reduce((n, o) => n + o.totalCents, 0);
  const sommaPrecedenti = precedenti.reduce((n, o) => n + o.totalCents, 0);

  const spesa: SpesaCliente = {
    totaleCents,
    conti: conti.length,
    mediaContoCents: conti.length ? Math.round(totaleCents / conti.length) : null,
    massimoCents: conti.length ? Math.max(...conti.map((o) => o.totalCents)) : null,
    ultimi30Cents: conti
      .filter((o) => quandoConto(o).getTime() >= entro(30))
      .reduce((n, o) => n + o.totalCents, 0),
    // Entrambi i periodi devono avere qualcosa dentro, altrimenti la
    // percentuale è una divisione per zero travestita da tendenza.
    variazione90:
      correnti.length > 0 && precedenti.length > 0
        ? {
            correnteCents: sommaCorrenti,
            precedenteCents: sommaPrecedenti,
            delta: (sommaCorrenti - sommaPrecedenti) / sommaPrecedenti,
          }
        : null,
  };

  /* -------------------------------------------------------------- prodotti */

  /*
    «Volte» e «quantità» sono due numeri diversi e servono tutti e due: due
    tartare nella stessa sera sono due pezzi ordinati **una** volta. Contare
    solo i pezzi direbbe che il cliente adora un piatto che ha preso una sera
    sola, per il tavolo.
  */
  type Accumulo = { p: ProdottoPreferito; conti: Set<string> };
  const perProdotto = new Map<string, Accumulo>();
  const perCategoria = new Map<string, number>();

  for (const conto of conti) {
    for (const riga of conto.OrderItem) {
      // Il nome sulla riga, non quello del menu: è quello che è stato battuto
      // quella sera, e un piatto rinominato dopo non deve riscrivere la
      // storia di chi l'ha mangiato.
      const chiave = riga.menuItemId ?? `libero:${riga.name.toLowerCase()}`;
      const spesaRiga = riga.priceCents * riga.quantity;
      const categoria = riga.MenuItem?.MenuCategory?.name ?? null;

      const acc = perProdotto.get(chiave);
      if (acc) {
        acc.p.quantita += riga.quantity;
        acc.p.spesaCents += spesaRiga;
        acc.conti.add(conto.id);
      } else {
        perProdotto.set(chiave, {
          p: {
            menuItemId: riga.menuItemId,
            nome: riga.name,
            categoria,
            imageUrl: riga.MenuItem?.imageUrl ?? null,
            volte: 0,
            quantita: riga.quantity,
            spesaCents: spesaRiga,
          },
          conti: new Set([conto.id]),
        });
      }

      /*
        Le righe senza piatto di menu esistono — un extra battuto a mano — e
        non hanno categoria. Finiscono sotto «Altro» invece di sparire: la
        somma delle percentuali deve fare cento, altrimenti chi legge cerca il
        pezzo che manca.
      */
      const nomeCat = categoria ?? "Altro";
      perCategoria.set(nomeCat, (perCategoria.get(nomeCat) ?? 0) + spesaRiga);
    }
  }

  const prodotti = [...perProdotto.values()]
    .map(({ p, conti: c }) => ({ ...p, volte: c.size }))
    .sort((a, b) => b.volte - a.volte || b.spesaCents - a.spesaCents)
    .slice(0, 6);

  const spesaCategorizzata = [...perCategoria.values()].reduce((a, b) => a + b, 0);
  const categorie: CategoriaPreferita[] = [...perCategoria.entries()]
    .map(([nome, cents]) => ({
      nome,
      spesaCents: cents,
      quota: spesaCategorizzata ? cents / spesaCategorizzata : 0,
    }))
    .sort((a, b) => b.spesaCents - a.spesaCents);

  /* ------------------------------------------------------------- abitudini */

  const giornoModa = moda(
    visite.map((b) => b.startsAt.getDay()),
    (g) => String(g),
  );

  /*
    L'ora tipica, arrotondata alla mezz'ora.

    Sulle ore intere «20» e «20:45» sono due gruppi diversi, e un cliente che
    arriva sempre verso le nove non risulterebbe avere nessuna abitudine. La
    mezz'ora è il passo con cui si prenota, quindi è il passo con cui l'orario
    va raggruppato — e l'intervallo mostrato è quella mezz'ora più la
    successiva, cioè «arriva fra le 20:30 e le 21:30», che è il modo in cui la
    direbbe una persona.
  */
  const mezzOra = (d: Date) => Math.floor((d.getHours() * 60 + d.getMinutes()) / 30) * 30;
  const fasciaModa = moda(visite.map((b) => mezzOra(b.startsAt)), (m) => String(m));

  const conTempi = visite.filter((b) => b.seatedAt && b.closedAt);
  const permanenze = conTempi.map(
    (b) => (b.closedAt!.getTime() - b.seatedAt!.getTime()) / 60_000,
  );

  const postoModa = moda(
    visite.filter((b) => b.table).map((b) => b.table!),
    (t) => `${t.room?.name ?? ""}|${t.label}`,
  );

  const abitudini: Abitudini = {
    giorno: giornoModa ? { label: GIORNI[giornoModa.value], quota: giornoModa.share } : null,
    fascia: fasciaModa
      ? { da: hhmm(fasciaModa.value), a: hhmm(fasciaModa.value + 60), quota: fasciaModa.share }
      : null,
    copertiMedi: visite.length
      ? Math.round((visite.reduce((n, b) => n + b.partySize, 0) / visite.length) * 10) / 10
      : null,
    permanenza: permanenze.length
      ? {
          minuti: Math.round(permanenze.reduce((a, b) => a + b, 0) / permanenze.length),
          misurataSu: permanenze.length,
        }
      : null,
    // `WALK_IN` è l'unica sorgente che vuol dire «è entrato senza prenotare»:
    // telefono, widget, Google e concierge sono tutte prenotazioni.
    quotaPrenotazioni: visite.length
      ? {
          quota: visite.filter((b) => b.source !== "WALK_IN").length / visite.length,
          su: visite.length,
        }
      : null,
    posto: postoModa
      ? {
          sala: postoModa.value.room?.name ?? null,
          tavolo: postoModa.value.label,
          quota: postoModa.share,
        }
      : null,
  };

  /* --------------------------------------------------------------- storico */

  const contiPerPrenotazione = new Map<string, (typeof conti)[number][]>();
  for (const o of conti) {
    if (!o.bookingId) continue;
    const lista = contiPerPrenotazione.get(o.bookingId);
    if (lista) lista.push(o);
    else contiPerPrenotazione.set(o.bookingId, [o]);
  }

  const storico: VisitaStorica[] = [...visite]
    .reverse()
    .map((b) => {
      const suoi = contiPerPrenotazione.get(b.id) ?? [];
      const righe = suoi.flatMap((o) => o.OrderItem);
      return {
        bookingId: b.id,
        quando: b.startsAt.toISOString(),
        coperti: b.partySize,
        tavolo: b.table?.label ?? null,
        sala: b.table?.room?.name ?? null,
        // Nessun conto non è «zero euro»: è una serata che non è stata
        // battuta, ed è un'informazione diversa.
        spesaCents: suoi.length ? suoi.reduce((n, o) => n + o.totalCents, 0) : null,
        senzaPrenotazione: b.source === "WALK_IN",
        permanenzaMin:
          b.seatedAt && b.closedAt
            ? Math.round((b.closedAt.getTime() - b.seatedAt.getTime()) / 60_000)
            : null,
        // I più cari per primi: è quello che descrive la serata. Tre e basta —
        // l'elenco completo sta sul conto, non nello storico.
        piatti: righe
          .slice()
          .sort((x, y) => y.priceCents * y.quantity - x.priceCents * x.quantity)
          .slice(0, 3)
          .map((r) => ({ nome: r.name, quantita: r.quantity })),
      };
    });

  return {
    visite: ritmo,
    spesa,
    prodotti,
    categorie,
    abitudini,
    storico,
    stato: statoCliente(visite.length, cadenza, giorniDaUltima),
  };
}
