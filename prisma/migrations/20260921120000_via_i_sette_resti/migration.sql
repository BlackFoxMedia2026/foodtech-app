-- I sette resti: tabelle sostituite da qualcosa che funziona.
--
-- Lo schema è il documento che chiunque apre per capire cosa fa il prodotto, e
-- una riga su quattro promette una cosa che non c'è. Il 17 settembre 2026 è
-- costato una tabella in più: `PhoneCall` è nata quarta perché `CallLog`,
-- `MissedCall` e `VoiceBookingDraft` erano lì e sembravano vive.
--
-- Cosa sostituisce cosa:
--   CallLog, MissedCall          → PhoneCall (+ PhoneCallEvent, VoiceCallback)
--   VoiceBookingDraft            → VoiceRecovery (il recupero della chiamata
--                                  interrotta, che funziona e si prova)
--   StaffShift                   → WorkShift
--   FloorDecor                   → RoomLayout.elements (JSON)
--   MessageTemplate              → i testi nel codice
--                                  (automations/catalogue.ts, campaign-templates.ts)
--   ExchangeRate + i campi fx    → niente: il multivaluta non è mai partito
--
-- ─────────────────────────────────────────────────────────────────────────────
-- LA GUARDIA, e perché è tutta la migrazione
--
-- Non posso guardare il database di produzione: qui dentro «sono vuote» è una
-- convinzione, non un fatto. Quindi il fatto lo verifica Postgres nell'istante
-- in cui la migrazione gira, e se trova **una riga sola** si ferma e dice
-- quale tabella e quante righe — senza cancellare niente, perché una
-- migrazione fallita si rimedia e una tabella cancellata no.
--
-- Vale anche per le colonne del multivaluta, che qui si **controllano e non si
-- cancellano**: `Payment.fx*` e `Organization.baseCurrency` escono dallo
-- schema con questa pubblicazione e dal database con la prossima. È la regola
-- di `prisma/migrations/README.md` — aggiungere prima, eliminare dopo — letta
-- al rovescio: mentre il deploy nuovo si costruisce, le istanze **vecchie**
-- stanno ancora servendo, e il loro client Prisma seleziona quelle colonne in
-- ogni lettura di un pagamento o di un'organizzazione. Cancellarle adesso
-- vorrebbe dire qualche minuto di errori su letture normalissime.
--
-- Le sette tabelle invece si possono cancellare subito: **nessuna riga di
-- codice le interroga**, quindi nessun client vecchio ci manda una query.
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  righe   bigint;
  trovato text := '';
  t       text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'CallLog', 'MissedCall', 'VoiceBookingDraft',
    'StaffShift', 'FloorDecor', 'MessageTemplate', 'ExchangeRate'
  ]
  LOOP
    EXECUTE format('SELECT count(*) FROM %I', t) INTO righe;
    IF righe > 0 THEN
      trovato := trovato || format('%s: %s righe; ', t, righe);
    END IF;
  END LOOP;

  SELECT count(*) INTO righe
  FROM "Payment"
  WHERE "fxAmountBaseCents" IS NOT NULL
     OR "fxBaseCurrency" IS NOT NULL
     OR "fxRateToBase" IS NOT NULL;
  IF righe > 0 THEN
    trovato := trovato || format('Payment con importi in valuta: %s righe; ', righe);
  END IF;

  SELECT count(*) INTO righe FROM "Organization" WHERE "baseCurrency" <> 'EUR';
  IF righe > 0 THEN
    trovato := trovato || format('Organization con valuta di base diversa da EUR: %s; ', righe);
  END IF;

  IF trovato <> '' THEN
    RAISE EXCEPTION
      'Non cancello niente: qui dentro ci sono dati. %Queste tabelle dovevano essere vuote (sostituite da PhoneCall, VoiceRecovery, WorkShift, RoomLayout, i testi nel codice). Guarda cosa contengono prima di decidere: se sono righe di demo si cancellano a mano e si ripete la migrazione, se sono dati veri la sostituzione non è completa e questa migrazione va rifatta.',
      trovato;
  END IF;
END $$;

-- ── Le tabelle ───────────────────────────────────────────────────────────────
-- `CallLog` prima di `VoiceBookingDraft`: la prima punta alla seconda.
DROP TABLE "CallLog";
DROP TABLE "MissedCall";
DROP TABLE "VoiceBookingDraft";
DROP TABLE "StaffShift";
DROP TABLE "FloorDecor";
DROP TABLE "MessageTemplate";
DROP TABLE "ExchangeRate";

-- ── I tipi rimasti senza nessuno ─────────────────────────────────────────────
-- Cinque enum che esistevano solo per queste tabelle. Lasciarli sarebbe
-- lasciare in giro `DecorKind` con diciannove valori di arredamento che non
-- arredano niente.
DROP TYPE "DecorKind";
DROP TYPE "TemplateCategory";
DROP TYPE "DraftStatus";
DROP TYPE "CallDirection";
DROP TYPE "CallStatus";
