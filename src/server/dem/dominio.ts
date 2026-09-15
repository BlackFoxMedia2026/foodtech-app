import { resolveTxt } from "node:dns/promises";
import type { DemDomain } from "@prisma/client";
import { db } from "@/lib/db";
import { logAttenzione } from "@/lib/observability";
import { avvisa } from "./avvisi";
import {
  assicuraInsiemeConfigurazione,
  assicuraSpazio,
  nomeInsiemeConfigurazione,
  nomeSpazio,
  registraDominio,
  statoDominio,
  type RecordDns,
} from "./ses";

/**
 * Il dominio da cui escono le newsletter di un locale.
 *
 * ## Un sottodominio, e non il dominio del cliente
 *
 * `ristorante.it` è il sito, la posta aziendale, le prenotazioni che arrivano
 * via email. Toccarlo per mandare una newsletter significa poter spegnere la
 * casella su cui quel ristorante riceve il lavoro. Quindi si aggiunge
 * `news.ristorante.it`, che prima non esisteva: qualunque cosa succeda lì non
 * può rompere niente di quello che c'era.
 *
 * Nessun record viene scritto da noi. Li mostriamo, il cliente (o chi gli
 * gestisce il dominio) li mette, e noi controlliamo. Modificare il DNS di
 * qualcun altro in automatico è il tipo di potere che non si prende senza che
 * sia stato dato esplicitamente.
 *
 * ## Le parole
 *
 * Qui non compare il nome di nessun fornitore. «Dominio di invio», «firma»,
 * «pronto per l'invio»: il cliente sta configurando Foodtech.
 */

/** Il sottodominio che proponiamo, dato il dominio del cliente. */
export function sottodominioProposto(dominioCliente: string): string {
  return `news.${normalizzaDominio(dominioCliente)}`;
}

/**
 * Il sottodominio del Return-Path: **un altro** nome, sotto quello di invio.
 *
 * Perché non lo stesso: il Return-Path vuole un record MX, cioè «la posta per
 * questo nome la riceve questo server». Se un domani il cliente volesse
 * ricevere posta su `news.ristorante.it`, i due usi si romperebbero a vicenda.
 * Un nome dedicato costa una riga di DNS in più e toglie il problema per
 * sempre.
 */
export function dominioRitornoProposto(dominioInvio: string): string {
  return `bounce.${dominioInvio}`;
}

/** Via lo spazio, il protocollo, le maiuscole e un eventuale punto finale. */
export function normalizzaDominio(valore: string): string {
  return valore
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/.*$/, "")
    .replace(/\.$/, "");
}

/** Assomiglia a un dominio? Il controllo serve a non chiedere ad Amazon nomi assurdi. */
export function dominioValido(valore: string): boolean {
  const d = normalizzaDominio(valore);
  return /^(?!-)[a-z0-9-]{1,63}(?<!-)(\.(?!-)[a-z0-9-]{1,63}(?<!-))+$/.test(d) && d.length <= 253;
}

export type ConfigurazioneDominio = {
  dominio: DemDomain;
  record: RecordDns[];
};

/**
 * Prepara il dominio di invio del locale.
 *
 * Rieseguibile dall'inizio alla fine: chi ricarica la pagina a metà, o chi
 * riprova dopo un errore di rete, non crea un secondo spazio né un secondo
 * dominio. Le chiavi di firma restano quelle già generate — rigenerarle
 * invaliderebbe i record che il cliente ha appena finito di copiare.
 */
export async function configuraDominio(
  venueId: string,
  dominioCliente: string,
  opts: { fromName?: string; replyTo?: string } = {},
): Promise<ConfigurazioneDominio> {
  const root = normalizzaDominio(dominioCliente);
  if (!dominioValido(root)) throw new Error("validation_failed");

  const invio = sottodominioProposto(root);
  const ritorno = dominioRitornoProposto(invio);

  await assicuraSpazio(venueId);
  await assicuraInsiemeConfigurazione(venueId);

  await db.demSesTenant.upsert({
    where: { venueId },
    create: {
      venueId,
      tenantName: nomeSpazio(venueId),
      configurationSet: nomeInsiemeConfigurazione(venueId),
    },
    update: {},
  });

  const { record } = await registraDominio(venueId, invio, ritorno);

  const dominio = await db.demDomain.upsert({
    where: { venueId },
    create: {
      venueId,
      rootDomain: root,
      sendingDomain: invio,
      mailFromDomain: ritorno,
      fromName: opts.fromName ?? null,
      replyTo: opts.replyTo ?? null,
      status: "VERIFYING",
      dnsRecords: record as unknown as object,
    },
    update: {
      rootDomain: root,
      sendingDomain: invio,
      mailFromDomain: ritorno,
      status: "VERIFYING",
      dnsRecords: record as unknown as object,
      lastError: null,
      ...(opts.fromName !== undefined && { fromName: opts.fromName }),
      ...(opts.replyTo !== undefined && { replyTo: opts.replyTo }),
    },
  });

  return { dominio, record };
}

/**
 * Controlla com'è messo il dominio, adesso.
 *
 * Nessuno stato viene dedotto o ricordato: la firma e il Return-Path li dice
 * il servizio di invio, il DMARC lo si legge dal DNS pubblico. Un «verificato»
 * scritto una volta e mai più controllato è il modo in cui un cliente scopre
 * fra tre settimane che le sue campagne non partono.
 *
 * La prima volta che il dominio diventa pronto, il locale riceve un avviso: è
 * un'attesa che dura ore — il DNS ci mette quel che ci mette — e nessuno
 * resta a guardare la pagina.
 */
export async function verificaDominio(venueId: string): Promise<DemDomain | null> {
  const dominio = await db.demDomain.findUnique({ where: { venueId } });
  if (!dominio) return null;

  const stato = await statoDominio(dominio.sendingDomain);
  const dmarc = await leggiDmarc(dominio.rootDomain);

  if (!stato) {
    // Non siamo riusciti a chiedere: non è «non verificato». Scrivere «errore»
    // su una configurazione che magari è perfetta manderebbe il cliente a
    // rifare un lavoro già fatto.
    return db.demDomain.update({ where: { venueId }, data: { lastCheckedAt: new Date() } });
  }

  const eraPronto = dominio.status === "VERIFIED";
  const pronto = stato.verificato && stato.dkim === "OK";

  const aggiornato = await db.demDomain.update({
    where: { venueId },
    data: {
      status: pronto ? "VERIFIED" : stato.dkim === "FAILED" ? "FAILED" : "VERIFYING",
      dkimStatus: mappa(stato.dkim),
      // L'SPF del Return-Path viaggia insieme al suo MX: il servizio li
      // verifica come una cosa sola, e mostrarli separati darebbe al cliente
      // due righe che non può far cambiare una per volta.
      spfStatus: mappa(stato.ritorno),
      dmarcStatus: dmarc ? "OK" : "MISSING",
      dmarcPolicy: dmarc,
      lastCheckedAt: new Date(),
      ...(pronto && !dominio.verifiedAt && { verifiedAt: new Date() }),
    },
  });

  if (pronto && !eraPronto) {
    await avvisa(venueId, {
      kind: "DEM_DOMAIN_VERIFIED",
      title: "Il tuo dominio è pronto per l'invio",
      body: `Le newsletter partiranno da ${dominio.sendingDomain}.`,
      link: "/settings/marketing/invio",
      perEmail: true,
    });
  }

  return aggiornato;
}

function mappa(v: "OK" | "PENDING" | "FAILED" | "UNKNOWN") {
  return v === "OK" ? "OK" : v === "PENDING" ? "PENDING" : v === "FAILED" ? "FAILED" : "UNKNOWN";
}

/**
 * La politica DMARC pubblicata sul dominio del cliente, se c'è.
 *
 * Si **legge** e non si scrive. Il DMARC dice al mondo cosa fare delle email
 * che dichiarano di venire da quel dominio: se il cliente ha già altri
 * servizi che spediscono per suo conto — un gestionale, una piattaforma di
 * newsletter precedente, il commercialista — sovrascriverlo significherebbe
 * fargli rifiutare posta che oggi arriva. Quando manca lo diciamo e
 * suggeriamo cosa mettere; metterlo è una sua decisione.
 */
export async function leggiDmarc(dominioRadice: string): Promise<string | null> {
  try {
    const record = await resolveTxt(`_dmarc.${dominioRadice}`);
    const riga = record.map((parti) => parti.join("")).find((t) => t.toLowerCase().startsWith("v=dmarc1"));
    if (!riga) return null;
    const politica = /\bp=([a-z]+)/i.exec(riga)?.[1];
    return politica ? politica.toLowerCase() : "none";
  } catch {
    // Nessun record, o DNS che non risponde: in entrambi i casi non possiamo
    // dire che c'è. Non è un errore da mostrare.
    return null;
  }
}

/** Il DMARC che consigliamo a chi non ne ha uno: osservare prima di bloccare. */
export function dmarcConsigliato(dominioRadice: string): RecordDns {
  return {
    tipo: "TXT",
    nome: `_dmarc.${dominioRadice}`,
    // `p=none` di proposito: chiede ai provider di **riferire** senza
    // rifiutare niente. Suggerire `p=reject` a un cliente che non sa quali
    // altri servizi spediscono a suo nome significa fargli sparire fatture e
    // conferme di prenotazione il giorno dopo.
    valore: "v=DMARC1; p=none;",
  };
}

export type StatoInvio = {
  configurato: boolean;
  dominioInvio: string | null;
  mittente: string | null;
  replyTo: string | null;
  stato: "PENDING" | "VERIFYING" | "VERIFIED" | "FAILED";
  dkim: string;
  spf: string;
  dmarc: string;
  dmarcPolitica: string | null;
  record: RecordDns[];
  dmarcSuggerito: RecordDns | null;
  ultimoControllo: Date | null;
};

/** Tutto quello che serve alla schermata «Impostazioni invio». */
export async function statoInvio(venueId: string): Promise<StatoInvio> {
  const dominio = await db.demDomain.findUnique({ where: { venueId } });

  if (!dominio) {
    return {
      configurato: false,
      dominioInvio: null,
      mittente: null,
      replyTo: null,
      stato: "PENDING",
      dkim: "UNKNOWN",
      spf: "UNKNOWN",
      dmarc: "UNKNOWN",
      dmarcPolitica: null,
      record: [],
      dmarcSuggerito: null,
      ultimoControllo: null,
    };
  }

  return {
    configurato: true,
    dominioInvio: dominio.sendingDomain,
    mittente: `${dominio.fromLocalPart}@${dominio.sendingDomain}`,
    replyTo: dominio.replyTo,
    stato: dominio.status,
    dkim: dominio.dkimStatus,
    spf: dominio.spfStatus,
    dmarc: dominio.dmarcStatus,
    dmarcPolitica: dominio.dmarcPolicy,
    record: (dominio.dnsRecords as RecordDns[] | null) ?? [],
    dmarcSuggerito: dominio.dmarcStatus === "MISSING" ? dmarcConsigliato(dominio.rootDomain) : null,
    ultimoControllo: dominio.lastCheckedAt,
  };
}

/**
 * Chi manda, per un dato locale, quando si spedisce davvero.
 *
 * Restituisce `null` finché il dominio non è pronto: è il controllo che
 * impedisce di spedire da un dominio non firmato, cosa che finirebbe nello
 * spam e porterebbe giù la reputazione di tutti gli altri clienti insieme.
 */
export async function mittenteDi(venueId: string): Promise<{
  from: string;
  replyTo: string | null;
  configurationSet: string;
} | null> {
  const dominio = await db.demDomain.findUnique({ where: { venueId } });
  if (!dominio || dominio.status !== "VERIFIED") return null;

  const venue = await db.venue.findUnique({ where: { id: venueId }, select: { name: true, email: true } });
  const nome = dominio.fromName ?? venue?.name ?? "Newsletter";
  const indirizzo = `${dominio.fromLocalPart}@${dominio.sendingDomain}`;

  return {
    // Il nome visibile è quello del ristorante: chi riceve deve riconoscere
    // **il locale**, non la piattaforma che gli manda le email.
    from: `${nome} <${indirizzo}>`,
    // E le risposte vanno dove qualcuno le legge: la casella da cui si spedisce
    // non la apre nessuno.
    replyTo: dominio.replyTo ?? venue?.email ?? null,
    configurationSet: nomeInsiemeConfigurazione(venueId),
  };
}

/** Per l'assistenza: perché un dominio non è andato a buon fine. */
export async function segnaProblemaDominio(venueId: string, motivo: string): Promise<void> {
  logAttenzione("dem.dominio.problema", { venueId, motivo });
  await db.demDomain.updateMany({
    where: { venueId },
    data: { status: "FAILED", lastError: motivo.slice(0, 400) },
  });
}

/**
 * Ricontrolla i domini che stanno aspettando, e avvisa chi è diventato pronto.
 *
 * Esiste perché la schermata promette «ti avvisiamo appena è pronto», e senza
 * questo giro quella frase sarebbe falsa: la verifica avverrebbe solo quando
 * qualcuno ripreme il pulsante. I cambi al DNS ci mettono da qualche minuto a
 * qualche ora, e nessuno resta lì a guardare.
 *
 * Solo chi sta aspettando davvero: un dominio già pronto non si ricontrolla a
 * ogni giro — la sua verifica arriva dal primo invio che fallisce, ed è un
 * caso che si affronta diversamente.
 */
export async function controllaDominiInAttesa(limite = 25): Promise<{
  controllati: number;
  diventatiPronti: number;
}> {
  const inAttesa = await db.demDomain.findMany({
    where: { status: { in: ["PENDING", "VERIFYING"] } },
    orderBy: { lastCheckedAt: { sort: "asc", nulls: "first" } },
    take: limite,
    select: { venueId: true },
  });

  let diventatiPronti = 0;
  for (const { venueId } of inAttesa) {
    // Un dominio che fa esplodere il controllo non deve fermare gli altri
    // ventiquattro: l'errore resta nei log e il giro continua.
    try {
      const dopo = await verificaDominio(venueId);
      if (dopo?.status === "VERIFIED") diventatiPronti += 1;
    } catch (err) {
      logAttenzione("dem.dominio.controllo_non_riuscito", { venueId, errore: String(err) });
    }
  }

  return { controllati: inAttesa.length, diventatiPronti };
}
