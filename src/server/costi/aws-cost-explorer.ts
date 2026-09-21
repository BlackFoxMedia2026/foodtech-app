import { CostExplorerClient, GetCostAndUsageCommand } from "@aws-sdk/client-cost-explorer";
import { logAttenzione, logEvento } from "@/lib/observability";
import type { StatoCostExplorer } from "@/lib/salute-ses";

/**
 * Quanto ci ha fatturato Amazon per l'invio email, in un mese.
 *
 * ## Quello che questa API **non** può dirci
 *
 * Non può dire quanto costa un singolo ristorante. Cost Explorer espone
 * servizio, regione, account collegato e tipo di utilizzo; i tenant SES non
 * sono una dimensione della fatturazione, e le etichette sulle risorse non
 * finiscono nei record di utilizzo dei messaggi. Quindi da qui esce **un
 * numero per l'account**, e l'attribuzione ai clienti resta quella del nostro
 * ledger. È il motivo per cui la riconciliazione tiene tre colonne separate.
 *
 * ## Perché non può stare nel percorso di invio
 *
 * Due ragioni indipendenti, e ognuna basterebbe. I dati di Cost Explorer
 * arrivano con 24-48 ore di ritardo: una campagna decisa adesso non comparirà
 * mai in tempo per essere fermata. E ogni richiesta si paga (0,01 $): un
 * controllo pre-invio che la chiamasse costerebbe più delle email che
 * protegge, e renderebbe l'invio dipendente dalla disponibilità di un servizio
 * di fatturazione.
 *
 * Quindi: il freno usa il ledger, questa funzione serve solo a **verificare a
 * posteriori** se il listino è tarato bene.
 *
 * ## Spenta finché non si accende
 *
 * Serve `ce:GetCostAndUsage`, che la nostra policy IAM **non ha** — è stata
 * scritta con le sole azioni che il codice usava. Finché manca, o finché
 * `AWS_COST_EXPLORER_ENABLED` non vale «1», questa funzione restituisce `null`
 * e la riconciliazione lo scrive come «non disponibile» invece di inventare un
 * costo reale.
 */

export type CostoReale = {
  importo: number;
  valuta: string;
  /** Il periodo davvero coperto dalla risposta, non quello richiesto. */
  da: string;
  a: string;
};

export function costExplorerAttivo(): boolean {
  return process.env.AWS_COST_EXPLORER_ENABLED === "1";
}

let cliente: CostExplorerClient | null = null;

function client(): CostExplorerClient {
  /* Cost Explorer vive solo in us-east-1, qualunque sia la regione in cui
     spediamo: è un servizio globale con un endpoint solo, e puntarlo alla
     regione di invio produce un errore che sembra un problema di permessi. */
  if (!cliente) cliente = new CostExplorerClient({ region: "us-east-1" });
  return cliente;
}

/** Il primo giorno del mese successivo: Cost Explorer vuole la fine esclusa. */
function fineEsclusa(yearMonth: string): string {
  const [anno, mese] = yearMonth.split("-").map(Number);
  const d = new Date(Date.UTC(anno, mese, 1));
  return d.toISOString().slice(0, 10);
}

/**
 * Il costo SES dell'account per un mese, o `null` se non lo sappiamo.
 *
 * `null` non è un errore da nascondere: è la risposta onesta quando il
 * permesso manca, quando la funzione è spenta, o quando Amazon non risponde. È
 * la stessa disciplina del cambio mancante — meglio una colonna vuota che un
 * numero inventato che poi finisce in una decisione sui prezzi.
 */
export async function costoSesDelMese(yearMonth: string): Promise<CostoReale | null> {
  if (!costExplorerAttivo()) return null;

  const inizio = `${yearMonth}-01`;
  const fine = fineEsclusa(yearMonth);

  try {
    const risposta = await client().send(
      new GetCostAndUsageCommand({
        TimePeriod: { Start: inizio, End: fine },
        Granularity: "MONTHLY",
        /* Il costo non mischiato: è quello che si confronta con una fattura.
           `BlendedCost` ha senso solo fra account di un'organizzazione. */
        Metrics: ["UnblendedCost"],
        Filter: {
          Dimensions: { Key: "SERVICE", Values: ["Amazon Simple Email Service"] },
        },
      }),
    );

    const periodo = risposta.ResultsByTime?.[0];
    const totale = periodo?.Total?.UnblendedCost;
    if (!periodo || !totale?.Amount) {
      logAttenzione("costi.cost_explorer.risposta_vuota", { yearMonth });
      return null;
    }

    logEvento("costi.cost_explorer.letto", { yearMonth, importo: totale.Amount, valuta: totale.Unit });
    return {
      importo: Number(totale.Amount),
      valuta: totale.Unit ?? "USD",
      da: periodo.TimePeriod?.Start ?? inizio,
      a: periodo.TimePeriod?.End ?? fine,
    };
  } catch (err) {
    /* Un permesso mancante e una rete che non va si assomigliano da qui, e per
       chi chiama sono la stessa cosa: il dato reale non c'è, si continua con
       la stima e lo si dice. */
    logAttenzione("costi.cost_explorer.non_letto", {
      yearMonth,
      errore: err instanceof Error ? `${err.name}: ${err.message}`.slice(0, 200) : "sconosciuto",
    });
    return null;
  }
}


/**
 * Cost Explorer risponde? E se no, perché?
 *
 * Serve al pannello diagnostico, e distingue quattro situazioni che si
 * risolvono in quattro posti diversi. La più insidiosa è `NON_ATTIVO`: il
 * permesso IAM c'è, la chiamata parte, e Amazon risponde comunque
 * «AccessDenied» — perché Cost Explorer non è mai stato acceso sull'account.
 * Letto di fretta sembra un problema di policy, e si perde un pomeriggio a
 * rileggere un JSON che era giusto.
 */
export async function provaCostExplorer(yearMonth: string): Promise<StatoCostExplorer> {
  if (!costExplorerAttivo()) return "DISABILITATO";

  const inizio = `${yearMonth}-01`;
  try {
    await client().send(
      new GetCostAndUsageCommand({
        TimePeriod: { Start: inizio, End: fineEsclusa(yearMonth) },
        Granularity: "MONTHLY",
        Metrics: ["UnblendedCost"],
        Filter: { Dimensions: { Key: "SERVICE", Values: ["Amazon Simple Email Service"] } },
      }),
    );
    return "CONNESSO";
  } catch (err) {
    const messaggio = err instanceof Error ? `${err.name}: ${err.message}` : "";
    if (/not enabled for cost explorer/i.test(messaggio)) return "NON_ATTIVO";
    if (/DataUnavailable/i.test(messaggio)) return "IN_PREPARAZIONE";
    if (/AccessDenied/i.test(messaggio)) return "PERMESSO_MANCANTE";
    return "ERRORE";
  }
}
