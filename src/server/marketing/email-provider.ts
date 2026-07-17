import type { Campaign, Guest } from "@prisma/client";

export interface ProviderContactRef {
  providerContactId: string;
}

export interface ProviderCampaignRef {
  providerId: string;
  providerListId: number;
}

export interface CampaignStats {
  sentCount: number;
  openedCount: number;
}

export type NormalizedEventType =
  | "delivered"
  | "opened"
  | "hard_bounce"
  | "soft_bounce"
  | "unsubscribed"
  | "complaint";

export interface NormalizedEvent {
  providerEventId: string;
  eventType: NormalizedEventType;
  toAddress: string;
  providerCampaignId?: string;
  providerMessageId?: string;
  occurredAt: Date;
}

export interface TransactionalEmail {
  to: string;
  subject: string;
  html: string;
}

/**
 * Foodtech resta il "cervello" (Guest, ConsentLog, Campaign, MessageLog restano
 * qui): questa interfaccia isola tutto ciò che è specifico del fornitore, così
 * cambiare provider in futuro significa scrivere una nuova implementazione,
 * non riscrivere UI/route/logica di segmentazione.
 */
export interface EmailProviderAdapter {
  createContact(guest: Guest): Promise<ProviderContactRef>;
  syncContact(guest: Guest): Promise<ProviderContactRef>;
  createCampaign(
    campaign: Campaign,
    opts: { htmlContent: string; recipientEmails: string[] }
  ): Promise<ProviderCampaignRef>;
  sendCampaign(providerId: string): Promise<void>;
  scheduleCampaign(providerId: string, at: Date): Promise<void>;
  sendTransactionalEmail(payload: TransactionalEmail): Promise<void>;
  getCampaignStats(providerId: string): Promise<CampaignStats>;
  handleWebhookEvent(rawPayload: unknown): Promise<NormalizedEvent[]>;
  unsubscribeContact(providerContactId: string): Promise<void>;
}
