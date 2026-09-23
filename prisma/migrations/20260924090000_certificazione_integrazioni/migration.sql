-- La certificazione delle integrazioni: provare un fornitore contro un POS
-- vero in modo controllato, e ricordare che cosa è stato provato, da chi e
-- a che livello.
--
-- Solo aggiunte:
--
--   IntegrationBetaAccess             accesso anticipato di un locale a un'integrazione
--   IntegrationRollout                fase di rilascio decisa da Foodtech (senza riga: predefinito)
--   IntegrationCertificationRun       prove della console, con la traccia ripulita
--   IntegrationCertificationEvidence  evidenze per capacità e livello, IMMUTABILI
--
-- Le evidenze non hanno chiave esterna verso il locale (sopravvivono) e un
-- trigger rifiuta modifica e cancellazione: una prova ripetuta è una riga nuova.

-- CreateTable
CREATE TABLE "IntegrationBetaAccess" (
    "id" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "integrationSlug" VARCHAR(60) NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "fiscalTestsAuthorized" BOOLEAN NOT NULL DEFAULT false,
    "enabledByEmail" VARCHAR(200) NOT NULL,
    "enabledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedByEmail" VARCHAR(200) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "note" VARCHAR(500),

    CONSTRAINT "IntegrationBetaAccess_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntegrationRollout" (
    "integrationSlug" VARCHAR(60) NOT NULL,
    "stage" VARCHAR(30) NOT NULL,
    "updatedByEmail" VARCHAR(200) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "note" VARCHAR(500),

    CONSTRAINT "IntegrationRollout_pkey" PRIMARY KEY ("integrationSlug")
);

-- CreateTable
CREATE TABLE "IntegrationCertificationRun" (
    "id" TEXT NOT NULL,
    "integrationSlug" VARCHAR(60) NOT NULL,
    "venueId" TEXT NOT NULL,
    "installationId" TEXT NOT NULL,
    "kind" VARCHAR(40) NOT NULL,
    "status" VARCHAR(20) NOT NULL,
    "realEnvironment" BOOLEAN NOT NULL,
    "environment" VARCHAR(60),
    "externalLocationId" VARCHAR(200),
    "correlationId" VARCHAR(60) NOT NULL,
    "externalEntityId" VARCHAR(200),
    "riferimento" VARCHAR(200),
    "parentRunId" TEXT,
    "input" JSONB,
    "trace" JSONB NOT NULL,
    "createdByEmail" VARCHAR(200) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IntegrationCertificationRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntegrationCertificationEvidence" (
    "id" TEXT NOT NULL,
    "integrationSlug" VARCHAR(60) NOT NULL,
    "capability" VARCHAR(40) NOT NULL,
    "level" VARCHAR(30) NOT NULL,
    "result" VARCHAR(20) NOT NULL,
    "venueId" TEXT NOT NULL,
    "venueName" VARCHAR(200) NOT NULL,
    "externalLocationId" VARCHAR(200),
    "environment" VARCHAR(60),
    "operatorEmail" VARCHAR(200) NOT NULL,
    "correlationId" VARCHAR(60),
    "externalEntityId" VARCHAR(200),
    "runId" TEXT,
    "manualConfirmation" BOOLEAN NOT NULL DEFAULT false,
    "evidenceRef" VARCHAR(500),
    "notes" VARCHAR(2000),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IntegrationCertificationEvidence_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "IntegrationBetaAccess_integrationSlug_idx" ON "IntegrationBetaAccess"("integrationSlug");

-- CreateIndex
CREATE UNIQUE INDEX "IntegrationBetaAccess_venueId_integrationSlug_key" ON "IntegrationBetaAccess"("venueId", "integrationSlug");

-- CreateIndex
CREATE INDEX "IntegrationCertificationRun_integrationSlug_createdAt_idx" ON "IntegrationCertificationRun"("integrationSlug", "createdAt");

-- CreateIndex
CREATE INDEX "IntegrationCertificationRun_venueId_createdAt_idx" ON "IntegrationCertificationRun"("venueId", "createdAt");

-- CreateIndex
CREATE INDEX "IntegrationCertificationEvidence_integrationSlug_capability_idx" ON "IntegrationCertificationEvidence"("integrationSlug", "capability", "level", "createdAt");

-- CreateIndex
CREATE INDEX "IntegrationCertificationEvidence_venueId_createdAt_idx" ON "IntegrationCertificationEvidence"("venueId", "createdAt");

-- AddForeignKey
ALTER TABLE "IntegrationBetaAccess" ADD CONSTRAINT "IntegrationBetaAccess_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntegrationCertificationRun" ADD CONSTRAINT "IntegrationCertificationRun_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Evidenze immutabili: chi vuole correggere un esito registra una prova nuova.
CREATE OR REPLACE FUNCTION "evidenza_certificazione_immutabile"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'IntegrationCertificationEvidence è immutabile: registra una nuova evidenza';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "IntegrationCertificationEvidence_immutabile"
  BEFORE UPDATE OR DELETE ON "IntegrationCertificationEvidence"
  FOR EACH ROW EXECUTE FUNCTION "evidenza_certificazione_immutabile"();
