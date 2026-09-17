import { db } from "@/lib/db";
import { codaIdentita, telefonoLeggibile } from "@/lib/telefono";
import {
  riconosciChiamante,
  type EsitoRiconoscimento,
} from "@/server/telefonia";

/**
 * Le chiamate al telefono del locale, mentre succedono.
 *
 * ## A cosa serve, e cosa non è
 *
 * Serve ai tre secondi in cui il telefono squilla: chi risponde vede chi sta
 * chiamando prima di dire pronto. **Non è un registro telefonico** — quello ce
 * l'ha il centralino, che vede tutto il traffico, anche quello che non riguarda
 * il ristorante.
 *
 * ## Chi scrive
 *
 * Il centralino, attraverso `/api/v1/telefonia/chiamata`. Ogni evento della
 * stessa chiamata arriva con lo stesso identificativo, e la riga si **aggiorna**
 * invece di moltiplicarsi: una consegna ripetuta — che su una rete succede — non
 * deve far comparire due volte la stessa persona sullo schermo.
 */

/** Oltre questo, una chiamata che «squilla» non sta più squillando. */
const SQUILLO_MASSIMO_MS = 90_000;

export type StatoChiamata = "RINGING" | "ANSWERED" | "MISSED" | "ENDED";

export type ChiamataViva = {
  id: string;
  /** Il numero come si legge a voce. Nullo quando arriva riservato. */
  telefono: string | null;
  stato: StatoChiamata;
  daQuandoISecondi: number;
  /** Chi sta chiamando, se lo sappiamo. */
  chi: EsitoRiconoscimento["guest"];
  prossimaPrenotazione: EsitoRiconoscimento["prossimaPrenotazione"];
  ultimaVisita: EsitoRiconoscimento["ultimaVisita"];
  altreSchede: EsitoRiconoscimento["altreSchede"];
};

/**
 * Registra un evento di chiamata.
 *
 * Il riconoscimento dell'ospite si fa **una volta**, allo squillo, e si scrive
 * sulla riga: se domani quella scheda cambia numero, questa chiamata resta
 * attribuita a chi era in quel momento. Una storia che si riscrive non è una
 * storia — ed è anche il motivo per cui non si rifà il riconoscimento agli
 * eventi successivi: costerebbe una lettura per ogni «ha risposto».
 */
export async function registraEventoChiamata(
  venueId: string,
  dati: {
    externalId: string;
    phone?: string | null;
    stato: StatoChiamata;
    quando?: Date;
  },
): Promise<{
  id: string;
  stato: StatoChiamata;
  chi: EsitoRiconoscimento["guest"];
}> {
  const adesso = dati.quando ?? new Date();
  const esistente = await db.phoneCall.findUnique({
    where: { venueId_externalId: { venueId, externalId: dati.externalId } },
    select: { id: true, guestId: true, fromNumber: true, answeredAt: true },
  });

  /* Il riconoscimento solo alla prima notizia di questa chiamata. Agli eventi
     successivi l'ospite è già sulla riga. */
  let riconosciuto: EsitoRiconoscimento | null = null;
  if (!esistente) {
    riconosciuto = await riconosciChiamante(
      venueId,
      dati.phone ?? null,
      adesso,
    );
  }

  const riga = await db.phoneCall.upsert({
    where: { venueId_externalId: { venueId, externalId: dati.externalId } },
    create: {
      venueId,
      externalId: dati.externalId,
      fromNumber: dati.phone ?? null,
      status: dati.stato,
      startedAt: adesso,
      answeredAt: dati.stato === "ANSWERED" ? adesso : null,
      endedAt:
        dati.stato === "ENDED" || dati.stato === "MISSED" ? adesso : null,
      guestId: riconosciuto?.guest?.id ?? null,
    },
    update: {
      status: dati.stato,
      /* `?? adesso` e non sovrascrittura: se il centralino manda «ha
         risposto» due volte, l'ora della risposta resta la prima. La seconda
         notizia non cambia quando è successo. */
      answeredAt:
        dati.stato === "ANSWERED"
          ? (esistente?.answeredAt ?? adesso)
          : undefined,
      endedAt:
        dati.stato === "ENDED" || dati.stato === "MISSED" ? adesso : undefined,
      // Il numero può arrivare solo con l'evento successivo (caller ID tardivo).
      fromNumber: dati.phone ?? esistente?.fromNumber ?? null,
    },
    select: { id: true, status: true, guestId: true },
  });

  return {
    id: riga.id,
    stato: riga.status as StatoChiamata,
    chi: riconosciuto?.guest ?? null,
  };
}

/**
 * Le chiamate da mostrare **adesso** in Servizio.
 *
 * Solo quelle che squillano o a cui si sta parlando, e solo quelle degli ultimi
 * novanta secondi: una riga rimasta «RINGING» perché il centralino non ha mai
 * mandato la chiusura non deve restare sullo schermo per sempre. È il caso che
 * capita — una rete che salta a metà chiamata — e lasciarlo scoperto vuol dire
 * un telefono che sembra squillare mentre il locale è silenzioso.
 */
export async function chiamateVive(
  venueId: string,
  adesso: Date = new Date(),
): Promise<ChiamataViva[]> {
  const righe = await db.phoneCall.findMany({
    where: {
      venueId,
      status: { in: ["RINGING", "ANSWERED"] },
      startedAt: { gte: new Date(adesso.getTime() - SQUILLO_MASSIMO_MS) },
    },
    orderBy: { startedAt: "desc" },
    take: 3,
    select: {
      id: true,
      fromNumber: true,
      status: true,
      startedAt: true,
      guestId: true,
    },
  });
  if (righe.length === 0) return [];

  /* Il riconoscimento si rilegge qui, non si conserva: le allergie e il blocco
     devono essere quelli di adesso. L'ospite **quale** è già deciso (sta sulla
     riga); quello che si rilegge è cosa sappiamo di lui. */
  return Promise.all(
    righe.map(async (r) => {
      const esito = r.fromNumber
        ? await riconosciChiamante(venueId, r.fromNumber, adesso)
        : null;
      return {
        id: r.id,
        telefono: r.fromNumber ? telefonoLeggibile(r.fromNumber) : null,
        stato: r.status as StatoChiamata,
        daQuandoISecondi: Math.max(
          0,
          Math.round((adesso.getTime() - r.startedAt.getTime()) / 1000),
        ),
        chi: esito?.guest ?? null,
        prossimaPrenotazione: esito?.prossimaPrenotazione ?? null,
        ultimaVisita: esito?.ultimaVisita ?? null,
        altreSchede: esito?.altreSchede ?? [],
      };
    }),
  );
}

/**
 * Il segnale per la sonda: qualcosa è cambiato nelle chiamate?
 *
 * Corto di proposito, come gli altri pezzi di `versione-servizio`: il conteggio
 * serve perché la sola ora dell'ultima modifica non vede una chiamata che
 * **smette** di squillare.
 */
export async function versioneChiamate(
  venueId: string,
  adesso: Date = new Date(),
) {
  const r = await db.phoneCall.aggregate({
    where: {
      venueId,
      status: { in: ["RINGING", "ANSWERED"] },
      startedAt: { gte: new Date(adesso.getTime() - SQUILLO_MASSIMO_MS) },
    },
    _count: { _all: true },
    _max: { updatedAt: true },
  });
  return `${r._count._all}:${r._max.updatedAt?.getTime() ?? 0}`;
}

/**
 * Chiude le chiamate che nessuno ha chiuso.
 *
 * Il centralino manda la fine di una chiamata, ma se salta la rete nel momento
 * sbagliato quella notizia non arriva mai. Senza questa pulizia la riga resta
 * `RINGING` per sempre nel database — invisibile sullo schermo grazie al limite
 * dei novanta secondi, ma sporca nei conti di domani.
 */
export async function chiudiChiamateAppese(
  adesso: Date = new Date(),
): Promise<number> {
  const esito = await db.phoneCall.updateMany({
    where: {
      status: { in: ["RINGING", "ANSWERED"] },
      startedAt: { lt: new Date(adesso.getTime() - 60 * 60 * 1000) },
    },
    data: { status: "ENDED", endedAt: adesso },
  });
  return esito.count;
}

/** Il numero ha una forma utilizzabile? Serve alla rotta per rifiutare presto. */
export function numeroUtilizzabile(phone: string | null | undefined): boolean {
  return codaIdentita(phone) != null;
}
