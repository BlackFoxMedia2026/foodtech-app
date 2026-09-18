import { db } from "@/lib/db";
import { telefonoLeggibile } from "@/lib/telefono";
import { statoDaChiave } from "@/server/licenza-centralino";
import { createNotification } from "@/server/notifications";

/**
 * Il recupero delle chiamate perse.
 *
 * ## Il buco, e non è nell'interfaccia
 *
 * Una chiamata persa la si vede: c'è il bollino in testata e la colonna «Da
 * fare». Ma **solo mentre qualcuno ha Tavolo aperto davanti**. Il telefono di
 * un ristorante squilla alle quattro del pomeriggio, quando la saracinesca è
 * giù e nessuno guarda niente; alle sei arriva chi apre, e la sola cosa che
 * gli dice che qualcuno ha chiamato è un numero su un bollino — che non dice
 * *quando*, né *chi*, e che sparisce appena la coda si svuota.
 *
 * La campanella sì: resta, ha l'ora dentro, e si legge a fine serata. È il
 * registro nel tempo di una cosa che altrimenti esiste solo adesso.
 *
 * `NotificationKind.MISSED_CALL` era dichiarata da mesi e **non l'ha mai
 * scritta nessuno**: era una categoria pronta per una funzione che non
 * esisteva. Adesso esiste.
 *
 * ## Le tre regole che decidono quando notificare
 *
 * La regola generale delle notifiche di Tavolo (vedi `server/notifications.ts`)
 * è: *si notifica solo ciò che nessun'altra schermata già mostra, e solo
 * quando una persona può farci qualcosa.* Tradotta qui:
 *
 * 1. **dopo dieci minuti, non subito.** Una chiamata persa alle 20:03 in pieno
 *    servizio, richiamata alle 20:05, non deve lasciare niente nella
 *    campanella: sarebbe una notifica per un lavoro già fatto, e tre di quelle
 *    insegnano a non aprirla più;
 * 2. **solo se nessuno se n'è occupato**: nessuna prenotazione nata da quella
 *    chiamata, nessuna richiamata in coda. Chi ha già deciso ha già deciso;
 * 3. **una sola volta per chiamata, per sempre.** Non si ripete il giorno
 *    dopo: un promemoria che torna da sé si chiude senza leggerlo.
 *
 * ## Perché gira per locale e non per tutte le chiamate
 *
 * Perché l'indice buono è `[venueId, status, startedAt]`: una spazzata globale
 * su `status` non lo usa. Si parte dai locali che hanno una chiave del
 * centralino — oggi pochi, domani tanti ma sempre molti meno delle chiamate —
 * e per ognuno si fa una lettura indicizzata.
 *
 * E si ricontrolla la **licenza**, non solo la presenza della chiave: un locale
 * che ha smesso di pagare non deve continuare a ricevere notifiche del
 * telefono.
 */

/** Quanto si aspetta prima di dire che nessuno se n'è occupato. */
export const GRAZIA_MINUTI = 10;

/** Oltre questo, richiamare non ha più senso e la notifica arriverebbe tardi. */
export const FINESTRA_ORE = 48;

export type EsitoRecupero = {
  /** Quante notifiche sono state scritte in questo giro. */
  notificate: number;
  /** Quanti locali sono stati guardati: serve a capire un giro a vuoto. */
  locali: number;
};

export async function notificaChiamatePerse(
  adesso: Date = new Date(),
): Promise<EsitoRecupero> {
  const locali = await db.venue.findMany({
    where: { phoneLicenseKey: { not: null } },
    select: {
      id: true,
      timezone: true,
      phoneLicenseKey: true,
      phoneLicenseActivatedAt: true,
    },
  });

  const da = new Date(adesso.getTime() - FINESTRA_ORE * 60 * 60 * 1000);
  const fino = new Date(adesso.getTime() - GRAZIA_MINUTI * 60 * 1000);
  let notificate = 0;

  for (const locale of locali) {
    const stato = statoDaChiave(
      locale.id,
      locale.phoneLicenseKey,
      locale.phoneLicenseActivatedAt,
      adesso,
    );
    if (!stato.attivo) continue;

    const perse = await db.phoneCall.findMany({
      where: {
        venueId: locale.id,
        status: "MISSED",
        startedAt: { gte: da, lte: fino },
        bookingId: null,
        callbacks: { none: {} },
      },
      orderBy: { startedAt: "asc" },
      take: 50,
      select: {
        id: true,
        fromNumber: true,
        startedAt: true,
        guest: { select: { firstName: true, lastName: true } },
      },
    });
    if (perse.length === 0) continue;

    /* Quelle già notificate, in un colpo solo.
   
       L'identificativo della chiamata sta in `meta`, e si rilegge da lì: la
       tabella delle notifiche non ha un vincolo unico su cui appoggiarsi, e
       questo giro passa ogni minuto — senza questa lettura la campanella si
       riempirebbe della stessa chiamata quarantotto volte all'ora. */
    const gia = await db.notification.findMany({
      where: {
        venueId: locale.id,
        kind: "MISSED_CALL",
        createdAt: { gte: da },
      },
      select: { meta: true },
    });
    const notiIds = new Set(
      gia
        .map((n) =>
          n.meta && typeof n.meta === "object" && !Array.isArray(n.meta)
            ? (n.meta as Record<string, unknown>).callId
            : null,
        )
        .filter((v): v is string => typeof v === "string"),
    );

    const ora = new Intl.DateTimeFormat("it-IT", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: locale.timezone,
    });

    for (const persa of perse) {
      if (notiIds.has(persa.id)) continue;

      const numero = telefonoLeggibile(persa.fromNumber);
      const nome = persa.guest
        ? `${persa.guest.firstName}${persa.guest.lastName ? ` ${persa.guest.lastName}` : ""}`
        : null;

      /* Chi ha chiamato nel titolo, e l'ora accanto.
       
         Il titolo è la sola riga che si legge scorrendo la campanella: se
         dicesse «Chiamata persa» bisognerebbe aprirla per sapere se vale la
         pena. Con il nome — o il numero, quando il nome non c'è — la si può
         anche solo guardare e decidere. */
      await createNotification(locale.id, {
        kind: "MISSED_CALL",
        title: nome
          ? `${nome} ha chiamato alle ${ora.format(persa.startedAt)}`
          : `Chiamata senza risposta alle ${ora.format(persa.startedAt)}`,
        body: nome
          ? `Nessuno ha risposto${numero ? ` — ${numero}` : ""}. Nessuno l'ha ancora richiamato.`
          : numero
            ? `${numero} — nessuno ha risposto, e non è un contatto che conosciamo.`
            : "Numero riservato: non c'è un numero da richiamare.",
        link: "/telefono",
        meta: { callId: persa.id },
      });
      notificate += 1;
    }
  }

  return { notificate, locali: locali.length };
}

/**
 * Spegne la notifica di una chiamata persa quando qualcuno se n'è occupato.
 *
 * Senza questo, la campanella terrebbe il pallino per un lavoro già fatto: si
 * apre il telefono, si mette la persona in coda o si prende la prenotazione,
 * e la notifica resta là non letta. È lo stesso difetto della coda che non si
 * spegne — e una campanella che segnala cose fatte la si smette di aprire.
 *
 * Si segna **letta** e non si cancella: quella telefonata è successa, e
 * l'ora a cui è arrivata resta leggibile nella campanella. Cancellarla
 * vorrebbe dire riscrivere la sera.
 */
export async function spegniNotificaChiamata(
  venueId: string,
  callId: string,
): Promise<void> {
  await db.notification
    .updateMany({
      where: {
        venueId,
        kind: "MISSED_CALL",
        readAt: null,
        meta: { path: ["callId"], equals: callId },
      },
      data: { readAt: new Date() },
    })
    .catch(() => {
      /* Una notifica che resta accesa non deve far fallire il gesto che l'ha
         resa inutile: meglio un pallino di troppo che una richiamata non
         messa in coda. */
    });
}
