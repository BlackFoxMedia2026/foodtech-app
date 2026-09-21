import { db } from "@/lib/db";

/**
 * Il listino: quanto costa un'unità di un servizio, adesso.
 *
 * Prima di questa tabella il costo era `DEM_COSTO_PER_MILLE_USD`, una
 * variabile d'ambiente: cambiare un prezzo voleva dire pubblicare una versione
 * dell'applicazione, e i prezzi di Amazon cambiano quando decide Amazon.
 *
 * I servizi che non usiamo non hanno righe attive, e non compaiono da nessuna
 * parte — è così che il dettaglio costi mostra solo quello che consumiamo
 * davvero, senza righe a zero che fanno scorrere una tabella per niente.
 */

export type PrezzoApplicato = {
  service: string;
  label: string;
  unit: string;
  unitPrice: number;
  currency: string;
};

/**
 * Il prezzo valido a una certa data.
 *
 * **A una certa data**, non «l'ultimo»: ricalcolare il costo di marzo con il
 * listino di settembre riscriverebbe la storia, e la riconciliazione con la
 * fattura vera non tornerebbe mai più.
 *
 * Fra due righe valide vince la più recente per `effectiveFrom`: è il modo in
 * cui un prezzo nuovo si prepara in anticipo senza spegnere quello vecchio a
 * mano nel momento esatto del cambio.
 */
export async function prezzoDi(
  provider: string,
  service: string,
  quando: Date = new Date(),
): Promise<PrezzoApplicato | null> {
  const riga = await db.providerPrice.findFirst({
    where: {
      provider,
      service,
      active: true,
      effectiveFrom: { lte: quando },
      OR: [{ effectiveTo: null }, { effectiveTo: { gte: quando } }],
    },
    orderBy: { effectiveFrom: "desc" },
  });
  if (!riga) return null;

  return {
    service: riga.service,
    label: riga.label,
    unit: riga.unit,
    unitPrice: Number(riga.unitPrice),
    currency: riga.currency,
  };
}

/** Tutti i servizi con un prezzo attivo: è l'elenco di cosa stiamo pagando. */
export async function serviziAttivi(
  provider: string,
  quando: Date = new Date(),
): Promise<PrezzoApplicato[]> {
  const righe = await db.providerPrice.findMany({
    where: {
      provider,
      active: true,
      effectiveFrom: { lte: quando },
      OR: [{ effectiveTo: null }, { effectiveTo: { gte: quando } }],
    },
    orderBy: [{ service: "asc" }, { effectiveFrom: "desc" }],
  });

  // Una riga per servizio: la più recente fra quelle valide.
  const perServizio = new Map<string, (typeof righe)[number]>();
  for (const r of righe) if (!perServizio.has(r.service)) perServizio.set(r.service, r);

  return [...perServizio.values()].map((r) => ({
    service: r.service,
    label: r.label,
    unit: r.unit,
    unitPrice: Number(r.unitPrice),
    currency: r.currency,
  }));
}
