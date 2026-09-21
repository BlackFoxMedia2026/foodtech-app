import {
  GetAccountCommand,
  GetConfigurationSetEventDestinationsCommand,
  ListConfigurationSetsCommand,
  ListTenantsCommand,
} from "@aws-sdk/client-sesv2";
import { db } from "@/lib/db";
import {
  valutaSalute,
  type LettureAws,
  type LettureNostre,
  type Salute,
  type StatoCostExplorer,
} from "@/lib/salute-ses";
import { logAttenzione } from "@/lib/observability";
import { EVENTI_ATTESI, nomeInsiemeConfigurazione, nomeSpazio, sesOpzionale } from "@/server/dem/ses";
import { provaCostExplorer } from "./aws-cost-explorer";
import { cicloCorrente } from "./piattaforma-costi";

/**
 * Lo stato reale della catena di invio: cosa c'è su AWS, cosa dice il nostro
 * database, e dove i due non coincidono.
 *
 * ## È diagnostica, e solo diagnostica
 *
 * Nessuna di queste chiamate entra nel percorso di invio. Se AWS non risponde,
 * il pannello mostra uno stato degradato e le campagne continuano a partire
 * esattamente come prima: il freno resta il ledger.
 *
 * ## Perché una cache
 *
 * Interrogare AWS a ogni apertura di pagina significherebbe quattro chiamate
 * per ogni ricarica, moltiplicate per ogni scheda aperta, per un dato che
 * cambia una volta al giorno. La fotografia si tiene cinque minuti; il
 * pulsante «Ricontrolla» la rifà subito.
 *
 * La cache serve anche a un'altra cosa: se una lettura fallisce, si continua a
 * mostrare l'ultima riuscita con la sua data, invece di sbiancare il pannello.
 */

const DURATA_CACHE_MS = 5 * 60_000;

type Fotografia = { salute: Salute; quando: Date; degradata: boolean };
let cache: Fotografia | null = null;

/** Le finestre: quanto aspettiamo prima di considerare «perso» un evento. */
const MINUTI_TOLLERANZA_EVENTI = 30;

export async function saluteInfrastruttura(forza = false): Promise<Fotografia> {
  if (!forza && cache && Date.now() - cache.quando.getTime() < DURATA_CACHE_MS) return cache;

  const [aws, nostre] = await Promise.all([leggiAws(), leggiNostre()]);
  const salute = valutaSalute(aws, nostre, EVENTI_ATTESI);

  /* Degradata = qualcosa non l'abbiamo potuto chiedere. Si dichiara, perché un
     pannello che tace su ciò che non sa è peggio di uno che lo scrive. */
  const degradata = aws.account === null || aws.tenant === null || aws.configurationSet === null;

  cache = { salute, quando: new Date(), degradata };
  return cache;
}

/** L'ultima fotografia, senza chiedere niente ad AWS. */
export function ultimaFotografia(): Fotografia | null {
  return cache;
}

async function leggiAws(): Promise<LettureAws> {
  const ses = sesOpzionale();
  if (!ses) {
    return { account: null, tenant: null, configurationSet: null, destinazioni: null, costExplorer: "DISABILITATO" };
  }

  const account = await ses
    .send(new GetAccountCommand({}))
    .then((r) => ({
      sandbox: !(r.ProductionAccessEnabled ?? false),
      invioAbilitato: r.SendingEnabled ?? false,
      quota24h: r.SendQuota?.Max24HourSend ?? null,
    }))
    .catch((err) => {
      logAttenzione("salute.account_non_letto", { errore: nome(err) });
      return null;
    });

  const tenant = await ses
    .send(new ListTenantsCommand({ PageSize: 100 }))
    .then((r) => (r.Tenants ?? []).map((t) => t.TenantName ?? "").filter(Boolean))
    .catch((err) => {
      logAttenzione("salute.tenant_non_letti", { errore: nome(err) });
      return null;
    });

  const configurationSet = await ses
    .send(new ListConfigurationSetsCommand({ PageSize: 100 }))
    .then((r) => r.ConfigurationSets ?? [])
    .catch((err) => {
      logAttenzione("salute.insiemi_non_letti", { errore: nome(err) });
      return null;
    });

  /*
    Le destinazioni si chiedono **solo per gli insiemi che usiamo davvero**, e
    non per tutti quelli che esistono sull'account: una chiamata per insieme, e
    su cento clienti sarebbero cento chiamate a ogni controllo. Il tetto a
    venti tiene il controllo veloce; se un giorno servisse di più, si pagina.
  */
  let destinazioni: LettureAws["destinazioni"] = null;
  if (configurationSet !== null) {
    const nostri = await insiemiPrevisti();
    const daGuardare = nostri.filter((n) => configurationSet.includes(n)).slice(0, 20);
    destinazioni = {};
    for (const insieme of daGuardare) {
      destinazioni[insieme] = await ses
        .send(new GetConfigurationSetEventDestinationsCommand({ ConfigurationSetName: insieme }))
        .then((r) => {
          const nostra = (r.EventDestinations ?? []).find((d) => d.Name === "foodtech-eventi");
          return {
            presente: !!nostra,
            abilitata: nostra?.Enabled ?? false,
            eventi: (nostra?.MatchingEventTypes ?? []).map(String),
          };
        })
        .catch((err) => {
          logAttenzione("salute.destinazione_non_letta", { insieme, errore: nome(err) });
          return null;
        });
    }
    // Se non abbiamo potuto leggerne nemmeno una, è come non saperlo.
    if (Object.values(destinazioni).every((d) => d === null) && daGuardare.length > 0) destinazioni = null;
  }

  return { account, tenant, configurationSet, destinazioni, costExplorer: await provaCostExplorer(cicloCorrente()) };
}

async function insiemiPrevisti(): Promise<string[]> {
  const domini = await db.demDomain.findMany({ select: { venueId: true } });
  return domini.map((d) => nomeInsiemeConfigurazione(d.venueId));
}

async function leggiNostre(): Promise<LettureNostre> {
  const domini = await db.demDomain.findMany({
    select: { venueId: true, venue: { select: { name: true } } },
  });

  const confine = new Date(Date.now() - MINUTI_TOLLERANZA_EVENTI * 60_000);

  const [inviiSes, inviiRecenti, conMessageId, eventiSend, ultimo, riconciliazione] = await Promise.all([
    /* Gli invii «maturi»: abbastanza vecchi perché i loro eventi siano già
       tornati. Sono il denominatore onesto di ogni percentuale qui sotto. */
    db.campaignRecipient.count({ where: { status: { in: ["SENT", "DELIVERED"] }, sentAt: { lt: confine } } }),
    db.campaignRecipient.count({ where: { status: { in: ["SENT", "DELIVERED"] }, sentAt: { gte: confine } } }),
    db.campaignRecipient.count({
      where: { status: { in: ["SENT", "DELIVERED"] }, providerMessageId: { not: null } },
    }),
    db.campaignEvent.count({ where: { type: "SEND" } }),
    db.campaignEvent.findFirst({ orderBy: { occurredAt: "desc" }, select: { occurredAt: true } }),
    db.costReconciliation.findFirst({ orderBy: { updatedAt: "desc" }, select: { updatedAt: true } }),
  ]);

  return {
    localiAttesi: domini.map((d) => ({
      venueId: d.venueId,
      nome: d.venue?.name ?? d.venueId,
      tenant: nomeSpazio(d.venueId),
      configurationSet: nomeInsiemeConfigurazione(d.venueId),
    })),
    inviiSes,
    inviiRecenti,
    conMessageId,
    eventiSend,
    ultimoEvento: ultimo?.occurredAt ?? null,
    ultimaRiconciliazione: riconciliazione?.updatedAt ?? null,
  };
}

function nome(err: unknown): string {
  return err instanceof Error ? `${err.name}: ${err.message}`.slice(0, 160) : "sconosciuto";
}
