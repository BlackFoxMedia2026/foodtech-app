-- Staff: reparti, ruoli di cucina, turni e richieste.
--
-- Tutto additivo: nuovi valori d'enum, quattro colonne nullable su "Waiter",
-- due tabelle nuove. Nessuna colonna tolta, nessun dato riscritto — le
-- anagrafiche esistenti restano valide com'erano (department nullo = reparto
-- dedotto dal ruolo, vedi src/lib/staff-roles.ts).

-- CreateEnum
CREATE TYPE "StaffDepartment" AS ENUM ('SALA', 'CUCINA', 'BAR', 'DIREZIONE', 'ALTRO');

-- CreateEnum
CREATE TYPE "WorkShiftKind" AS ENUM ('WORK', 'REST', 'VACATION', 'LEAVE', 'SICK_LEAVE', 'UNAVAILABLE');

-- CreateEnum
CREATE TYPE "StaffRequestType" AS ENUM ('SHIFT_CHANGE', 'DAY_OFF', 'VACATION', 'LEAVE', 'UNAVAILABILITY');

-- CreateEnum
CREATE TYPE "StaffRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'WITHDRAWN');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "StaffPrimaryRole" ADD VALUE 'EXECUTIVE_CHEF';
ALTER TYPE "StaffPrimaryRole" ADD VALUE 'SOUS_CHEF';
ALTER TYPE "StaffPrimaryRole" ADD VALUE 'CHEF_DE_PARTIE';
ALTER TYPE "StaffPrimaryRole" ADD VALUE 'COMMIS_CUCINA';
ALTER TYPE "StaffPrimaryRole" ADD VALUE 'LAVAPIATTI';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "WaiterStatus" ADD VALUE 'VACATION';
ALTER TYPE "WaiterStatus" ADD VALUE 'SICK_LEAVE';
ALTER TYPE "WaiterStatus" ADD VALUE 'UNAVAILABLE';

-- AlterTable
ALTER TABLE "Waiter" ADD COLUMN     "department" "StaffDepartment",
ADD COLUMN     "email" TEXT,
ADD COLUMN     "hireDate" TIMESTAMP(3),
ADD COLUMN     "userId" TEXT;

-- CreateTable
CREATE TABLE "WorkShift" (
    "id" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "waiterId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "kind" "WorkShiftKind" NOT NULL DEFAULT 'WORK',
    "startMinute" INTEGER,
    "endMinute" INTEGER,
    "breakMinutes" INTEGER,
    "department" "StaffDepartment",
    "service" TEXT,
    "notes" VARCHAR(500),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkShift_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StaffRequest" (
    "id" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "waiterId" TEXT NOT NULL,
    "shiftId" TEXT,
    "type" "StaffRequestType" NOT NULL,
    "requestedFrom" DATE,
    "requestedTo" DATE,
    "requestedStartMinute" INTEGER,
    "requestedEndMinute" INTEGER,
    "reason" VARCHAR(1000),
    "status" "StaffRequestStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedByUserId" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewNote" VARCHAR(1000),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StaffRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WorkShift_venueId_date_idx" ON "WorkShift"("venueId", "date");

-- CreateIndex
CREATE INDEX "WorkShift_waiterId_date_idx" ON "WorkShift"("waiterId", "date");

-- CreateIndex
CREATE INDEX "StaffRequest_venueId_status_createdAt_idx" ON "StaffRequest"("venueId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "StaffRequest_waiterId_createdAt_idx" ON "StaffRequest"("waiterId", "createdAt");

-- CreateIndex
CREATE INDEX "Waiter_venueId_status_idx" ON "Waiter"("venueId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Waiter_venueId_userId_key" ON "Waiter"("venueId", "userId");

-- AddForeignKey
ALTER TABLE "Waiter" ADD CONSTRAINT "Waiter_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkShift" ADD CONSTRAINT "WorkShift_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkShift" ADD CONSTRAINT "WorkShift_waiterId_fkey" FOREIGN KEY ("waiterId") REFERENCES "Waiter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffRequest" ADD CONSTRAINT "StaffRequest_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffRequest" ADD CONSTRAINT "StaffRequest_waiterId_fkey" FOREIGN KEY ("waiterId") REFERENCES "Waiter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffRequest" ADD CONSTRAINT "StaffRequest_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "WorkShift"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffRequest" ADD CONSTRAINT "StaffRequest_reviewedByUserId_fkey" FOREIGN KEY ("reviewedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

