-- CreateEnum
CREATE TYPE "QrCodeKind" AS ENUM ('PAY_TABLE', 'MENU', 'WIFI', 'BOOKING', 'CUSTOM');

-- AlterTable
ALTER TABLE "QrCode" ADD COLUMN     "design" JSONB,
ADD COLUMN     "kind" "QrCodeKind" NOT NULL DEFAULT 'CUSTOM',
ADD COLUMN     "payload" JSONB,
ADD COLUMN     "tableId" TEXT;

-- AlterTable
-- Il Wi-Fi non porta a un indirizzo: dentro il codice c'e' la riga dello
-- standard con le credenziali della rete. Allargare una colonna a nullo non
-- toglie niente a nessuna riga gia' scritta.
ALTER TABLE "QrCode" ALTER COLUMN "destinationUrl" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "QrCode_venueId_kind_idx" ON "QrCode"("venueId", "kind");

-- CreateIndex
CREATE INDEX "QrCode_tableId_idx" ON "QrCode"("tableId");

-- AddForeignKey
ALTER TABLE "QrCode" ADD CONSTRAINT "QrCode_tableId_fkey" FOREIGN KEY ("tableId") REFERENCES "Table"("id") ON DELETE SET NULL ON UPDATE CASCADE;
