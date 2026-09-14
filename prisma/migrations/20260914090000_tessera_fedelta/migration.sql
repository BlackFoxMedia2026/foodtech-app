-- Il numero della tessera fedeltà: il primo identificativo di un ospite fatto
-- per **uscire dal database** — stamparlo su una card, metterlo in un QR,
-- dettarlo al telefono.
--
-- Serviva perché non ce n'era nessuno. L'unica chiave era il `cuid` della riga,
-- che è un identificatore interno: metterlo in un codice a barre significa
-- consegnare al cliente la chiave primaria di un record, e da quel momento non
-- poterla più cambiare né revocare a chi ha perso la carta.
--
-- Additiva e nullabile: si assegna alla prima apertura della scheda
-- (`server/tessera-fedelta.ts`), non a tutti in blocco — un codice generato per
-- chi non lo userà mai è solo un valore in più da tenere unico. Quindi si può
-- applicare prima del deploy del codice senza toccare una riga esistente.
ALTER TABLE "Guest" ADD COLUMN "loyaltyCardCode" TEXT;

-- L'unicità la garantisce il database, non il calcolo delle probabilità: chi
-- assegna il codice riprova se questo vincolo lo rifiuta. Sulle righe esistenti
-- non può fallire, perché sono tutte `NULL` e in Postgres i `NULL` non si
-- contano come duplicati.
CREATE UNIQUE INDEX "Guest_loyaltyCardCode_key" ON "Guest"("loyaltyCardCode");
