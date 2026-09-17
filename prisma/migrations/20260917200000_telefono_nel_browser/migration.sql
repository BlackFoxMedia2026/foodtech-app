-- Il telefono nel browser: dove registrarsi e con che credenziale.
--
-- Sui locale e non sull'utente perché il telefono del ristorante è **uno**:
-- chi è in sala risponde da qualunque schermo, e squilla su tutti quelli
-- aperti. Una credenziale per persona darebbe un telefono a testa, che è il
-- contrario di come si risponde in un ristorante.
--
-- La password è cifrata a riposo (`lib/cifratura.ts`) e va guardata in faccia:
-- deve essere **riletta e mandata al browser**, perché SIP.js si autentica da
-- solo. Non si può ridurre a un'impronta come la password di una persona.
ALTER TABLE "Venue" ADD COLUMN IF NOT EXISTS "phoneSipServer" TEXT;
ALTER TABLE "Venue" ADD COLUMN IF NOT EXISTS "phoneSipUser" TEXT;
ALTER TABLE "Venue" ADD COLUMN IF NOT EXISTS "phoneSipPassword" TEXT;
