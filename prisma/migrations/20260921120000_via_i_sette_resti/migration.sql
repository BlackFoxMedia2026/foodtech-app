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
-- LA GUARDIA, e cosa ha trovato
--
-- Non posso guardare il database di produzione: la prima versione di questa
-- migrazione contava **tutte** le righe e si fermava se ne trovava una. Il 21
-- settembre 2026 si è fermata davvero, e ha detto cosa c'era:
--
--     CallLog: 2, MissedCall: 2, VoiceBookingDraft: 2,
--     StaffShift: 6, FloorDecor: 8, MessageTemplate: 8
--     (ExchangeRate vuota, nessun pagamento in valuta, nessuna
--      organizzazione con valuta di base diversa da EUR)
--
-- Sono le righe del **seed della vetrina di aprile 2026**, l'unica cosa che le
-- ha mai scritte (vedi `docs/TAVOLO-VOICE-ARCHITECTURE.md`: «chi la scrive:
-- solo la demo; chi la legge: nessuno»). Il seed che le scriveva non esiste
-- più nel repository, e il lavoro del telefono di settembre ha creato tabelle
-- nuove **proprio perché** queste erano morte.
--
-- Quindi la guardia adesso non chiede «sono vuote?» ma la domanda che conta:
-- **qualcuno ha ricominciato a scriverci?** Una riga da giugno in poi
-- significa che l'assunto qui sopra è falso — che una di queste tabelle è
-- tornata viva — e allora la migrazione si ferma come si è fermata prima.
--
-- La soglia è una data e non un conteggio perché un conteggio invecchia: se
-- domani il seed della vetrina ne scrive nove invece di otto, un controllo sul
-- numero si fermerebbe per niente. Una riga **recente** invece è sempre la
-- cosa che deve far fermare tutto.
--
-- Le colonne del multivaluta qui si **controllano e non si cancellano**:
-- `Payment.fx*` e `Organization.baseCurrency` escono dallo schema con questa
-- pubblicazione e dal database con la prossima. È la regola di
-- `prisma/migrations/README.md` — aggiungere prima, eliminare dopo — letta al
-- rovescio: mentre il deploy nuovo si costruisce, le istanze **vecchie**
-- stanno ancora servendo, e il loro client Prisma seleziona quelle colonne in
-- ogni lettura di un pagamento o di un'organizzazione. Cancellarle adesso
-- vorrebbe dire qualche minuto di errori su letture normalissime.
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  righe   bigint;
  trovato text := '';
  t       text;
  -- Da qui in poi nessun codice ha scritto queste tabelle: il seed della
  -- vetrina è di aprile, e da maggio in poi il telefono ha usato `PhoneCall`.
  soglia  timestamp := '2026-06-01';
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'CallLog', 'MissedCall', 'VoiceBookingDraft',
    'StaffShift', 'FloorDecor', 'MessageTemplate'
  ]
  LOOP
    EXECUTE format('SELECT count(*) FROM %I WHERE "createdAt" >= $1', t)
      INTO righe USING soglia;
    IF righe > 0 THEN
      trovato := trovato || format('%s: %s righe recenti; ', t, righe);
    END IF;
  END LOOP;

  -- `ExchangeRate` non ha `createdAt`: la data del cambio è `fetchedAt`.
  SELECT count(*) INTO righe FROM "ExchangeRate" WHERE "fetchedAt" >= soglia;
  IF righe > 0 THEN
    trovato := trovato || format('ExchangeRate: %s cambi recenti; ', righe);
  END IF;

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
      'Non cancello niente: qualcuno ha ricominciato a usare queste tabelle. %Dovevano essere morte da maggio 2026 — sostituite da PhoneCall, VoiceRecovery, WorkShift, RoomLayout e dai testi nel codice — e una riga recente dice che non e cosi. Guarda chi le scrive prima di decidere: se e codice nuovo, questa migrazione va rifatta.',
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
