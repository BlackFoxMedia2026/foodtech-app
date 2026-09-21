import { db } from "@/lib/db";

/**
 * Il telefono dei locali, visto dal pannello di piattaforma.
 *
 * ## Solo lettura, e non per caso
 *
 * Qui non si accende e non si spegne niente. Per un giorno c'era un
 * interruttore, poi la direzione e diventata quella giusta: **Tavolo non si
 * configura**, nasce col telefono spento e ad accenderlo e la chiave firmata
 * che solo ilmiocentralino puo fabbricare. Due strade verso lo stesso «si»
 * erano anche due posti in cui cercare quando la risposta e «no».
 *
 * Quello che resta risponde a una domanda che serve davvero: **chi ha il
 * telefono, da quando, e su quali linee** — tutti i clienti in una schermata.
 * Guardare non e configurare.
 */

export type LocaleConServizi = {
  venueId: string;
  nome: string;
  organizzazione: string;
  /** Il centralino: acceso, e da dove. */
  centralino: {
    attivo: boolean;
    origine: "piattaforma" | "chiave" | null;
    funzioni: string[];
    /** Vero quando c'e anche una chiave firmata: si dice, non si nasconde. */
    haChiave: boolean;
    attivatoDa: string | null;
    attivatoIl: Date | null;
    nota: string | null;
  };
  /** Le linee che arrivano a questo locale, come le mostra il pannello. */
  linee: { numero: string; etichetta: string | null }[];
  ultimaChiamata: Date | null;
  /**
   * Come si chiama nel centralino. Nullo = **il centralino non si e ancora
   * presentato**, e allora da qui non si puo assegnare niente: assegnare al
   * cliente sbagliato manda le telefonate di un ristorante nel gestionale di
   * un altro.
   */
  tenantCentralino: string | null;
};

/**
 * Tutti i locali, con lo stato dei servizi.
 *
 * Tutti e non solo quelli col centralino acceso: la domanda di questa
 * schermata e «a chi lo accendo?», e un elenco dei soli accesi non la puo
 * rispondere.
 */
export async function localiConServizi(): Promise<LocaleConServizi[]> {
  const locali = await db.venue.findMany({
    orderBy: [{ org: { name: "asc" } }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      phoneLicenseKey: true,
      org: { select: { name: true } },
      servizi: {
        where: { servizio: "CENTRALINO" },
        select: { attivo: true, funzioni: true, attivatoDa: true, attivatoIl: true, nota: true },
        take: 1,
      },
      centralinoTenantId: true,
      voiceNumbers: {
        where: { attivo: true },
        orderBy: { createdAt: "asc" },
        select: { numeroEsterno: true, numeroMostrato: true, etichetta: true },
      },
      phoneCalls: { orderBy: { startedAt: "desc" }, take: 1, select: { startedAt: true } },
    },
  });

  return locali.map((l) => {
    const s = l.servizi[0];
    const haChiave = !!l.phoneLicenseKey;
    /* Acceso dall'interruttore, oppure da una chiave. Qui non si riverifica la
       firma — costerebbe una verifica per riga su una schermata che elenca
       tutti i locali — quindi si dice **chiave presente**, non «chiave
       valida»: la verifica vera la fa `statoCentralino` dentro il locale, ed e
       quella che comanda. Scrivere «attivo» qui per una chiave scaduta
       sarebbe la solita spunta che dichiara un fatto invece di leggerlo. */
    return {
      venueId: l.id,
      nome: l.name,
      organizzazione: l.org.name,
      centralino: {
        attivo: s?.attivo ?? false,
        origine: s?.attivo ? "piattaforma" : haChiave ? "chiave" : null,
        funzioni: s?.funzioni ?? [],
        haChiave,
        attivatoDa: s?.attivatoDa ?? null,
        attivatoIl: s?.attivatoIl ?? null,
        nota: s?.nota ?? null,
      },
      linee: l.voiceNumbers.map((n) => ({
        numero: n.numeroMostrato ?? n.numeroEsterno,
        etichetta: n.etichetta,
      })),
      ultimaChiamata: l.phoneCalls[0]?.startedAt ?? null,
      tenantCentralino: l.centralinoTenantId,
    };
  });
}
