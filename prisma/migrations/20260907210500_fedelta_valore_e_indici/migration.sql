-- Il valore di uno sconto in punti va fotografato quando si usa: se domani il
-- locale cambia quanto vale un punto, il conto di stasera non deve cambiare.
-- È la stessa regola con cui `OrderItem` copia il prezzo del piatto.
--
-- I due indici servono a una domanda che prima nessuno faceva: «cos'è stato
-- pagato su questo conto?». Senza, ogni apertura di un conto leggeva per
-- intero le tabelle degli utilizzi.
-- Tutto additivo: una colonna che nasce vuota e due indici.

-- AlterTable
ALTER TABLE "LoyaltyTransaction" ADD COLUMN "amountCents" INTEGER;

-- CreateIndex
CREATE INDEX "LoyaltyTransaction_orderId_idx" ON "LoyaltyTransaction"("orderId");

-- CreateIndex
CREATE INDEX "GiftCardRedemption_orderId_idx" ON "GiftCardRedemption"("orderId");
