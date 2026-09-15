-- CreateEnum
CREATE TYPE "DemPlanInterval" AS ENUM ('MONTH', 'YEAR');

-- CreateEnum
CREATE TYPE "DemPlanVisibility" AS ENUM ('PUBLIC', 'PRIVATE');

-- CreateEnum
CREATE TYPE "DemSubscriptionStatus" AS ENUM ('ACTIVE', 'PAST_DUE', 'CANCELLED', 'INCOMPLETE');

-- CreateEnum
CREATE TYPE "CampaignRecipientStatus" AS ENUM ('PENDING', 'SENDING', 'SENT', 'DELIVERED', 'BOUNCED', 'COMPLAINED', 'FAILED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "DemEventType" AS ENUM ('SEND', 'DELIVERY', 'OPEN', 'CLICK', 'BOUNCE', 'COMPLAINT', 'DELIVERY_DELAY', 'REJECT', 'SUBSCRIPTION', 'RENDERING_FAILURE');

-- CreateEnum
CREATE TYPE "DemSuppressionReason" AS ENUM ('HARD_BOUNCE', 'COMPLAINT', 'UNSUBSCRIBE', 'MANUAL', 'INVALID');

-- CreateEnum
CREATE TYPE "DemDomainStatus" AS ENUM ('PENDING', 'VERIFYING', 'VERIFIED', 'FAILED');

-- CreateEnum
CREATE TYPE "DemRecordStatus" AS ENUM ('UNKNOWN', 'PENDING', 'OK', 'MISSING', 'FAILED');

-- CreateEnum
CREATE TYPE "DemTenantStatus" AS ENUM ('ACTIVE', 'PAUSED', 'FAILED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "CampaignStatus" ADD VALUE 'READY';
ALTER TYPE "CampaignStatus" ADD VALUE 'QUEUED';
ALTER TYPE "CampaignStatus" ADD VALUE 'PAUSED';
ALTER TYPE "CampaignStatus" ADD VALUE 'CANCELLED';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationKind" ADD VALUE 'DEM_QUOTA_WARNING';
ALTER TYPE "NotificationKind" ADD VALUE 'DEM_QUOTA_NEAR_LIMIT';
ALTER TYPE "NotificationKind" ADD VALUE 'DEM_QUOTA_EXHAUSTED';
ALTER TYPE "NotificationKind" ADD VALUE 'DEM_DOMAIN_VERIFIED';
ALTER TYPE "NotificationKind" ADD VALUE 'DEM_DOMAIN_PROBLEM';
ALTER TYPE "NotificationKind" ADD VALUE 'DEM_CAMPAIGN_SENT';
ALTER TYPE "NotificationKind" ADD VALUE 'DEM_SENDING_PAUSED';
ALTER TYPE "NotificationKind" ADD VALUE 'DEM_PAYMENT_FAILED';

-- AlterTable
ALTER TABLE "Campaign" ADD COLUMN     "bouncedCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "cancelledAt" TIMESTAMP(3),
ADD COLUMN     "cancelledBy" TEXT,
ADD COLUMN     "clickedCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "complainedCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "deliveredCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "failedCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "pausedAt" TIMESTAMP(3),
ADD COLUMN     "queuedAt" TIMESTAMP(3),
ADD COLUMN     "readyAt" TIMESTAMP(3),
ADD COLUMN     "recipientsCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "reservedCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "sendingStartedAt" TIMESTAMP(3),
ADD COLUMN     "sentAt" TIMESTAMP(3),
ADD COLUMN     "testSendCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "unsubscribedCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "usagePeriod" VARCHAR(7);

-- AlterTable
ALTER TABLE "Guest" ADD COLUMN     "marketingConsentAt" TIMESTAMP(3),
ADD COLUMN     "marketingConsentSource" VARCHAR(40),
ADD COLUMN     "unsubscribedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "DemPlan" (
    "id" TEXT NOT NULL,
    "slug" VARCHAR(40) NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "monthlyEmails" INTEGER NOT NULL,
    "priceCents" INTEGER NOT NULL DEFAULT 0,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'EUR',
    "interval" "DemPlanInterval" NOT NULL DEFAULT 'MONTH',
    "stripePriceId" VARCHAR(120),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "description" VARCHAR(300),
    "badge" VARCHAR(40),
    "visibility" "DemPlanVisibility" NOT NULL DEFAULT 'PUBLIC',
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DemPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DemSubscription" (
    "id" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "status" "DemSubscriptionStatus" NOT NULL DEFAULT 'ACTIVE',
    "customMonthlyLimit" INTEGER,
    "scheduledPlanId" TEXT,
    "scheduledChangeAt" TIMESTAMP(3),
    "currentPeriodStart" TIMESTAMP(3) NOT NULL,
    "currentPeriodEnd" TIMESTAMP(3) NOT NULL,
    "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
    "stripeCustomerId" VARCHAR(120),
    "stripeSubscriptionId" VARCHAR(120),
    "stripePriceId" VARCHAR(120),
    "sendingPausedAt" TIMESTAMP(3),
    "sendingPausedReason" VARCHAR(200),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DemSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DemUsagePeriod" (
    "id" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "yearMonth" VARCHAR(7) NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "monthlyLimit" INTEGER NOT NULL,
    "planSlug" VARCHAR(40) NOT NULL,
    "used" INTEGER NOT NULL DEFAULT 0,
    "reserved" INTEGER NOT NULL DEFAULT 0,
    "notified" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DemUsagePeriod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampaignRecipient" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "guestId" TEXT,
    "email" VARCHAR(320) NOT NULL,
    "firstName" VARCHAR(120),
    "lastName" VARCHAR(120),
    "vars" JSONB,
    "status" "CampaignRecipientStatus" NOT NULL DEFAULT 'PENDING',
    "providerMessageId" VARCHAR(200),
    "queuedAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "openedAt" TIMESTAMP(3),
    "clickedAt" TIMESTAMP(3),
    "bouncedAt" TIMESTAMP(3),
    "complainedAt" TIMESTAMP(3),
    "unsubscribedAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "openCount" INTEGER NOT NULL DEFAULT 0,
    "clickCount" INTEGER NOT NULL DEFAULT 0,
    "error" VARCHAR(300),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CampaignRecipient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampaignEvent" (
    "id" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "recipientId" TEXT,
    "type" "DemEventType" NOT NULL,
    "providerEventId" VARCHAR(250) NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "url" VARCHAR(600),
    "detail" VARCHAR(300),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CampaignEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DemSuppression" (
    "id" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "email" VARCHAR(320) NOT NULL,
    "reason" "DemSuppressionReason" NOT NULL,
    "detail" VARCHAR(300),
    "source" VARCHAR(60),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DemSuppression_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DemDomain" (
    "id" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "rootDomain" VARCHAR(253) NOT NULL,
    "sendingDomain" VARCHAR(253) NOT NULL,
    "mailFromDomain" VARCHAR(253),
    "fromLocalPart" VARCHAR(64) NOT NULL DEFAULT 'newsletter',
    "fromName" VARCHAR(120),
    "replyTo" VARCHAR(320),
    "status" "DemDomainStatus" NOT NULL DEFAULT 'PENDING',
    "dkimStatus" "DemRecordStatus" NOT NULL DEFAULT 'UNKNOWN',
    "spfStatus" "DemRecordStatus" NOT NULL DEFAULT 'UNKNOWN',
    "dmarcStatus" "DemRecordStatus" NOT NULL DEFAULT 'UNKNOWN',
    "dmarcPolicy" VARCHAR(30),
    "dnsRecords" JSONB,
    "lastCheckedAt" TIMESTAMP(3),
    "verifiedAt" TIMESTAMP(3),
    "lastError" VARCHAR(400),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DemDomain_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DemSesTenant" (
    "id" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "tenantName" VARCHAR(64) NOT NULL,
    "configurationSet" VARCHAR(64) NOT NULL,
    "status" "DemTenantStatus" NOT NULL DEFAULT 'ACTIVE',
    "bounceRate" DOUBLE PRECISION,
    "complaintRate" DOUBLE PRECISION,
    "lastCheckedAt" TIMESTAMP(3),
    "pausedAt" TIMESTAMP(3),
    "pausedReason" VARCHAR(200),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DemSesTenant_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DemPlan_slug_key" ON "DemPlan"("slug");

-- CreateIndex
CREATE INDEX "DemPlan_active_sortOrder_idx" ON "DemPlan"("active", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "DemSubscription_venueId_key" ON "DemSubscription"("venueId");

-- CreateIndex
CREATE UNIQUE INDEX "DemSubscription_stripeSubscriptionId_key" ON "DemSubscription"("stripeSubscriptionId");

-- CreateIndex
CREATE INDEX "DemSubscription_status_currentPeriodEnd_idx" ON "DemSubscription"("status", "currentPeriodEnd");

-- CreateIndex
CREATE INDEX "DemUsagePeriod_venueId_periodStart_idx" ON "DemUsagePeriod"("venueId", "periodStart");

-- CreateIndex
CREATE UNIQUE INDEX "DemUsagePeriod_venueId_yearMonth_key" ON "DemUsagePeriod"("venueId", "yearMonth");

-- CreateIndex
CREATE INDEX "CampaignRecipient_campaignId_status_idx" ON "CampaignRecipient"("campaignId", "status");

-- CreateIndex
CREATE INDEX "CampaignRecipient_venueId_createdAt_idx" ON "CampaignRecipient"("venueId", "createdAt");

-- CreateIndex
CREATE INDEX "CampaignRecipient_providerMessageId_idx" ON "CampaignRecipient"("providerMessageId");

-- CreateIndex
CREATE UNIQUE INDEX "CampaignRecipient_campaignId_email_key" ON "CampaignRecipient"("campaignId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "CampaignEvent_providerEventId_key" ON "CampaignEvent"("providerEventId");

-- CreateIndex
CREATE INDEX "CampaignEvent_campaignId_type_idx" ON "CampaignEvent"("campaignId", "type");

-- CreateIndex
CREATE INDEX "CampaignEvent_venueId_occurredAt_idx" ON "CampaignEvent"("venueId", "occurredAt");

-- CreateIndex
CREATE INDEX "CampaignEvent_recipientId_type_idx" ON "CampaignEvent"("recipientId", "type");

-- CreateIndex
CREATE INDEX "DemSuppression_venueId_reason_idx" ON "DemSuppression"("venueId", "reason");

-- CreateIndex
CREATE UNIQUE INDEX "DemSuppression_venueId_email_key" ON "DemSuppression"("venueId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "DemDomain_venueId_key" ON "DemDomain"("venueId");

-- CreateIndex
CREATE UNIQUE INDEX "DemDomain_sendingDomain_key" ON "DemDomain"("sendingDomain");

-- CreateIndex
CREATE INDEX "DemDomain_status_idx" ON "DemDomain"("status");

-- CreateIndex
CREATE UNIQUE INDEX "DemSesTenant_venueId_key" ON "DemSesTenant"("venueId");

-- CreateIndex
CREATE UNIQUE INDEX "DemSesTenant_tenantName_key" ON "DemSesTenant"("tenantName");

-- CreateIndex
CREATE UNIQUE INDEX "DemSesTenant_configurationSet_key" ON "DemSesTenant"("configurationSet");

-- CreateIndex
CREATE INDEX "DemSesTenant_status_idx" ON "DemSesTenant"("status");

-- AddForeignKey
ALTER TABLE "DemSubscription" ADD CONSTRAINT "DemSubscription_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DemSubscription" ADD CONSTRAINT "DemSubscription_planId_fkey" FOREIGN KEY ("planId") REFERENCES "DemPlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DemSubscription" ADD CONSTRAINT "DemSubscription_scheduledPlanId_fkey" FOREIGN KEY ("scheduledPlanId") REFERENCES "DemPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DemUsagePeriod" ADD CONSTRAINT "DemUsagePeriod_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignRecipient" ADD CONSTRAINT "CampaignRecipient_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignRecipient" ADD CONSTRAINT "CampaignRecipient_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignRecipient" ADD CONSTRAINT "CampaignRecipient_guestId_fkey" FOREIGN KEY ("guestId") REFERENCES "Guest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignEvent" ADD CONSTRAINT "CampaignEvent_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignEvent" ADD CONSTRAINT "CampaignEvent_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignEvent" ADD CONSTRAINT "CampaignEvent_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "CampaignRecipient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DemSuppression" ADD CONSTRAINT "DemSuppression_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DemDomain" ADD CONSTRAINT "DemDomain_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DemSesTenant" ADD CONSTRAINT "DemSesTenant_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

