-- Da quanto in anticipo, e fino a quando, si può prenotare **online**.
--
-- Due colonne facoltative: nullo vuol dire «nessun limite», che è il
-- comportamento di oggi. Nessun locale si ritrova regole che non ha chiesto.
ALTER TABLE "Venue" ADD COLUMN "bookingWindowDays" INTEGER;
ALTER TABLE "Venue" ADD COLUMN "bookingCutoffMin" INTEGER;
