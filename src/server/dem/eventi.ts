import type { DemEventType, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { logAttenzione, logEvento } from "@/lib/observability";
import { sopprimi } from "./destinatari";

/**
 * Cosa è successo a un messaggio dopo che è partito.
 *
 * ## Perché la ripetizione è la regola, non l'eccezione
 *
 * Chi consegna gli eventi promette di consegnarli **almeno** una volta: lo
 * stesso evento arriva due o tre volte, e arriva fuori ordine — la consegna
 * dopo l'apertura, il rimbalzo prima dell'invio. Se le statistiche si
 * incrementassero a ogni arrivo, un'apertura riconsegnata tre volte
 * diventerebbe tre aperture, e il tasso di apertura di una campagna sarebbe un
 * numero inventato.
 *
 * La difesa è il vincolo di unicità su `providerEventId`: la seconda scrittura
 * dello stesso evento sbatte contro il database e non succede niente. Non è un
 * controllo «guardo se c'è già» — quello, fra due consegne in parallelo, non
 * vede niente e lascia passare entrambe.
 *
 * ## Le aperture non sono le letture
 *
 * Un'apertura si misura con un'immagine invisibile, e i programmi di posta che
 * proteggono la privacy la caricano **da soli**, senza che nessuno abbia
 * aperto niente. Al contrario, chi legge con le immagini spente non risulta
 * mai. Quindi qui si registra un fatto tecnico — «l'immagine è stata
 * caricata» — e l'interfaccia lo chiama «Aperture» perché è la parola che
 * tutti usano, ma il modello dati tiene le due cose distinte e non va usato
 * come prova che una persona abbia letto.
 */

/** Un evento, già tradotto dalla forma del fornitore. */
export type EventoNormalizzato = {
  tipo: DemEventType;
  /** L'identificativo del messaggio a cui si riferisce. */
  messageId: string;
  occorsoIl: Date;
  /** La chiave dell'idempotenza: stesso evento, stessa chiave. */
  chiave: string;
  destinatario?: string;
  url?: string;
  dettaglio?: string;
  /** Vero per i rimbalzi definitivi: l'indirizzo non esiste. */
  definitivo?: boolean;
};

/**
 * Registra un evento, una volta sola.
 *
 * Restituisce `false` se era già stato registrato: chi chiama può contarli, ma
 * non deve fare niente di diverso — l'idempotenza è già successa.
 */
export async function registraEvento(evento: EventoNormalizzato): Promise<boolean> {
  const destinatario = await db.campaignRecipient.findFirst({
    where: { providerMessageId: evento.messageId },
    select: { id: true, campaignId: true, venueId: true, email: true, guestId: true },
  });

  if (!destinatario) {
    // Un evento per un messaggio che non è nostro, o che è arrivato prima che
    // salvassimo l'identificativo. Non si inventa a chi appartiene.
    logAttenzione("dem.evento.senza_destinatario", { messageId: evento.messageId, tipo: evento.tipo });
    return false;
  }

  try {
    await db.campaignEvent.create({
      data: {
        venueId: destinatario.venueId,
        campaignId: destinatario.campaignId,
        recipientId: destinatario.id,
        type: evento.tipo,
        providerEventId: evento.chiave.slice(0, 250),
        occurredAt: evento.occorsoIl,
        url: evento.url?.slice(0, 600) ?? null,
        detail: evento.dettaglio?.slice(0, 300) ?? null,
      },
    });
  } catch {
    // Vincolo unico: già visto, già contato. Non è un errore.
    return false;
  }

  await applica(evento, destinatario);
  return true;
}

type Riferimento = {
  id: string;
  campaignId: string;
  venueId: string;
  email: string;
  guestId: string | null;
};

/**
 * Sposta i contatori e gli orari.
 *
 * Gira **solo** per gli eventi nuovi: ci pensa il vincolo di unicità qui
 * sopra. È il motivo per cui qui si può usare `increment` senza che una
 * riconsegna gonfi i numeri.
 */
async function applica(evento: EventoNormalizzato, dest: Riferimento): Promise<void> {
  switch (evento.tipo) {
    case "DELIVERY": {
      await db.campaignRecipient.updateMany({
        where: { id: dest.id, deliveredAt: null },
        data: { status: "DELIVERED", deliveredAt: evento.occorsoIl },
      });
      await incrementa(dest.campaignId, { deliveredCount: 1 });
      return;
    }

    case "OPEN": {
      // Il primo orario è quello che conta per «quando l'ha vista»; il
      // conteggio serve alle metriche e non all'interfaccia.
      const primo = await db.campaignRecipient.updateMany({
        where: { id: dest.id, openedAt: null },
        data: { openedAt: evento.occorsoIl },
      });
      await db.campaignRecipient.update({
        where: { id: dest.id },
        data: { openCount: { increment: 1 } },
      });
      // La campagna conta le **persone**, non le aperture: chi guarda la
      // pagina dei risultati legge «quanti l'hanno aperta».
      if (primo.count > 0) await incrementa(dest.campaignId, { openedCount: 1 });
      return;
    }

    case "CLICK": {
      const primo = await db.campaignRecipient.updateMany({
        where: { id: dest.id, clickedAt: null },
        data: { clickedAt: evento.occorsoIl },
      });
      await db.campaignRecipient.update({
        where: { id: dest.id },
        data: { clickCount: { increment: 1 } },
      });
      if (primo.count > 0) await incrementa(dest.campaignId, { clickedCount: 1 });
      return;
    }

    case "BOUNCE": {
      await db.campaignRecipient.update({
        where: { id: dest.id },
        data: { status: "BOUNCED", bouncedAt: evento.occorsoIl, error: evento.dettaglio?.slice(0, 300) ?? null },
      });
      await incrementa(dest.campaignId, { bouncedCount: 1 });

      /*
        Definitivo e temporaneo non sono la stessa cosa.

        Un rimbalzo definitivo dice che l'indirizzo **non esiste**: continuare a
        scrivergli non è inutile, è dannoso — è il segnale con cui i provider
        riconoscono le liste comprate, e fa scendere il recapito di tutte le
        altre campagne di tutti gli altri clienti.

        Un rimbalzo temporaneo è una casella piena o un server occupato: si
        registra e basta. Sopprimere al primo significherebbe perdere clienti
        veri perché un giorno la loro casella era piena.
      */
      if (evento.definitivo) {
        await sopprimi(dest.venueId, dest.email, "HARD_BOUNCE", {
          detail: evento.dettaglio,
          source: "rimbalzo",
        });
      }
      return;
    }

    case "COMPLAINT": {
      await db.campaignRecipient.update({
        where: { id: dest.id },
        data: { status: "COMPLAINED", complainedAt: evento.occorsoIl },
      });
      await incrementa(dest.campaignId, { complainedCount: 1 });

      // Una segnalazione di spam è la cosa più grave che possa arrivare: si
      // smette subito, e per sempre. Chi ha segnalato non va convinto.
      await sopprimi(dest.venueId, dest.email, "COMPLAINT", {
        detail: evento.dettaglio,
        source: "segnalazione",
      });
      if (dest.guestId) {
        await db.guest.updateMany({
          where: { id: dest.guestId, marketingOptIn: true },
          data: { marketingOptIn: false, unsubscribedAt: evento.occorsoIl },
        });
        await db.consentLog.create({
          data: {
            id: crypto.randomUUID(),
            venueId: dest.venueId,
            guestId: dest.guestId,
            channel: "EMAIL",
            granted: false,
            source: "segnalazione_spam",
          },
        });
      }
      return;
    }

    case "SUBSCRIPTION": {
      // La disiscrizione fatta dal programma di posta, con un clic.
      await db.campaignRecipient.update({
        where: { id: dest.id },
        data: { unsubscribedAt: evento.occorsoIl },
      });
      await incrementa(dest.campaignId, { unsubscribedCount: 1 });
      await sopprimi(dest.venueId, dest.email, "UNSUBSCRIBE", { source: "un_clic" });
      if (dest.guestId) {
        await db.guest.updateMany({
          where: { id: dest.guestId, marketingOptIn: true },
          data: { marketingOptIn: false, unsubscribedAt: evento.occorsoIl },
        });
      }
      return;
    }

    case "REJECT":
    case "RENDERING_FAILURE": {
      await db.campaignRecipient.update({
        where: { id: dest.id },
        data: { status: "FAILED", failedAt: evento.occorsoIl, error: evento.dettaglio?.slice(0, 300) ?? null },
      });
      await incrementa(dest.campaignId, { failedCount: 1 });
      return;
    }

    /*
      `SEND` e `DELIVERY_DELAY` si registrano e non muovono niente.

      Il primo lo sappiamo già — l'invio l'abbiamo fatto noi — e serve solo a
      chiudere il cerchio quando si guarda la storia di un singolo messaggio.
      Il secondo è un ritardo, non un esito: contarlo fra i non consegnati
      farebbe sembrare andata male una campagna che sta ancora arrivando.
    */
    default:
      return;
  }
}

function incrementa(campaignId: string, campi: Prisma.CampaignUpdateInput) {
  return db.campaign.update({
    where: { id: campaignId },
    data: Object.fromEntries(
      Object.entries(campi).map(([k, v]) => [k, { increment: v as number }]),
    ) as Prisma.CampaignUpdateInput,
  });
}

/* -------------------------------------------------------------------------- */
/*  La traduzione dalla forma del fornitore                                   */
/* -------------------------------------------------------------------------- */

const TIPI: Record<string, DemEventType> = {
  Send: "SEND",
  Delivery: "DELIVERY",
  Open: "OPEN",
  Click: "CLICK",
  Bounce: "BOUNCE",
  Complaint: "COMPLAINT",
  Reject: "REJECT",
  DeliveryDelay: "DELIVERY_DELAY",
  Subscription: "SUBSCRIPTION",
  "Rendering Failure": "RENDERING_FAILURE",
  RenderingFailure: "RENDERING_FAILURE",
};

type GrezzoSes = {
  eventType?: string;
  mail?: { messageId?: string; timestamp?: string };
  bounce?: {
    bounceType?: string;
    bounceSubType?: string;
    timestamp?: string;
    bouncedRecipients?: { emailAddress?: string; diagnosticCode?: string }[];
  };
  complaint?: {
    timestamp?: string;
    complaintFeedbackType?: string;
    complainedRecipients?: { emailAddress?: string }[];
  };
  delivery?: { timestamp?: string };
  open?: { timestamp?: string };
  click?: { timestamp?: string; link?: string };
  reject?: { reason?: string };
  deliveryDelay?: { timestamp?: string; delayType?: string };
  failure?: { errorMessage?: string };
};

/**
 * Traduce un evento del fornitore nella nostra forma, o restituisce `null`.
 *
 * Tradurre subito serve a una cosa sola, ed è quella che regge tutto il
 * modulo: **la forma del fornitore non entra nel resto del codice**. Il giorno
 * in cui l'infrastruttura cambierà, si riscrive questa funzione e nient'altro.
 */
export function traduciEvento(grezzo: unknown): EventoNormalizzato | null {
  // Il corpo arriva da fuori e non è detto che sia un oggetto: un `null` o una
  // stringa che passasse di qui farebbe cadere il ricevitore degli eventi, e
  // con lui **tutte** le statistiche — per un messaggio malformato che
  // andava solo ignorato.
  if (typeof grezzo !== "object" || grezzo === null) return null;

  const e = grezzo as GrezzoSes;
  const tipo = e.eventType ? TIPI[e.eventType] : undefined;
  const messageId = e.mail?.messageId;
  if (!tipo || !messageId) return null;

  const quando =
    e.bounce?.timestamp ??
    e.complaint?.timestamp ??
    e.delivery?.timestamp ??
    e.open?.timestamp ??
    e.click?.timestamp ??
    e.deliveryDelay?.timestamp ??
    e.mail?.timestamp;
  const occorsoIl = quando ? new Date(quando) : new Date();

  const base = {
    tipo,
    messageId,
    occorsoIl,
    // Tipo, messaggio e istante: due aperture vere hanno istanti diversi e
    // contano due volte, la stessa apertura riconsegnata ha lo stesso istante
    // e conta una volta.
    chiave: `${tipo}:${messageId}:${occorsoIl.toISOString()}`,
  };

  switch (tipo) {
    case "BOUNCE":
      return {
        ...base,
        definitivo: e.bounce?.bounceType === "Permanent",
        dettaglio: [e.bounce?.bounceType, e.bounce?.bounceSubType].filter(Boolean).join("/"),
        ...(e.bounce?.bouncedRecipients?.[0]?.emailAddress && {
          destinatario: e.bounce.bouncedRecipients[0].emailAddress,
        }),
      };
    case "COMPLAINT":
      return {
        ...base,
        dettaglio: e.complaint?.complaintFeedbackType ?? "abuse",
        ...(e.complaint?.complainedRecipients?.[0]?.emailAddress && {
          destinatario: e.complaint.complainedRecipients[0].emailAddress,
        }),
      };
    case "CLICK":
      return { ...base, ...(e.click?.link && { url: e.click.link }) };
    case "REJECT":
      return { ...base, ...(e.reject?.reason && { dettaglio: e.reject.reason }) };
    case "RENDERING_FAILURE":
      return { ...base, ...(e.failure?.errorMessage && { dettaglio: e.failure.errorMessage }) };
    case "DELIVERY_DELAY":
      return { ...base, ...(e.deliveryDelay?.delayType && { dettaglio: e.deliveryDelay.delayType }) };
    default:
      return base;
  }
}

/** Traduce e registra un lotto di eventi. Restituisce quanti erano nuovi. */
export async function ricevi(grezzi: unknown[]): Promise<number> {
  let nuovi = 0;
  for (const grezzo of grezzi) {
    const evento = traduciEvento(grezzo);
    if (!evento) continue;
    if (await registraEvento(evento)) nuovi += 1;
  }
  if (nuovi > 0) logEvento("dem.eventi.registrati", { quanti: nuovi });
  return nuovi;
}
