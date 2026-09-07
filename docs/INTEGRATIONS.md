# Integrazioni

Stato al 7 settembre 2026. Ogni voce dice se il codice esiste, non se la tabella esiste.

## Attive

### Brevo — invio campagne email · BETA

`src/server/marketing/brevo-adapter.ts` (205 righe) più `email-provider.ts` come interfaccia.
Sincronizza i contatti, crea e invia la campagna, riceve gli eventi via webhook autenticato
(`/api/webhooks/brevo?token=…`) e li scrive su `WebhookEvent` e `MessageLog`.

**Chiavi:** `BREVO_API_KEY`, `BREVO_WEBHOOK_TOKEN`, `BREVO_FROM_EMAIL`, `BREVO_FROM_NAME`.
Vuote = funzione disattivata, non errore.

**Limite noto e serio:** `prepareRecipients` fa una chiamata a Brevo **più** una scrittura su
database **per ogni ospite**, in sequenza, dentro la richiesta HTTP. Con qualche centinaio di
ospiti la funzione viene interrotta a metà: contatti sincronizzati in parte, campagna in stato
incoerente, nessuna ripresa. Prima di aprire le campagne a liste vere serve una coda.

### Resend — email trasazionali · LIVE

`src/server/emails.ts`. Quattro messaggi: conferma prenotazione, avviso di prenotazione in
attesa, contratto in scadenza, contratto scaduto.

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

Una sola pianificazione, in `vercel.json`: `/api/cron/staff-contracts-expiry` ogni giorno alle
6:00. Protetta da `CRON_SECRET` e **si rifiuta di partire** se il segreto non è configurato.

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
