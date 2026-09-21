-- Il controllo dei costi di infrastruttura: listino, ledger per evento,
-- aggregato per ciclo, autorizzazioni, avvisi di piattaforma, riconciliazione
-- con la fattura, e il cambio valuta del modulo.
--
-- Additiva: sette tabelle nuove e nove colonne, tutte con un valore per
-- difetto o nullabili. Nessuna riga esistente cambia di significato.
--
-- `awsBudgetCents` nasce NULL di proposito: nessun tetto finché qualcuno non lo
-- decide. Un budget inventato dal codice fermerebbe gli invii di un cliente per
-- una cifra che nessuno ha scelto.
--
-- Nota per chi rilascia: `prisma migrate diff` proponeva anche tre modifiche
-- distruttive che **non appartengono a questo lavoro** — un indice di
-- BackgroundJob e le colonne di cambio valuta su Organization e Payment, tolte
-- dallo schema a monte senza una migrazione. Sono state escluse: una migrazione
-- che parla di costi non deve portarsi dietro la cancellazione di colonne di
-- qualcun altro. Lo scostamento resta da chiudere a parte.

-- AlterTable
ALTER TABLE "Campaign" ADD COLUMN     "blockedAt" TIMESTAMP(3),
ADD COLUMN     "blockedDetail" JSONB,
ADD COLUMN     "blockedReason" VARCHAR(40),
ADD COLUMN     "reservedCostCents" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "DemPlan" ADD COLUMN     "allowOverage" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "awsBudgetCents" INTEGER,
ADD COLUMN     "criticalPct" INTEGER NOT NULL DEFAULT 90,
ADD COLUMN     "hardLimitPct" INTEGER NOT NULL DEFAULT 100,
ADD COLUMN     "warningPct" INTEGER NOT NULL DEFAULT 75;

-- CreateTable
CREATE TABLE "ProviderPrice" (
    "id" TEXT NOT NULL,
    "provider" VARCHAR(40) NOT NULL,
    "service" VARCHAR(40) NOT NULL,
    "label" VARCHAR(80) NOT NULL,
    "unit" VARCHAR(40) NOT NULL,
    "unitPrice" DECIMAL(12,6) NOT NULL,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'USD',
    "region" VARCHAR(20),
    "tierStart" INTEGER NOT NULL DEFAULT 0,
    "tierEnd" INTEGER,
    "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effectiveTo" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

CONSTRAINT "ProviderPrice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UsageEvent" (
    "id" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "campaignId" TEXT,
    "provider" VARCHAR(40) NOT NULL,
    "service" VARCHAR(40) NOT NULL,
    "eventType" VARCHAR(40) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'SENT',
    "quantity" INTEGER NOT NULL,
    "unit" VARCHAR(40) NOT NULL,
    "unitPrice" DECIMAL(12,6) NOT NULL,
    "estimatedCost" DECIMAL(12,6) NOT NULL,
    "actualCost" DECIMAL(12,6),
    "currency" VARCHAR(3) NOT NULL,
    "yearMonth" VARCHAR(7) NOT NULL,
    "idempotencyKey" VARCHAR(200) NOT NULL,
    "providerEventId" VARCHAR(250),
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

CONSTRAINT "UsageEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CostPeriod" (
    "id" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "yearMonth" VARCHAR(7) NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "originalAmount" DECIMAL(12,6) NOT NULL,
    "originalCurrency" VARCHAR(3) NOT NULL DEFAULT 'USD',
    "exchangeRate" DECIMAL(12,6),
    "exchangeRateAt" TIMESTAMP(3),
    "amountCents" INTEGER,
    "reservedCents" INTEGER NOT NULL DEFAULT 0,
    "billingCurrency" VARCHAR(3) NOT NULL DEFAULT 'EUR',
    "budgetCents" INTEGER,
    "warningPct" INTEGER NOT NULL DEFAULT 75,
    "criticalPct" INTEGER NOT NULL DEFAULT 90,
    "hardLimitPct" INTEGER NOT NULL DEFAULT 100,
    "allowOverage" BOOLEAN NOT NULL DEFAULT false,
    "forecastCents" INTEGER,
    "stato" VARCHAR(20) NOT NULL DEFAULT 'NORMALE',
    "notified" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

CONSTRAINT "CostPeriod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CostOverride" (
    "id" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "yearMonth" VARCHAR(7) NOT NULL,
    "kind" VARCHAR(20) NOT NULL,
    "oldValue" INTEGER NOT NULL,
    "newValue" INTEGER NOT NULL,
    "note" VARCHAR(300),
    "actorEmail" VARCHAR(160) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

CONSTRAINT "CostOverride_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlatformAlert" (
    "id" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "yearMonth" VARCHAR(7) NOT NULL,
    "kind" VARCHAR(40) NOT NULL,
    "level" VARCHAR(20) NOT NULL,
    "title" VARCHAR(160) NOT NULL,
    "body" VARCHAR(500),
    "meta" JSONB,
    "emailedAt" TIMESTAMP(3),
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

CONSTRAINT "PlatformAlert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CostReconciliation" (
    "id" TEXT NOT NULL,
    "provider" VARCHAR(40) NOT NULL,
    "yearMonth" VARCHAR(7) NOT NULL,
    "region" VARCHAR(20) NOT NULL DEFAULT '',
    "awsReportedAmount" DECIMAL(14,6),
    "awsReportedCurrency" VARCHAR(3),
    "allocatedAmount" DECIMAL(14,6) NOT NULL DEFAULT 0,
    "allocatedCurrency" VARCHAR(3) NOT NULL DEFAULT 'USD',
    "unallocatedAmount" DECIMAL(14,6),
    "scostamentoPct" DECIMAL(8,4),
    "inviiLedger" INTEGER NOT NULL DEFAULT 0,
    "inviiSes" INTEGER NOT NULL DEFAULT 0,
    "fonte" VARCHAR(40) NOT NULL DEFAULT 'NON_DISPONIBILE',
    "stato" VARCHAR(20) NOT NULL DEFAULT 'IN_ATTESA',
    "note" VARCHAR(300),
    "fetchedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

CONSTRAINT "CostReconciliation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CambioValuta" (
    "id" TEXT NOT NULL,
    "da" VARCHAR(3) NOT NULL,
    "a" VARCHAR(3) NOT NULL,
    "tasso" DECIMAL(12,6) NOT NULL,
    "lettoIl" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fonte" VARCHAR(40) NOT NULL DEFAULT 'MANUALE',

CONSTRAINT "CambioValuta_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProviderPrice_provider_service_active_effectiveFrom_idx" ON "ProviderPrice"("provider", "service", "active", "effectiveFrom");

-- CreateIndex
CREATE UNIQUE INDEX "UsageEvent_idempotencyKey_key" ON "UsageEvent"("idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "UsageEvent_providerEventId_key" ON "UsageEvent"("providerEventId");

-- CreateIndex
CREATE INDEX "UsageEvent_venueId_yearMonth_status_idx" ON "UsageEvent"("venueId", "yearMonth", "status");

-- CreateIndex
CREATE INDEX "UsageEvent_venueId_occurredAt_idx" ON "UsageEvent"("venueId", "occurredAt");

-- CreateIndex
CREATE INDEX "UsageEvent_campaignId_idx" ON "UsageEvent"("campaignId");

-- CreateIndex
CREATE INDEX "CostPeriod_stato_idx" ON "CostPeriod"("stato");

-- CreateIndex
CREATE UNIQUE INDEX "CostPeriod_venueId_yearMonth_key" ON "CostPeriod"("venueId", "yearMonth");

-- CreateIndex
CREATE INDEX "CostOverride_venueId_yearMonth_idx" ON "CostOverride"("venueId", "yearMonth");

-- CreateIndex
CREATE INDEX "PlatformAlert_createdAt_idx" ON "PlatformAlert"("createdAt");

-- CreateIndex
CREATE INDEX "PlatformAlert_readAt_idx" ON "PlatformAlert"("readAt");

-- CreateIndex
CREATE UNIQUE INDEX "PlatformAlert_venueId_yearMonth_kind_key" ON "PlatformAlert"("venueId", "yearMonth", "kind");

-- CreateIndex
CREATE INDEX "CostReconciliation_yearMonth_idx" ON "CostReconciliation"("yearMonth");

-- CreateIndex
CREATE UNIQUE INDEX "CostReconciliation_provider_yearMonth_region_key" ON "CostReconciliation"("provider", "yearMonth", "region");

-- CreateIndex
CREATE INDEX "CambioValuta_da_a_lettoIl_idx" ON "CambioValuta"("da", "a", "lettoIl");

-- AddForeignKey
ALTER TABLE "UsageEvent" ADD CONSTRAINT "UsageEvent_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UsageEvent" ADD CONSTRAINT "UsageEvent_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CostPeriod" ADD CONSTRAINT "CostPeriod_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CostOverride" ADD CONSTRAINT "CostOverride_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlatformAlert" ADD CONSTRAINT "PlatformAlert_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE CASCADE ON UPDATE CASCADE;
