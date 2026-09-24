-- Le richieste dei ristoranti per le integrazioni che non possono ancora
-- collegare da soli: «Richiedi attivazione» (ACCESS) su un'anteprima,
-- «Avvisami» (NOTIFY) su una voce in arrivo. Solo interne a Foodtech.
--
-- Solo aggiunte.

-- CreateTable
CREATE TABLE "IntegrationAccessRequest" (
    "id" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "integrationSlug" VARCHAR(60) NOT NULL,
    "kind" VARCHAR(20) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    "requestedById" TEXT,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "resolvedByEmail" VARCHAR(200),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IntegrationAccessRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "IntegrationAccessRequest_venueId_integrationSlug_key" ON "IntegrationAccessRequest"("venueId", "integrationSlug");

-- CreateIndex
CREATE INDEX "IntegrationAccessRequest_status_requestedAt_idx" ON "IntegrationAccessRequest"("status", "requestedAt");

-- AddForeignKey
ALTER TABLE "IntegrationAccessRequest" ADD CONSTRAINT "IntegrationAccessRequest_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE CASCADE ON UPDATE CASCADE;
