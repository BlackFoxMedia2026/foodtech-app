-- Tavolo Voice, fase 1: lo schema.
--
-- Additiva. Non cancella niente: le tre tabelle superate del baseline
-- (`CallLog`, `MissedCall`, `VoiceBookingDraft`) restano, marcate nello schema,
-- perché contengono sei righe di demo di aprile 2026. La loro cancellazione è
-- un passo separato ed esplicito.
--
-- `PhoneCall` resta la verità sulle chiamate e si estende con quello che quelle
-- tre anticipavano. Rinominarla in `VoiceCall` per allinearla a un nome sarebbe
-- una migrazione rischiosa su una tabella viva, in cambio di un nome.

-- ── gli stati che mancavano ───────────────────────────────────────────────
-- «nessuno ha risposto» e «non è riuscita» sono due cose diverse: la prima è
-- una persona da richiamare, la seconda un guasto da guardare.
ALTER TYPE "PhoneCallStatus" ADD VALUE IF NOT EXISTS 'HELD';
ALTER TYPE "PhoneCallStatus" ADD VALUE IF NOT EXISTS 'VOICEMAIL';
ALTER TYPE "PhoneCallStatus" ADD VALUE IF NOT EXISTS 'FAILED';

-- Il telefono diventa una fonte di prenotazioni vera. `PHONE` resta per le
-- righe esistenti e per chi scrive a mano: il passato non si riscrive.
ALTER TYPE "BookingSource" ADD VALUE IF NOT EXISTS 'VOICE';

CREATE TYPE "PhoneCallDirection" AS ENUM ('INBOUND', 'OUTBOUND');
CREATE TYPE "PhoneCallHandler" AS ENUM ('HUMAN', 'AI', 'HYBRID', 'NONE');

-- Elenco chiuso: con un campo di testo libero, due mesi dopo ci sono
-- «prenotato», «prenotazione» e «PRENOTATO» nella stessa colonna.
CREATE TYPE "PhoneCallOutcome" AS ENUM (
  'BOOKING_CREATED', 'BOOKING_UPDATED', 'BOOKING_CANCELLED', 'WAITLIST_ADDED',
  'INFORMATION', 'TRANSFERRED', 'CALLBACK_REQUIRED', 'MISSED', 'VOICEMAIL',
  'NO_ACTION', 'FAILED'
);

CREATE TYPE "PhoneCallEventKind" AS ENUM (
  'CALL_RECEIVED', 'CALL_ANSWERED', 'CALL_HELD', 'CALL_RESUMED',
  'CALL_TRANSFERRED', 'CALL_ENDED', 'CALL_MISSED', 'AI_STARTED', 'AI_ESCALATED',
  'BOOKING_CREATED', 'BOOKING_UPDATED', 'BOOKING_CANCELLED', 'WAITLIST_ADDED',
  'MESSAGE_SENT', 'CALLBACK_CREATED', 'CALLBACK_RESOLVED', 'CRM_INSIGHT_CREATED',
  'NOTE_ADDED'
);

CREATE TYPE "VoiceMode" AS ENUM ('OFF', 'HUMAN_ONLY', 'HUMAN_FIRST', 'AI_FIRST');
CREATE TYPE "VoiceRoutingTarget" AS ENUM ('HUMAN', 'AI', 'VOICEMAIL', 'FORWARD', 'MESSAGE');
CREATE TYPE "VoiceRecordingConsent" AS ENUM ('OFF', 'ANNOUNCE', 'BOTH_PARTIES');
CREATE TYPE "VoiceCallbackStatus" AS ENUM ('OPEN', 'DONE', 'IGNORED');
CREATE TYPE "VoiceInsightStatus" AS ENUM ('PENDING', 'SAVED', 'IGNORED');
CREATE TYPE "VoiceKnowledgeCategory" AS ENUM (
  'LOCALE', 'ORARI', 'MENU', 'ALLERGIE', 'ACCESSIBILITA', 'PARCHEGGIO',
  'BAMBINI', 'ANIMALI', 'GRUPPI', 'EVENTI', 'PAGAMENTI', 'ALTRO'
);

-- ── le linee del locale ───────────────────────────────────────────────────
-- Un numero appartiene a UN locale: è il confine che impedisce di mescolare le
-- chiamate di due ristoranti dello stesso gruppo.
CREATE TABLE "VoiceNumber" (
  "id" TEXT NOT NULL,
  "venueId" TEXT NOT NULL,
  "fornitore" VARCHAR(40) NOT NULL,
  "numeroEsterno" TEXT NOT NULL,
  "numeroMostrato" TEXT,
  "etichetta" VARCHAR(80),
  "attivo" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "VoiceNumber_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "VoiceNumber_fornitore_numeroEsterno_key"
  ON "VoiceNumber" ("fornitore", "numeroEsterno");
CREATE INDEX "VoiceNumber_venueId_attivo_idx" ON "VoiceNumber" ("venueId", "attivo");
ALTER TABLE "VoiceNumber" ADD CONSTRAINT "VoiceNumber_venueId_fkey"
  FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── i campi nuovi della chiamata ──────────────────────────────────────────
ALTER TABLE "PhoneCall" ADD COLUMN IF NOT EXISTS "toNumber" TEXT;
ALTER TABLE "PhoneCall" ADD COLUMN IF NOT EXISTS "voiceNumberId" TEXT;
ALTER TABLE "PhoneCall" ADD COLUMN IF NOT EXISTS "direction" "PhoneCallDirection" NOT NULL DEFAULT 'INBOUND';
ALTER TABLE "PhoneCall" ADD COLUMN IF NOT EXISTS "handler" "PhoneCallHandler" NOT NULL DEFAULT 'NONE';
ALTER TABLE "PhoneCall" ADD COLUMN IF NOT EXISTS "outcome" "PhoneCallOutcome";
ALTER TABLE "PhoneCall" ADD COLUMN IF NOT EXISTS "summary" VARCHAR(600);
ALTER TABLE "PhoneCall" ADD COLUMN IF NOT EXISTS "notes" VARCHAR(1000);
ALTER TABLE "PhoneCall" ADD COLUMN IF NOT EXISTS "waitlistId" TEXT;

-- L'indice per le analitiche: le chiamate di un periodo per esito.
CREATE INDEX IF NOT EXISTS "PhoneCall_venueId_outcome_startedAt_idx"
  ON "PhoneCall" ("venueId", "outcome", "startedAt");

ALTER TABLE "PhoneCall" ADD CONSTRAINT "PhoneCall_voiceNumberId_fkey"
  FOREIGN KEY ("voiceNumberId") REFERENCES "VoiceNumber"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- La lista d'attesa si stacca invece di portarsi via la chiamata: la telefonata
-- è successa comunque.
ALTER TABLE "PhoneCall" ADD CONSTRAINT "PhoneCall_waitlistId_fkey"
  FOREIGN KEY ("waitlistId") REFERENCES "WaitlistEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ── gli eventi ────────────────────────────────────────────────────────────
-- La riga della chiamata dice com'è adesso; questi dicono cos'è successo.
CREATE TABLE "PhoneCallEvent" (
  "id" TEXT NOT NULL,
  "callId" TEXT NOT NULL,
  "kind" "PhoneCallEventKind" NOT NULL,
  "actor" VARCHAR(64),
  "meta" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PhoneCallEvent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "PhoneCallEvent_callId_createdAt_idx" ON "PhoneCallEvent" ("callId", "createdAt");
ALTER TABLE "PhoneCallEvent" ADD CONSTRAINT "PhoneCallEvent_callId_fkey"
  FOREIGN KEY ("callId") REFERENCES "PhoneCall"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── registrazione e trascrizione, in tabelle a parte ──────────────────────
-- Non su `PhoneCall`: l'elenco delle chiamate non deve portarsi dietro un
-- testo lungo a ogni lettura, e una registrazione ha una scadenza sua.
CREATE TABLE "PhoneCallRecording" (
  "id" TEXT NOT NULL,
  "callId" TEXT NOT NULL,
  "url" TEXT NOT NULL,
  "durationSec" INTEGER,
  "expiresAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PhoneCallRecording_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PhoneCallRecording_callId_key" ON "PhoneCallRecording" ("callId");
CREATE INDEX "PhoneCallRecording_expiresAt_idx" ON "PhoneCallRecording" ("expiresAt");
ALTER TABLE "PhoneCallRecording" ADD CONSTRAINT "PhoneCallRecording_callId_fkey"
  FOREIGN KEY ("callId") REFERENCES "PhoneCall"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "PhoneCallTranscript" (
  "id" TEXT NOT NULL,
  "callId" TEXT NOT NULL,
  "testo" TEXT NOT NULL,
  "lingua" VARCHAR(8),
  "fornitore" VARCHAR(40),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PhoneCallTranscript_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PhoneCallTranscript_callId_key" ON "PhoneCallTranscript" ("callId");
ALTER TABLE "PhoneCallTranscript" ADD CONSTRAINT "PhoneCallTranscript_callId_fkey"
  FOREIGN KEY ("callId") REFERENCES "PhoneCall"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── come il locale vuole che si comporti il telefono ──────────────────────
-- Il valore per difetto è `HUMAN_ONLY`: nessuna macchina parla con i clienti
-- di nessuno senza che qualcuno l'abbia deciso.
CREATE TABLE "VoiceConfiguration" (
  "id" TEXT NOT NULL,
  "venueId" TEXT NOT NULL,
  "modalita" "VoiceMode" NOT NULL DEFAULT 'HUMAN_ONLY',
  "secondiDiSquillo" INTEGER NOT NULL DEFAULT 20,
  "quandoAperto" "VoiceRoutingTarget" NOT NULL DEFAULT 'HUMAN',
  "quandoChiuso" "VoiceRoutingTarget" NOT NULL DEFAULT 'VOICEMAIL',
  "quandoOccupato" "VoiceRoutingTarget" NOT NULL DEFAULT 'VOICEMAIL',
  "quandoNonRisponde" "VoiceRoutingTarget" NOT NULL DEFAULT 'VOICEMAIL',
  "numeroInoltro" TEXT,
  "recuperoPerseAttivo" BOOLEAN NOT NULL DEFAULT false,
  "recuperoPerseCanale" "MessageChannel",
  "recuperoPerseMinuti" INTEGER NOT NULL DEFAULT 5,
  "recuperoPerseTesto" VARCHAR(600),
  "recuperoCreaRichiamata" BOOLEAN NOT NULL DEFAULT true,
  "registrazioniAttive" BOOLEAN NOT NULL DEFAULT false,
  "registrazioniConsenso" "VoiceRecordingConsent" NOT NULL DEFAULT 'OFF',
  "registrazioniGiorni" INTEGER NOT NULL DEFAULT 30,
  "aiNome" VARCHAR(40),
  "aiLingua" TEXT NOT NULL DEFAULT 'it',
  "aiSaluto" VARCHAR(300),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "VoiceConfiguration_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "VoiceConfiguration_venueId_key" ON "VoiceConfiguration" ("venueId");
ALTER TABLE "VoiceConfiguration" ADD CONSTRAINT "VoiceConfiguration_venueId_fkey"
  FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── la coda da richiamare ─────────────────────────────────────────────────
-- Una chiamata persa non è una riga di storico: è un lavoro da fare.
CREATE TABLE "VoiceCallback" (
  "id" TEXT NOT NULL,
  "venueId" TEXT NOT NULL,
  "numero" TEXT NOT NULL,
  "guestId" TEXT,
  "callId" TEXT,
  "stato" "VoiceCallbackStatus" NOT NULL DEFAULT 'OPEN',
  "tentativi" INTEGER NOT NULL DEFAULT 0,
  "entro" TIMESTAMP(3),
  "chiusoIl" TIMESTAMP(3),
  "chiusoDa" TEXT,
  "nota" VARCHAR(400),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "VoiceCallback_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "VoiceCallback_venueId_stato_createdAt_idx"
  ON "VoiceCallback" ("venueId", "stato", "createdAt");
ALTER TABLE "VoiceCallback" ADD CONSTRAINT "VoiceCallback_venueId_fkey"
  FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VoiceCallback" ADD CONSTRAINT "VoiceCallback_guestId_fkey"
  FOREIGN KEY ("guestId") REFERENCES "Guest"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "VoiceCallback" ADD CONSTRAINT "VoiceCallback_callId_fkey"
  FOREIGN KEY ("callId") REFERENCES "PhoneCall"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ── le informazioni da approvare ──────────────────────────────────────────
-- Il punto di questa tabella è `stato`: quello che una macchina deduce da una
-- telefonata non entra nel profilo di un cliente finché una persona non premo
-- «salva». Un CRM pieno di deduzioni non verificate è peggio di uno vuoto,
-- perché non si sa più cosa è vero.
CREATE TABLE "VoiceCRMInsight" (
  "id" TEXT NOT NULL,
  "venueId" TEXT NOT NULL,
  "callId" TEXT NOT NULL,
  "guestId" TEXT,
  "tipo" VARCHAR(40) NOT NULL,
  "valore" VARCHAR(300) NOT NULL,
  "stato" "VoiceInsightStatus" NOT NULL DEFAULT 'PENDING',
  "decisoDa" TEXT,
  "decisoIl" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "VoiceCRMInsight_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "VoiceCRMInsight_venueId_stato_createdAt_idx"
  ON "VoiceCRMInsight" ("venueId", "stato", "createdAt");
ALTER TABLE "VoiceCRMInsight" ADD CONSTRAINT "VoiceCRMInsight_venueId_fkey"
  FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VoiceCRMInsight" ADD CONSTRAINT "VoiceCRMInsight_callId_fkey"
  FOREIGN KEY ("callId") REFERENCES "PhoneCall"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VoiceCRMInsight" ADD CONSTRAINT "VoiceCRMInsight_guestId_fkey"
  FOREIGN KEY ("guestId") REFERENCES "Guest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ── quello che il locale ha deciso di far sapere al telefono ──────────────
-- Esiste perché una macchina che risponde non deve inventare: se la risposta
-- non è qui, si dice «faccio verificare dal personale».
CREATE TABLE "VoiceKnowledgeItem" (
  "id" TEXT NOT NULL,
  "venueId" TEXT NOT NULL,
  "categoria" "VoiceKnowledgeCategory" NOT NULL,
  "argomenti" TEXT[] NOT NULL DEFAULT '{}',
  "risposta" VARCHAR(1200) NOT NULL,
  "attivo" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "VoiceKnowledgeItem_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "VoiceKnowledgeItem_venueId_categoria_attivo_idx"
  ON "VoiceKnowledgeItem" ("venueId", "categoria", "attivo");
ALTER TABLE "VoiceKnowledgeItem" ADD CONSTRAINT "VoiceKnowledgeItem_venueId_fkey"
  FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE CASCADE ON UPDATE CASCADE;
