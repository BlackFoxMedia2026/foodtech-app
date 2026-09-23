import { db } from "@/lib/db";
import { aggiornaEsitoMappatura } from "./stato-mappature";
import type { EventoNormalizzato } from "./dominio";
import { accodaSincronizzazione } from "./installazioni";

/**
 * **Chi fa qualcosa quando arriva un evento.**
 *
 * I gestori ricevono l'evento **già tradotto** (`EventoNormalizzato`): nessuno
 * di loro legge il payload di Lightspeed, e lo stesso gestore varrà per
 * Oracle o Tilby il giorno in cui i loro adattatori produrranno lo stesso
 * `pos.order.status`.
 *
 * ## Cosa fanno oggi, e cosa no
 *
 * Oggi registrano l'esito sulle mappature: «l'ordine con il nostro
 * riferimento X è stato accettato dalla cassa, e lì si chiama Y». **Non
 * toccano ancora comande, conti o pagamenti di Foodtech.** È voluto: la
 * piattaforma è additiva, e il modulo comande inizierà a consumare questi
 * esiti quando l'invio degli ordini alla cassa sarà collegato
 * (`server/comande/fornitore.ts`, `fornitorePerLocale`). Collegarlo prima
 * della prova con un account vero vorrebbe dire mandare le comande di una
 * sala in una cassa che non sappiamo se le riceve.
 */

export type EsitoGestore = "PROCESSED" | "IGNORED";

/** Il contesto dell'evento: l'id della riga di `WebhookEvent` che l'ha portato, per la correlazione. */
export type ContestoEvento = { eventoId?: string | null };

type Gestore<T extends EventoNormalizzato["tipo"]> = (
  installazione: { id: string; venueId: string },
  evento: Extract<EventoNormalizzato, { tipo: T }>,
  contesto: ContestoEvento,
) => Promise<EsitoGestore>;

/**
 * Un ordine mandato da Foodtech: la mappatura si chiave sul **nostro**
 * riferimento. L'aggiornamento è atomico e monotono (`stato-mappature.ts`):
 * un evento vecchio arrivato dopo uno stato finale si ricorda e non si applica.
 */
const statoOrdine: Gestore<"pos.order.status"> = async (i, e, c) => {
  /* Alcune casse notificano solo il loro identificativo (Oracle: `checkRef`):
     si risale al nostro riferimento dall'ordine che ha avuto quell'id
     all'invio. Il primo inviato, non le aggiunte, che portano lo stesso id. */
  const riferimento = e.riferimento ?? (e.externalId ? await riferimentoDaIdEsterno(i, e.externalId) : null);
  if (!riferimento) return "IGNORED";
  await aggiornaEsitoMappatura(i, "ORDER", riferimento, {
    fonte: "webhook",
    eventoId: c.eventoId ?? null,
    stato: e.stato,
    ...(e.preparazione !== undefined ? { preparazione: e.preparazione } : {}),
    campi: { externalId: e.externalId, motivo: e.motivo },
  });
  return "PROCESSED";
};

async function riferimentoDaIdEsterno(i: { id: string; venueId: string }, idEsterno: string): Promise<string | null> {
  const m = await db.externalEntityMapping.findFirst({
    where: {
      installationId: i.id,
      venueId: i.venueId,
      entityType: "ORDER",
      metadata: { path: ["invio", "idEsterno"], equals: idEsterno },
    },
    // Le aggiunte portano lo stesso id e nascono sempre dopo la base (che deve
    // essere già arrivata alla cassa): la prima creata è l'ordine che l'ha aperto.
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: { externalId: true },
  });
  return m?.externalId ?? null;
}

const statoPagamento: Gestore<"pos.payment.status"> = async (i, e, c) => {
  if (!e.riferimento) return "IGNORED";
  await aggiornaEsitoMappatura(i, "PAYMENT", e.riferimento, {
    fonte: "webhook",
    eventoId: c.eventoId ?? null,
    riuscito: e.riuscito,
    campi: { externalId: e.externalId, motivo: e.motivo },
  });
  return "PROCESSED";
};

export async function gestisciEvento(
  installazione: { id: string; venueId: string },
  evento: EventoNormalizzato,
  contesto: ContestoEvento = {},
): Promise<EsitoGestore> {
  switch (evento.tipo) {
    case "pos.order.status":
      return statoOrdine(installazione, evento, contesto);
    case "pos.payment.status":
      return statoPagamento(installazione, evento, contesto);
    case "multipli": {
      /* Una notifica con più entità: ogni evento il suo gestore. «Lavorato»
         se almeno uno ha fatto qualcosa. */
      let fatto = false;
      for (const e of evento.eventi) if ((await gestisciEvento(installazione, e, contesto)) === "PROCESSED") fatto = true;
      return fatto ? "PROCESSED" : "IGNORED";
    }
    case "catalogo.cambiato":
      /* Il fornitore dice che un prodotto, una categoria o un'aliquota sono
         cambiati: si chiede una sincronizzazione di quella parte, con la
         stessa coda e lo stesso lucchetto di tutte le altre. Più eventi in
         fila si fondono in un lavoro solo (chiave di deduplicazione). */
      await accodaSincronizzazione(installazione, "WEBHOOK", evento.risorsa);
      return "PROCESSED";
    default:
      // Un evento che non conosciamo non è un guasto: si conserva e si ignora.
      return "IGNORED";
  }
}
