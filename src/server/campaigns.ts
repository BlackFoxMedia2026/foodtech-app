import { z } from "zod";
import { db } from "@/lib/db";
import { brevoAdapter } from "@/server/marketing/brevo-adapter";
import type { EmailProviderAdapter, NormalizedEventType } from "@/server/marketing/email-provider";
import type { Prisma } from "@prisma/client";

const adapter: EmailProviderAdapter = brevoAdapter;

export const SegmentFilter = z.object({
  tags: z.array(z.string()).optional(),
  loyaltyTier: z.enum(["NEW", "REGULAR", "VIP", "AMBASSADOR"]).optional(),
  minTotalVisits: z.number().int().min(0).optional(),
  inactiveDays: z.number().int().min(0).optional(),
});
export type SegmentFilterType = z.infer<typeof SegmentFilter>;

export const CampaignInput = z.object({
  name: z.string().min(1),
  subject: z.string().min(1),
  body: z.string().min(1),
  segment: SegmentFilter,
});
export type CampaignInputType = z.infer<typeof CampaignInput>;

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
      body: data.body,
      segment: data.segment,
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
  return db.campaign.update({
    where: { id },
    data: {
      ...(data.name !== undefined && { name: data.name }),
      ...(data.subject !== undefined && { subject: data.subject }),
      ...(data.body !== undefined && { body: data.body }),
      ...(data.segment !== undefined && { segment: data.segment }),
    },
  });
}

/**
 * marketingOptIn ed email non-null sono vincoli imposti sempre, in AND con i
 * filtri scelti dal ristoratore — non delegabili alla UI/segment builder.
 */
export async function resolveSegment(venueId: string, segment: SegmentFilterType) {
  const where: Prisma.GuestWhereInput = {
    venueId,
    marketingOptIn: true,
    email: { not: null },
  };
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
    where.OR = [{ lastVisitAt: { lte: threshold } }, { lastVisitAt: null }];
  }
  return db.guest.findMany({ where });
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

export async function sendCampaignNow(venueId: string, campaignId: string) {
  const { campaign, guests } = await prepareRecipients(venueId, campaignId);

  const ref = await adapter.createCampaign(campaign, {
    htmlContent: campaign.body || "",
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

  const ref = await adapter.createCampaign(campaign, {
    htmlContent: campaign.body || "",
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
