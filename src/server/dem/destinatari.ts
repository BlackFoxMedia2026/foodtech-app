import { db } from "@/lib/db";

/**
 * Chi riceve davvero una campagna.
 *
 * Il segmento dice **chi corrisponde ai criteri**; questo modulo dice chi di
 * quelli si può e si deve contattare. Sono due domande diverse, e tenerle
 * separate è ciò che permette di mostrare al ristoratore la differenza fra le
 * due — «mille clienti corrispondono, novecento la ricevono, ed ecco perché»
 * — invece di un numero finale che sembra arbitrario.
 *
 * Il conto serve anche a qualcos'altro: gli invii si pagano per destinatario,
 * e si paga **questa** lista. Un contatto escluso qui non costa niente, ed è
 * giusto così — non gli è stato scritto.
 *
 * L'ordine delle esclusioni non è casuale: ogni contatto conta in **una sola**
 * categoria, quella che si incontra per prima. Senza un ordine dichiarato, un
 * disiscritto senza email comparirebbe in due righe e la somma non tornerebbe.
 */

export type EsclusioniDestinatari = {
  /** Non ha un indirizzo: non è un rifiuto, è un dato che manca. */
  senzaEmail: number;
  /** Non ha dato il consenso, o l'ha ritirato. */
  senzaConsenso: number;
  /** In lista di soppressione: ha segnalato spam, o l'indirizzo non esiste. */
  soppressi: number;
  /** Lo stesso indirizzo su due schede: una email sola, un invio solo. */
  doppioni: number;
};

export type Candidato = {
  id: string;
  email: string | null;
  marketingOptIn: boolean;
  unsubscribedAt?: Date | null;
};

export type EsitoEleggibilita<T extends Candidato> = {
  destinatari: T[];
  esclusi: EsclusioniDestinatari;
};

/**
 * L'indirizzo in forma confrontabile.
 *
 * Minuscolo e senza spazi ai lati: `Mario@Ristorante.it` e
 * `mario@ristorante.it ` sono la stessa casella, e trattarli come due
 * destinatari significa scrivere due volte alla stessa persona e farlo pagare
 * due volte.
 */
export function normalizzaEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Filtra i candidati, contando i motivi.
 *
 * La soppressione si legge in una interrogazione sola per tutta la lista: una
 * per contatto significherebbe mille viaggi al database per disegnare
 * l'anteprima di un segmento, cioè un'anteprima che nessuno aspetta.
 */
export async function eleggibili<T extends Candidato>(
  venueId: string,
  candidati: T[],
): Promise<EsitoEleggibilita<T>> {
  const esclusi: EsclusioniDestinatari = { senzaEmail: 0, senzaConsenso: 0, soppressi: 0, doppioni: 0 };

  const conEmail: { candidato: T; email: string }[] = [];
  for (const c of candidati) {
    if (!c.email?.trim()) {
      esclusi.senzaEmail += 1;
      continue;
    }
    if (!c.marketingOptIn || c.unsubscribedAt) {
      esclusi.senzaConsenso += 1;
      continue;
    }
    conEmail.push({ candidato: c, email: normalizzaEmail(c.email) });
  }

  const soppressi =
    conEmail.length === 0
      ? new Set<string>()
      : new Set(
          (
            await db.demSuppression.findMany({
              where: { venueId, email: { in: Array.from(new Set(conEmail.map((c) => c.email))) } },
              select: { email: true },
            })
          ).map((s) => s.email),
        );

  const visti = new Set<string>();
  const destinatari: T[] = [];

  for (const { candidato, email } of conEmail) {
    if (soppressi.has(email)) {
      esclusi.soppressi += 1;
      continue;
    }
    if (visti.has(email)) {
      esclusi.doppioni += 1;
      continue;
    }
    visti.add(email);
    destinatari.push(candidato);
  }

  return { destinatari, esclusi };
}

/**
 * Questo indirizzo è soppresso per questo locale?
 *
 * Per il singolo controllo — un invio di prova, un contatto aggiunto a mano.
 * Per una lista si usa `eleggibili`, che ne fa una interrogazione sola.
 */
export async function soppresso(venueId: string, email: string): Promise<boolean> {
  const riga = await db.demSuppression.findUnique({
    where: { venueId_email: { venueId, email: normalizzaEmail(email) } },
    select: { id: true },
  });
  return riga !== null;
}

/**
 * Mette un indirizzo in soppressione, senza sovrascrivere il motivo originale.
 *
 * Il primo motivo è quello vero: se un indirizzo è stato soppresso per una
 * segnalazione di spam e più tardi arriva anche un rimbalzo, resta una
 * segnalazione di spam — che è il fatto più grave e quello che spiega perché
 * non gli si scrive più.
 */
export async function sopprimi(
  venueId: string,
  email: string,
  reason: "HARD_BOUNCE" | "COMPLAINT" | "UNSUBSCRIBE" | "MANUAL" | "INVALID",
  opts: { detail?: string; source?: string } = {},
): Promise<void> {
  const indirizzo = normalizzaEmail(email);
  if (!indirizzo) return;
  await db.demSuppression.upsert({
    where: { venueId_email: { venueId, email: indirizzo } },
    create: {
      venueId,
      email: indirizzo,
      reason,
      detail: opts.detail?.slice(0, 300) ?? null,
      source: opts.source?.slice(0, 60) ?? null,
    },
    update: {},
  });
}

/**
 * La fotografia dei destinatari, scattata prima di riservare la quota.
 *
 * Da qui in poi la campagna ha una lista **sua**, che non cambia se il
 * segmento cambia: chi la riceverà è deciso adesso, e adesso si sa quanto
 * costa. Senza lo scatto, una campagna programmata per venerdì partirebbe con
 * i contatti di venerdì — un numero diverso da quello che il ristoratore ha
 * visto e approvato il martedì.
 *
 * Le righe già partite non si toccano: rifare lo scatto su una campagna a metà
 * (una ripresa dopo un'interruzione) deve poter aggiungere e togliere fra i
 * destinatari in attesa, mai riscrivere la storia di chi ha già ricevuto.
 */
export async function scattaSnapshot(
  campaignId: string,
  venueId: string,
  destinatari: { id: string; email: string | null; firstName: string; lastName: string | null }[],
): Promise<number> {
  await db.campaignRecipient.deleteMany({ where: { campaignId, status: "PENDING" } });

  await db.campaignRecipient.createMany({
    data: destinatari
      .filter((g) => g.email)
      .map((g) => ({
        campaignId,
        venueId,
        guestId: g.id,
        email: normalizzaEmail(g.email!),
        firstName: g.firstName,
        lastName: g.lastName,
      })),
    // Chi ha già ricevuto è ancora in tabella con lo stesso indirizzo: il
    // vincolo di unicità lo protegge, e saltarlo è esattamente ciò che serve.
    skipDuplicates: true,
  });

  return db.campaignRecipient.count({ where: { campaignId } });
}
