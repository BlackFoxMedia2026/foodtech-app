# Integrazioni

Stato al 7 settembre 2026. Ogni voce dice se il codice esiste, non se la tabella esiste.

## Attive

### Amazon SES — invio delle newsletter · DIETRO INTERRUTTORE

`src/server/dem/ses.ts`, e **solo** quello: è l'unico file del progetto che sa da dove escono
le email. Uno spazio isolato per cliente, un insieme di configurazione per cliente, un
sottodominio di invio per cliente. Gli esiti tornano a `/api/webhooks/ses`, con verifica della
firma.

**Chiavi:** `DEM_SES_ENABLED`, `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`,
`AWS_ACCOUNT_ID`, `SES_EVENT_SNS_TOPIC_ARN`. Senza l'interruttore le campagne passano da Brevo.

**Al cliente non compare mai**: né il nome, né un messaggio d'errore, né una sigla. Vedi
[DEM.md](DEM.md).

### Stripe — abbonamenti del modulo DEM · LIVE quando ci sono le chiavi

Stesse chiavi dei pagamenti al tavolo, **senza** `perConto()`: qui incassa la piattaforma, non
il ristorante. `src/server/dem/stripe-dem.ts`, eventi sullo stesso webhook.

### Brevo — invio campagne email · LIVE

`src/server/marketing/brevo-adapter.ts` (205 righe) più `email-provider.ts` come interfaccia.
Sincronizza i contatti, crea e invia la campagna, riceve gli eventi via webhook autenticato
(`/api/webhooks/brevo?token=…`) e li scrive su `WebhookEvent` e `MessageLog`.

**Chiavi:** `BREVO_API_KEY`, `BREVO_WEBHOOK_TOKEN`, `BREVO_FROM_EMAIL`, `BREVO_FROM_NAME`.
Vuote = funzione disattivata, non errore.

**Il limite che c'era:** la sincronizzazione dei contatti stava dentro la richiesta HTTP, una
chiamata per ospite. Con qualche centinaio di ospiti la funzione veniva interrotta a metà:
contatti sincronizzati in parte, campagna in stato incoerente, nessuna ripresa. Ora l'invio
è un lavoro in coda (`campaign.send`, vedi ARCHITECTURE.md): lotti di venticinque contatti,
ripresa da dove era, e un segnaposto che impedisce un secondo invio se il lavoro muore dopo
aver dato l'ordine al fornitore.

**Quello che resta aperto:** una campagna programmata la fa partire Brevo all'ora indicata, e
nessuno riporta indietro il momento in cui è partita: lo stato resta «programmata» per sempre.

### Resend — email trasazionali · LIVE

`src/server/emails.ts`. Quattro messaggi: conferma prenotazione, avviso di prenotazione in
attesa, contratto in scadenza, contratto scaduto. Promemoria e richieste di parere passano da
`src/server/messaging/send.ts`, che li mette in coda.

**Attenzione a come si legge la risposta:** il client di Resend non solleva un errore quando
l'invio viene rifiutato — torna un oggetto con `error` dentro e `data` vuoto. Il codice
guardava solo `data?.id`, quindi con una chiave non valida i promemoria risultavano «inviati».
`esitoResend` pretende un identificativo e solleva altrimenti.

**Chiavi:** `RESEND_API_KEY`, `RESEND_FROM`. Senza chiave scrive in console e non fallisce.

**Promemoria:** dal 7 settembre 2026 partono 24 ore e 3 ore prima del servizio
(`src/server/reminders.ts`, cron ogni 15 minuti), con link firmati per
confermare o annullare. Passano da `src/server/messaging/send.ts`, che registra
tutto su `MessageLog` e non manda due volte la stessa cosa.

**Sondaggio dopo la visita:** il giorno dopo, una domanda sola con un link a
token unico (`src/server/surveys.ts`, cron alle 11:00).

**Manca ancora:** nessuna email su modifica o annullo fatti dallo staff.

### OpenAI — agente in-app · BETA

`src/server/ai/openai-adapter.ts`, modello da `OPENAI_MODEL` (per difetto `gpt-4o-mini`).
Dettagli in [AI_AGENT.md](AI_AGENT.md).

**Chiavi:** `OPENAI_API_KEY`, `OPENAI_MODEL`. **Non sono in `.env.example`:** chi clona il
repository non sa che l'agente esiste. Da aggiungere.

**Un solo fornitore, nessun ripiego:** se OpenAI non risponde, l'agente non risponde.
`llm-provider.ts` è l'interfaccia da cui passare per aggiungerne altri.

### Vercel Blob — file caricati · LIVE

Foto dei camerieri, piantine delle sale, immagini delle campagne, documenti dei contratti.
Le route di upload sono limitate a 20 richieste al minuto.

### Vercel Cron · LIVE

Quattro pianificazioni, in `vercel.json`:

| Percorso | Quando | Cosa fa |
|---|---|---|
| `/api/cron/jobs` | ogni minuto | smaltisce la coda dei lavori (messaggi, invii campagna) |
| `/api/cron/booking-reminders` | ogni 15 minuti | prepara i promemoria dovuti e li mette in coda |
| `/api/cron/staff-contracts-expiry` | 6:00 | avvisi sui contratti in scadenza |
| `/api/cron/survey-requests` | 11:00 | chiede «com'è andata?» a chi è venuto ieri |
| `/api/cron/automations` | 10:00 | accoda le automazioni accese (compleanno, chi non torna, invito a tornare) |

Tutte protette da `CRON_SECRET`, e tutte **si rifiutano di partire** se il segreto non è
configurato: meglio un cron fermo che un endpoint che chiunque trovi l'URL può innescare.

## Dichiarate ma non implementate

Aggiornata il 21 settembre 2026. Cinque righe di questa tabella erano **false**:
centralino, Wi-Fi e SMS sono stati costruiti nel frattempo, e le tre tabelle
del telefono citate qui sotto sono state cancellate. Un documento che dichiara
mancante una cosa che c'è manda a costruirla due volte.

| Integrazione | Cosa esiste | Cosa manca |
|---|---|---|
| **Stripe** | `server/stripe-connect.ts`, `pagamenti-tavolo.ts`, `conto-tavolo.ts` (il conto al tavolo) e **`caparre.ts`** dal 22 settembre 2026: la caparra si chiede, il link parte per SMS, il pagamento la marca pagata nella stessa transazione, e si restituisce con un gesto. `Booking.depositCents`/`depositStatus` erano dichiarati e non scritti: adesso li scrive questo | la caparra **chiesta da sola** dal widget pubblico: oggi la chiede la sala con un clic. E `Payment.fx*` per il multivaluta, che non e mai partito |
| **SMS** | **fatto**: `server/messaging/sms.ts` (Brevo, lo stesso account delle email). Promemoria a chi ha lasciato solo il numero, conferma di chi prenota al telefono, link per riprendere una chiamata interrotta | niente di tecnico. Servono **due interruttori**: `BREVO_SMS_SENDER=locale` (il canale esiste su questa installazione; il mittente e il nome di ogni ristorante, undici caratteri alfanumerici tagliati fra le parole) e `Venue.smsAttivi` per ogni locale che vuole usarlo, spento per difetto — perche un SMS si paga e in produzione vivono anche i locali vetrina con numeri inventati. Da spento il registro dice `SKIPPED` col testo che sarebbe partito |
| **WhatsApp** | il posto in `PROVIDERS` con la firma giusta, e `canalePerTelefono()` che lo preferirà da sé appena c'è | un account WhatsApp Business e un **modello approvato da Meta per ogni tipo di messaggio**: fuori dalle 24 ore da un messaggio del cliente un testo libero non si può mandare, ed è una regola del canale. Finché non c'è, quei messaggi partono come SMS |
| **Centralino / voce** | **fatto**: `server/voice/**`, `api/v1/telefonia/**`, il centralino in `blackfox-voice`. Risponde, riconosce chi chiama, prende e disdice prenotazioni, controlla la disponibilità | la prova con una telefonata vera sulla linea del cliente |
| **Wi-Fi captive portal** | **fatto**: `server/wifi.ts`, `/wifi/[slug]`, `WifiLead` | `WifiSession` resta vuota di proposito (vedi `ARCHITECTURE.md`) |
| **POS** | dal 23 settembre 2026 la **piattaforma integrazioni** ([INTEGRATION-PLATFORM.md](INTEGRATION-PLATFORM.md)) e l'adattatore **Lightspeed K-Series**, scritto sulla documentazione ufficiale e mai provato con un account vero (anteprima). `POSConnector`/`POSEvent` sono superate | il client OAuth partner di Lightspeed e la prova dal vivo; gli adattatori delle altre casse |
| **Connettori generici** | la piattaforma integrazioni: catalogo, installazione per locale, credenziali cifrate, sincronizzazione, webhook idempotenti. `Connector`/`ConnectorEvent` sono superate | un adattatore per canale e un accordo commerciale per ognuno |
| **Reserve with Google** | `BookingSource.GOOGLE` | tutto: serve un account partner |
| **Eventi e gruppi** | **fatto** il 22 settembre 2026: `server/eventi.ts`, `/eventi`, `POST /api/v1/telefonia/evento`. Richiesta → preventivo → accettata, e la prenotazione nasce marcata come evento (`isGroup`, `eventType`, `budgetCents`: i tre campi che nessuno scriveva) | l'**acconto**: serve un incasso vero, e quando ci sarà sta sulla prenotazione. Un campo «acconto» che nessuno può incassare è una promessa scritta nello schema e mantenuta da nessuno |
| **Importazione da un altro gestionale** | **fatta**: `/settings/importa`, `lib/import-csv.ts`, `server/importazione.ts`. CSV con clienti, prenotazioni o entrambi; anteprima che non scrive; ricaricare lo stesso file non duplica | niente. Le colonne non riconosciute si elencano nella schermata: si aggiungono a `ALIAS` quando un file vero ne porta di nuove |

## Come si aggiunge un'integrazione

**Un collegamento che il ristoratore installa sul proprio locale** (la sua cassa, il suo
account Mailchimp, il suo portale) passa dalla piattaforma integrazioni: vedi
[INTEGRATION-PLATFORM.md](INTEGRATION-PLATFORM.md), §11. Rotte, interfaccia, cifratura e
webhook ci sono già; si scrive l'adattatore.

**Un fornitore che Foodtech usa per tutti** (le email che spediamo noi, l'agente, i file)
resta nella forma di sempre:

1. **Un'interfaccia** in `src/server/<area>/<nome>-provider.ts` che dichiara cosa serve al
   dominio, scritta guardando il dominio e non l'API del fornitore.
2. **Un adattatore** `<fornitore>-adapter.ts` che la implementa.
3. **Chiave assente = funzione disattivata**, mai un errore. È la convenzione del progetto e
   permette di clonare il repository e lavorare senza credenziali.
4. **Gli eventi in entrata** passano da una route sotto `/api/webhooks/`, sempre autenticata, e
   vengono scritti su `WebhookEvent` prima di essere interpretati: così un payload che non si
   riesce a leggere resta comunque recuperabile.
5. **Il lavoro lungo va fuori dalla richiesta HTTP.** Vedi il limite di Brevo qui sopra.
