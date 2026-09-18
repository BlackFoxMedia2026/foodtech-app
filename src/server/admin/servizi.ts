import { z } from "zod";
import { db } from "@/lib/db";
import { FUNZIONI_CENTRALINO } from "@/lib/licenza-centralino";

/**
 * I servizi dei locali, dal pannello di piattaforma.
 *
 * ## Cosa manda in pensione
 *
 * Il centralino si accendeva incollando una **chiave firmata** emessa da un
 * secondo gestionale. Per un cliente della nostra installazione era un giro
 * inutile: sei gesti in due applicazioni, due chiavi in versi opposti, e in
 * mezzo un codice da copiare. Il database e nostro e chi accende siamo noi —
 * quindi si accende da qui, con un interruttore.
 *
 * **La firma non va in pensione**: resta la strada delle installazioni che non
 * gestiamo noi, dove un interruttore nel database sarebbe un interruttore che
 * il cliente si gira da solo. Le due strade convivono e nessuna indebolisce
 * l'altra (vedi `statoCentralino`).
 *
 * ## Cosa questo file non fa
 *
 * Non controlla chi sta chiamando. Il controllo del super amministratore sta
 * **nella rotta**, come per tutto il resto del pannello: una funzione di
 * server che si fida del suo chiamante e una funzione che prima o poi viene
 * chiamata da un altro posto.
 */

export const ServizioInput = z.object({
  servizio: z.literal("CENTRALINO"),
  attivo: z.boolean(),
  /** Vuoto = tutte quelle di oggi. */
  funzioni: z.array(z.enum(FUNZIONI_CENTRALINO)).optional(),
  nota: z.string().trim().max(300).optional(),
});

export type ServizioInputType = z.infer<typeof ServizioInput>;

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

/**
 * Accende o spegne un servizio.
 *
 * **Lo spegnimento non cancella la riga**: resta con `spentoIl` e con chi
 * l'aveva acceso. Cancellarla vorrebbe dire perdere la storia di un servizio
 * che qualcuno ha pagato per due mesi — e davanti a «da ieri non va» la prima
 * domanda e quando e chi.
 */
export async function cambiaServizio(
  venueId: string,
  raw: unknown,
  adminEmail: string,
  adesso = new Date(),
) {
  const dati = ServizioInput.parse(raw);

  const locale = await db.venue.findUnique({ where: { id: venueId }, select: { id: true } });
  if (!locale) throw new Error("locale_non_trovato");

  const comune = {
    attivo: dati.attivo,
    funzioni: dati.funzioni ?? [],
    ...(dati.nota !== undefined ? { nota: dati.nota || null } : {}),
    spentoIl: dati.attivo ? null : adesso,
  };

  await db.venueServizio.upsert({
    where: { venueId_servizio: { venueId, servizio: dati.servizio } },
    create: {
      venueId,
      servizio: dati.servizio,
      ...comune,
      /* Chi ha **deciso**, e quando: si scrive all'accensione e non si
         sovrascrive a ogni salvataggio della nota. Un campo «ultima modifica»
         risponde a una domanda che nessuno fa. */
      attivatoDa: adminEmail,
      attivatoIl: adesso,
    },
    update: {
      ...comune,
      /* Riaccendere e una decisione nuova: chi e quando si aggiornano. Cambiare
         solo la nota o le funzioni, no. */
      ...(dati.attivo ? { attivatoDa: adminEmail, attivatoIl: adesso } : {}),
    },
  });
}
