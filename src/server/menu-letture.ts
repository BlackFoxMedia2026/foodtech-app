import { createHash } from "node:crypto";
import { db } from "@/lib/db";
import { dateKeyInVenue } from "@/lib/venue-time";

/**
 * Quante volte la carta viene letta.
 *
 * ## Metà di una tabella, di proposito
 *
 * `MenuScan` era pensata per **raccogliere contatti**: ha `email`, `phone`,
 * `consentMarketing`. Quella è una funzione di marketing con dentro il
 * consenso, e non si fa di straforo mentre si aggiunge un contatore: qui si
 * scrive **solo** quante volte la carta è stata aperta, e quei tre campi
 * restano vuoti. Se un giorno si vuole il resto, si decide allora.
 *
 * ## Perché non si salva l'indirizzo di rete
 *
 * Perché un indirizzo IP è un dato personale, e per contare le letture non
 * serve: serve solo distinguere due letture della stessa persona da due
 * letture di due persone. Quindi si salva un'**impronta** che cambia ogni
 * giorno e per ogni locale — `sha256(ip + browser + locale + giorno)` — da cui
 * non si torna all'indirizzo e che non permette di seguire nessuno fra un
 * giorno e l'altro.
 *
 * ## Una lettura per dispositivo al giorno
 *
 * Chi legge la carta la riapre quattro volte durante la cena — antipasti,
 * secondi, dolci, il vino — e contarle quattro volte trasformerebbe «quante
 * persone l'hanno letta» in «quante volte è stata aperta», che è un numero
 * che gonfia da solo. Un tavolo che ricarica la pagina non fa quattro clienti.
 */

/** Su quanti giorni si guarda, quando si mostra il numero. */
export const GIORNI_LETTURE = 30;

function impronta(opz: {
  ip: string | null;
  userAgent: string | null;
  venueId: string;
  giorno: string;
}): string {
  return createHash("sha256")
    .update(`${opz.ip ?? "?"}|${opz.userAgent ?? "?"}|${opz.venueId}|${opz.giorno}`)
    .digest("hex")
    .slice(0, 32);
}

/**
 * Segna una lettura, se quel dispositivo non l'ha già letta oggi.
 *
 * Non solleva mai: è una statistica, e non deve poter impedire a un cliente di
 * leggere il menù. La pagina la chiama senza attenderla.
 */
export async function segnaLetturaCarta(opz: {
  venueId: string;
  menuKey?: string;
  /** `QR` quando si arriva dal codice sul tavolo, `LINK` da un indirizzo. */
  source?: "QR" | "LINK";
  ip?: string | null;
  userAgent?: string | null;
  fuso?: string;
  adesso?: Date;
}): Promise<{ segnata: boolean }> {
  try {
    const adesso = opz.adesso ?? new Date();
    const giorno = dateKeyInVenue(adesso, opz.fuso ?? "Europe/Rome");
    const ipHash = impronta({
      ip: opz.ip ?? null,
      userAgent: opz.userAgent ?? null,
      venueId: opz.venueId,
      giorno,
    });

    /* Già letta oggi da questo dispositivo? Il confronto è sull'impronta, che
       contiene il giorno: domani la stessa persona conta di nuovo, ed è
       giusto — è un'altra visita. */
    const gia = await db.menuScan.findFirst({
      where: { venueId: opz.venueId, ipHash },
      select: { id: true },
    });
    if (gia) return { segnata: false };

    await db.menuScan.create({
      data: {
        venueId: opz.venueId,
        menuKey: opz.menuKey ?? "main",
        source: opz.source ?? "LINK",
        ipHash,
        /* Il browser si conserva tronco: serve a distinguere un telefono da un
           programma che gira, non a profilare nessuno. */
        userAgent: opz.userAgent?.slice(0, 120) ?? null,
      },
    });
    return { segnata: true };
  } catch {
    return { segnata: false };
  }
}

export type LettureCarta = {
  /** Quante letture negli ultimi giorni. */
  totale: number;
  /** Quante arrivate dal QR sul tavolo. */
  dalQr: number;
  giorni: number;
};

/**
 * Il numero da mostrare al ristoratore.
 *
 * Diviso fra QR e indirizzo perché sono due domande diverse: «la gente
 * inquadra il codice sul tavolo?» e «il link che ho messo su Instagram
 * funziona?». Un totale unico non risponde a nessuna delle due.
 */
export async function lettureCarta(
  venueId: string,
  giorni = GIORNI_LETTURE,
  adesso: Date = new Date(),
): Promise<LettureCarta> {
  const da = new Date(adesso.getTime() - giorni * 86_400_000);
  const [totale, dalQr] = await Promise.all([
    db.menuScan.count({ where: { venueId, createdAt: { gte: da } } }),
    db.menuScan.count({ where: { venueId, createdAt: { gte: da }, source: "QR" } }),
  ]);
  return { totale, dalQr, giorni };
}
