-- Le automazioni sono un numero chiuso: questa colonna dice quale del
-- catalogo è ogni riga. Additiva: la colonna nasce vuota e nessuna riga
-- esistente ne ha bisogno (la tabella era senza codice, quindi vuota).

-- AlterTable
ALTER TABLE "AutomationWorkflow" ADD COLUMN "key" VARCHAR(40);

-- CreateIndex
CREATE UNIQUE INDEX "AutomationWorkflow_venueId_key_key" ON "AutomationWorkflow"("venueId", "key");
