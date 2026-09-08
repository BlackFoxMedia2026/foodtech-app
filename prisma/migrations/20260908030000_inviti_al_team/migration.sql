-- Gli inviti al team.
--
-- `VenueMembership` la scriveva solo il seed: i cinque ruoli funzionavano e
-- non c'era modo di assegnarli. Tabella nuova, nessuna colonna toccata:
-- additiva in tutto e per tutto.
CREATE TABLE "VenueInvite" (
    "id" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" "StaffRole" NOT NULL DEFAULT 'RECEPTION',
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "invitedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VenueInvite_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "VenueInvite_token_key" ON "VenueInvite"("token");
CREATE INDEX "VenueInvite_venueId_acceptedAt_idx" ON "VenueInvite"("venueId", "acceptedAt");

ALTER TABLE "VenueInvite" ADD CONSTRAINT "VenueInvite_venueId_fkey"
    FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE CASCADE ON UPDATE CASCADE;
