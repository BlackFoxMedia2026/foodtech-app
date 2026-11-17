-- Le registrazioni di «Nuova persona» salvate a metà, da riprendere dopo.
CREATE TABLE "StaffBozza" (
    "id" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "dati" JSONB NOT NULL,
    "passo" TEXT NOT NULL,
    "nome" TEXT NOT NULL DEFAULT '',
    "creataDa" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "StaffBozza_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "StaffBozza_venueId_updatedAt_idx" ON "StaffBozza"("venueId", "updatedAt");

ALTER TABLE "StaffBozza" ADD CONSTRAINT "StaffBozza_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE CASCADE ON UPDATE CASCADE;
