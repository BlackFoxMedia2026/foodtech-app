-- Il traguardo della raccolta punti.
--
-- Uno sconto lineare («100 punti = 5 €») è troppo piccolo per essere notato e
-- non fa tornare nessuno. «Ti mancano 40 punti alla cena omaggio» sì: è un
-- traguardo, e i traguardi si inseguono. Il premio lo decide il locale — noi
-- non sappiamo cosa può permettersi di regalare.
-- Additiva: due colonne che nascono vuote (nessun premio = comportamento di oggi).

-- AlterTable
ALTER TABLE "Venue" ADD COLUMN "loyaltyRewardPoints" INTEGER;
ALTER TABLE "Venue" ADD COLUMN "loyaltyRewardLabel" VARCHAR(120);
