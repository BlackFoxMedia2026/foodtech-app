-- Una richiesta di evento ha una categoria sua nella campanella.
--
-- La prima versione riusava `AUTOMATION_FAILED`, che e una bugia: non e
-- un'automazione e non e fallita. Una categoria sbagliata non e un dettaglio
-- estetico — la campanella filtra e raggruppa per categoria, e il giorno in
-- cui qualcuno cerca «cos'e andato storto» trova dentro le richieste di
-- preventivo.
--
-- Additiva: un valore in piu su un enum.
ALTER TYPE "NotificationKind" ADD VALUE IF NOT EXISTS 'EVENT_REQUEST';
