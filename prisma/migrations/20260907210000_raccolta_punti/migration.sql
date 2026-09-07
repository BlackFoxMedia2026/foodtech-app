-- Le due regole della raccolta punti, dichiarate dal locale.
-- Nulle = raccolta spenta: una raccolta accesa da sola, senza che nessuno
-- abbia deciso quanto vale un punto, regalerebbe sconti a caso.
-- Additiva: due colonne che nascono vuote.

-- AlterTable
ALTER TABLE "Venue" ADD COLUMN "loyaltyPointsPerEuro" INTEGER;
ALTER TABLE "Venue" ADD COLUMN "loyaltyPointValueCents" INTEGER;
