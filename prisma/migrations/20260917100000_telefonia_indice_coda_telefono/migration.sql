-- Un indice per riconoscere chi sta chiamando.
--
-- Il centralino telefonico chiede a Tavolo «di chi e' questo numero?» mentre
-- il telefono squilla, e abbandona la richiesta dopo 800 ms: una telefonata
-- non puo' aspettare un gestionale.
--
-- Il confronto non si puo' fare sulla colonna "phone" com'e' scritta. Quel
-- campo e' testo libero riempito da chi prende la prenotazione al telefono, e
-- nello stesso archivio convivono «333 123 4567», «+39 333 1234567»,
-- «00393331234567» e «3331234567». Si confrontano le **ultime nove cifre**,
-- che sono l'unica parte che nessun operatore riscrive (vedi
-- src/lib/telefono.ts).
--
-- L'indice esistente su ("venueId", "phone") non serve a questo: indicizza la
-- stringa come e' scritta, mentre la ricerca avviene sulla colonna
-- **trasformata**. Senza un indice sull'espressione, ogni squillo costa una
-- scansione di tutti gli ospiti del locale — invisibile su mille schede,
-- fuori dal budget su centomila.
--
-- `regexp_replace` e `right` sono entrambe IMMUTABLE, quindi Postgres accetta
-- l'espressione in un indice. La clausola WHERE lo tiene piccolo: gli ospiti
-- senza telefono non si cercano per telefono.
CREATE INDEX IF NOT EXISTS "Guest_venueId_codaTelefono_idx"
  ON "Guest" ("venueId", right(regexp_replace("phone", '[^0-9]', '', 'g'), 9))
  WHERE "phone" IS NOT NULL;
