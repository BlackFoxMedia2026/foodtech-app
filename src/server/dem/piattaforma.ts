import { db } from "@/lib/db";
import { disponibili, percentualeUsata } from "@/lib/dem-quota";
import { valutaReputazione, type LivelloReputazione } from "@/lib/dem-reputazione";
import { limiteDi } from "./abbonamento";

/**
 * La vista di piattaforma: tutti i clienti DEM, in una schermata.
 *
 * Serve a rispondere a tre domande che si fanno da fuori e non da dentro un
 * locale: chi sta per finire gli invii (e quindi vale una telefonata), chi ha
 * un dominio che non funziona (e quindi non sta mandando niente senza
 * saperlo), e chi sta rovinando la reputazione di tutti.
 *
 * Tutti i conti vengono da righe vere. Nessuna stima, nessun campione.
 */

export type RigaCliente = {
  venueId: string;
  locale: string;
  piano: string;
  usati: number;
  limite: number;
  percentuale: number;
  disponibili: number;
  dominio: string | null;
  dominioPronto: boolean;
  statoInvio: "Attivo" | "Sospeso" | "Da configurare";
  reputazione: LivelloReputazione;
  tassoRimbalzi: number | null;
  tassoSegnalazioni: number | null;
  ultimoInvio: Date | null;
};

/**
 * L'elenco dei clienti con il modulo DEM.
 *
 * Solo chi ha un abbonamento: un locale che non ha mai aperto il marketing non
 * è un cliente DEM, e riempire la tabella con centinaia di righe a zero
 * renderebbe invisibili le poche che contano.
 */
export async function clientiDem(): Promise<RigaCliente[]> {
  const abbonamenti = await db.demSubscription.findMany({
    include: { plan: true, venue: { select: { id: true, name: true } } },
    orderBy: { createdAt: "asc" },
  });
  if (abbonamenti.length === 0) return [];

  const venueIds = abbonamenti.map((a) => a.venueId);
  const da = new Date(Date.now() - 30 * 86_400_000);

  const [periodi, domini, campagne, ultimiInvii] = await Promise.all([
    db.demUsagePeriod.findMany({ where: { venueId: { in: venueIds } } }),
    db.demDomain.findMany({ where: { venueId: { in: venueIds } } }),
    db.campaign.groupBy({
      by: ["venueId"],
      where: { venueId: { in: venueIds }, sentAt: { gte: da } },
      _sum: { sentCount: true, bouncedCount: true, complainedCount: true },
    }),
    db.campaign.groupBy({
      by: ["venueId"],
      where: { venueId: { in: venueIds }, sentAt: { not: null } },
      _max: { sentAt: true },
    }),
  ]);

  const perCiclo = new Map(periodi.map((p) => [`${p.venueId}:${p.yearMonth}`, p]));
  const perDominio = new Map(domini.map((d) => [d.venueId, d]));
  const perCampagne = new Map(campagne.map((c) => [c.venueId, c]));
  const perUltimo = new Map(ultimiInvii.map((u) => [u.venueId, u._max.sentAt]));

  return abbonamenti.map((sub) => {
    const limite = limiteDi(sub);
    const ciclo = cicloCorrente(sub.currentPeriodStart);
    const periodo = perCiclo.get(`${sub.venueId}:${ciclo}`);
    const usati = periodo?.used ?? 0;
    const riservati = periodo?.reserved ?? 0;

    const dominio = perDominio.get(sub.venueId);
    const dominioPronto = dominio?.status === "VERIFIED";
    const somme = perCampagne.get(sub.venueId);

    const reputazione = valutaReputazione({
      inviate: somme?._sum.sentCount ?? 0,
      rimbalzi: somme?._sum.bouncedCount ?? 0,
      segnalazioni: somme?._sum.complainedCount ?? 0,
      dominioPronto,
      sospesa: sub.sendingPausedAt != null,
    });

    return {
      venueId: sub.venueId,
      locale: sub.venue.name,
      piano: sub.plan.name,
      usati,
      limite,
      percentuale: percentualeUsata({ limite, usati, riservati }),
      disponibili: disponibili({ limite, usati, riservati }),
      dominio: dominio?.sendingDomain ?? null,
      dominioPronto,
      statoInvio: sub.sendingPausedAt ? "Sospeso" : dominioPronto ? "Attivo" : "Da configurare",
      reputazione: reputazione.livello,
      tassoRimbalzi: reputazione.tassoRimbalzi,
      tassoSegnalazioni: reputazione.tassoSegnalazioni,
      ultimoInvio: perUltimo.get(sub.venueId) ?? null,
    };
  });
}

function cicloCorrente(inizio: Date): string {
  const anno = inizio.getUTCFullYear();
  const mese = String(inizio.getUTCMonth() + 1).padStart(2, "0");
  return `${anno}-${mese}`;
}

export type MargineMese = {
  inviate: number;
  /** Il costo dell'infrastruttura, **in dollari**: vedi la nota qui sotto. */
  costoStimatoUsd: number;
  ricavoCents: number;
  currency: string;
};

/**
 * Quanto ci costa mandare, e quanto incassiamo. Solo per noi.
 *
 * ## Il cambio non si inventa
 *
 * Il costo dell'infrastruttura è in dollari, i piani si vendono in euro.
 * Convertire richiede un tasso di cambio, e un tasso scritto nel codice
 * diventa sbagliato il giorno dopo — producendo un margine che sembra un
 * numero e non lo è. Finché non c'è una fonte affidabile dei cambi, i due
 * valori restano nelle loro valute e il confronto lo fa una persona.
 *
 * ## Il prezzo per mille non è un prezzo di listino
 *
 * Sta in configurazione perché i listini dell'infrastruttura cambiano e perché
 * dipendono dal piano tariffario attivo sull'account, che va guardato e non
 * dedotto. Nessuna parte del prodotto lo usa per decidere qualcosa: serve solo
 * a questo riquadro.
 */
export async function margineDelMese(): Promise<MargineMese> {
  const inizio = new Date();
  inizio.setUTCDate(1);
  inizio.setUTCHours(0, 0, 0, 0);

  const [invii, abbonamenti] = await Promise.all([
    db.campaign.aggregate({ where: { sentAt: { gte: inizio } }, _sum: { sentCount: true } }),
    db.demSubscription.findMany({ where: { status: "ACTIVE" }, include: { plan: true } }),
  ]);

  const inviate = invii._sum.sentCount ?? 0;
  const costoPerMille = Number(process.env.DEM_COSTO_PER_MILLE_USD ?? "0.10");

  return {
    inviate,
    costoStimatoUsd: Math.round((inviate / 1000) * costoPerMille * 100) / 100,
    ricavoCents: abbonamenti.reduce((somma, s) => somma + s.plan.priceCents, 0),
    currency: "EUR",
  };
}
