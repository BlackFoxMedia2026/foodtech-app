-- Il conto al tavolo: un ordine collegato alla prenotazione.
--
-- `customerName` e `phone` erano obbligatori perché il modello era pensato per
-- l'asporto. Per un conto al tavolo il cliente è la prenotazione, e l'unico
-- modo di aprirne uno sarebbe stato inventare un nome e un telefono.
-- Rendere una colonna facoltativa non porta via niente: nessuna riga perde un
-- valore, e chi li scrive continua a scriverli.

-- AlterTable
ALTER TABLE "Order" ADD COLUMN "bookingId" TEXT;
ALTER TABLE "Order" ALTER COLUMN "customerName" DROP NOT NULL;
ALTER TABLE "Order" ALTER COLUMN "phone" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "Order_bookingId_idx" ON "Order"("bookingId");

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE SET NULL ON UPDATE CASCADE;
