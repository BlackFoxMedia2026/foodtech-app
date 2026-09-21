-- Le chiamate al telefono del locale, mentre succedono.
--
-- Esiste per una schermata sola: chi risponde deve sapere chi sta chiamando
-- prima di dire pronto. Non è il registro telefonico — quello ce l'ha il
-- centralino, che vede tutto il traffico.
--
-- `(venueId, externalId)` unico è l'idempotenza: il centralino può rimandare
-- lo stesso evento se non ha ricevuto la nostra risposta, e senza il vincolo
-- la stessa chiamata comparirebbe due volte sullo schermo di chi risponde.

CREATE TYPE "PhoneCallStatus" AS ENUM ('RINGING', 'ANSWERED', 'MISSED', 'ENDED');

CREATE TABLE "PhoneCall" (
  "id" TEXT NOT NULL,
  "venueId" TEXT NOT NULL,
  "externalId" TEXT NOT NULL,
  "fromNumber" TEXT,
  "status" "PhoneCallStatus" NOT NULL DEFAULT 'RINGING',
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "answeredAt" TIMESTAMP(3),
  "endedAt" TIMESTAMP(3),
  "guestId" TEXT,
  "bookingId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PhoneCall_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PhoneCall_venueId_externalId_key" ON "PhoneCall" ("venueId", "externalId");

-- Le chiamate che squillano adesso: è la lettura che la schermata fa ogni
-- cinque secondi, e senza questo indice leggerebbe tutte le chiamate del
-- locale per trovarne una.
CREATE INDEX "PhoneCall_venueId_status_startedAt_idx"
  ON "PhoneCall" ("venueId", "status", "startedAt");
CREATE INDEX "PhoneCall_venueId_startedAt_idx" ON "PhoneCall" ("venueId", "startedAt");

ALTER TABLE "PhoneCall" ADD CONSTRAINT "PhoneCall_venueId_fkey"
  FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- L'ospite si stacca invece di portarsi via la chiamata: se una scheda viene
-- cancellata, la chiamata è successa comunque.
ALTER TABLE "PhoneCall" ADD CONSTRAINT "PhoneCall_guestId_fkey"
  FOREIGN KEY ("guestId") REFERENCES "Guest"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PhoneCall" ADD CONSTRAINT "PhoneCall_bookingId_fkey"
  FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE SET NULL ON UPDATE CASCADE;
