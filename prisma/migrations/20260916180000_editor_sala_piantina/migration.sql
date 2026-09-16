-- La Sala diventa un editor della piantina reale.
--
-- Cinque colonne su "RoomLayout" e due valori in piu' nell'enum delle forme.
-- Tutte le colonne hanno un valore di partenza, quindi ogni sala gia'
-- configurata continua a disegnarsi esattamente come prima: layer tutti
-- accesi, nessun inventario dichiarato, nessuna analisi.
--
--  - layers:    quali livelli sono visibili (tavoli, struttura, aree, testi,
--               immagine originale). E' una preferenza della sala, non
--               dell'utente: chi apre la Sala deve vedere la stessa piantina
--               che ha lasciato il collega.
--  - inventory: quanti tavoli il locale dichiara di possedere, per forma.
--               La libreria a sinistra ne sottrae quelli gia' posizionati e
--               mostra la disponibilita' residua.
--  - meta:      nome/superficie/dimensioni quando non si possono calcolare
--               dalla geometria e il locale li scrive a mano.
--  - analysis:  il risultato grezzo del riconoscimento della planimetria,
--               conservato accanto agli elementi che ne sono derivati: se
--               domani il riconoscimento migliora si puo' ri-generare senza
--               chiedere di ricaricare l'immagine.

-- AlterTable
ALTER TABLE "RoomLayout" ADD COLUMN     "layers" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "inventory" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "meta" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "analysis" JSONB,
ADD COLUMN     "analyzedAt" TIMESTAMP(3);

-- AlterEnum
ALTER TYPE "TableShape" ADD VALUE IF NOT EXISTS 'OVAL';
ALTER TYPE "TableShape" ADD VALUE IF NOT EXISTS 'CUSTOM';
