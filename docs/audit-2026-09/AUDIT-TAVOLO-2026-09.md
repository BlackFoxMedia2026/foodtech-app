# Tavolo (foodtech-app) — Audit tecnico e di prodotto

**Data:** 7 settembre 2026
**Commit auditato:** `c6a1a82` (`main`, merge PR #12) — 64 commit totali
**Repo:** `BlackFoxMedia2026/foodtech-app` · **Produzione:** https://foodtech-app.vercel.app
**Ambiente di prova:** locale, Next.js 14.2.18 su `http://localhost:3001`, PostgreSQL 18 (`tavolo_app_dev`), dati del seed demo
**Screenshot allegati:** 28 file in `screenshots/` (elenco e didascalie in appendice A)

---

## 0. Come leggere questo documento

Questo è un audit di stato su un prodotto **funzionante e già online**, non su un prototipo. Il codice è ordinato: `tsc --noEmit` e `next lint` passano senza un solo avviso, e a runtime non c'è un errore JavaScript. I problemi che seguono non sono "codice scritto male": sono **buchi di copertura, di permessi e di processo di rilascio**.

Ogni rilievo indica: come è stato verificato, il file e la riga, e la conseguenza pratica. Dove non ho potuto verificare, lo dico. La gravità è un mio giudizio, non un dato.

**Convenzione:** 🔴 alta (blocca la produzione o perde dati) · 🟠 media (danno reale ma circoscritto) · 🟡 bassa (rifinitura).

---

## 1. Sintesi in una pagina

Tavolo è un gestionale per l'ospitalità multi-tenant (organizzazione → locale → membri con ruoli). Sono **26.000 righe** di TypeScript: 25 pagine, 46 route API, 115 componenti, 21 moduli di dominio, uno schema Prisma da 1.955 righe con **72 modelli**.

Tre fatti riassumono lo stato:

1. **Lo schema promette cinque volte il prodotto che esiste.** 43 dei 72 modelli non sono citati in una sola riga di codice applicativo. Menu, ordini, food cost, waitlist, recensioni, sondaggi, coupon, gift card, fidelity, automazioni, POS, centralino telefonico, captive-portal wifi: tabelle pronte, zero codice.
2. **Il rilascio in produzione può cancellare dati.** Lo script di build esegue `prisma db push --accept-data-loss` a ogni deploy, senza migrazioni versionate. Basta che un collega rinomini una colonna perché il deploy successivo cancelli la colonna vera con i dati dentro.
3. **La matrice dei permessi esiste ma non è applicata dove serve.** Dieci endpoint di scrittura verificano la sessione e il locale, ma non il ruolo: un membro `READ_ONLY` può creare, modificare ed eliminare camerieri, tavoli e ospiti.

Aggiungo un problema commerciale, non tecnico: **la demo online è vuota**. Il seed genera prenotazioni relative al giorno in cui gira (dal 1 luglio al 14 agosto 2026); oggi ogni schermata mostra zero. Chi apre il link vede un prodotto morto (screenshot `01`, `02`, `12`, `13`).

Il lavoro fatto è però solido dove c'è: il controllo di disponibilità server-side regge ancora dopo tre PR di terzi (45/45 asserzioni verdi, riprovato via API oggi), l'assegnazione tavoli gestisce le collisioni con lock e 409, la modalità forced-colors di Windows è rispettata, lo schema ha 82 indici dichiarati.

---

## 2. Che cosa esiste davvero (copertura codice ↔ schema)

Metodo: per ognuno dei 72 modelli Prisma ho contato le occorrenze di `db.<modello>.` e `tx.<modello>.` in `src/`.

### 2.1 Modelli usati dal codice (29 su 72)

| Modello | Occorrenze | Modello | Occorrenze |
|---|---|---|---|
| Table | 20 | AgentConversation | 5 |
| Room | 18 | VenueMembership | 4 |
| Booking | 18 | StaffAssignment | 4 |
| Venue | 17 | AgentMessage | 4 |
| Guest | 17 | MessageLog | 3 |
| WaiterAssignment | 15 | WebhookEvent | 2 |
| StaffContract | 13 | StaffContractReminder | 2 |
| Waiter | 12 | GuestProviderLink | 2 |
| Campaign | 10 | ConsentLog | 2 |
| Shift | 6 | AgentUsage | 2 |
| QrCode | 6 | User | 1 |
| Notification | 6 | TableBlock | 1 |
| ContractDocument | 6 | RoomLayout | 1 |
| | | Payment | 1 |
| | | OrgMembership | 1 |
| | | Experience | 1 |

Le ultime cinque voci (una sola occorrenza) sono di fatto sola lettura: `Payment` è letto solo per riempire la pagina Pagamenti, `Experience` solo per elencare le esperienze.

### 2.2 Modelli con zero codice (43 su 72)

```
ApiToken · AuditLog · AutomationRun · AutomationWorkflow · BookingEvent
BookingPreorder · BookingPreorderItem · CallLog · ChatMessage · ChatSession
Connector · ConnectorEvent · CostEntry · Coupon · CouponRedemption
ExchangeRate · FloorDecor · GiftCard · GiftCardRedemption · LoyaltyTransaction
MenuCategory · MenuItem · MenuItemCost · MenuScan · MessageTemplate
MissedCall · Order · OrderItem · Organization · POSConnector · POSEvent
Review · ReviewLink · ReviewLinkClick · Session · StaffShift · Survey
SurveyResponse · Ticket · VoiceBookingDraft · WaitlistEntry · WifiLead · WifiSession
```

Raggruppati per modulo mancante:

| Modulo dichiarato | Tabelle pronte | Codice |
|---|---|---|
| Menu → ordini → food cost | MenuCategory, MenuItem, MenuItemCost, Order, OrderItem, CostEntry, MenuScan | nessuno |
| Recensioni e sondaggi | Review, ReviewLink, ReviewLinkClick, Survey, SurveyResponse | nessuno |
| Fidelity, coupon, gift card | LoyaltyTransaction, Coupon, CouponRedemption, GiftCard, GiftCardRedemption | nessuno |
| Waitlist / lista d'attesa | WaitlistEntry | nessuno |
| Automazioni | AutomationWorkflow, AutomationRun, MessageTemplate | nessuno |
| Centralino / voce | CallLog, MissedCall, VoiceBookingDraft | nessuno |
| POS e connettori | POSConnector, POSEvent, Connector, ConnectorEvent | nessuno |
| Captive portal wifi | WifiLead, WifiSession | nessuno |
| Biglietti esperienze | Ticket | nessuno |
| Preordini | BookingPreorder, BookingPreorderItem | nessuno |
| Tracciabilità | AuditLog, BookingEvent | nessuno |
| Chat ospiti | ChatSession, ChatMessage | nessuno |

### 2.3 Gusci vuoti nell'interfaccia

- **`/reports` "Segnalazioni"** — 19 righe, testo fisso «Nessuna segnalazione registrata ancora.», nessuna query. Il modello `Ticket` non è mai letto. **Inoltre la voce non è in navigazione** (`src/components/shell/header.tsx:31-39`): è una rotta orfana raggiungibile solo scrivendo l'URL. Screenshot `16`.
- **`/payments` "Pagamenti"** — legge `Payment` (0 righe in tabella) e mostra tre contatori a zero. **Stripe non è implementato:** l'unica occorrenza della stringa "stripe" in tutto il progetto è la dipendenza in `package.json:52`. Screenshot `12`.
- **`/waiters` "Camerieri"** — il modulo è invece pieno e recente (dialoghi profilo, contratti, assegnazioni, ricerca per ruolo), ma il seed non crea nemmeno un cameriere: appare vuoto. Screenshot `05`.

---

## 3. Sicurezza e permessi

### 🔴 S1 — Dieci endpoint di scrittura non controllano il ruolo

La matrice delle capacità esiste e funziona (`src/lib/tenant.ts:44-62`: `manage_staff`, `manage_bookings`, `view_revenue`, `edit_marketing`, `manage_contracts`, `manage_venue`) e viene applicata correttamente in 22 route. In queste no:

| Route | Metodi | `can()` |
|---|---|---|
| `/api/waiters` | GET, POST | assente |
| `/api/waiters/[id]` | GET, PATCH, DELETE | assente |
| `/api/waiters/[id]/photo` | POST | assente |
| `/api/waiter-assignments` | scrittura | assente |
| `/api/waiter-assignments/table` | scrittura | assente |
| `/api/tables` | GET, POST | assente |
| `/api/tables/[id]` | PATCH, DELETE | assente |
| `/api/guests` | GET, POST | assente |
| `/api/guests/[id]` | GET, PATCH | assente |
| `/api/staff/eligible` | GET | assente |

Esempio, `src/app/api/waiters/route.ts:11-14`:

```ts
export async function POST(req: Request) {
  const ctx = await getActiveVenue();     // sessione + locale: ok
  const body = await req.json();          // nessun can(ctx.role, "manage_staff")
  const created = await createWaiter(ctx.venueId, body);
```

**Conseguenza:** un membro con ruolo `READ_ONLY` (che nella matrice non ha nessuna capacità) o `WAITER` può creare e cancellare camerieri, riscrivere la pianta dei tavoli e modificare le schede degli ospiti. L'isolamento fra locali regge — `venueId` viene sempre dal contesto server, mai dal corpo della richiesta — quindi il danno resta dentro il proprio locale.

**Fix:** una riga per route, `if (!can(ctx.role, "…")) return NextResponse.json({error:"forbidden"},{status:403})`, com'è già fatto in `src/app/api/bookings/[id]/assign-table/route.ts:23-25`.

### 🟠 S2 — Le API non autenticate rispondono 307 verso `/sign-in`, non 401

`getActiveVenue()` usa `redirect()` (`src/lib/tenant.ts:13, 26`), pensato per le pagine. Nelle route API diventa una risposta di redirect. Verificato:

```
$ curl -i http://localhost:3001/api/waiters
HTTP/1.1 307 Temporary Redirect
location: /sign-in

$ curl -X POST http://localhost:3001/api/tables -d '{"label":"X","seats":2}'
307
```

**Conseguenza:** quando la sessione scade, il `fetch` del client segue il redirect, riceve l'HTML della pagina di login e `res.json()` esplode con un errore di parsing. L'utente vede un messaggio incomprensibile invece di «sessione scaduta, rientra».

### 🟠 S3 — Nessun limite di frequenza sugli endpoint pubblici

`grep` su tutto `src/` per `rateLimit|ratelimit|upstash`: **zero risultati**. `POST /api/public/bookings` accetta prenotazioni senza autenticazione, senza captcha, senza verifica di email o telefono, e senza limite per IP. Il controllo di disponibilità impedisce la prenotazione *impossibile*, non quella *finta*: un bot può saturare la capienza di tutti i turni con indirizzi inventati. Lo stesso vale per `GET /api/public/availability`, che espone la disponibilità di un locale a chiunque conosca l'id.

### 🟠 S4 — `force: true` bypassa il limite di posti, è raggiungibile e non lascia traccia

`POST /api/bookings/[id]/assign-table` accetta `force` dal corpo della richiesta (`route.ts:34`) e in `src/server/booking-floor.ts:88` la usa per saltare il controllo `table.seats < booking.partySize`. Nessun componente client lo invia (`grep "force: true"` in `src/components`: zero). Quindi è un override:
- non documentato,
- disponibile a **chiunque** abbia `manage_bookings` — quindi anche al ruolo `WAITER`,
- senza registrazione di chi l'ha usato.

### 🟠 S5 — `AuditLog` esiste, non viene mai scritto

Prodotto multi-utente, con ruoli, contratti del personale e dati di ospiti (GDPR): zero tracciabilità di chi ha cancellato un cameriere o modificato una prenotazione. La tabella è già nello schema.

### 🟡 S6 — Nessun form ha `method="post"`: la password può finire nell'URL

Tutti i form del progetto sono `<form onSubmit={…}>` senza `method`, quindi in HTML valgono come GET. Se l'invio avviene **prima che React si sia idratato** il browser fa una GET con i campi in query string. Riprodotto involontariamente durante questo audit: la mia automazione ha cliccato "Accedi" troppo presto e l'URL è diventato

```
/sign-in?email=owner%40tavolo.demo&password=tavolo2026
```

Con un utente reale serve un dispositivo lento o una rete scadente, quindi la probabilità è bassa; la conseguenza no: la password finisce nella cronologia del browser, nei log di accesso di Vercel e nell'header `Referer`. Vale anche per il form pubblico di prenotazione (`public-booking-form.tsx:100`), dove in query string finirebbero nome, email e telefono dell'ospite.

**Fix:** aggiungere `method="post"` a `src/app/(auth)/sign-in/page.tsx:92` e ai form con dati personali. Un invio pre-idratazione diventa un 405 innocuo invece di una fuga di dati.

### 🟡 S7 — Credenziali demo note in produzione

Il seed crea `owner@tavolo.demo` / `tavolo2026` (`prisma/seed.ts:39`) e **gira a ogni build**, anche in produzione (vedi I1). Le credenziali sono nella documentazione interna e nella cronologia dei PR.

### ✅ Cose fatte bene

- Il cron è protetto correttamente e rifiuta di partire se `CRON_SECRET` non è configurato (`src/app/api/cron/staff-contracts-expiry/route.ts:14-21`).
- Il webhook Brevo verifica un token di query e risponde 401 (`src/app/api/webhooks/brevo/route.ts:5-10`).
- `venueId` non viene **mai** accettato dal client nelle route autenticate: arriva sempre da `getActiveVenue()`. È l'errore più comune nei SaaS multi-tenant ed è stato evitato.
- Le password usano bcrypt (`src/lib/auth.ts:20`), sessioni JWT.
- 22 file usano schemi Zod per validare gli input.

---

## 4. Rilascio e infrastruttura

### 🔴 I1 — Il build di produzione applica lo schema accettando la perdita di dati

`package.json`:

```json
"build": "prisma generate && prisma db push --accept-data-loss && (tsx prisma/seed.ts || true) && next build"
```

Non esiste la cartella `prisma/migrations`: **non c'è storico delle migrazioni**. `db push --accept-data-loss` allinea il database allo schema senza chiedere conferma. Con tre persone che lavorano in parallelo su branch separati e uno schema che è passato da 11 a 72 modelli in cinque settimane, lo scenario è concreto: qualcuno rinomina `federation_card_expires` in `card_expires_at`, il deploy passa, la colonna vecchia viene eliminata con tutto il contenuto. Nessun avviso, nessun rollback.

Peggiora il quadro il fatto che il build **fallisce silenziosamente** sul seed (`|| true`).

**Fix:** passare a `prisma migrate deploy` con migrazioni committate, e togliere il seed dal build di produzione. È il rilievo più urgente del documento.

### 🟠 I2 — Il seed gira in produzione

Non duplica i dati (c'è un guard su `Organization.slug = "casa-aurora"`, `prisma/seed.ts:30-34`), ma crea l'utente demo con password nota su un ambiente pubblico.

### 🟠 I3 — I dati demo sono statici e sono scaduti

Il seed genera prenotazioni relative al **giorno in cui viene eseguito**. Nel database locale:

```
prenotazioni: 1.158 · dalla più vecchia 2026-07-01 alla più recente 2026-08-14
oggi: 2026-09-07
```

Camerieri 0 · menu 0 · ordini 0 · recensioni 0 · waitlist 0 · pagamenti 0 · notifiche 0 · esperienze 2.

**Conseguenza:** su https://foodtech-app.vercel.app la Panoramica dice «Nessuna prenotazione per oggi», Prenotazioni «0 prenotazioni · 0 coperti», Analytics «Nessun dato disponibile», Camerieri «Nessun cameriere registrato». Il modulo più recente e più curato del prodotto — Camerieri, Room Builder, contratti — è invisibile a chi apre il link. Screenshot `01`, `02`, `05`, `12`, `13`.

**Fix:** seed con date relative a `now()` rieseguibile, oppure un job che ogni notte sposta le date demo in avanti.

### 🟡 I4 — Variabili d'ambiente dell'agente AI non documentate

L'agente usa OpenAI (`src/server/ai/openai-adapter.ts:4-6`: `OPENAI_API_KEY`, `OPENAI_MODEL`, default `gpt-4o-mini`). Nessuna delle due è in `.env.example`, che invece elenca Stripe, Resend, Brevo, cron e URL pubblico. Chi clona il repo non sa che l'agente esiste. In locale la chiave non c'è, quindi **l'agente non è stato provato in funzione**: ho verificato solo che il pannello si apre e mostra la quota (screenshot `81`).

---

## 5. Qualità e verifica

### 🔴 Q1 — Non esiste un test runner

Nessun vitest, jest, playwright, testing-library in `package.json`. L'unica verifica automatica è `scripts/check-availability-rules.ts`: 45 asserzioni sulle regole di disponibilità, scritte a mano, eseguite con `npm run check:availability`. **Oggi passano tutte** — quindi il controllo anti-overbooking ha resistito a tre PR di terzi, ed è una buona notizia.

Ma il perimetro coperto è solo quello. Senza test sono: camerieri, contratti e promemoria di scadenza, assegnazioni, Room Builder, wizard campagne, agente AI, notifiche, e **tutta la matrice dei permessi** (dove sta il rilievo S1).

La scelta di non introdurre un runner era stata deliberata a luglio, per non toccare le dipendenze condivise con Filippo e Vasile. A 26.000 righe e 72 modelli quel compromesso è scaduto: va deciso in squadra.

### ✅ Q2 — Verifiche superate oggi

| Controllo | Esito |
|---|---|
| `npm run typecheck` (`tsc --noEmit`) | pulito |
| `npm run lint` (`next lint`) | «No ESLint warnings or errors» |
| `npm run check:availability` | 45/45 |
| Errori JavaScript a runtime su 18 pagine | 0 |
| Errori di accessibilità in console | 34-40 (un unico difetto, vedi A1) |
| Prenotazione pubblica valida | 201 |
| Prenotazione pubblica alle 04:00 | 409 «Il locale non è aperto in questo orario» |
| `GET /api/public/availability` | slot corretti con `seatsLeft` e fuso `Europe/Rome` |

---

## 6. Interfaccia ed esperienza d'uso

### 🔴 U1 — Su schermo piccolo la navigazione è quasi inaccessibile

La barra è una fila orizzontale di 9 voci con `overflow-x-auto` (`src/components/shell/header.tsx:82`). Misurato con browser reale, larghezza visibile della barra contro larghezza del contenuto:

| Viewport | Contenuto | Visibile | Voci leggibili |
|---|---|---|---|
| 390 px (telefono) | 1120 px | 144 px | **1 su 9** — solo "Panoramica" |
| 768 px (tablet verticale) | 1120 px | 522 px | 4 su 9 |
| 1024 px (tablet orizzontale) | 1120 px | 762 px | 6 su 9 |
| 1440 px (desktop) | 1178 px | 1178 px | 9 su 9 |

Le altre voci esistono, ma si raggiungono **solo scorrendo la barra in orizzontale**, e non c'è nessun segno che si possa fare: nessuna sfumatura sul bordo, nessuna freccia, nessun menu alternativo. Sotto i ~1300 px la barra inizia a tagliare. Nello screenshot `m-overview` l'alone luminoso della sfera dell'agente arriva a sfiorare l'ultima voce visibile, peggiorando la leggibilità (i due elementi non si sovrappongono: la barra finisce a 208 px, la sfera inizia a 206 px).

Questo pesa perché `PRODUCT.md` descrive come utenti secondari «staff operativo (reception, sala) che vive nella dashboard tutto il giorno» — cioè persone con un telefono in mano in sala.

### 🟠 U2 — Il wizard del brand riparte a ogni caricamento di pagina

`src/app/(app)/layout.tsx:16` mostra il wizard quando `venue.onboardingStatus === "NOT_STARTED"`, e il componente parte con `useState(true)` (`brand-setup-dialog.tsx:24`). Il pulsante «Configura più tardi» chiude la finestra ma **non cambia lo stato sul server**: al ricaricamento successivo la finestra torna. Non c'è modo di rinviare davvero, se non completare il wizard. Screenshot `80`.

### 🟠 U3 — Il widget pubblico è fuori brand

È l'unica pagina che vede il cliente finale del ristorante, ed è l'unica rimasta con la **vecchia palette ember**: fondo giallo saturo a gradiente, card verde scuro, tipografia diversa, pulsante giallo. L'applicazione interna è verde bosco, crema e terracotta. Confronta screenshot `90` (widget) con `01` (app): sembrano due prodotti di due aziende. Screenshot `90`.

### 🟠 U4 — In Sala le etichette dei tavoli si sovrappongono

Nella fila superiore (T1…T8) la pillola «Non assegnato» è più larga del passo fra un tavolo e l'altro: le pillole si toccano e si accavallano, e coprono la dicitura «2 posti» del tavolo. Con 8 tavoli affiancati la fila diventa una striscia continua illeggibile. Screenshot `04`.

### 🟠 U5 — Il form interno di prenotazione non mostra la disponibilità

Il widget pubblico propone solo gli orari accettabili (`GET /api/public/availability`, aggiunto con la PR #9). Il form che usa **lo staff** (`/bookings/new`, screenshot `03`) ha un campo ora libero e nessun suggerimento: il conflitto si scopre solo dopo aver premuto «Crea prenotazione» e ricevuto il 409. Questa è la disparità più fastidiosa nell'uso quotidiano, perché lo staff prenota al telefono con il cliente in linea.

Collegato: `skipAvailabilityCheck` è predisposto nel modulo di disponibilità per la forzatura consapevole dello staff, ma **non ha ancora nessuna interfaccia**. È una decisione di prodotto rimasta aperta da luglio: quando il locale decide di accettare comunque, oggi non può.

### 🟡 U6 — Le pagine con pochi dati lasciano grandi vuoti

Prenotazioni, Pagamenti e Camerieri riempiono una fascia in alto e lasciano due terzi di schermo vuoto (screenshot `02`, `12`, `05`). Analytics invece gestisce bene il vuoto, con testi che spiegano cosa comparirà (screenshot `13`): quello è il modello da estendere agli altri.

### ✅ Fatto bene

- Nessuno sfondamento orizzontale su telefono: a 390 px `scrollWidth == clientWidth` su tutte le pagine provate.
- Gli stati vuoti di Analytics spiegano il perché, non dicono solo «nessun dato».
- L'agente AI ha suggerimenti di partenza pertinenti al dominio («Quali tavoli non hanno un cameriere?») e mostra la quota residua di messaggi.
- Il Room Builder e la pianta sala reggono zoom e trascinamento con indicazioni d'uso in basso a sinistra.

---

## 7. Accessibilità

`PRODUCT.md` dichiara **WCAG 2.1 AA** come standard, quindi questi rilievi sono scostamenti da un impegno preso.

### 🟠 A1 — Finestra di dialogo senza titolo accessibile

Unico difetto, ripetuto: `brand-setup-dialog.tsx` usa `DialogContent` senza `DialogTitle` né titolo nascosto. Radix lo segnala in console, e su **ogni** pagina visitata (34-40 messaggi in 18 pagine):

> `DialogContent` requires a `DialogTitle` for the component to be accessible for screen reader users.

Con uno screen reader la finestra si apre senza essere annunciata. È l'unico dialogo del progetto in questa condizione: gli altri 18 con `DialogContent` hanno il titolo.

### 🟡 A2 — Quattro immagini senza testo alternativo

`bookings-floor-canvas.tsx:90`, `qr-code-preview.tsx:49`, `floor-plan-dialog.tsx:98`, `floor-canvas.tsx:217`. Sono tag `<img>` grezzi, quindi manca anche l'ottimizzazione di `next/image`.

### ✅ A3 — Verifiche superate

- **forced-colors (alto contrasto Windows):** l'interfaccia si ricolora correttamente e resta interamente leggibile, comprese le card e i pulsanti. Screenshot `82-forced-colors`.
- **prefers-reduced-motion:** rispettato in 6 punti, incluse le animazioni dell'agente e del fondo. Screenshot `82-reduced-motion`.
- **Contrasto dei testi:** scansione automatica su 4 pagine (115 elementi di testo). **Nessuna violazione confermata.** I 6 casi segnalati sulla Panoramica sono falsi positivi: le card crema sono dipinte con `background-image` (texture «finish-parchment»), quindi lo strumento non riesce a leggere il colore di fondo e ripiega sul nero. Il testo reale è marrone scuro su crema. **Serve comunque un controllo manuale** su quelle superfici, perché nessuna scansione automatica può misurarle.

---

## 8. Prestazioni

### 🟠 P1 — Tre tabelle senza indice, una sul percorso critico

Lo schema ha 82 indici dichiarati, ma questi mancano:

| Tabella | Come viene interrogata | Indice |
|---|---|---|
| `Shift` | `venueId + weekday + active` a **ogni** verifica di disponibilità (`src/server/availability.ts:380`) | nessuno |
| `TableBlock` | per tavolo e intervallo, a ogni verifica di disponibilità | nessuno |
| `Campaign` | per `venueId` nella lista campagne | nessuno |

`Shift` è il caso che conta: sta sul percorso di ogni prenotazione, da sala, da API e dal widget pubblico. Oggi le righe sono poche e non si nota; con 200 locali per 7 giorni per 3 turni la scansione diventa misurabile. Sono tre righe di schema.

Anche `RoomLayout` e `Ticket` sono senza indice, ma vengono letti per chiave primaria: irrilevante.

### 🟡 P2 — Nessuna cache, tutto ricalcolato

17 pagine su 25 dichiarano `dynamic = "force-dynamic"` e non c'è **un solo** `revalidate` o `unstable_cache` in tutto il progetto. Ogni navigazione ricalcola tutto da database. È una scelta legittima per una dashboard operativa (i dati devono essere freschi), ma vale la pena verificarla su Analytics, che aggrega 90 giorni di prenotazioni a ogni caricamento.

Nota di contesto già nota alla squadra: se l'applicazione su Vercel gira in una regione lontana dal database, ogni query paga la latenza di rete moltiplicata per il numero di query. Va controllato che funzione e database siano entrambi in Europa (`fra1`).

---

## 9. Coerenza della documentazione

### 🟠 D1 — `DESIGN.md` e `PRODUCT.md` descrivono un prodotto di un altro colore

`CLAUDE.md` prescrive: «Consulta `PRODUCT.md` e `DESIGN.md` prima di qualsiasi modifica UI». Quei due file descrivono la palette **ember**:

- `DESIGN.md:89` — «sotto ogni schermata brace un fondo quasi nero (`#1A1A1A`) e un solo accento incandescente, l'ember giallo»
- `DESIGN.md:104` — «**Ember Core** (#FFD400): il giallo principale del brand»
- `DESIGN.md:118` — «La Regola del Fuoco Unico… non introdurre una seconda famiglia di colore»
- `PRODUCT.md:25` — «La palette scura ambra/rame ("ember")… è l'identità corretta da consolidare»

L'applicazione oggi è **verde bosco su crema con accento terracotta** (`src/styles/globals.css:7-21`: `--background: 160 46% 11%`, `--accent: 30 44% 48%`). Il giallo `#FFD400` sopravvive solo in un secondo blocco di token in fondo al CSS e nel widget pubblico (rilievo U3).

**Conseguenza pratica:** chi segue le istruzioni del repo — un collega nuovo, o un assistente AI — scrive interfacce del colore sbagliato. È già la seconda deriva in cinque settimane (a fine luglio la palette era passata da ember arancio a giallo, poi a verde). I documenti non sono stati aggiornati nessuna delle due volte.

### 🟡 D2 — Le decisioni di prodotto vivono solo nei PR

Le scelte non ovvie — chi può forzare cosa, perché `COMPLETED`/`CANCELLED` non occupano un tavolo, perché fra turni sovrapposti vince la capienza minore, perché non c'è un test runner — sono descritte bene, ma nel corpo delle pull request. Fra sei mesi nessuno le ritrova. Servirebbe un file di decisioni, anche breve.

---

## 10. Fuso orario

### 🟠 T1 — «Oggi» è calcolato in UTC in 8 punti, mentre il locale ha un suo fuso

`Venue.timezone` esiste (`prisma/schema.prisma:65`, default `Europe/Rome`) e il modulo di disponibilità lo rispetta correttamente — è stato uno dei punti curati della PR #9. Il resto dell'applicazione no:

```
src/app/(app)/floor/page.tsx:27              new Date().toISOString().slice(0, 10)
src/server/ai/tools/assign-waiter.ts:68      idem
src/components/bookings/day-picker.tsx:45    idem
src/components/bookings/booking-form.tsx:65  idem
src/components/waiters/assign-service-dialog.tsx:41   idem
src/components/waiters/waiter-profile-dialog.tsx:81   idem
src/components/waiters/new-waiter-dialog.tsx:59       idem
src/components/waiters/waiter-contract-section.tsx:91 idem
```

`toISOString()` restituisce UTC. In Italia d'estate (UTC+2) fra le 00:00 e le 02:00 locali, e d'inverno fra le 00:00 e le 01:00, **tutta l'interfaccia mostra il giorno prima**: la Sala apre su ieri, il calendario evidenzia ieri, il form nuova prenotazione propone ieri come data. È esattamente la fascia oraria in cui un ristorante chiude il servizio e registra gli ultimi conti.

**Fix:** una funzione `todayInVenue(venue.timezone)` usata in tutti gli 8 punti.

---

## 11. Backlog proposto

Ordine per rapporto fra rischio e sforzo. Le stime sono grossolane.

### P0 — Prima di qualsiasi nuova funzione

| # | Intervento | Perché | Sforzo |
|---|---|---|---|
| 1 | Migrazioni versionate: `prisma migrate deploy` nel build, seed fuori dal build | I1: oggi un deploy può cancellare dati di produzione | mezza giornata + coordinamento squadra |
| 2 | `can()` sui 10 endpoint scoperti | S1: `READ_ONLY` può modificare personale e sala | 2 ore |
| 3 | Seed demo con date relative a oggi + camerieri e assegnazioni di esempio | I3: la demo online sembra un prodotto morto | mezza giornata |
| 4 | Decidere in squadra se introdurre un test runner, e coprire per primi permessi e disponibilità | Q1: 26.000 righe, un solo script di verifica | decisione + 1-2 giorni |

### P1 — Subito dopo

| # | Intervento | Rilievo |
|---|---|---|
| 5 | `todayInVenue(timezone)` in tutti gli 8 punti | T1 |
| 6 | 401 JSON invece di 307 nelle route API (helper `requireVenueApi()`) | S2 |
| 7 | Limite di frequenza + captcha sul widget pubblico | S3 |
| 8 | Navigazione su schermo piccolo: menu compatto o affordance di scorrimento | U1 |
| 9 | «Configura più tardi» che persiste davvero | U2 |
| 10 | Allineare `DESIGN.md`/`PRODUCT.md` alla palette verde reale | D1 |
| 11 | `DialogTitle` nel wizard brand + `alt` sulle 4 immagini | A1, A2 |
| 12 | Indici su `Shift`, `TableBlock`, `Campaign` | P1 |
| 13 | Orari disponibili anche nel form interno + interfaccia per la forzatura consapevole | U5 |
| 14 | `method="post"` sui form con dati personali | S6 |
| 15 | Riportare il widget pubblico sulla palette dell'app | U3 |
| 16 | Etichette dei tavoli che non si sovrappongono in Sala | U4 |

### P2 — Funzionalità mancanti, in ordine di dipendenza

1. **Caparre con Stripe** — è l'unico P0 di prodotto concordato a luglio e ancora completamente scoperto: la dipendenza è installata, il codice non esiste. Sblocca la pagina Pagamenti, che oggi è un guscio.
2. **Waitlist + stato sala in tempo reale** — `WaitlistEntry` è pronto; è la funzione che i ristoranti chiedono più spesso dopo l'anti-overbooking.
3. **Recensioni e sondaggi** — 5 tabelle pronte, si aggancia al CRM ospiti che già esiste.
4. **Motore automazioni + template messaggi** — abilita WhatsApp/SMS come canali, oggi solo email via Brevo.
5. **Fidelity, coupon, gift card** — 5 tabelle pronte.
6. **Menu → ordini → food cost** — è una catena, va fatta in quest'ordine, ed è il blocco più grosso (7 tabelle, zero codice).
7. **Tracciabilità (`AuditLog`, `BookingEvent`)** — da fare *prima* di aprire il prodotto a locali con molto personale.
8. Più in là: POS, centralino, captive portal wifi, Reserve with Google.

---

## 12. Che cosa non è stato verificato

Perché il documento non venga letto per più di quello che è:

- **Nessuna verifica sull'ambiente di produzione.** Tutto è stato provato in locale sul commit `c6a1a82` con i dati del seed. Su Vercel potrebbero esserci variabili d'ambiente e dati diversi.
- **L'agente AI non è stato provato in funzione:** in locale non c'è `OPENAI_API_KEY`. Ho verificato solo che il pannello si apre, mostra i suggerimenti e la quota (`0/200`).
- **Invio email e campagne non provati end-to-end:** Brevo e Resend sono senza chiave (comportamento previsto: chiavi vuote disabilitano la funzione).
- **Nessun test di carico e nessun penetration test.** I rilievi di prestazioni derivano dalla lettura di schema e query, non da misurazioni sotto carico. I rilievi di sicurezza derivano da lettura del codice più prove puntuali con `curl`, non da un attacco strutturato.
- **Wizard campagne, Room Builder e contratti provati solo a schermo,** non compilandoli fino in fondo con dati reali.
- **Il contrasto sulle superfici a texture va controllato a mano** (vedi A3).
- Le date mostrate in formato `mm/gg/aaaa` negli screenshot sono un artefatto del browser di automazione, **non** un difetto del prodotto: il valore inviato è corretto (`lunedì 07 settembre` accanto al campo lo conferma, screenshot `02`).

---

## 13. Domande su cui vorrei un secondo parere

1. **Migrazioni:** con tre persone su branch separati e uno schema che cambia in fretta, `prisma migrate` con migrazioni committate è la scelta ovvia — o in un progetto a questo stadio ha senso un compromesso (per esempio `db push` in preview e `migrate deploy` solo in produzione)?
2. **Test:** conviene introdurre un runner completo (vitest + qualche test end-to-end su Playwright) o partire da una batteria di test sui soli permessi e sulla disponibilità, nello stile dello script che esiste già, per non toccare le dipendenze condivise?
3. **43 tabelle senza codice:** meglio tenerle (documentano l'intenzione, costano zero a runtime) o potarle e reintrodurle quando servono? Il rischio del tenerle è che facciano sembrare il prodotto più completo di quanto sia, come è già capitato con l'analisi di copertura di luglio.
4. **Priorità di prodotto:** con caparre Stripe, waitlist e menu/ordini tutti aperti, quale sblocca più valore per un ristorante indipendente italiano nel 2026? La mia ipotesi è le caparre (riducono i no-show, che sono il costo più sentito), ma è un'ipotesi.
5. **Navigazione mobile:** conviene un menu a scomparsa, una barra in basso in stile app, o una riduzione delle voci di primo livello da 9 a 5 con raggruppamento?
6. **Forzatura da parte dello staff:** quando il locale vuole accettare una prenotazione oltre i limiti, la scelta giusta è un pulsante «forza» con motivazione obbligatoria e registrazione in `AuditLog`, o è meglio non offrirla affatto?

---

## Appendice A — Screenshot allegati

Cartella `screenshots/`. Desktop 1440×900, telefono 390×844, catturati il 7 settembre 2026 con login reale (`owner@tavolo.demo`).

| File | Contenuto | Rilievi visibili |
|---|---|---|
| `00-sign-in.png` | Pagina di accesso | — |
| `01-overview.png` | Panoramica | I3 (tutto a zero), U6 (vuoto verticale) |
| `02-bookings.png` | Prenotazioni | I3, U6 |
| `03-bookings-new.png` | Nuova prenotazione (staff) | U5 (nessun orario suggerito) |
| `04-floor.png` | Sala, pianta tavoli | **U4 (etichette sovrapposte, fila T1-T8)** |
| `05-waiters.png` | Camerieri | I3 (0 camerieri nel seed), U6 |
| `06-guests.png` | CRM ospiti | — |
| `07-experiences.png` | Esperienze | — |
| `08-marketing.png` | Marketing | — |
| `09-marketing-qr.png` | QR code | — |
| `10-campaigns.png` | Campagne | — |
| `11-campaigns-new.png` | Wizard nuova campagna | — |
| `12-payments.png` | Pagamenti | **F2 (guscio, Stripe assente)** |
| `13-insights.png` | Analytics | I3; stati vuoti fatti bene |
| `14-settings.png` | Impostazioni | — |
| `15-settings-brand.png` | Impostazioni brand | — |
| `16-reports-orfana.png` | «Segnalazioni» | **F2 (guscio fisso, rotta fuori navigazione)** |
| `17-booking-detail.png` | Dettaglio prenotazione | — |
| `18-guest-detail.png` | Scheda ospite | — |
| `80-nag-brand-dialog.png` | Wizard brand all'apertura | **U2 (riparte a ogni caricamento)** |
| `81-agente-ai.png` | Pannello agente AI | quota `0/200`; non provato in funzione |
| `82-forced-colors.png` | Panoramica in alto contrasto Windows | ✅ A3 (superato) |
| `82-reduced-motion.png` | Panoramica con animazioni ridotte | ✅ A3 (superato) |
| `90-widget-pubblico.png` | Widget pubblico di prenotazione | **U3 (fuori brand: giallo ember)** |
| `m-overview.png` | Panoramica su telefono | **U1 (1 voce di menu su 9)** |
| `m-bookings.png` | Prenotazioni su telefono | U1 |
| `m-floor.png` | Sala su telefono | U1 |
| `m-waiters.png` | Camerieri su telefono | U1 |

## Appendice B — Come riprodurre l'audit

```bash
cd /Users/lucamoncalvo/tavolo-app
git checkout c6a1a82
npm install
npm run db:push && npm run db:seed
npm run dev                    # → localhost:3000 (o 3001 se occupata)

npm run typecheck              # atteso: pulito
npm run lint                   # atteso: nessun avviso
npm run check:availability     # atteso: 45/45

# copertura schema ↔ codice
grep -oE "^model [A-Za-z_]+" prisma/schema.prisma | awk '{print $2}' | while read m; do
  lc=$(python3 -c "import sys;s=sys.argv[1];print(s[0].lower()+s[1:])" "$m")
  printf "%s %s\n" "$m" "$(grep -rIoE "\b(db|tx)\.$lc\." src | wc -l)"
done | sort -k2 -n

# controllo ruoli per route
for f in $(find src/app/api -name route.ts); do
  echo "$(grep -c '\bcan(' $f) $f"
done | sort -n

# API senza sessione: atteso 307 (rilievo S2)
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3001/api/waiters
```

Gli script di cattura schermate e di misura (Playwright) sono stati usati una volta e non fanno parte del repo. Il login avviene via API NextAuth (`/api/auth/csrf` poi `/api/auth/callback/credentials`), perché il form di accesso è solo client-side.
