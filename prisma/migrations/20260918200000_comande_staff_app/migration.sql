-- CreateEnum
CREATE TYPE "ComandaStatus" AS ENUM ('BOZZA', 'INVIATA', 'RICEVUTA', 'IN_PREPARAZIONE', 'PRONTA', 'SERVITA', 'ANNULLATA');

-- CreateEnum
CREATE TYPE "ComandaRigaStatus" AS ENUM ('BOZZA', 'INVIATA', 'IN_PREPARAZIONE', 'PRONTA', 'SERVITA', 'ANNULLATA');

-- CreateEnum
CREATE TYPE "ComandaModificaKind" AS ENUM ('VARIANTE', 'SENZA', 'EXTRA', 'COTTURA', 'PORZIONE');

-- CreateEnum
CREATE TYPE "FornitoreComanda" AS ENUM ('INTERNO');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationKind" ADD VALUE 'COMANDA_PRONTA';
ALTER TYPE "NotificationKind" ADD VALUE 'COMANDA_PRESA_IN_CARICO';
ALTER TYPE "NotificationKind" ADD VALUE 'COMANDA_MODIFICATA';
ALTER TYPE "NotificationKind" ADD VALUE 'TAVOLO_ASSEGNATO';
ALTER TYPE "NotificationKind" ADD VALUE 'TURNO_IMMINENTE';
ALTER TYPE "NotificationKind" ADD VALUE 'COMUNICAZIONE_STAFF';

-- AlterTable
ALTER TABLE "Notification" ADD COLUMN     "waiterId" TEXT;

-- AlterTable
ALTER TABLE "OrderItem" ADD COLUMN     "allergens" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "allergyNote" VARCHAR(300),
ADD COLUMN     "comandaId" TEXT,
ADD COLUMN     "orderGuestId" TEXT,
ADD COLUMN     "readyAt" TIMESTAMP(3),
ADD COLUMN     "sentAt" TIMESTAMP(3),
ADD COLUMN     "servedAt" TIMESTAMP(3),
ADD COLUMN     "status" "ComandaRigaStatus" NOT NULL DEFAULT 'BOZZA';

-- CreateTable
CREATE TABLE "Comanda" (
    "id" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "tableId" TEXT,
    "bookingId" TEXT,
    "waiterId" TEXT,
    "numero" INTEGER NOT NULL,
    "status" "ComandaStatus" NOT NULL DEFAULT 'BOZZA',
    "fornitore" "FornitoreComanda" NOT NULL DEFAULT 'INTERNO',
    "fornitoreRef" VARCHAR(120),
    "nota" VARCHAR(500),
    "invioKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "sentAt" TIMESTAMP(3),
    "acknowledgedAt" TIMESTAMP(3),
    "preparingAt" TIMESTAMP(3),
    "readyAt" TIMESTAMP(3),
    "servedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),

    CONSTRAINT "Comanda_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComandaEvento" (
    "id" TEXT NOT NULL,
    "comandaId" TEXT NOT NULL,
    "da" "ComandaStatus",
    "a" "ComandaStatus" NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "waiterId" TEXT,
    "userId" TEXT,
    "nota" VARCHAR(300),

    CONSTRAINT "ComandaEvento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderGuest" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "ordering" INTEGER NOT NULL,
    "label" VARCHAR(60) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrderGuest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderItemModifica" (
    "id" TEXT NOT NULL,
    "orderItemId" TEXT NOT NULL,
    "kind" "ComandaModificaKind" NOT NULL,
    "label" VARCHAR(80) NOT NULL,
    "priceCents" INTEGER NOT NULL DEFAULT 0,
    "ordering" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "OrderItemModifica_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Comanda_invioKey_key" ON "Comanda"("invioKey");

-- CreateIndex
CREATE INDEX "Comanda_venueId_status_sentAt_idx" ON "Comanda"("venueId", "status", "sentAt");

-- CreateIndex
CREATE INDEX "Comanda_venueId_createdAt_idx" ON "Comanda"("venueId", "createdAt");

-- CreateIndex
CREATE INDEX "Comanda_tableId_createdAt_idx" ON "Comanda"("tableId", "createdAt");

-- CreateIndex
CREATE INDEX "Comanda_waiterId_createdAt_idx" ON "Comanda"("waiterId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Comanda_orderId_numero_key" ON "Comanda"("orderId", "numero");

-- CreateIndex
CREATE INDEX "ComandaEvento_comandaId_at_idx" ON "ComandaEvento"("comandaId", "at");

-- CreateIndex
CREATE INDEX "OrderGuest_orderId_idx" ON "OrderGuest"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "OrderGuest_orderId_ordering_key" ON "OrderGuest"("orderId", "ordering");

-- CreateIndex
CREATE INDEX "OrderItemModifica_orderItemId_idx" ON "OrderItemModifica"("orderItemId");

-- CreateIndex
CREATE INDEX "Notification_waiterId_readAt_createdAt_idx" ON "Notification"("waiterId", "readAt", "createdAt");

-- CreateIndex
CREATE INDEX "OrderItem_comandaId_idx" ON "OrderItem"("comandaId");

-- CreateIndex
CREATE INDEX "OrderItem_orderGuestId_idx" ON "OrderItem"("orderGuestId");

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_waiterId_fkey" FOREIGN KEY ("waiterId") REFERENCES "Waiter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_comandaId_fkey" FOREIGN KEY ("comandaId") REFERENCES "Comanda"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_orderGuestId_fkey" FOREIGN KEY ("orderGuestId") REFERENCES "OrderGuest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comanda" ADD CONSTRAINT "Comanda_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comanda" ADD CONSTRAINT "Comanda_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comanda" ADD CONSTRAINT "Comanda_tableId_fkey" FOREIGN KEY ("tableId") REFERENCES "Table"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comanda" ADD CONSTRAINT "Comanda_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comanda" ADD CONSTRAINT "Comanda_waiterId_fkey" FOREIGN KEY ("waiterId") REFERENCES "Waiter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComandaEvento" ADD CONSTRAINT "ComandaEvento_comandaId_fkey" FOREIGN KEY ("comandaId") REFERENCES "Comanda"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComandaEvento" ADD CONSTRAINT "ComandaEvento_waiterId_fkey" FOREIGN KEY ("waiterId") REFERENCES "Waiter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderGuest" ADD CONSTRAINT "OrderGuest_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItemModifica" ADD CONSTRAINT "OrderItemModifica_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "OrderItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "contoRichiestoAt" TIMESTAMP(3);

