-- AlterEnum
ALTER TYPE "WaitlistStatus" ADD VALUE 'LEFT';

-- AlterTable
ALTER TABLE "WaitlistEntry" ADD COLUMN     "desiredAt" TIMESTAMP(3),
ADD COLUMN     "flexibilityMin" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "preferredRoomId" TEXT;

-- AddForeignKey
ALTER TABLE "WaitlistEntry" ADD CONSTRAINT "WaitlistEntry_guestId_fkey" FOREIGN KEY ("guestId") REFERENCES "Guest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WaitlistEntry" ADD CONSTRAINT "WaitlistEntry_preferredRoomId_fkey" FOREIGN KEY ("preferredRoomId") REFERENCES "Room"("id") ON DELETE SET NULL ON UPDATE CASCADE;

