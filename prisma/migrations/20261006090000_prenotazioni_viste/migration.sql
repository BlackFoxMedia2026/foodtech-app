-- Il riquadro «Prenotazioni» della Panoramica: quando una prenotazione è stata
-- gestita da qualcuno dello staff (confermata, rifiutata o vista).
--
-- Solo aggiunte: una colonna nuova, nullabile. Le righe che esistono già e non
-- aspettano una decisione si segnano viste all'ultima modifica, altrimenti il
-- primo giorno la Panoramica elencherebbe come «nuova» ogni prenotazione
-- confermata della storia del locale.

-- AlterTable
ALTER TABLE "Booking" ADD COLUMN "seenAt" TIMESTAMP(3);

-- Le righe di prima
UPDATE "Booking" SET "seenAt" = "updatedAt" WHERE "status" <> 'PENDING';
