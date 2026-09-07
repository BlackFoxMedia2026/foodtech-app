import type { ReviewPlatform } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { MAX_LINK, NOME_PIATTAFORMA, PIATTAFORME } from "@/lib/recensioni";
import { recordAudit, type AuditActor } from "./audit";

// Ri-esportate: chi lavora sulle recensioni le cerca qui.
export { MAX_LINK, NOME_PIATTAFORMA, PIATTAFORME };

/**
 * Il ponte verso le recensioni pubbliche, **misurato**.
 *
 * La catena visita → sondaggio → NPS → azione esisteva già e si fermava lì:
 * a chi rispondeva 9 o 10 comparivà un bottone verso il profilo Google del
 * locale, e da quel momento in poi non sapevamo più niente. «Quante
 * recensioni ha portato Tavolo?» era una domanda senza risposta, e la
 * recensione pubblica è il primo canale di acquisizione di un ristorante.
 *
 * Qui cambiano due cose:
 *
 * - **le piattaforme sono più di una.** Google conta di più, ma un locale
 *   turistico vive di TripAdvisor e uno che lavora con TheFork ha lì le sue
 *   recensioni. Il locale decide dove mandare chi è contento;
 * - **il passaggio si conta.** Il collegamento passa da `/r/<id>`, che
 *   registra il clic e poi porta sulla piattaforma. Non sapremo mai se la
 *   recensione è stata scritta — quello lo sa solo Google — ma sappiamo
 *   quanti promotori sono arrivati fino alla porta, e quella è la parte che
 *   dipende da noi.
 *
 * **Cosa non registriamo, di proposito:** indirizzo IP e browser. Servirebbero
 * a profilare, non a contare, e la domanda a cui questa funzione risponde è
 * «quanti promotori hanno cliccato», non «chi era». Restano il sondaggio e il
 * punteggio, che sono il senso della misura.
 *
 * `Review` (le recensioni vere, riportate dentro Tavolo) resta una tabella
 * senza codice: leggerle richiede le API delle piattaforme, e inventare un
 * elenco di recensioni finte sarebbe il tipo di finzione che questo progetto
 * ha passato giorni a togliere.
 */

export type ReviewLinkView = {
  id: string;
  platform: ReviewPlatform;
  nome: string;
  label: string | null;
  url: string;
  /** Quanti promotori ci sono passati negli ultimi trenta giorni. */
  clic30: number;
};

export class ReviewError extends Error {
  constructor(readonly code: "troppi_link" | "url_non_valido") {
    super(code);
    this.name = "ReviewError";
  }
}

/* -------------------------------------------------------------------------- */
/*  Configurazione                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Il primo collegamento nasce da solo, dal profilo Google già in Brand.
 *
 * Senza questo passaggio, accendere la misura spegnerebbe il bottone: i locali
 * che oggi mandano i promotori su Google si troverebbero la pagina del
 * sondaggio senza più niente, finché qualcuno non apre le Impostazioni. Da
 * qui in poi la verità è una sola — le righe di `ReviewLink` — e il campo del
 * brand torna a fare il suo mestiere, che è l'icona sul sito.
 */
export async function ensureReviewLinks(venueId: string): Promise<void> {
  const quanti = await db.reviewLink.count({ where: { venueId } });
  if (quanti > 0) return;

  const venue = await db.venue.findUnique({ where: { id: venueId }, select: { googleBusinessUrl: true } });
  if (!venue?.googleBusinessUrl) return;

  await db.reviewLink.create({
    data: { venueId, platform: "GOOGLE", url: venue.googleBusinessUrl, ordering: 0 },
  });
}

async function clicPerLink(venueId: string, giorni = 30): Promise<Map<string, number>> {
  const da = new Date(Date.now() - giorni * 86_400_000);
  const righe = await db.reviewLinkClick.groupBy({
    by: ["linkId"],
    where: { venueId, createdAt: { gte: da } },
    _count: { _all: true },
  });
  return new Map(righe.map((r) => [r.linkId, r._count._all]));
}

export async function listReviewLinks(venueId: string): Promise<ReviewLinkView[]> {
  await ensureReviewLinks(venueId);
  const [links, clic] = await Promise.all([
    db.reviewLink.findMany({
      where: { venueId, active: true },
      orderBy: [{ ordering: "asc" }, { createdAt: "asc" }],
    }),
    clicPerLink(venueId),
  ]);
  return links.map((l) => ({
    id: l.id,
    platform: l.platform,
    nome: NOME_PIATTAFORMA[l.platform],
    label: l.label,
    url: l.url,
    clic30: clic.get(l.id) ?? 0,
  }));
}

export const ReviewLinksInput = z.object({
  links: z
    .array(
      z.object({
        id: z.string().min(1).optional(),
        platform: z.enum(PIATTAFORME),
        label: z.string().trim().max(60).optional().nullable(),
        url: z.string().trim().url("Questo indirizzo non sembra valido").max(500),
      }),
    )
    .max(MAX_LINK),
});
export type ReviewLinksInputType = z.infer<typeof ReviewLinksInput>;

/**
 * Salva l'elenco così com'è: quello che manca viene **spento, non cancellato**.
 *
 * Cancellare una riga porterebbe via i clic che ha raccolto (la relazione è a
 * cascata), e con essi la risposta a «l'anno scorso quanti promotori sono
 * andati su TripAdvisor?». Un collegamento tolto è una decisione di oggi, non
 * una smentita di ieri.
 */
export async function saveReviewLinks(
  venueId: string,
  raw: unknown,
  actor?: AuditActor,
): Promise<ReviewLinkView[]> {
  const { links } = ReviewLinksInput.parse(raw);
  const esistenti = await db.reviewLink.findMany({ where: { venueId } });
  const tenuti = new Set(links.map((l) => l.id).filter(Boolean) as string[]);

  await db.$transaction(async (tx) => {
    for (const vecchio of esistenti) {
      if (!tenuti.has(vecchio.id) && vecchio.active) {
        await tx.reviewLink.update({ where: { id: vecchio.id }, data: { active: false } });
      }
    }
    for (const [i, l] of links.entries()) {
      const dati = {
        platform: l.platform,
        label: l.label?.trim() || null,
        url: l.url,
        ordering: i,
        active: true,
      };
      if (l.id && esistenti.some((e) => e.id === l.id)) {
        await tx.reviewLink.update({ where: { id: l.id }, data: dati });
      } else {
        await tx.reviewLink.create({ data: { venueId, ...dati } });
      }
    }
  });

  await recordAudit(actor, "venue.review_links_update", "venue", venueId, {
    collegamenti: links.map((l) => `${NOME_PIATTAFORMA[l.platform]}: ${l.url}`),
  });

  return listReviewLinks(venueId);
}

/* -------------------------------------------------------------------------- */
/*  Il passaggio                                                              */
/* -------------------------------------------------------------------------- */

/** I collegamenti da mostrare a chi è appena uscito contento. */
export async function linksPerSondaggio(
  venueId: string,
): Promise<{ id: string; nome: string; label: string | null }[]> {
  const links = await listReviewLinks(venueId);
  return links.map((l) => ({ id: l.id, nome: l.nome, label: l.label }));
}

/**
 * Registra il passaggio e restituisce dove andare.
 *
 * Il clic si scrive **prima** del rinvio e non blocca nessuno: se la scrittura
 * fallisce, la persona arriva lo stesso sulla piattaforma. Una misura non vale
 * la recensione che stava per lasciare.
 */
export async function recordReviewLinkClick(
  linkId: string,
  opts: { surveyToken?: string | null } = {},
): Promise<string | null> {
  const link = await db.reviewLink.findUnique({ where: { id: linkId } });
  if (!link || !link.active) return null;

  let surveyId: string | null = null;
  let npsScore: number | null = null;
  if (opts.surveyToken) {
    const survey = await db.survey.findUnique({
      where: { token: opts.surveyToken },
      select: { id: true, venueId: true, SurveyResponse: { select: { npsScore: true } } },
    });
    // Il sondaggio dev'essere di questo locale: un token di un altro ristorante
    // non deve poter attribuire un clic qui.
    if (survey && survey.venueId === link.venueId) {
      surveyId = survey.id;
      npsScore = survey.SurveyResponse?.npsScore ?? null;
    }
  }

  try {
    await db.reviewLinkClick.create({
      data: { linkId: link.id, venueId: link.venueId, surveyId, npsScore },
    });
  } catch (err) {
    console.error("[recensioni] clic non registrato", err);
  }

  return link.url;
}

/* -------------------------------------------------------------------------- */
/*  La misura                                                                 */
/* -------------------------------------------------------------------------- */

export type ReviewFunnel = {
  giorni: number;
  /** Quanti hanno risposto 9 o 10. */
  promotori: number;
  /** Quanti di loro sono arrivati su una piattaforma. Persone, non clic. */
  arrivati: number;
  /** Clic totali, compresi quelli senza sondaggio (chi apre il link dal tavolo). */
  clic: number;
  perPiattaforma: { nome: string; clic: number }[];
};

/**
 * Quanti promotori hanno fatto il passo successivo.
 *
 * `arrivati` conta **persone**, non clic: chi torna sul link due volte non
 * diventa due recensioni. E resta un numero onesto su quello che sappiamo —
 * se la recensione è stata scritta davvero, Tavolo non può vederlo.
 */
export async function reviewFunnel(
  venueId: string,
  opts: { days?: number; now?: Date } = {},
): Promise<ReviewFunnel> {
  const giorni = opts.days ?? 90;
  const now = opts.now ?? new Date();
  const da = new Date(now.getTime() - giorni * 86_400_000);

  const [promotori, clicks, links] = await Promise.all([
    db.surveyResponse.count({
      where: { sentiment: "PROMOTER", createdAt: { gte: da }, Survey: { venueId } },
    }),
    db.reviewLinkClick.findMany({
      where: { venueId, createdAt: { gte: da } },
      select: { surveyId: true, linkId: true },
    }),
    db.reviewLink.findMany({ where: { venueId }, select: { id: true, platform: true, label: true } }),
  ]);

  const nomeDi = new Map(links.map((l) => [l.id, l.label?.trim() || NOME_PIATTAFORMA[l.platform]]));
  const perPiattaforma = new Map<string, number>();
  const persone = new Set<string>();
  for (const c of clicks) {
    if (c.surveyId) persone.add(c.surveyId);
    const nome = nomeDi.get(c.linkId) ?? "Altro";
    perPiattaforma.set(nome, (perPiattaforma.get(nome) ?? 0) + 1);
  }

  return {
    giorni,
    promotori,
    arrivati: persone.size,
    clic: clicks.length,
    perPiattaforma: [...perPiattaforma.entries()]
      .map(([nome, clic]) => ({ nome, clic }))
      .sort((a, b) => b.clic - a.clic),
  };
}
