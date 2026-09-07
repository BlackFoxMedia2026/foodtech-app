# Integrazioni

Stato al 7 settembre 2026. Ogni voce dice se il codice esiste, non se la tabella esiste.

## Attive

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

| Integrazione | Cosa esiste | Cosa manca |
|---|---|---|
| **Stripe** | la dipendenza in `package.json`, `Payment.stripePaymentId`, `Booking.depositCents`/`depositStatus` | **tutto il codice**. Zero riferimenti in `src/` |
| **POS** | `POSConnector`, `POSEvent` | tutto |
| **Connettori generici** | `Connector`, `ConnectorEvent` | tutto |
| **Centralino / voce** | `CallLog`, `MissedCall`, `VoiceBookingDraft` | tutto |
| **Wi-Fi captive portal** | `WifiLead`, `WifiSession` | tutto |
| **WhatsApp / SMS** | il posto in `PROVIDERS` con la firma giusta (`src/server/messaging/send.ts`) | il fornitore. Aggiungerlo non tocca nient'altro; finché non c'è, chi chiama riceve `no_channel` e nessuna interfaccia li offre |
| **Reserve with Google** | `BookingSource.GOOGLE` | tutto |

## Come si aggiunge un'integrazione

Il progetto non ha ancora un livello connettori generico, e non conviene inventarlo prima di
averne due o tre concrete. La forma che funziona oggi, da seguire:

1. **Un'interfaccia** in `src/server/<area>/<nome>-provider.ts` che dichiara cosa serve al
   dominio, scritta guardando il dominio e non l'API del fornitore.
2. **Un adattatore** `<fornitore>-adapter.ts` che la implementa.
3. **Chiave assente = funzione disattivata**, mai un errore. È la convenzione del progetto e
   permette di clonare il repository e lavorare senza credenziali.
4. **Gli eventi in entrata** passano da una route sotto `/api/webhooks/`, sempre autenticata, e
   vengono scritti su `WebhookEvent` prima di essere interpretati: così un payload che non si
   riesce a leggere resta comunque recuperabile.
5. **Il lavoro lungo va fuori dalla richiesta HTTP.** Vedi il limite di Brevo qui sopra.
