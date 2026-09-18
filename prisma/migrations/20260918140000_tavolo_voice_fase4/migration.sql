-- Tavolo Voice, fase 4: gli esiti e la coda delle richiamate.
--
-- Due aggiunte, nessuna rimozione.

-- 1. Un evento per «com'e' finita».
--
-- L'esito e' un valore di un elenco chiuso su cui si contano le telefonate del
-- mese; una nota e' testo libero. Nel registro della chiamata devono restare
-- due cose diverse, o fra un mese non si sa piu' chi ha chiuso quella chiamata
-- ne' come.
ALTER TYPE "PhoneCallEventKind" ADD VALUE IF NOT EXISTS 'OUTCOME_SET';

-- 2. Una sola richiamata aperta per numero.
--
-- Il vincolo sta nel database e non in un controllo dentro il codice: due
-- persone che premono «da richiamare» sulla stessa chiamata perduta, nello
-- stesso istante, non si vedrebbero a vicenda — un controllo «ce n'e' gia'
-- una?» le farebbe passare entrambe — e in coda comparirebbe due volte la
-- stessa persona da richiamare. Con questo, la seconda scrittura viene
-- rifiutata dal database e il codice restituisce la riga che c'e' gia'.
--
-- Parziale, e non unico sulla coppia: una persona che chiama ogni mese deve
-- poter tornare in coda. Quello che non deve succedere e' averla in coda due
-- volte **contemporaneamente**.
--
-- Prisma non sa dichiarare un unico condizionato, quindi e' scritto qui a
-- mano: il commento sul modello `VoiceCallback` rimanda a questa migrazione.
CREATE UNIQUE INDEX IF NOT EXISTS "VoiceCallback_venueId_numero_aperta_key"
  ON "VoiceCallback" ("venueId", "numero")
  WHERE "stato" = 'OPEN';

-- 3. L'esito delle chiamate perse che c'erano gia'.
--
-- La colonna `outcome` esiste dalla fase 1 e nessuno l'ha mai scritta: tutte
-- le chiamate registrate finora hanno `outcome` nullo. Da adesso una persa
-- nasce con il suo esito, ma senza questa riga lo storico mostrerebbe mesi di
-- telefonate senza etichetta accanto a quelle nuove — e chi guarda penserebbe
-- che l'esito sia una cosa che a volte si perde.
--
-- Non e' un'invenzione: l'esito e' **dentro lo stato**. Una chiamata con
-- status MISSED e' una chiamata a cui non ha risposto nessuno, e scriverlo
-- nella colonna che serve a contarle non aggiunge un'informazione che non
-- c'era.
--
-- Solo le perse: una chiamata a cui si e' risposto non si sa come e' finita, e
-- inventarlo sarebbe il contrario di questo ragionamento.
UPDATE "PhoneCall"
   SET "outcome" = 'MISSED'
 WHERE "status" = 'MISSED'
   AND "outcome" IS NULL;
