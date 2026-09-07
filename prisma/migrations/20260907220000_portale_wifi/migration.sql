-- Il portale Wi-Fi aveva già nello schema tutto il contorno (testo di
-- benvenuto, note legali, colore, coupon automatico) e non aveva la cosa per
-- cui una persona compila un modulo: la password della rete.
--
-- Tavolo non apre la rete — quello lo fa il router del locale. Quindi il
-- portale funziona solo se, dopo il contatto, ha qualcosa da dare: il nome
-- della rete e la password. `wifiRedirectUrl` è dove mandare la persona dopo.
-- Additiva: tre colonne che nascono vuote.

-- AlterTable
ALTER TABLE "Venue" ADD COLUMN "wifiNetworkName" VARCHAR(64);
ALTER TABLE "Venue" ADD COLUMN "wifiPassword" VARCHAR(128);
ALTER TABLE "Venue" ADD COLUMN "wifiRedirectUrl" TEXT;
