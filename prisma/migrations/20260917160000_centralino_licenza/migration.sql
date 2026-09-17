-- La chiave che accende il centralino dentro Tavolo.
--
-- Quattro colonne e non una sola `phoneEnabled`: un booleano direbbe «acceso»
-- e non saprebbe dire *perché*. La chiave intera resta perché va riverificata
-- (la firma è la prova di aver comprato, e una riga cambiata a mano nel
-- database non deve poter accendere niente); la scadenza e le funzioni sono
-- copie, per poterle mostrare senza rifare la verifica a ogni schermata.
ALTER TABLE "Venue" ADD COLUMN IF NOT EXISTS "phoneLicenseKey" TEXT;
ALTER TABLE "Venue" ADD COLUMN IF NOT EXISTS "phoneLicenseActivatedAt" TIMESTAMP(3);
ALTER TABLE "Venue" ADD COLUMN IF NOT EXISTS "phoneLicenseExpiresAt" TIMESTAMP(3);
ALTER TABLE "Venue" ADD COLUMN IF NOT EXISTS "phoneLicenseFeatures" TEXT[] NOT NULL DEFAULT '{}';
