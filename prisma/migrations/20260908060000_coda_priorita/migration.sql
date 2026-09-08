-- La coda impara la priorità: numero piccolo = prima.
--
-- Additiva: la colonna nasce col valore 100 su tutte le righe esistenti, che
-- è la priorità normale — quindi l'ordine di quello che è già in coda non
-- cambia, e il codice vecchio (che non la seleziona) continua a funzionare.
ALTER TABLE "BackgroundJob" ADD COLUMN "priority" INTEGER NOT NULL DEFAULT 100;

-- L'indice nuovo serve all'ordinamento (stato, priorità, orario). Il vecchio
-- si toglie dopo, non adesso: durante il deploy convivono due versioni del
-- codice, e togliere un indice usato dalla versione precedente rallenta la
-- coda proprio nel momento in cui c'è più traffico.
CREATE INDEX "BackgroundJob_status_priority_runAt_idx" ON "BackgroundJob"("status", "priority", "runAt");
