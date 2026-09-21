-- L'annullamento di un utilizzo di gift card diventa ripetibile senza danno.
--
-- Senza questa colonna due DELETE sullo stesso utilizzo — un doppio clic, due
-- rientri sullo stesso link — scrivevano due righe negative: una carta da
-- 100 € con un utilizzo da 50 finiva a 150 € di saldo, e tornava ACTIVE.
-- La riga resta e il saldo continua a sommarsi con il segno: questa colonna
-- serve solo a dire «questo utilizzo è già stato annullato».
ALTER TABLE "GiftCardRedemption" ADD COLUMN "deletedAt" TIMESTAMP(3);
