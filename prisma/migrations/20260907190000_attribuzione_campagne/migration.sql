-- Da quale campagna arriva una prenotazione.
-- Serve per rispondere a «quante prenotazioni ha portato quell'email» con un
-- numero vero: prima c'era Campaign.bookedCount, che nessuno scriveva.
-- Tutto additivo: una colonna che nasce vuota, un indice, un vincolo.

-- AlterTable
ALTER TABLE "Booking" ADD COLUMN "campaignId" TEXT;

-- CreateIndex
CREATE INDEX "Booking_campaignId_idx" ON "Booking"("campaignId");

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;
