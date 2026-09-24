-- L'assistenza di Foodtech sulle integrazioni: la richiesta del ristorante
-- con la sua delega, i collegamenti per inserire le credenziali, e l'inizio
-- della verifica di connessione in corso.
--
-- Solo aggiunte: nessuna colonna tolta o cambiata, nessuna riga toccata.

-- AlterTable
ALTER TABLE "IntegrationInstallation" ADD COLUMN "testStartedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "IntegrationAssistance" (
    "id" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "integrationSlug" VARCHAR(60) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'OPEN',
    "note" VARCHAR(1000),
    "requestedById" TEXT,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "delegatedById" TEXT,
    "delegatedAt" TIMESTAMP(3),
    "delegatedUntil" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "closedByEmail" VARCHAR(200),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IntegrationAssistance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntegrationCredentialHandoff" (
    "id" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "integrationSlug" VARCHAR(60) NOT NULL,
    "tokenHash" VARCHAR(64) NOT NULL,
    "createdByEmail" VARCHAR(200) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "openedAt" TIMESTAMP(3),
    "openedById" TEXT,
    "completedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "IntegrationCredentialHandoff_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "IntegrationAssistance_venueId_integrationSlug_key" ON "IntegrationAssistance"("venueId", "integrationSlug");

-- CreateIndex
CREATE INDEX "IntegrationAssistance_status_requestedAt_idx" ON "IntegrationAssistance"("status", "requestedAt");

-- CreateIndex
CREATE UNIQUE INDEX "IntegrationCredentialHandoff_tokenHash_key" ON "IntegrationCredentialHandoff"("tokenHash");

-- CreateIndex
CREATE INDEX "IntegrationCredentialHandoff_venueId_integrationSlug_idx" ON "IntegrationCredentialHandoff"("venueId", "integrationSlug");

-- AddForeignKey
ALTER TABLE "IntegrationAssistance" ADD CONSTRAINT "IntegrationAssistance_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntegrationCredentialHandoff" ADD CONSTRAINT "IntegrationCredentialHandoff_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE CASCADE ON UPDATE CASCADE;
