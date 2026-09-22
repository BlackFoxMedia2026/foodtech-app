-- La caparra sulla prenotazione.
--
-- E la richiesta numero uno contro i no-show e la frase con cui i concorrenti
-- vendono («fino all'80% di no-show in meno»). In Tavolo `Booking.depositCents`
-- e `depositStatus` stavano nello schema dal primo giorno: `depositCents` era
-- **un numero che si scriveva a mano** e nessuno incassava niente.
--
-- I binari c'erano gia: il conto al tavolo si paga con Stripe, con addebito
-- diretto sull'account del ristorante (`server/pagamenti-tavolo.ts`). Qui si
-- riusano — non un secondo modo di incassare, che sarebbe un secondo posto
-- dove il denaro puo sbagliare.
--
-- Additiva: cinque colonne con un valore per difetto e un valore in piu su un
-- enum. Niente si accende da solo: `caparraAttiva` nasce falsa.
ALTER TABLE "Venue"
  ADD COLUMN IF NOT EXISTS "caparraAttiva" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "caparraDaPersone" INTEGER NOT NULL DEFAULT 8,
  ADD COLUMN IF NOT EXISTS "caparraPerPersonaCents" INTEGER,
  ADD COLUMN IF NOT EXISTS "caparraFissaCents" INTEGER,
  ADD COLUMN IF NOT EXISTS "caparraOreAnnulloGratis" INTEGER NOT NULL DEFAULT 48;

-- «Chiesta e non pagata» e uno stato vero, e serve in sala: la prenotazione
-- c'e, il tavolo e tenuto, e il denaro non e arrivato. Senza questo valore
-- quella riga sarebbe indistinguibile da una senza caparra — e chi guarda
-- l'agenda non saprebbe quale tavolo sta rischiando.
ALTER TYPE "DepositStatus" ADD VALUE IF NOT EXISTS 'REQUESTED';
