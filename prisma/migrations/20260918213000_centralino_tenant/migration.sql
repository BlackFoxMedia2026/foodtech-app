-- Come un locale si chiama nel centralino.
--
-- Lo dichiara il centralino insieme alle sue linee. Serve al verso opposto:
-- con questo, il pannello di piattaforma puo' chiedere al centralino di
-- assegnare un numero a un locale, invece di far aprire il secondo gestionale
-- a chi accende un cliente.
ALTER TABLE "Venue" ADD COLUMN "centralinoTenantId" TEXT;
