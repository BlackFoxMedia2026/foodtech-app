-- I servizi accesi a un locale da chi gestisce la piattaforma.
--
-- Il centralino si accendeva incollando una chiave firmata emessa da un
-- secondo gestionale. La firma resta indispensabile per le installazioni che
-- non gestiamo noi; per i clienti della nostra, il secondo gestionale era solo
-- un giro in piu' -- il database e' nostro, e chi accende e' un nostro super
-- amministratore.
--
-- Tabella e non colonna booleana: di un servizio acceso servono chi l'ha
-- acceso, quando, e cosa comprende. Davanti a «da ieri il telefono non va» la
-- prima domanda e' chi ha toccato cosa.

CREATE TYPE "ServizioLocale" AS ENUM ('CENTRALINO');

CREATE TABLE "VenueServizio" (
  "id"         TEXT NOT NULL,
  "venueId"    TEXT NOT NULL,
  "servizio"   "ServizioLocale" NOT NULL,
  "attivo"     BOOLEAN NOT NULL DEFAULT true,
  "funzioni"   TEXT[],
  "attivatoDa" VARCHAR(200),
  "attivatoIl" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "spentoIl"   TIMESTAMP(3),
  "nota"       VARCHAR(300),
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"  TIMESTAMP(3) NOT NULL,

  CONSTRAINT "VenueServizio_pkey" PRIMARY KEY ("id")
);

-- Un servizio per locale: due righe per lo stesso servizio vorrebbero dire due
-- verita' sullo stesso telefono, e la prima che si legge vince.
CREATE UNIQUE INDEX "VenueServizio_venueId_servizio_key" ON "VenueServizio"("venueId", "servizio");
CREATE INDEX "VenueServizio_servizio_attivo_idx" ON "VenueServizio"("servizio", "attivo");

ALTER TABLE "VenueServizio"
  ADD CONSTRAINT "VenueServizio_venueId_fkey"
  FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE CASCADE ON UPDATE CASCADE;
