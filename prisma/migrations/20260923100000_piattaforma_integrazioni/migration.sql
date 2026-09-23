-- La piattaforma integrazioni: installare, configurare e sorvegliare un
-- collegamento esterno (cassa, pagamenti, portali, marketing) locale per locale.
--
-- Solo aggiunte. Il catalogo delle integrazioni non sta nel database: è codice
-- (src/server/integrations/registry.ts). Qui entra ciò che un locale installa:
--
--   IntegrationInstallation   una riga per locale e integrazione
--   IntegrationCredential     le credenziali, cifrate e legate all'installazione
--   ExternalEntityMapping     tavolo B1 = tavolo 89372 del fornitore
--   IntegrationSyncLog        lo storico delle sincronizzazioni
--
-- WebhookEvent riceve sei colonne facoltative: gli eventi delle integrazioni
-- passano dalla stessa tabella (e dallo stesso vincolo di idempotenza) dei
-- webhook di Stripe, Brevo e SES, che quelle colonne le lasciano vuote.
--
-- POSConnector, POSEvent, Connector e ConnectorEvent restano: sono superate
-- ma cancellarle qui renderebbe la migrazione distruttiva (vedi
-- src/lib/migration-safety.ts). Escono con una migrazione loro, dopo il deploy.

-- CreateEnum
CREATE TYPE "IntegrationInstallationStatus" AS ENUM ('NOT_INSTALLED', 'INSTALLING', 'NEEDS_CONFIGURATION', 'CONNECTED', 'SYNCING', 'ACTIVE', 'ERROR', 'DISABLED', 'REAUTH_REQUIRED');

-- CreateEnum
CREATE TYPE "IntegrationHealth" AS ENUM ('HEALTHY', 'DEGRADED', 'ERROR', 'AUTH_REQUIRED', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "IntegrationSyncTrigger" AS ENUM ('MANUAL', 'WEBHOOK', 'SCHEDULED', 'INITIAL_IMPORT', 'RETRY');

-- CreateEnum
CREATE TYPE "IntegrationSyncDirection" AS ENUM ('INBOUND', 'OUTBOUND', 'BIDIRECTIONAL');

-- CreateEnum
CREATE TYPE "IntegrationSyncStatus" AS ENUM ('RUNNING', 'SUCCEEDED', 'PARTIAL', 'FAILED');

-- AlterTable
ALTER TABLE "WebhookEvent" ADD COLUMN     "attempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "error" TEXT,
ADD COLUMN     "installationId" TEXT,
ADD COLUMN     "normalized" JSONB,
ADD COLUMN     "status" VARCHAR(20),
ADD COLUMN     "venueId" TEXT;

-- CreateTable
CREATE TABLE "IntegrationInstallation" (
    "id" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "integrationSlug" VARCHAR(60) NOT NULL,
    "adapterVersion" VARCHAR(20) NOT NULL,
    "status" "IntegrationInstallationStatus" NOT NULL DEFAULT 'INSTALLING',
    "healthStatus" "IntegrationHealth" NOT NULL DEFAULT 'UNKNOWN',
    "healthMessage" VARCHAR(300),
    "configuration" JSONB NOT NULL DEFAULT '{}',
    "enabledCapabilities" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "externalAccountId" TEXT,
    "externalAccountName" TEXT,
    "externalLocationId" TEXT,
    "externalLocationName" TEXT,
    "metadata" JSONB,
    "webhookKey" TEXT NOT NULL,
    "installedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "installedById" TEXT,
    "activatedAt" TIMESTAMP(3),
    "disabledAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastTestAt" TIMESTAMP(3),
    "lastTestOk" BOOLEAN,
    "lastSyncAt" TIMESTAMP(3),
    "lastSuccessfulSyncAt" TIMESTAMP(3),
    "lastErrorAt" TIMESTAMP(3),
    "lastErrorCode" VARCHAR(40),
    "lastError" VARCHAR(1000),

    CONSTRAINT "IntegrationInstallation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntegrationCredential" (
    "id" TEXT NOT NULL,
    "installationId" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "kind" VARCHAR(30) NOT NULL,
    "secretCiphertext" TEXT NOT NULL,
    "scopes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "accessTokenExpiresAt" TIMESTAMP(3),
    "refreshTokenExpiresAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "refreshLockedUntil" TIMESTAMP(3),
    "rotatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IntegrationCredential_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExternalEntityMapping" (
    "id" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "installationId" TEXT NOT NULL,
    "entityType" VARCHAR(30) NOT NULL,
    "internalId" TEXT,
    "externalId" TEXT NOT NULL,
    "externalLabel" VARCHAR(200),
    "manual" BOOLEAN NOT NULL DEFAULT false,
    "metadata" JSONB,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExternalEntityMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntegrationSyncLog" (
    "id" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "installationId" TEXT NOT NULL,
    "provider" VARCHAR(60) NOT NULL,
    "operation" VARCHAR(60) NOT NULL,
    "direction" "IntegrationSyncDirection" NOT NULL DEFAULT 'INBOUND',
    "trigger" "IntegrationSyncTrigger" NOT NULL,
    "status" "IntegrationSyncStatus" NOT NULL DEFAULT 'RUNNING',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "itemsProcessed" INTEGER NOT NULL DEFAULT 0,
    "itemsSucceeded" INTEGER NOT NULL DEFAULT 0,
    "itemsFailed" INTEGER NOT NULL DEFAULT 0,
    "errorCode" VARCHAR(40),
    "error" VARCHAR(1000),
    "correlationId" VARCHAR(40) NOT NULL,
    "metadata" JSONB,

    CONSTRAINT "IntegrationSyncLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "IntegrationInstallation_webhookKey_key" ON "IntegrationInstallation"("webhookKey");

-- CreateIndex
CREATE INDEX "IntegrationInstallation_orgId_integrationSlug_idx" ON "IntegrationInstallation"("orgId", "integrationSlug");

-- CreateIndex
CREATE INDEX "IntegrationInstallation_integrationSlug_externalLocationId_idx" ON "IntegrationInstallation"("integrationSlug", "externalLocationId");

-- CreateIndex
CREATE INDEX "IntegrationInstallation_status_idx" ON "IntegrationInstallation"("status");

-- CreateIndex
CREATE UNIQUE INDEX "IntegrationInstallation_venueId_integrationSlug_key" ON "IntegrationInstallation"("venueId", "integrationSlug");

-- CreateIndex
CREATE UNIQUE INDEX "IntegrationCredential_installationId_key" ON "IntegrationCredential"("installationId");

-- CreateIndex
CREATE INDEX "IntegrationCredential_venueId_idx" ON "IntegrationCredential"("venueId");

-- CreateIndex
CREATE INDEX "ExternalEntityMapping_venueId_entityType_internalId_idx" ON "ExternalEntityMapping"("venueId", "entityType", "internalId");

-- CreateIndex
CREATE UNIQUE INDEX "ExternalEntityMapping_installationId_entityType_externalId_key" ON "ExternalEntityMapping"("installationId", "entityType", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "ExternalEntityMapping_installationId_entityType_internalId_key" ON "ExternalEntityMapping"("installationId", "entityType", "internalId");

-- CreateIndex
CREATE INDEX "IntegrationSyncLog_installationId_startedAt_idx" ON "IntegrationSyncLog"("installationId", "startedAt");

-- CreateIndex
CREATE INDEX "IntegrationSyncLog_venueId_startedAt_idx" ON "IntegrationSyncLog"("venueId", "startedAt");

-- CreateIndex
CREATE INDEX "WebhookEvent_installationId_receivedAt_idx" ON "WebhookEvent"("installationId", "receivedAt");

-- AddForeignKey
ALTER TABLE "IntegrationInstallation" ADD CONSTRAINT "IntegrationInstallation_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntegrationCredential" ADD CONSTRAINT "IntegrationCredential_installationId_fkey" FOREIGN KEY ("installationId") REFERENCES "IntegrationInstallation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalEntityMapping" ADD CONSTRAINT "ExternalEntityMapping_installationId_fkey" FOREIGN KEY ("installationId") REFERENCES "IntegrationInstallation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntegrationSyncLog" ADD CONSTRAINT "IntegrationSyncLog_installationId_fkey" FOREIGN KEY ("installationId") REFERENCES "IntegrationInstallation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

