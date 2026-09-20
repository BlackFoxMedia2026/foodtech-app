-- I punti di un conto si accreditano **una volta sola**, e lo garantisce il database.
--
-- La difesa era un `findFirst` su (orderId, kind) dentro una transazione in
-- read committed: due casse che chiudono lo stesso conto nello stesso istante
-- non vedono la riga dell'altra, e la scrivono entrambe. Su un conto da 80 €
-- facevano 160 punti — denaro regalato, e un saldo che non torna con lo
-- storico.
--
-- L'indice è **parziale** per due ragioni precise:
--  - `orderId` è nullo per le rettifiche a mano e per i riscatti fuori conto,
--    e in Postgres i nulli non si scontrano fra loro — ma dichiararlo rende
--    l'intenzione leggibile invece di lasciarla a una proprietà del motore;
--  - vale solo per `EARNED`: sullo stesso conto ci possono essere un accredito
--    e un riscatto, e devono poter convivere.
-- Se il difetto è già capitato, questa migrazione si ferma e lo dice.
--
-- Un indice unico su dati che già lo violano fallisce con «could not create
-- unique index», che non dice quali conti e non dice cosa fare. E qui non si
-- può rimediare da soli: due accrediti sullo stesso conto sono punti regalati
-- a un cliente vero, e togliergli dei punti è una decisione di chi gestisce il
-- locale, non di una migrazione. Quindi si ferma prima, nominando il problema.
DO $$
DECLARE conti_doppi integer;
BEGIN
  SELECT count(*) INTO conti_doppi
  FROM (
    SELECT "orderId"
    FROM "LoyaltyTransaction"
    WHERE "orderId" IS NOT NULL AND "kind" = 'EARNED'
    GROUP BY "orderId"
    HAVING count(*) > 1
  ) doppioni;

  IF conti_doppi > 0 THEN
    RAISE EXCEPTION
      'Punti accreditati più di una volta su % conti: l''indice unico non si può creare finché ci sono. Trovali con: SELECT "orderId", count(*) FROM "LoyaltyTransaction" WHERE "orderId" IS NOT NULL AND "kind" = ''EARNED'' GROUP BY "orderId" HAVING count(*) > 1; e decidi con il locale quali righe tenere.',
      conti_doppi;
  END IF;
END $$;

CREATE UNIQUE INDEX "LoyaltyTransaction_orderId_earned_key"
  ON "LoyaltyTransaction" ("orderId")
  WHERE "orderId" IS NOT NULL AND "kind" = 'EARNED';
