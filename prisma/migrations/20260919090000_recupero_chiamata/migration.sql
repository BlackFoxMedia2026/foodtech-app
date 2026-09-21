-- Una telefonata interrotta a meta', e il modo di riprenderla.
--
-- Qualcuno ha chiamato, il risponditore ha cominciato a prendere la
-- prenotazione, e la chiamata e' finita prima della conferma. Non e' un numero
-- da buttare: e' una persona che voleva un tavolo.
--
-- In tabella sta l'hash del token, non il token: chi legge il database non deve
-- poter aprire il link di nessuno.

CREATE TYPE "VoiceRecoveryInvio" AS ENUM ('DA_MANDARE', 'MANDATO', 'SENZA_CANALE', 'NON_RIUSCITO');

CREATE TABLE "VoiceRecovery" (
  "id"           TEXT NOT NULL,
  "venueId"      TEXT NOT NULL,
  "phoneCallId"  TEXT,
  "numero"       VARCHAR(40) NOT NULL,
  "tokenHash"    TEXT NOT NULL,
  "scadeIl"      TIMESTAMP(3) NOT NULL,
  "persone"      INTEGER,
  "quando"       TIMESTAMP(3),
  "nome"         VARCHAR(120),
  "passo"        VARCHAR(40),
  "invio"        "VoiceRecoveryInvio" NOT NULL DEFAULT 'DA_MANDARE',
  "messageLogId" TEXT,
  "bookingId"    TEXT,
  "convertitoIl" TIMESTAMP(3),
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3) NOT NULL,

  CONSTRAINT "VoiceRecovery_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "VoiceRecovery_tokenHash_key" ON "VoiceRecovery"("tokenHash");

-- Una sola per chiamata: il risponditore puo' raccontare due volte la stessa
-- interruzione, e due link per la stessa telefonata sono due messaggi alla
-- stessa persona.
CREATE UNIQUE INDEX "VoiceRecovery_phoneCallId_key" ON "VoiceRecovery"("phoneCallId");

-- Una prenotazione nasce da un recupero solo: e' l'attribuzione, e due righe
-- che la rivendicano falserebbero il conto dei recuperi.
CREATE UNIQUE INDEX "VoiceRecovery_bookingId_key" ON "VoiceRecovery"("bookingId");

CREATE INDEX "VoiceRecovery_venueId_createdAt_idx" ON "VoiceRecovery"("venueId", "createdAt");
CREATE INDEX "VoiceRecovery_venueId_invio_idx" ON "VoiceRecovery"("venueId", "invio");

ALTER TABLE "VoiceRecovery"
  ADD CONSTRAINT "VoiceRecovery_venueId_fkey" FOREIGN KEY ("venueId")
  REFERENCES "Venue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "VoiceRecovery"
  ADD CONSTRAINT "VoiceRecovery_phoneCallId_fkey" FOREIGN KEY ("phoneCallId")
  REFERENCES "PhoneCall"("id") ON DELETE SET NULL ON UPDATE CASCADE;
