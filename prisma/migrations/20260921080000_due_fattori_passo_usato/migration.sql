-- L'ultimo passo del codice a sei cifre già usato.
--
-- Serve a una cosa che la matematica dello standard non copre: **un codice
-- usato non si riusa**. Senza questa colonna, un codice visto passare — su una
-- spalla, in una schermata condivisa, in un registro — resta valido per altri
-- novanta secondi, che è tutto il tempo che serve a chi l'ha visto.
ALTER TABLE "User" ADD COLUMN "totpUltimoPasso" INTEGER;
