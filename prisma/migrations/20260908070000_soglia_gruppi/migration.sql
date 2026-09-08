-- Da quante persone una prenotazione online diventa una telefonata: era una
-- costante nel modulo pubblico (dodici), ora è un'impostazione del locale.
--
-- Additiva, e col valore che aveva la costante: nessun locale cambia
-- comportamento al deploy.
ALTER TABLE "Venue" ADD COLUMN "largePartyFrom" INTEGER NOT NULL DEFAULT 12;
