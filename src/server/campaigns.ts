import { headers } from "next/headers";
import { z } from "zod";
import { db } from "@/lib/db";
import { brevoAdapter } from "@/server/marketing/brevo-adapter";
import type { EmailProviderAdapter, NormalizedEventType } from "@/server/marketing/email-provider";
import type { Prisma } from "@prisma/client";
import { BlockSchema, type Block } from "@/lib/campaign-blocks";
import {
  compileBlocksToHtml,
  resolveGlobalVariables,
  resolveTestVariables,
  toBrevoMergeTags,
} from "@/lib/campaign-blocks-compiler";

const adapter: EmailProviderAdapter = brevoAdapter;

export const SegmentFilter = z.object({
  tags: z.array(z.string()).optional(),
  loyaltyTier: z.enum(["NEW", "REGULAR", "VIP", "AMBASSADOR"]).optional(),
  minTotalVisits: z.number().int().min(0).optional(),
  inactiveDays: z.number().int().min(0).optional(),
  minTotalSpend: z.number().min(0).optional(),
  minNoShowCount: z.number().int().min(0).optional(),
  birthdayThisMonth: z.boolean().optional(),
  hasFutureBooking: z.boolean().optional(),
  noFutureBooking: z.boolean().optional(),
  hadCancelledBooking: z.boolean().optional(),
});
export type SegmentFilterType = z.infer<typeof SegmentFilter>;

// Solo `name` è obbligatorio: il wizard crea una bozza minimale dopo lo Step 1
// e completa gli altri campi con PATCH incrementali nei passi successivi.
export const CampaignInput = z.object({
  name: z.string().min(1),
  subject: z.string().min(1).optional(),
  body: z.string().min(1).optional(),
  previewText: z.string().optional(),
  contentBlocks: z.array(BlockSchema).optional(),
  segment: SegmentFilter.optional(),
});
export type CampaignInputType = z.infer<typeof CampaignInput>;

function getRequestOrigin(): string {
  const hdrs = headers();
  const host = hdrs.get("x-forwarded-host") ?? hdrs.get("host") ?? "localhost:3000";
  const proto = hdrs.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

export async function listCampaigns(venueId: string) {
  return db.campaign.findMany({ where: { venueId }, orderBy: { createdAt: "desc" } });
}

export async function getCampaign(venueId: string, id: string) {
  return db.campaign.findFirst({ where: { id, venueId } });
}

export async function createCampaign(venueId: string, raw: unknown) {
  const data = CampaignInput.parse(raw);
  return db.campaign.create({
    data: {
      venueId,
      name: data.name,
      subject: data.subject,
      body: data.contentBlocks ? compileBlocksToHtml(data.contentBlocks as Block[]) : data.body,
      previewText: data.previewText,
      contentBlocks: data.contentBlocks as unknown as Prisma.InputJsonValue,
      segment: (data.segment ?? {}) as Prisma.InputJsonValue,
      channel: "EMAIL",
      status: "DRAFT",
    },
  });
}

export async function updateCampaign(venueId: string, id: string, raw: unknown) {
  const data = CampaignInput.partial().parse(raw);
  const existing = await db.campaign.findFirst({ where: { id, venueId } });
  if (!existing) throw new Error("not_found");
  if (existing.status !== "DRAFT") throw new Error("campaign_not_editable");
  // Quando arrivano contentBlocks, il body compilato viene sempre ricalcolato qui:
  // contentBlocks resta l'unica fonte di verità, body è solo una cache derivata,
  // così i due non possono mai disallinearsi anche se il client invia un body stantio.
  return db.campaign.update({
    where: { id },
    data: {
      ...(data.name !== undefined && { name: data.name }),
      ...(data.subject !== undefined && { subject: data.subject }),
      ...(data.previewText !== undefined && { previewText: data.previewText }),
      ...(data.contentBlocks !== undefined && {
        contentBlocks: data.contentBlocks as unknown as Prisma.InputJsonValue,
        body: compileBlocksToHtml(data.contentBlocks as Block[]),
      }),
      ...(data.contentBlocks === undefined && data.body !== undefined && { body: data.body }),
      ...(data.segment !== undefined && { segment: data.segment as Prisma.InputJsonValue }),
    },
  });
}

/**
 * Costruisce il where-clause dai soli filtri di segmento, SENZA i vincoli
 * marketingOptIn/email (usato sia da resolveSegment che da previewSegment per
 * poter calcolare il breakdown "quanti esclusi per consenso/email mancante").
 * Le condizioni sulla relazione bookings vengono accumulate in un array e
 * composte via AND invece di sovrascrivere `where.bookings` più volte — è
 * l'unico modo corretto quando più filtri booking-based sono attivi insieme.
 */
function buildSegmentWhere(venueId: string, segment: SegmentFilterType): Prisma.GuestWhereInput {
  const where: Prisma.GuestWhereInput = { venueId };
  const and: Prisma.GuestWhereInput[] = [];

  if (segment.tags && segment.tags.length > 0) {
    where.tags = { hasSome: segment.tags };
  }
  if (segment.loyaltyTier) {
    where.loyaltyTier = segment.loyaltyTier;
  }
  if (segment.minTotalVisits !== undefined) {
    where.totalVisits = { gte: segment.minTotalVisits };
  }
  if (segment.inactiveDays !== undefined) {
    const threshold = new Date(Date.now() - segment.inactiveDays * 24 * 60 * 60 * 1000);
    and.push({ OR: [{ lastVisitAt: { lte: threshold } }, { lastVisitAt: null }] });
  }
  if (segment.minTotalSpend !== undefined) {
    where.totalSpend = { gte: segment.minTotalSpend };
  }
  if (segment.minNoShowCount !== undefined) {
    where.noShowCount = { gte: segment.minNoShowCount };
  }
  if (segment.hasFutureBooking) {
    and.push({ bookings: { some: { startsAt: { gte: new Date() }, status: { notIn: ["CANCELLED", "NO_SHOW"] } } } });
  }
  if (segment.noFutureBooking) {
    and.push({ bookings: { none: { startsAt: { gte: new Date() }, status: { notIn: ["CANCELLED", "NO_SHOW"] } } } });
  }
  if (segment.hadCancelledBooking) {
    and.push({ bookings: { some: { status: "CANCELLED" } } });
  }
  if (and.length > 0) {
    where.AND = and;
  }
  return where;
}

/** birthdayThisMonth non è esprimibile come predicato Prisma portabile: si applica
 * come filtro finale in JS sui risultati già ridotti dagli altri filtri — corretto e
 * semplice ai volumi di guest per-venue di questo SaaS (a scale molto più grandi si
 * passerebbe a $queryRaw con EXTRACT(MONTH FROM birthday)). */
function applyBirthdayThisMonthFilter<T extends { birthday: Date | null }>(
  guests: T[],
  segment: SegmentFilterType
): T[] {
  if (!segment.birthdayThisMonth) return guests;
  const currentMonth = new Date().getMonth();
  return guests.filter((g) => g.birthday && g.birthday.getMonth() === currentMonth);
}

/**
 * marketingOptIn ed email non-null sono vincoli imposti sempre, in AND con i
 * filtri scelti dal ristoratore — non delegabili alla UI/segment builder.
 */
export async function resolveSegment(venueId: string, segment: SegmentFilterType) {
  const where = buildSegmentWhere(venueId, segment);
  where.marketingOptIn = true;
  where.email = { not: null };
  const guests = await db.guest.findMany({ where });
  return applyBirthdayThisMonthFilter(guests, segment);
}

export interface SegmentPreviewResult {
  totalMatchingFilters: number;
  excludedNoEmail: number;
  excludedNoConsent: number;
  finalRecipients: number;
}

/**
 * Esegue i filtri due volte: una volta senza i vincoli obbligatori di consenso/email
 * (per sapere quanti clienti corrispondono ai soli filtri scelti) e una volta con
 * essi (= identico a resolveSegment), per calcolare un breakdown reale delle
 * esclusioni. Un guest senza email ha priorità come motivo di esclusione rispetto
 * al consenso mancante, così le due categorie non si sovrappongono mai.
 * Non esiste un contatore "duplicati rimossi": i guest sono già righe uniche in DB,
 * quindi il concetto non si applica — va omesso o etichettato onestamente in UI,
 * mai mostrato come 0 finto che lasci intendere un dedup avvenuto.
 */
export async function previewSegment(venueId: string, segment: SegmentFilterType): Promise<SegmentPreviewResult> {
  const where = buildSegmentWhere(venueId, segment);
  const allMatching = applyBirthdayThisMonthFilter(
    await db.guest.findMany({ where, select: { id: true, email: true, marketingOptIn: true, birthday: true } }),
    segment
  );

  const totalMatchingFilters = allMatching.length;
  const excludedNoEmail = allMatching.filter((g) => !g.email).length;
  const excludedNoConsent = allMatching.filter((g) => g.email && !g.marketingOptIn).length;
  const finalRecipients = allMatching.filter((g) => g.email && g.marketingOptIn).length;

  return { totalMatchingFilters, excludedNoEmail, excludedNoConsent, finalRecipients };
}

async function requireDraftCampaign(venueId: string, campaignId: string) {
  const campaign = await db.campaign.findFirst({ where: { id: campaignId, venueId } });
  if (!campaign) throw new Error("not_found");
  if (campaign.status !== "DRAFT") throw new Error("campaign_already_sent");
  return campaign;
}

async function prepareRecipients(venueId: string, campaignId: string) {
  const campaign = await requireDraftCampaign(venueId, campaignId);
  const segment = (campaign.segment as SegmentFilterType | null) ?? {};
  const guests = await resolveSegment(venueId, segment);

  for (const guest of guests) {
    const ref = await adapter.syncContact(guest);
    await db.guestProviderLink.upsert({
      where: { guestId_provider: { guestId: guest.id, provider: "brevo" } },
      create: {
        venueId,
        guestId: guest.id,
        provider: "brevo",
        providerContactId: ref.providerContactId,
      },
      update: { providerContactId: ref.providerContactId, syncedAt: new Date() },
    });
  }

  return { campaign, guests };
}

async function createMessageLogs(campaignId: string, venueId: string, guests: { id: string; email: string | null }[]) {
  await db.messageLog.createMany({
    data: guests
      .filter((g) => g.email)
      .map((g) => ({
        id: crypto.randomUUID(),
        venueId,
        campaignId,
        guestId: g.id,
        channel: "EMAIL" as const,
        toAddress: g.email!,
        status: "QUEUED" as const,
      })),
  });
}

/**
 * Risolve i token globali di campagna ({{RESTAURANT_NAME}}, {{BOOKING_LINK}} — stesso
 * valore per ogni destinatario) e mappa i token per-destinatario rimanenti alla
 * sintassi di merge-tag di Brevo, che li risolverà lui stesso al momento dell'invio
 * reale usando gli attributi contatto sincronizzati in syncContact/createContact.
 */
async function compileHtmlForBrevoSend(venueId: string, body: string): Promise<string> {
  const venue = await db.venue.findUniqueOrThrow({ where: { id: venueId } });
  const origin = getRequestOrigin();
  const withGlobals = resolveGlobalVariables(body, {
    restaurantName: venue.name,
    bookingLink: `${origin}/book?venue=${venueId}`,
  });
  return toBrevoMergeTags(withGlobals);
}

export async function sendCampaignNow(venueId: string, campaignId: string) {
  const { campaign, guests } = await prepareRecipients(venueId, campaignId);
  const htmlContent = await compileHtmlForBrevoSend(venueId, campaign.body || "");

  const ref = await adapter.createCampaign(campaign, {
    htmlContent,
    recipientEmails: guests.map((g) => g.email!).filter(Boolean),
  });
  await adapter.sendCampaign(ref.providerId);
  await createMessageLogs(campaign.id, venueId, guests);

  return db.campaign.update({
    where: { id: campaign.id },
    data: {
      status: "SENT",
      providerId: ref.providerId,
      providerListId: ref.providerListId,
      sentCount: guests.length,
    },
  });
}

export async function scheduleCampaign(venueId: string, campaignId: string, at: Date) {
  const { campaign, guests } = await prepareRecipients(venueId, campaignId);
  const htmlContent = await compileHtmlForBrevoSend(venueId, campaign.body || "");

  const ref = await adapter.createCampaign(campaign, {
    htmlContent,
    recipientEmails: guests.map((g) => g.email!).filter(Boolean),
  });
  await adapter.scheduleCampaign(ref.providerId, at);
  await createMessageLogs(campaign.id, venueId, guests);

  return db.campaign.update({
    where: { id: campaign.id },
    data: {
      status: "SCHEDULED",
      scheduledAt: at,
      providerId: ref.providerId,
      providerListId: ref.providerListId,
      sentCount: guests.length,
    },
  });
}

/**
 * Invio di test: non tocca MessageLog (non è un invio reale a un destinatario),
 * risolve TUTTI i token localmente con dati di esempio realistici e passa
 * dall'adapter transazionale già verificato in produzione (sendTransactionalEmail),
 * bypassando del tutto la macchina "campagna" di Brevo.
 */
export async function sendTestEmail(venueId: string, campaignId: string, to: string) {
  const campaign = await db.campaign.findFirst({ where: { id: campaignId, venueId } });
  if (!campaign) throw new Error("not_found");
  if (campaign.status !== "DRAFT") throw new Error("campaign_not_editable");
  const venue = await db.venue.findUniqueOrThrow({ where: { id: venueId } });

  const rawHtml = campaign.contentBlocks
    ? compileBlocksToHtml(campaign.contentBlocks as unknown as Block[])
    : campaign.body || "";

  const origin = getRequestOrigin();
  const html = resolveTestVariables(rawHtml, {
    firstName: "Mario",
    lastName: "Rossi",
    restaurantName: venue.name,
    bookingLink: `${origin}/book?venue=${venueId}#test`,
    lastVisitDate: new Date().toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric" }),
    loyaltyLevel: "VIP",
  });

  await adapter.sendTransactionalEmail({
    to,
    subject: campaign.subject ?? "(anteprima campagna)",
    html,
  });
}

const EVENT_TO_MESSAGE_STATUS: Partial<Record<NormalizedEventType, "DELIVERED" | "FAILED">> = {
  delivered: "DELIVERED",
  hard_bounce: "FAILED",
};

export async function recordWebhookEvent(rawPayload: unknown) {
  const events = await adapter.handleWebhookEvent(rawPayload);

  for (const evt of events) {
    const existing = await db.webhookEvent.findUnique({
      where: { provider_providerEventId: { provider: "brevo", providerEventId: evt.providerEventId } },
    });
    if (existing) continue;

    await db.webhookEvent.create({
      data: {
        provider: "brevo",
        providerEventId: evt.providerEventId,
        eventType: evt.eventType,
        payload: rawPayload as Prisma.InputJsonValue,
        processedAt: new Date(),
      },
    });

    const messageLog = evt.providerCampaignId
      ? await db.messageLog.findFirst({
          where: { campaignId: evt.providerCampaignId, toAddress: evt.toAddress },
        })
      : null;

    const newStatus = EVENT_TO_MESSAGE_STATUS[evt.eventType];
    if (messageLog && newStatus) {
      await db.messageLog.update({
        where: { id: messageLog.id },
        data: {
          status: newStatus,
          ...(newStatus === "DELIVERED" && { deliveredAt: evt.occurredAt }),
          ...(newStatus === "FAILED" && { failedAt: evt.occurredAt, error: evt.eventType }),
        },
      });
    }

    if (evt.eventType === "opened" && messageLog?.campaignId) {
      await db.campaign.update({
        where: { id: messageLog.campaignId },
        data: { openedCount: { increment: 1 } },
      });
    }

    if (
      messageLog &&
      (evt.eventType === "hard_bounce" || evt.eventType === "unsubscribed" || evt.eventType === "complaint")
    ) {
      const guest = await db.guest.findFirst({
        where: { venueId: messageLog.venueId, email: evt.toAddress },
      });
      if (guest) {
        await db.guest.update({ where: { id: guest.id }, data: { marketingOptIn: false } });
        await db.consentLog.create({
          data: {
            id: crypto.randomUUID(),
            venueId: guest.venueId,
            guestId: guest.id,
            channel: "EMAIL",
            granted: false,
            source: `brevo_${evt.eventType}`,
          },
        });
      }
    }
  }
}
