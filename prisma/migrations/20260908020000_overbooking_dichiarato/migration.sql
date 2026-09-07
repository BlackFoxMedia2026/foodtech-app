-- Quanti coperti oltre la capienza del turno il locale accetta, in percentuale.
--
-- Facoltativa: nullo vuol dire «nessuno», cioè il comportamento di oggi.
-- Nessun locale si ritrova a vendere oltre la propria capienza per una
-- migrazione.
ALTER TABLE "Venue" ADD COLUMN "overbookingPct" INTEGER;
