-- La scheda HR del dipendente.
--
-- La scheda personale era una modale con otto campi e il contratto. Diventa
-- una pagina (/staff/[id]) che deve rispondere a «se domani il responsabile
-- dovesse controllare qualsiasi informazione su Marco Bellini, la troverebbe
-- tutta qui?». Per farlo servono quattro tabelle nuove — documenti, corsi,
-- visite mediche, note interne — e una manciata di colonne sulle tabelle che
-- c'erano: anagrafica estesa e caratteristiche su "Waiter", inquadramento,
-- giorni e periodo di prova su "StaffContract", permessi per persona e
-- disattivazione su "venue_membership", ultimo accesso e link di reset
-- password su "User".
--
-- Tutto additivo: nessuna colonna tolta, nessuna riga riscritta. Le colonne
-- nuove nascono nulle o con un default vuoto, quindi il codice in produzione
-- durante il deploy non vede niente di diverso. Lo storico non ha una tabella
-- sua: è "AuditLog", che le modifiche alle persone le registrava già.
-- CreateEnum
CREATE TYPE "StaffDocumentCategory" AS ENUM ('CONTRATTO', 'CARTA_IDENTITA', 'CODICE_FISCALE', 'PERMESSO_SOGGIORNO', 'CERTIFICAZIONE', 'ATTESTATO', 'CERTIFICATO_MEDICO', 'BUSTA_PAGA', 'ALTRO');

-- CreateEnum
CREATE TYPE "StaffTrainingKind" AS ENUM ('SICUREZZA_LAVORO', 'HACCP', 'ANTINCENDIO', 'PRIMO_SOCCORSO', 'ALTRO');

-- CreateEnum
CREATE TYPE "StaffMedicalFitness" AS ENUM ('IDONEO', 'IDONEO_CON_LIMITAZIONI', 'NON_IDONEO', 'IN_ATTESA');

-- CreateEnum
CREATE TYPE "StaffPermission" AS ENUM ('VIEW_OWN_SHIFTS', 'REQUEST_LEAVE', 'VIEW_ANNOUNCEMENTS', 'VIEW_BOOKINGS', 'EDIT_BOOKINGS', 'VIEW_FLOOR', 'VIEW_GUESTS', 'VIEW_REPORTS', 'MANAGE_MENU');

-- AlterEnum
ALTER TYPE "StaffContractType" ADD VALUE 'STAGE';

-- AlterTable
ALTER TABLE "StaffContract" ADD COLUMN     "level" VARCHAR(120),
ADD COLUMN     "probationEndDate" TIMESTAMP(3),
ADD COLUMN     "workingDays" INTEGER[] DEFAULT ARRAY[]::INTEGER[];

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "lastLoginAt" TIMESTAMP(3),
ADD COLUMN     "passwordResetExpiresAt" TIMESTAMP(3),
ADD COLUMN     "passwordResetHash" TEXT;

-- AlterTable
ALTER TABLE "Waiter" ADD COLUMN     "address" VARCHAR(200),
ADD COLUMN     "birthPlace" VARCHAR(120),
ADD COLUMN     "city" VARCHAR(120),
ADD COLUMN     "emergencyContactName" VARCHAR(120),
ADD COLUMN     "emergencyContactPhone" VARCHAR(40),
ADD COLUMN     "fiscalCode" VARCHAR(32),
ADD COLUMN     "managerId" TEXT,
ADD COLUMN     "nationality" VARCHAR(80),
ADD COLUMN     "postalCode" VARCHAR(16),
ADD COLUMN     "province" VARCHAR(8),
ADD COLUMN     "skills" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "venue_membership" ADD COLUMN     "customPermissions" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "disabledAt" TIMESTAMP(3),
ADD COLUMN     "permissions" "StaffPermission"[] DEFAULT ARRAY[]::"StaffPermission"[];

-- CreateTable
CREATE TABLE "StaffDocument" (
    "id" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "waiterId" TEXT NOT NULL,
    "category" "StaffDocumentCategory" NOT NULL DEFAULT 'ALTRO',
    "name" VARCHAR(160) NOT NULL,
    "storageKey" TEXT NOT NULL,
    "originalFileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "notes" VARCHAR(500),
    "uploadedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StaffDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StaffTraining" (
    "id" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "waiterId" TEXT NOT NULL,
    "kind" "StaffTrainingKind" NOT NULL,
    "name" VARCHAR(160),
    "completedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "provider" VARCHAR(160),
    "certificateNumber" VARCHAR(80),
    "notes" VARCHAR(1000),
    "certificateDocumentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StaffTraining_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StaffMedicalCheck" (
    "id" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "waiterId" TEXT NOT NULL,
    "examinedAt" TIMESTAMP(3) NOT NULL,
    "fitness" "StaffMedicalFitness" NOT NULL DEFAULT 'IDONEO',
    "expiresAt" TIMESTAMP(3),
    "doctorName" VARCHAR(160),
    "notes" VARCHAR(1000),
    "certificateDocumentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StaffMedicalCheck_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StaffNote" (
    "id" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "waiterId" TEXT NOT NULL,
    "body" VARCHAR(2000) NOT NULL,
    "authorUserId" TEXT,
    "authorLabel" VARCHAR(160) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StaffNote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StaffDocument_venueId_waiterId_createdAt_idx" ON "StaffDocument"("venueId", "waiterId", "createdAt");

-- CreateIndex
CREATE INDEX "StaffDocument_venueId_expiresAt_idx" ON "StaffDocument"("venueId", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "StaffTraining_certificateDocumentId_key" ON "StaffTraining"("certificateDocumentId");

-- CreateIndex
CREATE INDEX "StaffTraining_venueId_waiterId_idx" ON "StaffTraining"("venueId", "waiterId");

-- CreateIndex
CREATE INDEX "StaffTraining_venueId_expiresAt_idx" ON "StaffTraining"("venueId", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "StaffMedicalCheck_certificateDocumentId_key" ON "StaffMedicalCheck"("certificateDocumentId");

-- CreateIndex
CREATE INDEX "StaffMedicalCheck_venueId_waiterId_examinedAt_idx" ON "StaffMedicalCheck"("venueId", "waiterId", "examinedAt");

-- CreateIndex
CREATE INDEX "StaffMedicalCheck_venueId_expiresAt_idx" ON "StaffMedicalCheck"("venueId", "expiresAt");

-- CreateIndex
CREATE INDEX "StaffNote_venueId_waiterId_createdAt_idx" ON "StaffNote"("venueId", "waiterId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "User_passwordResetHash_key" ON "User"("passwordResetHash");

-- AddForeignKey
ALTER TABLE "Waiter" ADD CONSTRAINT "Waiter_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "Waiter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffDocument" ADD CONSTRAINT "StaffDocument_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffDocument" ADD CONSTRAINT "StaffDocument_waiterId_fkey" FOREIGN KEY ("waiterId") REFERENCES "Waiter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffTraining" ADD CONSTRAINT "StaffTraining_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffTraining" ADD CONSTRAINT "StaffTraining_waiterId_fkey" FOREIGN KEY ("waiterId") REFERENCES "Waiter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffTraining" ADD CONSTRAINT "StaffTraining_certificateDocumentId_fkey" FOREIGN KEY ("certificateDocumentId") REFERENCES "StaffDocument"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffMedicalCheck" ADD CONSTRAINT "StaffMedicalCheck_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffMedicalCheck" ADD CONSTRAINT "StaffMedicalCheck_waiterId_fkey" FOREIGN KEY ("waiterId") REFERENCES "Waiter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffMedicalCheck" ADD CONSTRAINT "StaffMedicalCheck_certificateDocumentId_fkey" FOREIGN KEY ("certificateDocumentId") REFERENCES "StaffDocument"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffNote" ADD CONSTRAINT "StaffNote_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffNote" ADD CONSTRAINT "StaffNote_waiterId_fkey" FOREIGN KEY ("waiterId") REFERENCES "Waiter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

