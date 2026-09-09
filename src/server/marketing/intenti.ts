import { AUDIENCE_TAGS, previewSegment, type AudienceTag } from "@/server/campaigns";
import { GIORNI_MINIMI, getOccupancyByWeekday, type WeekdayOccupancy } from "@/server/forecast";
import { listExperiences } from "@/server/experiences";

/**
 * «Cosa vuoi ottenere», prima di «quale strumento voglio aprire» (§38).
 *
 * L'hub del marketing era un indice di funzioni: campagne, automazioni,
 * coupon, gift card, Wi-Fi, QR. Chi ci arriva sapendo già cosa cliccare non ha
 * bisogno di un indice; chi non lo sa non trova il suo problema in un elenco
 * di strumenti, perché il suo problema è «il martedì è vuoto», non «coupon».
 *
 * Le due regole che tengono onesta questa lista:
 *
 * 1. **un intento si mostra solo se il dato per calcolarlo c'è.** «Riempire un
 *    giorno debole» non compare se non abbiamo misurato abbastanza martedì —
 *    la soglia è la stessa della previsione (`GIORNI_MINIMI`), non una più
 *    comoda. Un intento senza il suo numero sarebbe un pulsante che promette
 *    una cosa che non sappiamo;
 * 2. **ogni intento porta il numero che lo giustifica**, e il numero dice su
 *    cosa è misurato. «41 clienti non vengono da più di quattro mesi» è una
 *    ragione; «fai tornare gli inattivi» è uno slogan.
 *
 * Nessun dato nuovo: la debolezza di un giorno la calcola già la previsione,
 * i segmenti li calcolano già le campagne, e il segmento viaggia
 * nell'indirizzo — `?segmento=inattivi` — come fa già Analytics.
 */

export type ChiaveIntento = "giorno_debole" | "inattivi" | "migliori" | "evento" | "campagna";

export type Intento = {
  chiave: ChiaveIntento;
  /** Cosa si vuole ottenere, detto come lo direbbe chi ha il locale. */
  titolo: string;
  /** Il fatto misurato che lo giustifica, con la base della misura. */
  perche: string;
  /** Il gesto, e dove porta con il segmento già scelto. */
  azione: string;
  href: string;
};

/**
 * Di quanto un giorno deve stare sotto la media per chiamarlo «debole».
 *
 * Dieci punti di occupazione: sotto, è la differenza fra due martedì. È lo
 * stesso ragionamento della soglia di scostamento della sintesi esecutiva —
 * un numero che si muove poco non è una notizia, ed è quello che rende una
 * proposta credibile invece che automatica.
 */
export const DEBOLE_SOTTO_MEDIA_PCT = 10;

/** Quante persone servono in un segmento perché valga la pena proporlo. */
const MINIMO_DESTINATARI = 3;

async function destinatari(venueId: string, tag: AudienceTag): Promise<number> {
  // Il conteggio è quello vero della campagna: conta chi ha un'email **e** il
  // consenso, che sono le persone a cui si può scrivere davvero.
  const p = await previewSegment(venueId, { audienceTag: tag });
  return p.finalRecipients;
}

/**
 * Il giorno debole, se ce n'è uno — e la regola sta qui perché è discutibile.
 *
 * Due filtri, entrambi necessari:
 *
 * - **solo i giorni misurati abbastanza** (`GIORNI_MINIMI`, la stessa soglia
 *   della previsione). Un locale aperto solo nel fine settimana ha cinque
 *   giorni a zero coperti: senza questo filtro «il tuo giorno debole è il
 *   lunedì» sarebbe la scoperta che il lunedì è chiuso;
 * - **e uno scarto che si vede**. Fra un martedì al 27% e una media del 30%
 *   non c'è niente da fare: è la differenza fra due martedì. Proporre uno
 *   sconto per tre punti è il modo di far ignorare tutti i suggerimenti
 *   successivi.
 *
 * La media è quella **degli altri giorni misurati**, non di tutta la
 * settimana: includendo il giorno debole nel confronto, il giorno debole
 * abbassa la propria asta.
 */
export function giornoDebole(
  occupazione: WeekdayOccupancy[],
): { giorno: WeekdayOccupancy; media: number } | null {
  const misurati = occupazione.filter((g) => g.giorni >= GIORNI_MINIMI && g.occupancyPct != null);
  if (misurati.length < 2) return null;

  const piuVuoto = misurati.reduce((a, b) =>
    (a.occupancyPct ?? 0) <= (b.occupancyPct ?? 0) ? a : b,
  );
  const altri = misurati.filter((g) => g.weekday !== piuVuoto.weekday);
  const media = altri.reduce((s, g) => s + (g.occupancyPct ?? 0), 0) / altri.length;

  if (media - (piuVuoto.occupancyPct ?? 0) < DEBOLE_SOTTO_MEDIA_PCT) return null;
  return { giorno: piuVuoto, media: Math.round(media) };
}

export async function intentiDisponibili(
  venueId: string,
  opts: { now?: Date } = {},
): Promise<Intento[]> {
  const now = opts.now ?? new Date();

  const [occupazione, inattivi, abituali, esperienze] = await Promise.all([
    getOccupancyByWeekday(venueId, { now }),
    destinatari(venueId, "inattivi"),
    destinatari(venueId, "abituali"),
    listExperiences(venueId),
  ]);

  const intenti: Intento[] = [];

  /* ---- 1. Riempire un giorno debole -------------------------------------- */

  const debole = giornoDebole(occupazione);
  if (debole) {
    intenti.push({
      chiave: "giorno_debole",
      titolo: `Riempire il ${debole.giorno.label}`,
      perche: `${debole.giorno.occupancyPct}% di occupazione contro il ${debole.media}% degli altri giorni, misurato su ${
        debole.giorno.giorni
      } ${debole.giorno.giorni === 1 ? "giornata" : "giornate"}.`,
      azione: "Crea uno sconto per quel giorno",
      // Il coupon si apre già limitato a quel giorno: il gesto che serve è
      // «uno sconto valido il martedì», non «apri i coupon».
      href: `/marketing/coupons?nuovo=1&giorno=${debole.giorno.weekday}`,
    });
  }

  /* ---- 2. Far tornare chi non viene più ---------------------------------- */

  if (inattivi >= MINIMO_DESTINATARI) {
    intenti.push({
      chiave: "inattivi",
      titolo: "Far tornare chi non viene più",
      perche: `${inattivi} ${
        inattivi === 1 ? "persona" : "persone"
      } con email e consenso ${inattivi === 1 ? "risulta" : "risultano"} ${
        AUDIENCE_TAGS.inattivi.toLowerCase()
      }.`,
      azione: "Scrivi a chi non torna",
      href: "/campaigns/new?segmento=inattivi&nome=" + encodeURIComponent("Torna a trovarci"),
    });
  }

  /* ---- 3. Premiare i migliori -------------------------------------------- */

  if (abituali >= MINIMO_DESTINATARI) {
    intenti.push({
      chiave: "migliori",
      titolo: "Premiare i clienti abituali",
      perche: `${abituali} ${
        abituali === 1 ? "persona viene" : "persone vengono"
      } spesso e ${abituali === 1 ? "ha" : "hanno"} email e consenso.`,
      azione: "Scrivi ai migliori",
      href: "/campaigns/new?segmento=abituali&nome=" + encodeURIComponent("Un grazie ai nostri abituali"),
    });
  }

  /* ---- 4. Promuovere la prossima serata ---------------------------------- */

  const prossima = esperienze
    .filter((e) => e.published && e.endsAt.getTime() >= now.getTime())
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())[0];
  if (prossima) {
    const giorni = Math.ceil((prossima.startsAt.getTime() - now.getTime()) / 86_400_000);
    intenti.push({
      chiave: "evento",
      titolo: `Riempire «${prossima.title}»`,
      perche:
        giorni <= 0
          ? `È oggi, e ha ${prossima.capacity} posti.`
          : `Fra ${giorni} ${giorni === 1 ? "giorno" : "giorni"}, ${prossima.capacity} posti.`,
      azione: "Annunciala per email",
      href: "/campaigns/new?nome=" + encodeURIComponent(prossima.title),
    });
  }

  /* ---- 5. E comunque, scrivere ------------------------------------------- */

  /*
    L'unico intento senza condizioni: non dipende da un dato, dipende dal
    fatto che uno abbia in mente una cosa da dire. Sta per ultimo perché è il
    più generico, non perché conti meno.
  */
  intenti.push({
    chiave: "campagna",
    titolo: "Scrivere a mano a chi voglio",
    perche: "Scegli tu il segmento, e la procedura dice quante persone sono prima di inviare.",
    azione: "Nuova campagna",
    href: "/campaigns/new",
  });

  return intenti;
}
