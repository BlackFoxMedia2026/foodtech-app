-- Revoca delle sessioni: un istante da cui i token emessi prima non valgono più.
--
-- Additiva e nullabile: le sessioni già in corso non vengono toccate
-- (`NULL` = nessuna revoca), quindi si può applicare prima del deploy del
-- codice senza buttare fuori nessuno a metà servizio.
ALTER TABLE "User" ADD COLUMN "sessionsRevokedAt" TIMESTAMP(3);
