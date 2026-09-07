-- Le due condizioni che un ristoratore chiede per prime su un coupon, e che
-- fino a oggi non c'erano: la spesa minima e i giorni in cui vale.
--
-- Senza la prima, uno sconto del 20% si applica anche a un caffè. Senza la
-- seconda, un coupon nato per riempire il martedì viene speso di sabato, che
-- era già pieno.
-- Additiva: due colonne che nascono vuote (nessuna condizione = vale sempre,
-- che è il comportamento di oggi).

-- AlterTable
ALTER TABLE "Coupon" ADD COLUMN "minSpendCents" INTEGER;
ALTER TABLE "Coupon" ADD COLUMN "validWeekdays" INTEGER[] DEFAULT ARRAY[]::INTEGER[];
