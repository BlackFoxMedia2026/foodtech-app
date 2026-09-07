import { randomBytes } from "node:crypto";
import type { Sentiment } from "@prisma/client";
import { db } from "@/lib/db";
import { enqueueMessage } from "./messaging/send";
import { createNotification } from "./notifications";

/**
 * «Com'è andata?» — la domanda dopo la visita.
 *
 * `Survey` e `SurveyResponse` esistevano nello schema, con il token, il
 * punteggio, il sentiment e lo spazio per un commento. Non avevano una riga di
 * codice: un ristorante non aveva modo di sapere cosa pensa chi è appena
 * uscito, se non aspettando che lo scrivesse su Google.
 *
 * Il punto del meccanismo non è raccogliere stelle: è **intercettare chi è
 * uscito insoddisfatto prima che lo scriva in pubblico**, e dare una strada
 * facile a chi è uscito contento. Sono due percorsi diversi dopo la stessa
 * domanda, ed è la ragione per cui il punteggio si chiede in privato.
 *
 * Il punteggio è 0-10 e non 1-5 perché il campo si chiama `npsScore` e il
 * sentiment ha già i tre valori canonici: promotori 9-10, passivi 7-8,
 * detrattori 0-6. È lo standard, e permette un numero confrontabile nel tempo.
 */

/** Da quante ore dopo la chiusura del tavolo si può chiedere. */
const ASK_AFTER_HOURS = 2;

/** Oltre queste ore non si chiede più: la memoria della serata è sbiadita. */
const ASK_WITHIN_HOURS = 48;

export function sentimentFromScore(score: number): Sentiment {
  if (score >= 9) return "PROMOTER";
  if (score >= 7) return "PASSIVE";
  return "DETRACTOR";
}

/** Il punteggio NPS classico: percentuale di promotori meno detrattori. */
export function npsFromCounts(counts: { promoters: number; passives: number; detractors: number }): number | null {
  const totale = counts.promoters + counts.passives + counts.detractors;
  if (totale === 0) return null;
  return Math.round(((counts.promoters - counts.detractors) / totale) * 100);
}

/* -------------------------------------------------------------------------- */
/*  Invio                                                                     */
/* -------------------------------------------------------------------------- */

function corpo(opts: { guestName: string; venueName: string; url: string }) {
  return `
    <div style="font-family: -apple-system, Segoe UI, Roboto, sans-serif; color: #2F1F11; max-width: 520px;">
      <p style="font-size:16px;">Ciao ${opts.guestName},</p>
      <p style="font-size:16px;">grazie per essere stato da <strong>${opts.venueName}</strong>.</p>
      <p style="font-size:15px;">Ci farebbe piacere sapere com'è andata: è una domanda sola.</p>
      <p>
        <a href="${opts.url}"
           style="display:inline-block;background:#0F2920;color:#F2E7D0;text-decoration:none;padding:12px 20px;border-radius:999px;font-size:15px;">
          Dicci com'è andata
        </a>
      </p>
      <p style="font-size:13px;color:#6b5a45;">Ci vuole meno di un minuto, e a noi serve davvero.</p>
      <p style="font-size:13px;color:#6b5a45;"><strong>${opts.venueName}</strong></p>
    </div>
  `;
}

export type SurveyRequestResult = {
  bookingId: string;
  /** `queued`: la consegna la fa la coda, vedi server/jobs/queue.ts. */
  outcome: "queued" | "already_asked" | "no_address" | "no_channel";
};

/**
 * Chiede a chi è venuto ieri.
 *
 * Una richiesta per prenotazione, garantita dal vincolo di unicità su
 * `Survey.bookingId`: se il cron gira due volte, la seconda non crea niente.
 */
export async function sendDueSurveyRequests(now: Date = new Date()): Promise<SurveyRequestResult[]> {
  const da = new Date(now.getTime() - ASK_WITHIN_HOURS * 3_600_000);
  const a = new Date(now.getTime() - ASK_AFTER_HOURS * 3_600_000);

  const bookings = await db.booking.findMany({
    where: {
      status: "COMPLETED",
      deletedAt: null,
      closedAt: { gte: da, lte: a },
      guestId: { not: null },
      venue: { active: true },
      // Il vincolo di unicità impedisce il doppione, ma escluderlo qui evita
      // di ricaricare ogni notte le stesse prenotazioni per scartarle.
      Survey: null,
    },
    include: {
      guest: { select: { id: true, firstName: true, email: true } },
      venue: { select: { id: true, name: true } },
    },
    take: 200,
  });

  const risultati: SurveyRequestResult[] = [];
  const base = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  for (const b of bookings) {
    const email = b.guest?.email;
    if (!email) {
      risultati.push({ bookingId: b.id, outcome: "no_address" });
      continue;
    }

    const token = randomBytes(24).toString("base64url");

    // Il sondaggio nasce prima dell'invio: se l'email non parte, la riga resta
    // e il link continuerebbe a funzionare — meglio di un token promesso e
    // mai creato.
    const survey = await db.survey.create({
      data: { venueId: b.venueId, bookingId: b.id, guestId: b.guest!.id, token },
    });

    const esito = await enqueueMessage({
      venueId: b.venueId,
      venueName: b.venue.name,
      channel: "EMAIL",
      to: email,
      guestId: b.guest!.id,
      bookingId: b.id,
      kind: "booking.survey_request",
      subject: `Com'è andata da ${b.venue.name}?`,
      body: corpo({
        guestName: b.guest!.firstName,
        venueName: b.venue.name,
        url: `${base}/s/${token}`,
      }),
      preview: "Richiesta di valutazione dopo la visita",
    });

    if (!esito.queued) {
      // Senza canale il sondaggio non serve a nulla: si rimuove, così domani
      // si riprova invece di restare una riga muta per sempre.
      if (esito.reason === "no_channel" || esito.reason === "no_address") {
        await db.survey.delete({ where: { id: survey.id } });
      }
      risultati.push({
        bookingId: b.id,
        outcome: esito.reason === "duplicate" ? "already_asked" : esito.reason,
      });
      continue;
    }

    risultati.push({ bookingId: b.id, outcome: "queued" });
  }

  return risultati;
}

/* -------------------------------------------------------------------------- */
/*  Risposta                                                                  */
/* -------------------------------------------------------------------------- */

export type SurveyView = {
  token: string;
  venueName: string;
  guestName: string | null;
  visitedAt: string | null;
  alreadyAnswered: boolean;
  /** Dove mandare chi è contento, se il locale ha un profilo pubblico. */
  publicReviewUrl: string | null;
};

export async function readSurveyByToken(token: string): Promise<SurveyView | null> {
  const survey = await db.survey.findUnique({
    where: { token },
    include: {
      SurveyResponse: { select: { id: true } },
      Venue: { select: { name: true, googleBusinessUrl: true } },
      Guest: { select: { firstName: true } },
      booking: { select: { startsAt: true } },
    },
  });
  if (!survey) return null;

  return {
    token,
    venueName: survey.Venue.name,
    guestName: survey.Guest?.firstName ?? null,
    visitedAt: survey.booking?.startsAt.toISOString() ?? null,
    alreadyAnswered: !!survey.SurveyResponse,
    publicReviewUrl: survey.Venue.googleBusinessUrl ?? null,
  };
}

export type SubmitResult =
  | {
      ok: true;
      sentiment: Sentiment;
      /** Presente solo per i promotori: la strada per la recensione pubblica. */
      publicReviewUrl: string | null;
      message: string;
    }
  | { ok: false; code: "invalid_token" | "already_answered" | "invalid_score"; message: string };

export async function submitSurveyResponse(
  token: string,
  input: { score: number; comment?: string | null; recommend?: boolean | null },
): Promise<SubmitResult> {
  if (!Number.isInteger(input.score) || input.score < 0 || input.score > 10) {
    return { ok: false, code: "invalid_score", message: "Il punteggio deve essere fra 0 e 10." };
  }

  const survey = await db.survey.findUnique({
    where: { token },
    include: {
      SurveyResponse: { select: { id: true } },
      Venue: { select: { id: true, name: true, googleBusinessUrl: true } },
      Guest: { select: { id: true, firstName: true, lastName: true } },
    },
  });
  if (!survey) {
    return { ok: false, code: "invalid_token", message: "Questo link non è più valido." };
  }
  if (survey.SurveyResponse) {
    return { ok: false, code: "already_answered", message: "Abbiamo già registrato la tua risposta. Grazie!" };
  }

  const sentiment = sentimentFromScore(input.score);

  await db.$transaction([
    db.surveyResponse.create({
      data: {
        surveyId: survey.id,
        npsScore: input.score,
        sentiment,
        comment: input.comment?.trim() || null,
        recommend: input.recommend ?? null,
      },
    }),
    db.survey.update({ where: { id: survey.id }, data: { respondedAt: new Date() } }),
  ]);

  // Un detrattore è la ragione per cui questo meccanismo esiste: chi ha avuto
  // una brutta serata va saputo **subito**, non alla fine del mese in un
  // rapporto. La notifica in-app ha già la sua categoria nello schema.
  if (sentiment === "DETRACTOR") {
    const nome = survey.Guest
      ? `${survey.Guest.firstName}${survey.Guest.lastName ? ` ${survey.Guest.lastName}` : ""}`
      : "Un ospite";
    await createNotification(survey.venueId, {
      kind: "NPS_DETRACTOR",
      // Neutro di proposito: «non è rimasto soddisfatto» concordava al
      // maschile su qualunque nome, e il genere di un ospite non lo sappiamo.
      title: `Voto basso da ${nome}`,
      body: input.comment?.trim()
        ? `Punteggio ${input.score}/10 — «${input.comment.trim().slice(0, 180)}»`
        : `Punteggio ${input.score}/10, senza commento. Una telefonata può recuperare il cliente.`,
      link: survey.Guest ? `/guests/${survey.Guest.id}` : undefined,
    });
  }

  return {
    ok: true,
    sentiment,
    publicReviewUrl: sentiment === "PROMOTER" ? survey.Venue.googleBusinessUrl ?? null : null,
    message:
      sentiment === "PROMOTER"
        ? "Grazie! Ci fa piacere davvero."
        : sentiment === "PASSIVE"
          ? "Grazie: ci serve anche sapere cosa possiamo fare meglio."
          : "Grazie per la sincerità. Ne parliamo internamente e ci faremo sentire.",
  };
}

/* -------------------------------------------------------------------------- */
/*  Lettura per il locale                                                     */
/* -------------------------------------------------------------------------- */

export type SurveyStats = {
  /** Nullo finché non c'è nessuna risposta: non si mostra uno zero finto. */
  nps: number | null;
  responses: number;
  sent: number;
  responseRate: number | null;
  promoters: number;
  passives: number;
  detractors: number;
  averageScore: number | null;
  /** Andamento per settimana, dalla più vecchia alla più recente. */
  trend: { from: string; nps: number | null; responses: number }[];
  recentComments: {
    id: string;
    score: number;
    sentiment: Sentiment;
    comment: string;
    at: string;
    guestName: string | null;
    guestId: string | null;
  }[];
};

export async function getSurveyStats(
  venueId: string,
  opts: { days?: number; now?: Date } = {},
): Promise<SurveyStats> {
  const now = opts.now ?? new Date();
  const days = opts.days ?? 90;
  const da = new Date(now.getTime() - days * 86_400_000);

  const surveys = await db.survey.findMany({
    where: { venueId, sentAt: { gte: da } },
    include: {
      SurveyResponse: true,
      Guest: { select: { id: true, firstName: true, lastName: true } },
    },
    orderBy: { sentAt: "desc" },
  });

  const risposte = surveys.filter((s) => s.SurveyResponse);
  const promoters = risposte.filter((s) => s.SurveyResponse!.sentiment === "PROMOTER").length;
  const passives = risposte.filter((s) => s.SurveyResponse!.sentiment === "PASSIVE").length;
  const detractors = risposte.filter((s) => s.SurveyResponse!.sentiment === "DETRACTOR").length;

  // Quattro settimane, dalla più vecchia: un NPS su una settimana con tre
  // risposte non significa niente, e il conteggio accanto lo dice.
  const trend: SurveyStats["trend"] = [];
  for (let i = 3; i >= 0; i--) {
    const fine = new Date(now.getTime() - i * 7 * 86_400_000);
    const inizio = new Date(fine.getTime() - 7 * 86_400_000);
    const dentro = risposte.filter((s) => s.SurveyResponse!.createdAt >= inizio && s.SurveyResponse!.createdAt < fine);
    trend.push({
      from: inizio.toISOString().slice(0, 10),
      nps: npsFromCounts({
        promoters: dentro.filter((s) => s.SurveyResponse!.sentiment === "PROMOTER").length,
        passives: dentro.filter((s) => s.SurveyResponse!.sentiment === "PASSIVE").length,
        detractors: dentro.filter((s) => s.SurveyResponse!.sentiment === "DETRACTOR").length,
      }),
      responses: dentro.length,
    });
  }

  return {
    nps: npsFromCounts({ promoters, passives, detractors }),
    responses: risposte.length,
    sent: surveys.length,
    responseRate: surveys.length > 0 ? risposte.length / surveys.length : null,
    promoters,
    passives,
    detractors,
    averageScore: risposte.length
      ? Math.round((risposte.reduce((n, s) => n + s.SurveyResponse!.npsScore, 0) / risposte.length) * 10) / 10
      : null,
    trend,
    recentComments: risposte
      .filter((s) => s.SurveyResponse!.comment)
      .slice(0, 10)
      .map((s) => ({
        id: s.id,
        score: s.SurveyResponse!.npsScore,
        sentiment: s.SurveyResponse!.sentiment,
        comment: s.SurveyResponse!.comment!,
        at: s.SurveyResponse!.createdAt.toISOString(),
        guestName: s.Guest
          ? `${s.Guest.firstName}${s.Guest.lastName ? ` ${s.Guest.lastName}` : ""}`
          : null,
        guestId: s.Guest?.id ?? null,
      })),
  };
}
