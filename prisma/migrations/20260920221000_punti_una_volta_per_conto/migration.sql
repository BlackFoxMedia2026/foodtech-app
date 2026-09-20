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
CREATE UNIQUE INDEX "LoyaltyTransaction_orderId_earned_key"
  ON "LoyaltyTransaction" ("orderId")
  WHERE "orderId" IS NOT NULL AND "kind" = 'EARNED';
