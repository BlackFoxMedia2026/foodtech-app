-- La chiave di un tentativo di prenotazione dal widget.
--
-- Additiva: colonna facoltativa più un indice unico. Le prenotazioni
-- esistenti restano con NULL, e in Postgres i NULL non si scontrano fra loro
-- in un indice unico — quindi nessuna riga di oggi diventa un doppione.
ALTER TABLE "Booking" ADD COLUMN "idempotencyKey" TEXT;
CREATE UNIQUE INDEX "Booking_idempotencyKey_key" ON "Booking"("idempotencyKey");
