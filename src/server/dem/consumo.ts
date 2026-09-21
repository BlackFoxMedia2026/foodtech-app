import { Prisma, type DemUsagePeriod } from "@prisma/client";
import { db } from "@/lib/db";
import {
  cicloDi,
  disponibili,
  percentualeUsata,
  sogliaDaAvvisare,
  verificaQuota,
  type EsitoQuota,
} from "@/lib/dem-quota";
import { createNotification } from "@/server/notifications";
import { logAttenzione } from "@/lib/observability";
import { abbonamentoDi, limiteDi, type AbbonamentoConPiano } from "./abbonamento";

/**
 * Quanti invii sono stati usati, quanti restano, e chi se li è presi.
 *
 * ## La riga per ciclo, e perché non un contatore
 *
 * Un solo numero azzerato al rinnovo risponde a «quanti me ne restano» e a
 * nient'altro. «Quanto ho speso ad agosto» è una domanda che un cliente fa
 * davvero — è così che decide se il piano gli serve — e uno storico che si
 * cancella da solo ogni mese non ha modo di rispondere. Quindi una riga per
 * ciclo, con il limite di **quel** ciclo congelato dentro.
 *
 * ## Le tre colonne
 *
 * `used` sono gli invii partiti. `reserved` sono quelli impegnati da una
 * campagna programmata o a metà strada. Disponibili = limite − usati −
 * riservati, ed è la sottrazione dei riservati a rendere impossibile la scena
 * di §19: due schede aperte, due campagne da ottomila su diecimila
 * disponibili, e tutte e due che passano il controllo nello stesso istante.
 *
 * ## Perché SQL a mano per riservare
 *
 * Perché la condizione è un confronto **fra colonne** («ce n'è abbastanza?») e
 * deve stare nella stessa istruzione che sottrae. Leggere, decidere in
 * JavaScript e poi scrivere lascia in mezzo una finestra in cui un'altra
 * richiesta legge lo stesso numero: è esattamente il modo in cui questi conti
 * vanno in negativo. Con una `UPDATE ... WHERE` condizionata la decisione la
 * prende Postgres, una volta sola, e chi vede zero righe aggiornate sa di aver
 * perso la corsa — la stessa forma che usa già `claimJob` nella coda.
 */

/**
 * Gli invii concessi in più da un'autorizzazione del Super Admin, per questo
 * ciclo. Zero quando non ce ne sono, che è quasi sempre.
 */
async function inviiAutorizzatiInPiu(venueId: string, yearMonth: string): Promise<number> {
  const righe = await db.costOverride.findMany({
    where: { venueId, yearMonth, kind: "EMAILS" },
    select: { oldValue: true, newValue: true },
  });
  return righe.reduce((somma, r) => somma + Math.max(0, r.newValue - r.oldValue), 0);
}

export type PeriodoCorrente = {
  sub: AbbonamentoConPiano;
  periodo: DemUsagePeriod;
  limite: number;
};

/**
 * Il ciclo di consumo di adesso, creandolo se è il primo invio del mese.
 *
 * Il limite della riga insegue quello dell'abbonamento: serve all'upgrade
 * (§9), dove il tetto sale **senza** azzerare quello che è già stato speso —
 * 17.000/20.000 diventa 17.000/100.000, non 0/100.000. Non serve per i
 * downgrade, che non arrivano mai a metà ciclo: entrano in vigore al rinnovo
 * (vedi `rinnovaSeScaduto`), quando la riga del ciclo nuovo nasce già con il
 * tetto nuovo.
 */
export async function periodoCorrente(venueId: string, adesso = new Date()): Promise<PeriodoCorrente> {
  const sub = await abbonamentoDi(venueId, adesso);
  const yearMonth = cicloDi(sub.currentPeriodStart);
  /*
    Il tetto del ciclo è quello del piano **più** quanto il Super Admin ha
    autorizzato in più per questo mese.

    Sta qui e non solo nella colonna perché questa funzione riallinea
    `monthlyLimit` al piano ogni volta che li trova diversi — serve all'upgrade
    a metà mese — e senza questa somma cancellerebbe l'autorizzazione alla
    prima lettura successiva, silenziosamente, fermando la campagna che era
    stata appena sbloccata.

    E la somma vale per un ciclo solo: al mese nuovo non c'è nessuna riga da
    trovare, quindi il tetto torna da sé quello del piano. È l'unico modo per
    cui «temporaneo» non dipende da qualcuno che si ricorda di togliere una
    riga.
  */
  const extra = await inviiAutorizzatiInPiu(venueId, yearMonth);
  const limite = limiteDi(sub) + extra;

  // `upsert` non è al riparo dalla corsa: due richieste che aprono il ciclo
  // nello stesso istante arrivano entrambe al `create`, e una delle due trova
  // il vincolo di unicità. La riga c'è comunque — l'ha scritta l'altra — e
  // rileggerla è la risposta giusta, non un errore da mostrare.
  const periodo = await db.demUsagePeriod
    .upsert({
      where: { venueId_yearMonth: { venueId, yearMonth } },
      create: {
        venueId,
        yearMonth,
        periodStart: sub.currentPeriodStart,
        periodEnd: sub.currentPeriodEnd,
        monthlyLimit: limite,
        planSlug: sub.plan.slug,
      },
      update: {},
    })
    .catch(async (err: unknown) => {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        return db.demUsagePeriod.findUniqueOrThrow({ where: { venueId_yearMonth: { venueId, yearMonth } } });
      }
      throw err;
    });

  if (periodo.monthlyLimit === limite && periodo.planSlug === sub.plan.slug) {
    return { sub, periodo, limite };
  }

  const aggiornato = await db.demUsagePeriod.update({
    where: { id: periodo.id },
    data: { monthlyLimit: limite, planSlug: sub.plan.slug, periodEnd: sub.currentPeriodEnd },
  });
  return { sub, periodo: aggiornato, limite };
}

export type StatoConsumo = {
  pianoNome: string;
  pianoSlug: string;
  limite: number;
  usati: number;
  riservati: number;
  disponibili: number;
  percentuale: number;
  rinnovoIl: Date;
  ciclo: string;
  /** Il piano che entrerà in vigore al rinnovo, quando è stato scelto. */
  pianoProgrammato: string | null;
  sospeso: boolean;
  motivoSospensione: string | null;
};

/** Tutto quello che serve a disegnare la pagina «Il tuo piano DEM». */
export async function statoConsumo(venueId: string, adesso = new Date()): Promise<StatoConsumo> {
  const { sub, periodo, limite } = await periodoCorrente(venueId, adesso);
  const stato = { limite, usati: periodo.used, riservati: periodo.reserved };

  return {
    pianoNome: sub.plan.name,
    pianoSlug: sub.plan.slug,
    limite,
    usati: periodo.used,
    riservati: periodo.reserved,
    disponibili: disponibili(stato),
    percentuale: percentualeUsata(stato),
    rinnovoIl: sub.currentPeriodEnd,
    ciclo: periodo.yearMonth,
    pianoProgrammato: sub.scheduledPlan?.name ?? null,
    sospeso: sub.sendingPausedAt !== null,
    motivoSospensione: sub.sendingPausedReason,
  };
}

/** Lo storico: gli ultimi cicli, dal più recente. */
export async function storicoConsumo(venueId: string, quanti = 6): Promise<DemUsagePeriod[]> {
  return db.demUsagePeriod.findMany({
    where: { venueId },
    orderBy: { periodStart: "desc" },
    take: quanti,
  });
}

/** Basta la quota per questi destinatari? Non scrive niente: è la domanda. */
export async function quotaSufficiente(
  venueId: string,
  richiesti: number,
  adesso = new Date(),
): Promise<EsitoQuota> {
  const { periodo, limite } = await periodoCorrente(venueId, adesso);
  return verificaQuota({ limite, usati: periodo.used, riservati: periodo.reserved }, richiesti);
}

export type EsitoRiserva =
  | { riservata: true; ciclo: string; disponibiliDopo: number }
  | { riservata: false; disponibili: number; richiesti: number; mancanti: number };

/**
 * Impegna degli invii, o non ne impegna nessuno.
 *
 * Tutto o niente, e non è una preferenza di stile: riservarne una parte
 * significherebbe far partire una campagna verso metà dei destinatari scelti
 * dal caso. Chi resta fuori non lo sa nessuno — nemmeno chi ha premuto il
 * pulsante — e un mese dopo quella campagna risulterà «inviata».
 */
export async function riservaQuota(
  venueId: string,
  quantita: number,
  adesso = new Date(),
): Promise<EsitoRiserva> {
  if (quantita <= 0) {
    const { periodo, limite } = await periodoCorrente(venueId, adesso);
    return {
      riservata: true,
      ciclo: periodo.yearMonth,
      disponibiliDopo: disponibili({ limite, usati: periodo.used, riservati: periodo.reserved }),
    };
  }

  const { periodo } = await periodoCorrente(venueId, adesso);

  const righe = await db.$executeRaw`
    UPDATE "DemUsagePeriod"
       SET reserved = reserved + ${quantita}::int, "updatedAt" = NOW()
     WHERE id = ${periodo.id}
       AND ("monthlyLimit" - used - reserved) >= ${quantita}::int
  `;

  if (righe === 0) {
    // La corsa persa e la quota finita si vedono uguali da qui, e per chi
    // chiama sono la stessa cosa: non si può inviare, ecco quanto manca.
    const dopo = await db.demUsagePeriod.findUniqueOrThrow({ where: { id: periodo.id } });
    const liberi = disponibili({ limite: dopo.monthlyLimit, usati: dopo.used, riservati: dopo.reserved });
    return { riservata: false, disponibili: liberi, richiesti: quantita, mancanti: quantita - liberi };
  }

  const dopo = await db.demUsagePeriod.findUniqueOrThrow({ where: { id: periodo.id } });
  return {
    riservata: true,
    ciclo: dopo.yearMonth,
    disponibiliDopo: disponibili({ limite: dopo.monthlyLimit, usati: dopo.used, riservati: dopo.reserved }),
  };
}

/**
 * Restituisce invii impegnati e mai partiti.
 *
 * Succede in tre casi: una campagna programmata viene annullata, un
 * destinatario diventa non eleggibile fra la programmazione e l'invio, un
 * invio non riesce in modo definitivo. In tutti e tre non è partita una email,
 * e far pagare un invio che non c'è stato è il modo più veloce di perdere la
 * fiducia in un contatore.
 *
 * `GREATEST(..., 0)`: un rilascio ripetuto (un lavoro che riprova) non deve
 * poter mandare la colonna sotto zero.
 */
export async function rilasciaQuota(venueId: string, ciclo: string, quantita: number): Promise<void> {
  if (quantita <= 0) return;
  await db.$executeRaw`
    UPDATE "DemUsagePeriod"
       SET reserved = GREATEST(reserved - ${quantita}::int, 0), "updatedAt" = NOW()
     WHERE "venueId" = ${venueId} AND "yearMonth" = ${ciclo}
  `;
}

/**
 * Trasforma invii riservati in invii fatti.
 *
 * È il momento in cui un'email entra davvero nel processo di invio verso il
 * fornitore: prima di lì non ha consumato niente, e dopo non si torna
 * indietro. Le due colonne si muovono nella stessa istruzione perché sono due
 * facce dello stesso fatto, e vederle disallineate per un istante
 * significherebbe mostrare al cliente una disponibilità che non esiste.
 */
export async function consumaQuota(venueId: string, ciclo: string, quantita: number): Promise<void> {
  if (quantita <= 0) return;
  await db.$executeRaw`
    UPDATE "DemUsagePeriod"
       SET used = used + ${quantita}::int,
           reserved = GREATEST(reserved - ${quantita}::int, 0),
           "updatedAt" = NOW()
     WHERE "venueId" = ${venueId} AND "yearMonth" = ${ciclo}
  `;
}

/**
 * Consuma senza aver riservato prima, se c'è spazio.
 *
 * Serve agli invii di prova (§46): partono uno alla volta da dentro l'editor,
 * non hanno una campagna programmata dietro, e costano come gli altri perché
 * il fornitore li spedisce come gli altri. Se non c'è spazio non partono —
 * altrimenti «Invia test» diventerebbe il modo di spedire una campagna senza
 * pagarla.
 */
export async function consumaSubito(venueId: string, quantita: number, adesso = new Date()): Promise<boolean> {
  if (quantita <= 0) return true;
  const { periodo } = await periodoCorrente(venueId, adesso);
  const righe = await db.$executeRaw`
    UPDATE "DemUsagePeriod"
       SET used = used + ${quantita}::int, "updatedAt" = NOW()
     WHERE id = ${periodo.id}
       AND ("monthlyLimit" - used - reserved) >= ${quantita}::int
  `;
  return righe > 0;
}

/**
 * Avvisa quando il consumo attraversa una soglia, **una volta per ciclo**.
 *
 * La lista delle soglie già comunicate sta nella riga del ciclo e non in una
 * tabella di notifiche già inviate: è la stessa riga che si sta aggiornando, e
 * al rinnovo si azzera da sola perché il ciclo nuovo è una riga nuova.
 *
 * Da chiamare dopo aver consumato. Non solleva: un avviso mancato è un
 * fastidio, un invio bloccato da un avviso mancato è un guasto.
 */
export async function controllaSoglie(venueId: string, adesso = new Date()): Promise<void> {
  try {
    const { periodo } = await periodoCorrente(venueId, adesso);
    const percentuale = percentualeUsata({
      limite: periodo.monthlyLimit,
      usati: periodo.used,
      riservati: periodo.reserved,
    });
    const soglia = sogliaDaAvvisare(percentuale, periodo.notified);
    if (soglia === null) return;

    const testi: Record<number, { kind: "DEM_QUOTA_WARNING" | "DEM_QUOTA_NEAR_LIMIT" | "DEM_QUOTA_EXHAUSTED"; title: string; body: string }> = {
      80: {
        kind: "DEM_QUOTA_WARNING",
        title: "Stai raggiungendo il limite mensile delle tue campagne",
        body: `Hai usato l'${soglia}% degli invii di questo mese.`,
      },
      95: {
        kind: "DEM_QUOTA_NEAR_LIMIT",
        title: "Hai quasi terminato gli invii disponibili",
        body: "Restano pochi invii fino al rinnovo del tuo piano.",
      },
      100: {
        kind: "DEM_QUOTA_EXHAUSTED",
        title: "Hai terminato gli invii DEM disponibili",
        body: "Per continuare a inviare puoi passare a un piano superiore.",
      },
    };

    const testo = testi[soglia];
    if (!testo) return;

    await createNotification(venueId, {
      kind: testo.kind,
      title: testo.title,
      body: testo.body,
      link: "/settings/marketing/piano",
    });

    // Le soglie sotto a quella appena superata si segnano come comunicate: chi
    // passa dal 70 al 100 con una campagna sola non deve ricevere l'avviso
    // dell'80 al prossimo invio, quando è già fuori tempo massimo.
    const superate = [80, 95, 100].filter((s) => s <= soglia && !periodo.notified.includes(s));
    await db.demUsagePeriod.update({
      where: { id: periodo.id },
      data: { notified: [...periodo.notified, ...superate] },
    });
  } catch (err) {
    logAttenzione("dem.soglie.non_verificate", { venueId, errore: String(err) });
  }
}
