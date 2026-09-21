import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { eventiInArrivo, listinoDaCorreggere, riconcilia } from "@/lib/riconciliazione";
import { logAttenzione, logEvento } from "@/lib/observability";
import { costoSesDelMese, costExplorerAttivo } from "./aws-cost-explorer";
import { STATI_A_COSTO } from "./ledger";
import { PROVIDER_AWS } from "./periodo";

/**
 * Confronta la fattura di Amazon con quello che abbiamo attribuito ai clienti.
 *
 * ## Cosa non fa, ed è la parte importante
 *
 * Non tocca le stime già scritte nel ledger. Una riga di consumo racconta cosa
 * credevamo di spendere in quel momento, e riscriverla a fine mese
 * cancellerebbe l'unica prova di quanto il listino fosse tarato male. Le
 * correzioni nascono come righe nuove (`status = RECONCILED`), e la differenza
 * fra ciò che credevamo e ciò che era resta leggibile per sempre.
 *
 * Non attribuisce ai clienti il costo non allocato. Amazon non sa dire quanto
 * costa un ristorante, e spalmare la differenza pro quota darebbe a ogni
 * cliente un numero preciso e falso.
 *
 * Non entra mai nel percorso di invio: il freno resta il ledger, in tempo
 * reale. Questo modulo gira dal cron, una volta al giorno, e se Amazon non
 * risponde non succede niente di male.
 */

/** Ogni quanto ha senso richiedere la fattura: si paga a richiesta. */
const ORE_FRA_DUE_LETTURE = 12;

export type RigaRiconciliazione = {
  provider: string;
  yearMonth: string;
  dichiarato: number | null;
  valutaDichiarata: string | null;
  attribuito: number;
  valutaAttribuita: string;
  nonAttribuito: number | null;
  scostamentoPct: number | null;
  inviiLedger: number;
  inviiSes: number;
  eventiSani: boolean;
  listinoDaRivedere: boolean;
  fonte: string;
  stato: string;
  lettoIl: Date | null;
};

/**
 * Quanto il nostro ledger ha attribuito ai clienti in un ciclo.
 *
 * Solo gli stati che fanno somma, come ovunque: un impegno non è una spesa e
 * un rifiuto non fatturato nemmeno. E raggruppato per valuta, perché sommare
 * dollari ed euro è il tipo di errore che non dà nessun segnale.
 */
export async function attribuitoAiClienti(
  yearMonth: string,
  provider = PROVIDER_AWS,
): Promise<{ valuta: string; importo: number; invii: number }[]> {
  const righe = await db.usageEvent.groupBy({
    by: ["currency"],
    where: { provider, yearMonth, status: { in: STATI_A_COSTO } },
    _sum: { estimatedCost: true, quantity: true },
  });

  return righe.map((r) => ({
    valuta: r.currency,
    importo: Number(r._sum.estimatedCost ?? 0),
    invii: r._sum.quantity ?? 0,
  }));
}

/** Quanti eventi `SEND` ci ha rimandato Amazon per quel ciclo. */
async function inviiConfermatiDaSes(yearMonth: string): Promise<number> {
  const [anno, mese] = yearMonth.split("-").map(Number);
  const inizio = new Date(Date.UTC(anno, mese - 1, 1));
  const fine = new Date(Date.UTC(anno, mese, 1));

  return db.campaignEvent.count({
    where: { type: "SEND", occurredAt: { gte: inizio, lt: fine } },
  });
}

/**
 * Riconcilia un ciclo e salva l'esito.
 *
 * `forza` salta l'attesa fra due letture: serve al pulsante «Riconcilia
 * adesso» del pannello, non al cron.
 */
export async function riconciliaCiclo(
  yearMonth: string,
  opzioni: { forza?: boolean; provider?: string } = {},
): Promise<RigaRiconciliazione> {
  const provider = opzioni.provider ?? PROVIDER_AWS;

  const perValuta = await attribuitoAiClienti(yearMonth, provider);
  /* La valuta del ledger è quella del listino: oggi una sola. Se un giorno ne
     convivessero due, questo è il punto in cui ce ne accorgiamo invece di
     sommarle in silenzio. */
  if (perValuta.length > 1) {
    logAttenzione("costi.riconciliazione.valute_miste", {
      yearMonth,
      valute: perValuta.map((v) => v.valuta).join(","),
    });
  }
  const principale = perValuta[0] ?? { valuta: "USD", importo: 0, invii: 0 };

  const esistente = await db.costReconciliation.findUnique({
    where: { provider_yearMonth_region: { provider, yearMonth, region: "" } },
  });

  /*
    Si chiede ad Amazon solo se serve: ogni richiesta a Cost Explorer si paga, e
    il cron passa ogni venti minuti. Senza questo freno sarebbero settantadue
    richieste al giorno per un dato che cambia una volta al giorno.
  */
  const scaduto =
    !esistente?.fetchedAt ||
    Date.now() - esistente.fetchedAt.getTime() > ORE_FRA_DUE_LETTURE * 3_600_000;

  let dichiarato: number | null = esistente?.awsReportedAmount ? Number(esistente.awsReportedAmount) : null;
  let valutaDichiarata = esistente?.awsReportedCurrency ?? null;
  let lettoIl = esistente?.fetchedAt ?? null;
  let fonte = esistente?.fonte ?? "NON_DISPONIBILE";

  if (costExplorerAttivo() && (opzioni.forza || scaduto)) {
    const reale = await costoSesDelMese(yearMonth);
    if (reale) {
      dichiarato = reale.importo;
      valutaDichiarata = reale.valuta;
      lettoIl = new Date();
      fonte = "COST_EXPLORER";
    }
  }

  /* Valute diverse non si confrontano: un dollaro contro un euro produrrebbe
     uno scostamento del tredici per cento che non esiste. */
  const confrontabile = dichiarato !== null && (valutaDichiarata ?? principale.valuta) === principale.valuta;
  const esito = riconcilia(confrontabile ? dichiarato : null, principale.importo);

  const inviiSes = await inviiConfermatiDaSes(yearMonth);
  const eventiSani = eventiInArrivo(principale.invii, inviiSes);

  const salvata = await db.costReconciliation.upsert({
    where: { provider_yearMonth_region: { provider, yearMonth, region: "" } },
    create: {
      provider,
      yearMonth,
      region: "",
      awsReportedAmount: dichiarato !== null ? new Prisma.Decimal(dichiarato.toFixed(6)) : null,
      awsReportedCurrency: valutaDichiarata,
      allocatedAmount: new Prisma.Decimal(principale.importo.toFixed(6)),
      allocatedCurrency: principale.valuta,
      unallocatedAmount: esito.nonAttribuito !== null ? new Prisma.Decimal(esito.nonAttribuito.toFixed(6)) : null,
      scostamentoPct: esito.scostamentoPct !== null ? new Prisma.Decimal(esito.scostamentoPct.toFixed(4)) : null,
      inviiLedger: principale.invii,
      inviiSes,
      fonte,
      stato: esito.stato,
      fetchedAt: lettoIl,
    },
    update: {
      awsReportedAmount: dichiarato !== null ? new Prisma.Decimal(dichiarato.toFixed(6)) : null,
      awsReportedCurrency: valutaDichiarata,
      allocatedAmount: new Prisma.Decimal(principale.importo.toFixed(6)),
      allocatedCurrency: principale.valuta,
      unallocatedAmount: esito.nonAttribuito !== null ? new Prisma.Decimal(esito.nonAttribuito.toFixed(6)) : null,
      scostamentoPct: esito.scostamentoPct !== null ? new Prisma.Decimal(esito.scostamentoPct.toFixed(4)) : null,
      inviiLedger: principale.invii,
      inviiSes,
      fonte,
      stato: esito.stato,
      fetchedAt: lettoIl,
    },
  });

  if (!eventiSani) {
    logAttenzione("costi.riconciliazione.eventi_mancanti", {
      yearMonth,
      inviiLedger: principale.invii,
      inviiSes,
    });
  }
  if (listinoDaCorreggere(esito.scostamentoPct)) {
    logEvento("costi.riconciliazione.listino_da_rivedere", {
      yearMonth,
      scostamentoPct: esito.scostamentoPct,
    });
  }

  return leggiRiga(salvata, eventiSani);
}

/**
 * Registra a mano il costo reale di un mese: la fattura letta dal cruscotto.
 *
 * Esiste perché il permesso su Cost Explorer può arrivare dopo, o non arrivare
 * mai, e perché una riconciliazione fatta guardando la fattura vera vale più
 * di una API. La fonte resta scritta accanto al numero: chi legge deve sapere
 * se quel dato l'ha preso una macchina o una persona.
 */
export async function registraCostoReale(input: {
  yearMonth: string;
  importo: number;
  valuta: string;
  nota?: string;
  provider?: string;
}): Promise<RigaRiconciliazione> {
  const provider = input.provider ?? PROVIDER_AWS;
  const perValuta = await attribuitoAiClienti(input.yearMonth, provider);
  const principale = perValuta[0] ?? { valuta: input.valuta, importo: 0, invii: 0 };
  const esito = riconcilia(input.valuta === principale.valuta ? input.importo : null, principale.importo);

  const salvata = await db.costReconciliation.upsert({
    where: { provider_yearMonth_region: { provider, yearMonth: input.yearMonth, region: "" } },
    create: {
      provider,
      yearMonth: input.yearMonth,
      region: "",
      awsReportedAmount: new Prisma.Decimal(input.importo.toFixed(6)),
      awsReportedCurrency: input.valuta,
      allocatedAmount: new Prisma.Decimal(principale.importo.toFixed(6)),
      allocatedCurrency: principale.valuta,
      unallocatedAmount: esito.nonAttribuito !== null ? new Prisma.Decimal(esito.nonAttribuito.toFixed(6)) : null,
      scostamentoPct: esito.scostamentoPct !== null ? new Prisma.Decimal(esito.scostamentoPct.toFixed(4)) : null,
      inviiLedger: principale.invii,
      inviiSes: await inviiConfermatiDaSes(input.yearMonth),
      fonte: "MANUALE",
      stato: esito.stato,
      note: input.nota?.slice(0, 300) ?? null,
      fetchedAt: new Date(),
    },
    update: {
      awsReportedAmount: new Prisma.Decimal(input.importo.toFixed(6)),
      awsReportedCurrency: input.valuta,
      allocatedAmount: new Prisma.Decimal(principale.importo.toFixed(6)),
      allocatedCurrency: principale.valuta,
      unallocatedAmount: esito.nonAttribuito !== null ? new Prisma.Decimal(esito.nonAttribuito.toFixed(6)) : null,
      scostamentoPct: esito.scostamentoPct !== null ? new Prisma.Decimal(esito.scostamentoPct.toFixed(4)) : null,
      fonte: "MANUALE",
      stato: esito.stato,
      note: input.nota?.slice(0, 300) ?? null,
      fetchedAt: new Date(),
    },
  });

  logEvento("costi.riconciliazione.manuale", { yearMonth: input.yearMonth, importo: input.importo });
  return leggiRiga(salvata, true);
}

/** Le riconciliazioni salvate, dalla più recente. */
export async function storicoRiconciliazioni(quante = 12): Promise<RigaRiconciliazione[]> {
  const righe = await db.costReconciliation.findMany({
    orderBy: { yearMonth: "desc" },
    take: quante,
  });
  return righe.map((r) => leggiRiga(r, eventiInArrivo(r.inviiLedger, r.inviiSes)));
}

type RigaSalvata = Awaited<ReturnType<typeof db.costReconciliation.findFirstOrThrow>>;

function leggiRiga(r: RigaSalvata, eventiSani: boolean): RigaRiconciliazione {
  const scostamento = r.scostamentoPct !== null ? Number(r.scostamentoPct) : null;
  return {
    provider: r.provider,
    yearMonth: r.yearMonth,
    dichiarato: r.awsReportedAmount !== null ? Number(r.awsReportedAmount) : null,
    valutaDichiarata: r.awsReportedCurrency,
    attribuito: Number(r.allocatedAmount),
    valutaAttribuita: r.allocatedCurrency,
    nonAttribuito: r.unallocatedAmount !== null ? Number(r.unallocatedAmount) : null,
    scostamentoPct: scostamento,
    inviiLedger: r.inviiLedger,
    inviiSes: r.inviiSes,
    eventiSani,
    listinoDaRivedere: listinoDaCorreggere(scostamento),
    fonte: r.fonte,
    stato: r.stato,
    lettoIl: r.fetchedAt,
  };
}
