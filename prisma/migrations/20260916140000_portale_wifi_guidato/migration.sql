-- Il portale Wi-Fi diventa una configurazione guidata.
--
-- Quattro colonne, tutte con un valore di partenza: nessuna riga esistente
-- cambia comportamento. I portali gia' accesi continuano a chiedere nome,
-- email e telefono con la spunta del marketing, cioe' esattamente cio' che
-- il modulo pubblico faceva prima, scritto adesso nei dati invece che nel
-- codice.

-- AlterTable
ALTER TABLE "Venue" ADD COLUMN     "wifiAskEmail" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "wifiAskMarketing" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "wifiAskPhone" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "wifiRouterConfirmedAt" TIMESTAMP(3);
