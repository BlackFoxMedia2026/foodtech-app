-- Le richieste per un evento o un gruppo grande.
--
-- «Siamo quaranta per una laurea, un sabato di dicembre, quanto viene?» non e
-- una riga in agenda: e una trattativa con dentro una data da trovare, un menu
-- da concordare e un prezzo da dire. Una prenotazione da quaranta coperti
-- creata subito bloccherebbe mezza sala per qualcosa che forse non si fara.
--
-- E il pezzo con cui i concorrenti fanno margine, e in Tavolo mancava del
-- tutto: i campi `Booking.isGroup`, `eventType` e `budgetCents` erano nello
-- schema dal primo giorno e **non li scriveva nessuno**. Da adesso li scrive
-- l'accettazione di una di queste richieste.
--
-- Additiva: una tabella e un tipo nuovi, nessuna riga esistente cambia.
CREATE TYPE "EventRequestStatus" AS ENUM ('NUOVA', 'PREVENTIVO', 'ACCETTATA', 'PERSA');

CREATE TABLE "EventRequest" (
    "id" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "guestId" TEXT,
    "nome" VARCHAR(120) NOT NULL,
    "telefono" VARCHAR(40),
    "email" VARCHAR(200),
    "persone" INTEGER NOT NULL,
    "quando" TIMESTAMP(3),
    "quandoTesto" VARCHAR(160),
    "tipo" VARCHAR(60),
    "stato" "EventRequestStatus" NOT NULL DEFAULT 'NUOVA',
    "budgetCents" INTEGER,
    "preventivoCents" INTEGER,
    "perPersonaCents" INTEGER,
    "menuConcordato" VARCHAR(2000),
    "note" VARCHAR(1000),
    "callId" VARCHAR(120),
    "bookingId" TEXT,
    "decisoDa" TEXT,
    "decisoIl" TIMESTAMP(3),
    "motivo" VARCHAR(300),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventRequest_pkey" PRIMARY KEY ("id")
);

-- Una richiesta accettata produce **una** prenotazione: riaccettarla non ne
-- produce un'altra, e il vincolo sta qui e non in un controllo prima della
-- scrittura.
CREATE UNIQUE INDEX "EventRequest_bookingId_key" ON "EventRequest"("bookingId");

-- L'idempotenza sul telefono: il centralino che ritenta non apre due
-- trattative per la stessa chiamata. I nulli in Postgres non si scontrano fra
-- loro, quindi le richieste nate a mano non si disturbano a vicenda.
CREATE UNIQUE INDEX "EventRequest_venueId_callId_key" ON "EventRequest"("venueId", "callId");

CREATE INDEX "EventRequest_venueId_stato_createdAt_idx" ON "EventRequest"("venueId", "stato", "createdAt");
CREATE INDEX "EventRequest_venueId_quando_idx" ON "EventRequest"("venueId", "quando");

ALTER TABLE "EventRequest" ADD CONSTRAINT "EventRequest_venueId_fkey"
  FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EventRequest" ADD CONSTRAINT "EventRequest_guestId_fkey"
  FOREIGN KEY ("guestId") REFERENCES "Guest"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EventRequest" ADD CONSTRAINT "EventRequest_bookingId_fkey"
  FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE SET NULL ON UPDATE CASCADE;
