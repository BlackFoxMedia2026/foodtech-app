-- AlterTable
ALTER TABLE "MessageLog" ADD COLUMN     "bookingId" TEXT,
ADD COLUMN     "kind" VARCHAR(40);

-- CreateIndex
CREATE INDEX "MessageLog_bookingId_kind_idx" ON "MessageLog"("bookingId", "kind");

-- AddForeignKey
ALTER TABLE "MessageLog" ADD CONSTRAINT "MessageLog_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE SET NULL ON UPDATE CASCADE;

