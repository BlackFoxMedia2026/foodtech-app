import { BrevoClient } from "@getbrevo/brevo";
import type { Campaign, Guest } from "@prisma/client";
import { db } from "@/lib/db";
import { signUnsubscribeToken } from "@/lib/unsubscribe-token";
import type {
  CampaignStats,
  EmailProviderAdapter,
  NormalizedEvent,
  NormalizedEventType,
  ProviderCampaignRef,
  ProviderContactRef,
  TransactionalEmail,
} from "./email-provider";

const apiKey = process.env.BREVO_API_KEY;
const client = apiKey ? new BrevoClient({ apiKey }) : null;
const FROM_EMAIL = process.env.BREVO_FROM_EMAIL || "marketing@tavolo.local";
const FROM_NAME = process.env.BREVO_FROM_NAME || "Tavolo";

const EVENT_MAP: Record<string, NormalizedEventType> = {
  delivered: "delivered",
  opened: "opened",
  hard_bounce: "hard_bounce",
  soft_bounce: "soft_bounce",
  unsubscribed: "unsubscribed",
  spam: "complaint",
  complaint: "complaint",
};

async function ensureFolder(venueId: string): Promise<number> {
  const venue = await db.venue.findUniqueOrThrow({ where: { id: venueId } });
  if (venue.brevoFolderId) return venue.brevoFolderId;

  const folder = await client!.contacts.createFolder({ name: `Foodtech - ${venue.name}` });
  const folderId = folder.id;
  if (!folderId) throw new Error("brevo_folder_creation_failed");

  await db.venue.update({ where: { id: venueId }, data: { brevoFolderId: folderId } });
  return folderId;
}

async function ensureList(venueId: string, campaignId: string): Promise<number> {
  const folderId = await ensureFolder(venueId);
  const list = await client!.contacts.createList({ folderId, name: `campaign-${campaignId}` });
  const listId = list.id;
  if (!listId) throw new Error("brevo_list_creation_failed");
  return listId;
}

export const brevoAdapter: EmailProviderAdapter = {
  async createContact(guest: Guest): Promise<ProviderContactRef> {
    if (!client || !guest.email) {
      return { providerContactId: guest.id };
    }
    try {
      const res = await client.contacts.createContact({
        email: guest.email,
        attributes: {
          FIRSTNAME: guest.firstName,
          LASTNAME: guest.lastName ?? "",
          UNSUB_TOKEN: signUnsubscribeToken(guest.id),
        },
        updateEnabled: true,
        getId: true,
      });
      const id = res?.id;
      return { providerContactId: id ? String(id) : guest.email };
    } catch (error) {
      console.error(`[BREVO] createContact failed for ${guest.email}:`, error);
      return { providerContactId: guest.email };
    }
  },

  async syncContact(guest: Guest): Promise<ProviderContactRef> {
    return brevoAdapter.createContact(guest);
  },

  async createCampaign(
    campaign: Campaign,
    opts: { htmlContent: string; recipientEmails: string[] }
  ): Promise<ProviderCampaignRef> {
    if (!client) {
      return { providerId: campaign.id, providerListId: 0 };
    }
    try {
      const listId = await ensureList(campaign.venueId, campaign.id);
      if (opts.recipientEmails.length > 0) {
        await client.contacts.addContactToList({
          listId,
          body: { emails: opts.recipientEmails },
        });
      }

      const res = await client.emailCampaigns.createEmailCampaign({
        name: campaign.name,
        subject: campaign.subject || campaign.name,
        sender: { email: FROM_EMAIL, name: FROM_NAME },
        htmlContent: opts.htmlContent,
        recipients: { listIds: [listId] },
      });
      const providerId = res.id;
      if (!providerId) throw new Error("brevo_campaign_creation_failed");
      return { providerId: String(providerId), providerListId: listId };
    } catch (error) {
      console.error(`[BREVO] createCampaign failed for campaign ${campaign.id}:`, error);
      throw error;
    }
  },

  async sendCampaign(providerId: string): Promise<void> {
    if (!client) {
      console.log(`[BREVO] sendCampaign no-op (Brevo not configured): ${providerId}`);
      return;
    }
    await client.emailCampaigns.sendEmailCampaignNow({ campaignId: Number(providerId) });
  },

  async scheduleCampaign(providerId: string, at: Date): Promise<void> {
    if (!client) {
      console.log(`[BREVO] scheduleCampaign no-op (Brevo not configured): ${providerId} at ${at.toISOString()}`);
      return;
    }
    await client.emailCampaigns.updateEmailCampaign({
      campaignId: Number(providerId),
      scheduledAt: at.toISOString(),
    });
  },

  async sendTransactionalEmail(payload: TransactionalEmail): Promise<void> {
    if (!client) {
      console.log(`[BREVO] sendTransactionalEmail no-op (Brevo not configured): ${payload.to}`);
      return;
    }
    try {
      await client.transactionalEmails.sendTransacEmail({
        sender: { email: FROM_EMAIL, name: FROM_NAME },
        to: [{ email: payload.to }],
        subject: payload.subject,
        htmlContent: payload.html,
      });
    } catch (error) {
      console.error(`[BREVO] sendTransactionalEmail failed for ${payload.to}:`, error);
    }
  },

  async getCampaignStats(providerId: string): Promise<CampaignStats> {
    if (!client) return { sentCount: 0, openedCount: 0 };
    const res = await client.emailCampaigns.getEmailCampaign({
      campaignId: Number(providerId),
      statistics: "globalStats",
    });
    const stats = (res as { statistics?: { globalStats?: { sent?: number; uniqueViews?: number } } }).statistics
      ?.globalStats;
    return { sentCount: stats?.sent ?? 0, openedCount: stats?.uniqueViews ?? 0 };
  },

  async handleWebhookEvent(rawPayload: unknown): Promise<NormalizedEvent[]> {
    const events = Array.isArray(rawPayload) ? rawPayload : [rawPayload];
    const normalized: NormalizedEvent[] = [];

    for (const raw of events) {
      const evt = raw as {
        event?: string;
        email?: string;
        "message-id"?: string;
        id?: string | number;
        ts_event?: number;
        date?: string;
        campaign_id?: number[] | number;
      };
      const eventType = evt.event ? EVENT_MAP[evt.event] : undefined;
      if (!eventType || !evt.email) continue;

      const messageId = evt["message-id"] ?? "";
      const providerEventId = `${evt.event}:${messageId || evt.email}:${evt.ts_event ?? evt.date ?? ""}`;
      const campaignId = Array.isArray(evt.campaign_id) ? evt.campaign_id[0] : evt.campaign_id;

      normalized.push({
        providerEventId,
        eventType,
        toAddress: evt.email,
        providerCampaignId: campaignId != null ? String(campaignId) : undefined,
        providerMessageId: messageId || undefined,
        occurredAt: evt.ts_event ? new Date(evt.ts_event * 1000) : evt.date ? new Date(evt.date) : new Date(),
      });
    }

    return normalized;
  },

  async unsubscribeContact(providerContactId: string): Promise<void> {
    if (!client) {
      console.log(`[BREVO] unsubscribeContact no-op (Brevo not configured): ${providerContactId}`);
      return;
    }
    try {
      await client.contacts.updateContact({
        identifier: providerContactId,
        emailBlacklisted: true,
      });
    } catch (error) {
      console.error(`[BREVO] unsubscribeContact failed for ${providerContactId}:`, error);
    }
  },
};
