import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import type { StatoOrdineEsterno } from "./dominio";

/**
 * **Lo stato di un ordine (o pagamento) presso la cassa, scritto una volta
 * sola e senza tornare indietro.**
 *
 * Due problemi che qui si chiudono:
 *
 * 1. **Scritture concorrenti.** Un webhook e l'esito dell'invio
 *    (`ordini.ts`) possono scrivere la stessa riga nello stesso momento: con
 *    «leggi, modifica, scrivi» il secondo cancellava ciò che aveva scritto il
 *    primo. Qui la riga si legge con `SELECT … FOR UPDATE` dentro una
 *    transazione, e le chiavi scritte da altri restano.
 * 2. **Eventi fuori ordine.** I fornitori non garantiscono l'ordine di
 *    consegna (Tilby ritenta ogni 15 minuti, Oracle non ritenta affatto): un
 *    «in lavorazione» vecchio può arrivare dopo «chiuso». Le transizioni sono
 *    **monotone**: uno stato finale (chiuso, annullato, rifiutato) non cambia
 *    più; fra gli altri si va solo avanti. Ciò che arriva e non si applica si
 *    ricorda nello storico, con il motivo.
 */

/** L'ordine degli stati. Gli stati finali hanno lo stesso rango: vince il primo arrivato. */
const RANGO_STATO: Record<StatoOrdineEsterno, number> = {
  UNKNOWN: 0,
  ACCEPTED: 1,
  IN_PROGRESS: 2,
  READY: 3,
  REJECTED: 10,
  CLOSED: 10,
  CANCELLED: 10,
};
export const STATI_FINALI = new Set<StatoOrdineEsterno>(["REJECTED", "CLOSED", "CANCELLED"]);

/** Preparazione (Oracle `preparationStatus`): si va solo avanti. */
const RANGO_PREPARAZIONE: Record<string, number> = { Uninitialized: 0, Submitted: 1, Prepared: 2, AllPrepared: 3, Packaged: 4 };

export type EsitoTransizione = { applicato: boolean; motivo: string | null };

/** Funzione pura: il nuovo stato si applica, o no, e perché. */
export function transizioneStato(attuale: unknown, nuovo: StatoOrdineEsterno): EsitoTransizione {
  const a = typeof attuale === "string" && attuale in RANGO_STATO ? (attuale as StatoOrdineEsterno) : null;
  if (!a) return { applicato: true, motivo: null };
  if (a === nuovo) return { applicato: false, motivo: "uguale" };
  if (STATI_FINALI.has(a)) return { applicato: false, motivo: `stato finale ${a}` };
  if (RANGO_STATO[nuovo] < RANGO_STATO[a]) return { applicato: false, motivo: `regressione da ${a}` };
  return { applicato: true, motivo: null };
}

export function transizionePreparazione(attuale: unknown, nuova: string | null | undefined): boolean {
  if (!nuova) return false;
  if (typeof attuale !== "string") return true;
  const ra = RANGO_PREPARAZIONE[attuale];
  const rn = RANGO_PREPARAZIONE[nuova];
  if (rn === undefined) return false; // valore sconosciuto: non sostituisce uno noto
  return ra === undefined || rn > ra;
}

const MASSIMO_STORICO = 20;

export type AggiornamentoEsito = {
  /** Da dove viene: `webhook`, `ripiego` (conto chiuso scoperto all'aggiunta), … */
  fonte: string;
  /** L'evento del registro (`WebhookEvent.id`) che l'ha portato, quando c'è. */
  eventoId?: string | null;
  stato?: StatoOrdineEsterno;
  preparazione?: string | null;
  /** PAYMENT: una riuscita non torna mai a «non riuscito». */
  riuscito?: boolean;
  campi?: Record<string, unknown>;
};

/**
 * Aggiorna la mappatura ORDER o PAYMENT del nostro riferimento, in modo
 * atomico e monotono. Crea la riga se non c'è (un pagamento notificato prima
 * che Foodtech sapesse di lui). Restituisce se lo stato è cambiato.
 */
export async function aggiornaEsitoMappatura(
  i: { id: string; venueId: string },
  tipo: "ORDER" | "PAYMENT",
  riferimento: string,
  e: AggiornamentoEsito,
): Promise<EsitoTransizione> {
  for (let tentativo = 0; tentativo < 3; tentativo++) {
    try {
      return await db.$transaction(async (tx) => {
        const righe = await tx.$queryRaw<{ id: string; metadata: unknown }[]>`
          SELECT id, metadata FROM "ExternalEntityMapping"
          WHERE "installationId" = ${i.id} AND "venueId" = ${i.venueId} AND "entityType" = ${tipo} AND "externalId" = ${riferimento}
          FOR UPDATE`;
        const adesso = new Date();
        const prima = (righe[0]?.metadata && typeof righe[0].metadata === "object" ? righe[0].metadata : {}) as Record<string, unknown>;
        const dopo: Record<string, unknown> = { ...prima, ...(e.campi ?? {}) };
        let esito: EsitoTransizione = { applicato: false, motivo: null };

        if (e.stato) {
          esito = transizioneStato(prima.stato, e.stato);
          if (esito.applicato) dopo.stato = e.stato;
          // Il motivo di uno stato scartato non sostituisce quello vigente.
          else if ("motivo" in dopo) dopo.motivo = prima.motivo ?? null;
        }
        if (e.preparazione !== undefined && transizionePreparazione(prima.preparazione, e.preparazione)) {
          dopo.preparazione = e.preparazione;
          if (!e.stato) esito = { applicato: true, motivo: null };
        } else if (e.preparazione !== undefined) {
          dopo.preparazione = prima.preparazione ?? null;
        }
        if (e.riuscito !== undefined) {
          const giaRiuscito = prima.riuscito === true;
          esito = giaRiuscito && !e.riuscito ? { applicato: false, motivo: "già riuscito" } : { applicato: prima.riuscito !== e.riuscito, motivo: prima.riuscito === e.riuscito ? "uguale" : null };
          dopo.riuscito = giaRiuscito ? true : e.riuscito;
        }

        const storico = Array.isArray(prima.eventi) ? (prima.eventi as unknown[]) : [];
        dopo.eventi = [
          ...storico,
          {
            fonte: e.fonte,
            eventoId: e.eventoId ?? null,
            stato: e.stato ?? null,
            preparazione: e.preparazione ?? null,
            riuscito: e.riuscito ?? null,
            applicato: esito.applicato,
            motivo: esito.motivo,
            il: adesso.toISOString(),
          },
        ].slice(-MASSIMO_STORICO);
        dopo.aggiornatoIl = adesso.toISOString();

        if (righe[0]) {
          await tx.externalEntityMapping.update({
            where: { id: righe[0].id },
            data: { metadata: dopo as Prisma.InputJsonValue, lastSeenAt: adesso },
          });
        } else {
          await tx.externalEntityMapping.create({
            data: {
              venueId: i.venueId,
              installationId: i.id,
              entityType: tipo,
              externalId: riferimento,
              externalLabel: riferimento.slice(0, 200),
              metadata: dopo as Prisma.InputJsonValue,
              lastSeenAt: adesso,
            },
          });
        }
        return esito;
      });
    } catch (err) {
      // Due transazioni che creano la stessa riga nello stesso istante: la
      // seconda trova il vincolo unico, e al giro dopo la riga c'è (e si blocca).
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002" && tentativo < 2) continue;
      throw err;
    }
  }
  throw new Error("aggiornaEsitoMappatura: tentativi esauriti");
}

/**
 * Unisce chiavi di primo livello nei metadati di una mappatura **senza**
 * riscrivere le altre (quelle che un webhook può aver scritto nel frattempo).
 * Per l'esito dell'invio: `{ invio: {…} }`, eventualmente togliendo chiavi.
 */
export async function unisciMetadati(mappingId: string, unione: Record<string, unknown>, togli: string[] = []) {
  const json = JSON.stringify(unione);
  if (togli.length) {
    await db.$executeRaw`
      UPDATE "ExternalEntityMapping"
      SET metadata = (COALESCE(metadata, '{}'::jsonb) - ${togli}::text[]) || ${json}::jsonb, "updatedAt" = now()
      WHERE id = ${mappingId}`;
  } else {
    await db.$executeRaw`
      UPDATE "ExternalEntityMapping"
      SET metadata = COALESCE(metadata, '{}'::jsonb) || ${json}::jsonb, "updatedAt" = now()
      WHERE id = ${mappingId}`;
  }
}
