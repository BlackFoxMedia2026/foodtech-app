-- Tavolo Voice, fase 12: da dove entrano le chiamate.
--
-- Due strade, e non sono equivalenti: dal gateway la chiamata entra prima che
-- qualcuno risponda, dalla deviazione entra solo quello che l'operatore ci
-- devia. Nessun valore per difetto su `ingresso`: sceglierne uno vorrebbe dire
-- far chiamare l'operatore a chi ha la scatoletta, o il contrario.

CREATE TYPE "VoiceIngresso" AS ENUM ('GATEWAY', 'DEVIAZIONE');

ALTER TABLE "VoiceConfiguration"
  ADD COLUMN "ingresso" "VoiceIngresso",
  ADD COLUMN "numeroPubblico" VARCHAR(40),
  ADD COLUMN "operatore" VARCHAR(40),
  ADD COLUMN "squilliChiesti" INTEGER,
  ADD COLUMN "deviazioneChiestaIl" TIMESTAMP(3);

-- La protezione dai cicli: quante volte questa chiamata e' stata rimandata al
-- locale. Zero per tutte quelle esistenti, che e' la verita': nessuna e' stata
-- rimandata, perche' il rimando non esisteva.
ALTER TABLE "PhoneCall"
  ADD COLUMN "rimandi" INTEGER NOT NULL DEFAULT 0;
