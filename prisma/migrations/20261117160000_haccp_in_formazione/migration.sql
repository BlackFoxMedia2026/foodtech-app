-- Gli attestati HACCP caricati fra i documenti obbligatori prima di questa
-- versione diventano anche un corso HACCP in Formazione, come quelli nuovi.
INSERT INTO "StaffTraining" ("id", "venueId", "waiterId", "kind", "expiresAt", "certificateDocumentId", "createdAt", "updatedAt")
SELECT 'haccp_' || d."id", d."venueId", d."waiterId", 'HACCP', d."expiresAt", d."id", d."createdAt", CURRENT_TIMESTAMP
FROM "StaffDocument" d
WHERE d."category" = 'ATTESTATO_HACCP'
  AND NOT EXISTS (SELECT 1 FROM "StaffTraining" t WHERE t."certificateDocumentId" = d."id");
