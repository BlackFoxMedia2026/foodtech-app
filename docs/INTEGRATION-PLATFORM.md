# Piattaforma integrazioni

Scritto il 23 settembre 2026, insieme al codice. Descrive il codice com'è.

La piattaforma permette a **ogni locale** di installare, configurare,
attivare, disattivare e disinstallare le proprie integrazioni (cassa,
pagamenti, portali di prenotazione, marketing, analytics…), ognuna con le
proprie credenziali, la propria sede presso il fornitore e le proprie
mappature. Il catalogo è unico; lo stack è di ogni locale.

```
Foodtech (sala, comande, menu, …)
   ↓  (in futuro: fornitorePerLocale, gestori degli eventi)
Servizio integrazioni          src/server/integrations/installazioni.ts
   ↓
Adattatori                     src/server/integrations/adapters/<fornitore>/
   ↓
Fornitori esterni              Lightspeed, Oracle, ICG, Cassa in Cloud, …
```

---

## 1. Cosa esisteva prima

| Cosa | Dove | Stato |
|---|---|---|
| Multi-tenant `Organization → Venue`, accesso via `VenueMembership` | `prisma/schema.prisma`, `lib/tenant.ts` | riusato: il tenant delle integrazioni è il **Venue** |
| RBAC ruolo → capacità | `lib/abilities.ts`, `requireVenueApi()` | riusato, con cinque capacità nuove |
| Cifratura AES-256-GCM a riposo | `lib/cifratura.ts` (password Wi-Fi, segreto TOTP) | riusato, con una variante **legata al proprietario** |
| Idempotenza dei webhook | `WebhookEvent` con vincolo `(provider, providerEventId)` (Stripe, Brevo, SES) | riusato: gli eventi delle integrazioni passano da lì |
| Coda dei lavori su Postgres + cron ogni minuto | `server/jobs/queue.ts`, `/api/cron/jobs` | riusato: sincronizzazioni e riprove dei webhook |
| Registro delle azioni | `AuditLog`, `server/audit.ts` | riusato, con dieci azioni `integration.*` |
| Log strutturati senza dati personali | `lib/observability.ts` | riusato |
| Limite di frequenza | `middleware.ts`, `lib/rate-limit.ts` | riusato, due regole nuove |
| Stripe Connect per locale (caparre, conto al tavolo) | `server/stripe-connect.ts`, `/settings/pagamenti` | **integrazione nativa**: il catalogo la mostra e porta alla sua pagina |
| Interfaccia «chi riceve la comanda» | `server/comande/fornitore.ts` (`fornitorePerLocale`) | il punto dove le comande consumeranno la piattaforma; non ancora collegato |
| `POSConnector`, `POSEvent`, `Connector`, `ConnectorEvent` | schema | tabelle **mai scritte né lette**: marcate `SUPERATA`, da togliere con una migrazione dedicata |

Non esisteva nessun livello connettori generico (lo diceva `docs/INTEGRATIONS.md`:
«non conviene inventarlo prima di averne due o tre concrete»). Questa
piattaforma è quel livello.

## 2. Cosa è stato aggiunto

```
src/server/integrations/
  tipi.ts            vocabolario puro: categorie, capacità, stati (importabile dal client)
  registry.ts        IL CATALOGO — unica fonte di verità
  dominio.ts         modello normalizzato (tavoli, prodotti, ordini, …) in centesimi
  stati.ts           macchina a stati dell'installazione + salute
  errori.ts          errori normalizzati, in due lingue (tecnica / ristoratore)
  redazione.ts       pulizia dei segreti da log e payload
  credenziali.ts     cifratura legata, lettura, rinnovo con lease
  oauth-state.ts     state OAuth firmato, con scadenza e legato al browser
  installazioni.ts   il servizio: installa, autentica, configura, prova, attiva, …
  mappature.ts       ExternalEntityMapping, abbinamento automatico «solo se certo»
  sync.ts            motore di sincronizzazione + spazzata programmata
  webhooks.ts        pipeline dei webhook
  eventi.ts          gestori degli eventi normalizzati
  vista.ts           ciò che può arrivare al browser (e ciò che no)
  adapters/
    tipi.ts          IntegrationAdapter, PosIntegrationAdapter, METODI_PER_CAPACITA
    http.ts          client HTTP unico: timeout, errori, Retry-After, int64
    index.ts         slug → adattatore
    lightspeed-k/    primo adattatore POS

src/app/api/integrations/
  route.ts                           GET catalogo del locale
  [slug]/route.ts                    GET dettaglio · POST azioni · DELETE disinstalla
  [slug]/mappature/route.ts          GET / PATCH abbinamenti
  oauth/callback/[slug]/route.ts     ritorno OAuth
  webhooks/[slug]/[chiave]/route.ts  eventi dei fornitori

src/app/(app)/settings/integrations/          marketplace
src/app/(app)/settings/integrations/[slug]/   percorso di installazione / gestione
src/components/integrations/                   catalogo, percorso, dettaglio, segni
```

Modifiche a file esistenti, tutte additive: `abilities.ts` (capacità),
`api-auth.ts` (errori che portano il proprio status), `cifratura.ts`
(`cifraLegato`/`decifraLegato`), `audit.ts` (azioni), `jobs/queue.ts` e
`jobs/handlers.ts` (due tipi di lavoro), `cron/jobs` (spazzata),
`middleware.ts` e `rate-limit.ts` (due limiti), `settings/page.tsx` (il gruppo
«Integrazioni» in Sistema; il vecchio gruppo con Brevo si chiama ora «Servizi
della piattaforma», perché era quello), `parti-impostazioni.ts`, commenti di
`comande/fornitore.ts`.

**Nessun modulo operativo è stato toccato**: prenotazioni, sala, comande,
pagamenti, staff, CRM e menu funzionano esattamente come prima.

## 3. Schema del database

Migrazione `20260923100000_piattaforma_integrazioni`, **solo aggiunte**
(`esaminaMigrazione` → non distruttiva; provata applicando tutta la catena su
un database vuoto).

| Tabella | Cosa | Chiavi |
|---|---|---|
| `IntegrationInstallation` | un'integrazione installata su un locale: stato, salute, configurazione (mai segreti), capacità accese, account e sede esterni, `webhookKey`, date di prova/sync/errore, codice e dettaglio dell'ultimo errore | unico `(venueId, integrationSlug)`; indici `(orgId, slug)`, `(slug, externalLocationId)` |
| `IntegrationCredential` | le credenziali cifrate (`secretCiphertext`), permessi concessi, scadenze, `version` (lucchetto ottimistico), `refreshLockedUntil` (lease del rinnovo) | unico `installationId`; `venueId` ripetuto per il doppio filtro |
| `ExternalEntityMapping` | «il tavolo B1 è il 89372 del fornitore»: `entityType`, `internalId` (nullo = da abbinare), `externalId`, `manual` | unico `(installation, tipo, externalId)` e `(installation, tipo, internalId)` |
| `IntegrationSyncLog` | ogni sincronizzazione: operazione, direzione, trigger, esito, conteggi, codice ed errore tecnico, `correlationId` | `(installationId, startedAt)` |
| `WebhookEvent` (esistente) | + `installationId`, `venueId`, `status`, `attempts`, `normalized`, `error` — facoltative | il vincolo `(provider, providerEventId)` resta la garanzia di idempotenza |

Enum: `IntegrationInstallationStatus` (i nove stati chiesti),
`IntegrationHealth` (HEALTHY, DEGRADED, ERROR, AUTH_REQUIRED, UNKNOWN),
`IntegrationSyncTrigger` (MANUAL, WEBHOOK, SCHEDULED, INITIAL_IMPORT, RETRY),
`IntegrationSyncDirection`, `IntegrationSyncStatus`.

`NOT_INSTALLED` è una riga che resta dopo la disinstallazione (registro e
storia non si perdono); una reinstallazione riusa la riga ripartendo da zero.

**Multi-sede.** Il modello esistente è `Organization → Venue`; non c'è un
livello «sede» separato dal locale, e non ne è stato inventato uno. Ogni
`Venue` ha la propria installazione con la propria `externalLocationId`: il
Gruppo Rossi con Milano, Torino e Roma su Lightspeed ha tre installazioni, tre
accessi, tre sedi Lightspeed. `orgId` è copiato sull'installazione per le
viste di gruppo; se due locali dello stesso gruppo scelgono la stessa sede del
fornitore, la prova di connessione lo segnala (solo dentro il gruppo: fuori
sarebbe una fuga di dati).

## 4. Struttura degli adattatori

Un adattatore **traduce e basta**: riceve un contesto con credenziali già
fresche e un client HTTP già configurato, parla con il fornitore, restituisce
oggetti di `dominio.ts`. Non scrive nel database, non decide stati.

```ts
interface IntegrationAdapter {
  slug; versione; minutiSyncProgrammata?;
  iniziaAutorizzazione?()   completaAutorizzazione?()   connetti?()
  rinnovaAutenticazione?()  disconnetti?()
  provaConnessione()        opzioniConfigurazione?()    attiva?()
  sincronizza?()            verificaWebhook?()          riceviWebhook?()
}
interface PosIntegrationAdapter extends IntegrationAdapter {
  pos: { getLocations?, getFloors?, getTables?, getTable?, getMenu?, getProducts?,
         getCategories?, getTaxRates?, getPaymentMethods?, getOrders?, getOrder?,
         createOrder?, updateOrder?, sendOrder?, getPayments?, createPayment?,
         closeOrder?, syncCustomers? }
}
```

Tutti i metodi di cassa sono facoltativi. `METODI_PER_CAPACITA` lega ogni
capacità dichiarata nel catalogo al metodo che la realizza, e il test
`integrazioni-catalogo` fallisce se una capacità è dichiarata senza metodo, o
un metodo esiste senza capacità dichiarata.

**Regole del modello normalizzato:** denaro in centesimi interi;
`externalId` sempre stringa (gli `int64` dei fornitori perdono cifre come
numeri JavaScript — il client HTTP li legge come stringhe); nessun campo
inventato (`null` se il fornitore non lo dà).

## 5. Flusso di installazione

Impostazioni → Sistema → **Integrazioni** → `/settings/integrations`.

### Due esperienze separate (dal 24 settembre 2026)

- **Cliente** (`/settings/integrations`, `/settings/integrations/<slug>`,
  `/api/integrations/*`): legge solo `vista-cliente.ts`, costruita dalle
  regole pure di `cliente.ts`. Cinque stati — *Disponibile*, *In anteprima*,
  *Collegata*, *Richiede attenzione*, *Prossimamente* — e un pulsante
  (*Collega*, *Richiedi attivazione*, *Avvisami*, *Gestisci*). Niente fasi di
  rilascio, livelli di certificazione, adattatori, documentazione, endpoint,
  registro o correlation ID. Il test `integrazioni-esperienza-cliente`
  serializza catalogo e dettaglio e ci cerca le parole della vista interna.
- **Foodtech** (`/admin/integrazioni`, `/admin/integrazioni/<slug>`, solo
  Super Admin): tutto il resto — adattatore, scope, webhook, variabili della
  piattaforma, campi con l'aiuto tecnico, matrice delle risorse, rilascio,
  accessi beta, richieste dei locali, stato grezzo e registro sul locale
  attivo, console di certificazione (che non è più una scheda della pagina
  cliente).

Il pulsante lo decide `statoPerIlCliente`: senza adattatore → *Prossimamente*
/ *Avvisami*; manca un requisito di Foodtech (client OAuth Lightspeed,
custodia) → «in fase di attivazione» / *Richiedi accesso*, senza modulo;
anteprima senza accesso beta → *Richiedi attivazione*; altrimenti *Collega*.
*Richiedi attivazione* e *Avvisami* scrivono una `IntegrationAccessRequest`
(interna: niente parte verso il fornitore); il Super Admin la chiude con
*Abilita beta* (che concede l'accesso) o *Archivia*. Anche un accesso beta
concesso da altre strade chiude la richiesta aperta.

Il **wizard cliente** ha cinque passi — Accesso, Verifica, Sede,
Sincronizzazione, Pronta — sopra le stesse azioni del servizio qui sotto. I
campi vengono dallo schema `configurazione` della voce; le parole con cui si
mostrano al cliente da `cliente` (`PresentazioneCliente` in `tipi.ts`), che
può spostare un campo nel primo passo, nasconderlo sotto «Altre opzioni» o
dividere una scelta in due (Oracle: sede, poi revenue center). Al posto delle
capacità il cliente sceglie **gruppi** (`GRUPPI_SYNC`: tavoli, menu, ordini,
vendite); `orders.write`, `payments.write`, `close_order` e `customers`
restano fuori dalla sua portata e, se accese da Foodtech, non si spengono
quando salva. La prova risponde al cliente senza gli avvisi dell'adattatore
né il riferimento di correlazione (`provaPerIlCliente`).

Dopo il collegamento, se Foodtech è vuoto (nessun tavolo attivo, nessun
piatto) la pagina propone l'**importazione iniziale** (`importazione.ts`):
copia sale, tavoli, categorie e prodotti trovati dalla sincronizzazione, e li
lascia abbinati all'originale come un abbinamento fatto a mano. La
sincronizzazione continua a non toccare mai i dati di Foodtech da sola.

### Le azioni del servizio

1. **Informazioni** — cosa collega, cosa legge, cosa scrive, quali permessi
   (dal catalogo). «Installa» crea la riga (`INSTALLING`). Nel wizard cliente
   la crea il primo «Continua».
2. **Autenticazione** — OAuth: `POST azione=autorizza` → cookie col nonce →
   pagina del fornitore → `/api/integrations/oauth/callback/<slug>` verifica
   state + browser + persona + locale → scambio del codice → credenziali
   cifrate → `NEEDS_CONFIGURATION`. Chiave API: `azione=connetti`.
3. **Configurazione** — le scelte (per Lightspeed: la sede) si leggono **dal
   fornitore** con le credenziali appena date. Cambiarle rimette da provare.
4. **Prova** — `adapter.provaConnessione()` davvero. Riuscita →
   `CONNECTED`; fallita → frase per il ristoratore + riferimento per
   l'assistenza; accesso scaduto → `REAUTH_REQUIRED`.
5. **Cosa sincronizzare** — solo le capacità dichiarate dalla voce.
6. **Attivazione** — solo da `CONNECTED` con prova riuscita →
   `adapter.attiva()` (Lightspeed: registra il webhook) → `ACTIVE` → prima
   importazione in coda.

Il passo corrente lo decide lo stato sul server: chi chiude a metà riprende da
lì. Dopo l'attivazione la pagina del cliente mostra la gestione: stato,
sede, ultima sincronizzazione, che cosa si sincronizza, elementi trovati,
collegamenti di tavoli e prodotti (dal lato Foodtech, senza identificativi
del fornitore); azioni Sincronizza ora, Impostazioni (gruppi, sede, dati di
accesso, aggiornamenti istantanei, pausa), Disconnetti, e Ricollega quando
serve.

Le transizioni ammesse sono una tabella (`stati.ts`), fissata da test:
attivare senza prova è un 409, non una svista possibile.

**Permessi**: `integration:view`, `integration:install`,
`integration:configure`, `integration:disconnect`, `integration:logs`. Oggi
tutte e solo al `MANAGER` (`tests/permessi.test.ts`). Ogni azione della rotta
chiede la sua.

## 6. Gestione delle credenziali

- **Cifrate a riposo**, AES-256-GCM con `CHIAVE_CIFRATURA`, e **legate**: il
  contesto `integrazione:<venueId>:<installationId>` è dato autenticato del
  sigillo. Una credenziale copiata sotto un'altra installazione o un altro
  locale non si decifra (provato).
- **Senza chiave non si installa.** A differenza della password Wi-Fi, un
  token di cassa non si salva «in chiaro con l'etichetta»: `installa` rifiuta
  con `integration_encryption_unavailable` (503).
- **Mai verso il browser.** `vista.ts` costruisce le risposte per elenco di
  campi: dice *se* ci sono credenziali, quali permessi, quando scadono. Mai i
  segreti, mai `webhookKey`, mai il dettaglio tecnico dell'errore (provato
  serializzando le viste e cercando i segreti).
- **Mai nei log.** `redazione.ts` toglie campi per nome e valori per forma
  (Bearer, Basic, JWT) da ogni errore, estratto di risposta e payload salvato;
  il client HTTP registra metodo, indirizzo senza query, stato, durata.
- **Rinnovo** automatico due minuti prima della scadenza, con **lease**
  (`refreshLockedUntil`): rinnova uno solo, gli altri aspettano il suo token.
  Necessario con fornitori a token monouso come Lightspeed — senza, due
  rinnovi concorrenti bruciavano l'accesso (difetto trovato dai test e
  corretto).
- **Revoca/disconnessione**: si prova la revoca presso il fornitore se
  l'adattatore la offre, poi si cancellano comunque credenziali e mappature.
- **Registro**: installazione, autorizzazione (con i permessi, mai i token),
  configurazione, prova, attivazione, disattivazione, disinstallazione,
  abbinamenti.
- **Isolamento**: `venueId` sempre dal contesto della richiesta; ogni lettura
  filtra `{ venueId, integrationSlug }` o `{ installationId, venueId }`.

## 7. Gestione dei webhook

`POST /api/integrations/webhooks/<slug>/<webhookKey>` — un indirizzo per
fornitore **e per installazione**. La rotta legge il corpo grezzo e chiama la
pipeline:

1. installazione da `(slug, webhookKey)`, non disinstallata → altrimenti 404;
2. `adapter.verificaWebhook` con i segreti di **quella** installazione → 401
   senza scrivere niente (il corpo non si registra);
3. `adapter.riceviWebhook` → evento normalizzato + `idEvento`;
4. scrittura su `WebhookEvent` con chiave `<installationId>:<idEvento>` sotto
   il vincolo unico — duplicato → 200 `ripetuto`, fermo lì;
5. evento di un'altra sede o integrazione disattivata → conservato come
   `IGNORED`;
6. lavorazione con presa in carico condizionata (`RECEIVED|FAILED →
   PROCESSING`); se fallisce, `integration.webhook` in coda con riprove.

Provato: cinque copie dello stesso evento in parallelo → una lavorata, quattro
`ripetuto`; lo stesso id da due locali → due eventi; password di un altro
locale → 401. Limite di frequenza: 300/min per IP.

I gestori (`eventi.ts`) oggi registrano l'esito di ordini e pagamenti sulle
mappature. **Non toccano comande o conti**: si collegheranno quando l'invio
alla cassa sarà provato.

## 8. Integrazioni nel catalogo

| Categoria | Voci |
|---|---|
| POS | Lightspeed Restaurant (K-Series), Oracle Simphony, ICG, Cassa in Cloud, Tilby, Passepartout, Zucchetti |
| Pagamenti | Stripe, Adyen, Google Pay, Apple Pay, PaynoPain |
| Prenotazioni / portali | Prenota con Google, Google Maps, Facebook, Instagram, OpenTable, Resy, Amadeus, Simple Night, Petal Maps |
| Marketing | Mailchimp, Brevo (account del ristorante) |
| Analytics | Google Analytics 4, Google Tag Manager |
| CRM | Salesforce |
| Telefonia | Jusan, Gamma |
| PMS, Fiscale, Delivery, Altro | categorie pronte, nessuna voce |

Ogni voce porta due informazioni separate: `implementazione`
(IMPLEMENTED / IN_DEVELOPMENT / PLANNED) e `disponibilita`
(AVAILABLE / PREVIEW / COMING_SOON). Una voce PLANNED si vede e non ha il
pulsante «Installa». I loghi sono monogrammi: nessun marchio di terzi nel
repository.

## 9. Quali sono realmente operative

**Una sola: Stripe**, ed è l'integrazione nativa che esisteva già (Stripe
Connect per caparre e conto al tavolo), non un connettore nuovo. Il catalogo la
mostra «Connessa» quando il conto del locale accetta incassi, e porta a
`/settings/pagamenti`.

**Lightspeed Restaurant K-Series** ha un adattatore completo scritto sulla
documentazione ufficiale, ma **non è mai stato collegato a un account vero**:
resta `IN_DEVELOPMENT` e si mostra come «Anteprima». Senza
`LIGHTSPEED_K_CLIENT_ID`/`SECRET` non si può installare, e la scheda lo dice.

**Cassa in Cloud (TeamSystem)**, dal 23 settembre 2026: stesso stato di
Lightspeed — adattatore completo sulla documentazione ufficiale, **mai provato
con una chiave vera**, «Anteprima». Si installa con la chiave API del cliente
(nessun requisito di piattaforma). Vedi la sezione dedicata più sotto.

**Tilby**, dal 23 settembre 2026: adattatore completo sulla documentazione
ufficiale (reference OpenAPI e guida alla stampa automatica), **mai provato
con un token vero**, «Anteprima». L'accesso alle API richiede l'ammissione al
Developer Program di Tilby, a pagamento e con certificazione. Vedi la sezione
dedicata.

**Oracle MICROS Simphony**, dal 23 settembre 2026: adattatore su Simphony
Transaction Services Gen2 (guida e swagger ufficiali), **mai provato con un
ambiente Oracle**, «Anteprima». Oracle non offre una sandbox pubblica: serve
l'ambiente Simphony Cloud di un cliente con STS Gen2 attivo e un API account.
Vedi la sezione dedicata.

La **piattaforma** invece è operativa e provata end-to-end contro il database
(`tests/integrazioni-piattaforma.test.ts`, con un adattatore finto comandabile).

## 10. Cosa manca per collegarle davvero

**Lightspeed K-Series**

- un **client OAuth** di Foodtech presso Lightspeed: programma partner su
  https://api-portal.lsk.lightspeed.app (i client sono legati a un ambiente,
  trial o production);
- registrare presso Lightspeed l'indirizzo di ritorno
  `<NEXT_PUBLIC_APP_URL>/api/integrations/oauth/callback/lightspeed-k` (HTTPS);
- gli scope `orders-api`, `financial-api`, `offline_access` concessi al client;
- una prova completa su un account trial, controllando i punti marcati «dubbio
  da verificare» in `adapters/lightspeed-k/traduzione.ts`: `reference` dei
  tavoli, identificativi dei gruppi del menu, significato di `rate` nelle
  aliquote, formato esatto delle notifiche per gli ordini locali;
- solo dopo: `implementazione: "IMPLEMENTED"`, e il collegamento di
  `fornitorePerLocale` per mandare le comande alla cassa.

Cosa l'adattatore **non** fa di proposito, perché non ne abbiamo verificato il
formato: leggere ordini e pagamenti dalla cassa, registrare pagamenti,
chiudere il conto, revocare il token (Keycloak ha un endpoint di revoca, ma la
documentazione Lightspeed non lo cita).

**Tutte le altre voci**: un accordo di partnership o l'accesso alle API del
fornitore, e l'adattatore. Casi particolari scritti nella voce stessa:
Google Pay e Apple Pay passano probabilmente da Stripe Checkout ma nessuno lo
ha verificato su Foodtech; Prenota con Google e Google Maps richiedono
l'adesione al Google Actions Center; GA4 e GTM richiedono di portare eventi e
contenitore nel widget di prenotazione, con il consenso ai cookie; Brevo del
ristorante è diverso dal Brevo con cui spedisce Foodtech.

## 11. Come si aggiunge un fornitore

1. **Leggere la documentazione ufficiale.** Non inventare endpoint, non
   supporre scope.
2. Scrivere `src/server/integrations/adapters/<slug>/`:
   - `config.ts` (host, ambienti, scope minimi, variabili della piattaforma);
   - `traduzione.ts`: funzioni **pure** dal formato del fornitore a
     `dominio.ts`, con i dubbi scritti accanto;
   - `index.ts`: l'adattatore. Solo i metodi che l'API permette davvero.
     Tutte le chiamate via `ctx.http` (mai `fetch` diretto), errori come
     `ErroreIntegrazione`.
3. Registrarlo in `adapters/index.ts`.
4. Nella voce di `registry.ts`: `implementazione: "IN_DEVELOPMENT"`,
   `disponibilita: "PREVIEW"`, le `capacita` implementate, `configurazione`,
   `requisitiPiattaforma`, `versioneAdattatore`, `mancaPerOperare`.
5. Aggiungere le variabili a `.env.example`.
6. Scrivere il test dell'adattatore con un `fetch` finto e le risposte della
   documentazione (vedi `tests/integrazioni-lightspeed.test.ts`).
7. `npm test`: `integrazioni-catalogo` controlla da solo la coerenza fra voce e
   adattatore.
8. Provare con un account vero. Solo allora `IMPLEMENTED` / `AVAILABLE`, e
   aggiornare il test che elenca le voci implementate.

Rotte, interfaccia, cifratura, sincronizzazione, webhook e mappature **non si
toccano**.

## 12. Il prossimo fornitore dopo Lightspeed

*Scritto prima di Cassa in Cloud, che è stata fatta per seconda: vedi la
sezione dedicata. Tilby è stata fatta per terza: sezione dedicata anche lei.*

**Cassa in Cloud (TeamSystem)**, poi **Tilby**.

- Sono le casse più diffuse fra i ristoranti italiani piccoli e medi, cioè il
  cliente tipico di Foodtech; Lightspeed copre bene il segmento
  internazionale e i gruppi, non il ristorante di quartiere italiano.
- Per quanto se ne sa, entrambe offrono API per integratori con un percorso
  di accesso più corto di Oracle Simphony o ICG, che di norma passano da
  accordi enterprise e integratori certificati. **Non è verificato**: è la
  prima cosa da controllare, sulla loro documentazione ufficiale.
- Usano la stessa forma dell'adattatore POS: sedi, tavoli, prodotti, ordini.
  Il lavoro è l'adattatore e la prova, non la piattaforma.
- Il fiscale italiano (scontrino elettronico, RT) passa dalla cassa: una
  cassa italiana collegata è il presupposto per chiudere il conto dalla sala
  senza doppie battute.

Prima di iniziare: verificare sulla documentazione ufficiale di ciascuna la
modalità di autenticazione (oggi nel catalogo è segnata come **non
verificata**), i limiti di frequenza e se esistono webhook per gli ordini.

---

## Cassa in Cloud

Secondo adattatore POS, 23 settembre 2026. Fonte unica: la documentazione
ufficiale https://api-doc.cassanova.com/ (letta per intero, versione API
`1.0.0`). La knowledge base TeamSystem (cassanova.zendesk.com) risponde 403
agli accessi automatici e non è stata letta.

Quattro livelli di verifica, da non confondere mai:

| Livello | Cosa vuol dire | Cassa in Cloud |
|---|---|---|
| IMPLEMENTATO | il codice esiste | sì |
| TESTATO CON MOCK/FIXTURE | provato con risposte costruite sui modelli della documentazione | sì (adattatore, piattaforma, browser con server finto) |
| TESTATO CONTRO API REALE | una chiamata vera a `api.cassanova.com` con una chiave vera | **no** |
| TESTATO SU CASSA REALE | un ordine comparso su una cassa, una comanda stampata | **no** |

### Autenticazione

- La chiave API la rilascia Cassa in Cloud («contact us to obtain an
  api-key»); le API esistono **solo con licenze Risto Enterprise o Retail
  Enterprise**.
- `POST https://api.cassanova.com/apikey/token` con `{ "apiKey": "…" }` →
  `{ access_token, expires_in: 3600, token_type: "Bearer" }`. Nessun token di
  rinnovo: allo scadere se ne chiede un altro con la stessa chiave
  (`rinnovaAutenticazione`), e se una risorsa risponde 401 prima della
  scadenza l'adattatore rifà il token e riprova **una** volta.
- **Scope**: decisi da Cassa in Cloud sulla chiave; Foodtech non ne chiede.
- Ogni chiamata: `Authorization: Bearer`, `X-Version: 1.0.0`,
  `X-Requested-With: *`.
- Chiave e token vivono cifrati in `IntegrationCredential` (tipo `API_KEY`),
  legati all'installazione; si sostituiscono con «Sostituisci la chiave API»,
  si cancellano con la disinstallazione. **Revocare** la chiave si fa presso
  Cassa in Cloud: l'API non ha un endpoint per farlo.
- Limiti: **360 chiamate per API ogni 10 minuti**; corpo massimo 100 KB;
  elenchi a pagine da 100. Lo stato HTTP del superamento del limite non è
  documentato: si gestisce il 429 come per ogni fornitore (DA VERIFICARE).

### Endpoint usati

| Endpoint | Per cosa |
|---|---|
| `POST /apikey/token` | token dalla chiave |
| `GET /salespoint` | punti vendita abilitati per la chiave (prova, scelta del punto vendita) |
| `GET /risto/rooms`, `GET /risto/tables` | sale e tavoli |
| `GET /categories`, `GET /products`, `GET /salesmodes`, `GET /taxes` | catalogo, listini, aliquote |
| `GET /documents/orders`, `GET /documents/orders/:id` | lettura ordini; ricerca dell'ordine dopo un conflitto |
| `POST /documents/orders/batch` | **creazione** ordine |
| `GET /documents/receipts` | pagamenti, dagli scontrini |

### Capacità

`locations`, `tables`, `menu`, `tax_rates`, `orders.read`, `orders.write`,
`payments.read`. La matrice completa (lettura, scrittura, webhook, direzione,
fonte di verità, livello di verifica) sta nella voce del catalogo
(`registry.ts`, campo `risorse`) ed è mostrata nel primo passo del percorso.
Il test del catalogo la confronta con le capacità dichiarate.

| Risorsa | API: lettura / scrittura / webhook | Direzione | Fonte di verità | Stato |
|---|---|---|---|---|
| Punti vendita | sì / — / — | Cassa → Foodtech | Cassa | documentata |
| Sale, tavoli | sì / — / — | Cassa → Foodtech | Cassa | documentata |
| Categorie, prodotti, listini, aliquote | sì / sì / sì | Cassa → Foodtech | Cassa | documentata; Foodtech non scrive |
| Ordini | sì / **solo creazione** / sì | Foodtech → Cassa | Foodtech | DA VERIFICARE |
| Aggiornamento e chiusura ordine | — / — / — | — | — | **non supportata dall'API documentata** |
| Pagamenti | dentro scontrini e conti / solo il prepagamento dell'ordine / sì | Cassa → Foodtech | Cassa | documentata |
| Emissione documento commerciale | — / — / — | — | Cassa (RT) | **non supportata dall'API documentata** |
| Metodi di pagamento | nessun elenco | — | Cassa | non supportata (solo l'enum `PaymentType`) |
| Clienti, magazzino | sì / sì / sì | non collegati | — | fuori ambito |
| Personale | — | — | — | non supportata |

### Modello dei punti vendita

Un account Cassa in Cloud ha uno o più punti vendita (`SalesPoint.id`, un
intero). Ogni locale Foodtech ne sceglie **uno** (`externalLocationId`), e
ogni lettura filtra `idsSalesPoint=[id]`. Due locali dello stesso gruppo
installano due volte, con la stessa chiave o con chiavi diverse: le
installazioni restano separate.

### Mappature

Scritte dalla sincronizzazione, **mai** dati di Foodtech: `FLOOR`, `TABLE`,
`CATEGORY`, `PRODUCT` (con prezzo, aliquota, varianti e prezzi per listino nei
metadati), `PRICE_LIST`, `TAX_RATE`; `ORDER` per gli ordini inviati (chiave:
il riferimento Foodtech, con lo stato dell'invio nei metadati). Tavoli,
prodotti e categorie si abbinano da soli solo quando il nome coincide e c'è un
solo candidato; il resto si abbina a mano nella scheda Mappatura.
L'importazione iniziale (trigger `INITIAL_IMPORT`) **propone** gli abbinamenti:
creare in Foodtech i prodotti della cassa non è implementato.

### Webhook

Si configurano **dal ristoratore** nelle impostazioni del portale MyCassa in
Cloud (l'API ha solo `GET /webhooks` in lettura): Foodtech mostra l'indirizzo
da incollare (scheda Connessione, e passo Attivazione) e un campo per il
segreto che Cassa in Cloud genera. Pipeline di sempre: firma → salvataggio →
deduplica → traduzione → gestore.

- **Firma**: HMAC-SHA1 di «segreto + corpo» in `x-cn-signature`. Si calcola
  con il segreto come chiave e il corpo come messaggio; si accettano firma
  esadecimale e base64 (**DA VERIFICARE** quale delle due, e la lettura della
  frase).
- **Operazione** in `x-cn-operation` (`ORDER/EDIT`…). Nessun id evento: la
  chiave di idempotenza è l'impronta di operazione e corpo (Cassa in Cloud
  ritenta al massimo tre volte, con lo stesso corpo).
- `ORDER/*` → stato dell'ordine; `RECEIPT/CREATE`, `BILL/CREATE` → pagamento
  riuscito, collegato all'ordine Foodtech tramite
  `document.documentConnectionSources.orders[].externalId` (**DA
  VERIFICARE**); `PRODUCT`, `CATEGORY`, `MODIFIER`, `DEPARTMENT`, `TAX` →
  sincronizzazione del menu o delle aliquote in coda (trigger `WEBHOOK`).

### Ordini: il flusso sala → cassa

```
Cameriere → Tavolo B2 → «Invia comanda»
  → fornitorePerLocale()          ← OGGI sempre la cucina Foodtech: NON collegato
  → fornitoreIntegrazione()       ← pronto e provato da solo (fornitore-integrazione.ts)
  → inviaOrdine()                 ← idempotente, PENDING_SYNC se la cassa non risponde
  → adapter.pos.createOrder()     ← POST /documents/orders/batch
```

Il corpo inviato (tutti campi documentati): `externalId` = `ft-<comandaId>`,
`isExternalOrder: true` (solo gli ordini esterni sono «visibili e gestibili
dall'app POS»), `deliveryMode: "TABLE"`, `idTable`, `dueDate`, e righe con
`idProductVariant`, `quantity`, `price`, `note`.

**Idempotenza**, tre livelli: la mappatura `ORDER` (un riferimento già
`SYNCED` non si rimanda), il lucchetto ottimistico sulla riga (tre invii
contemporanei → una chiamata), e il vincolo di unicità di Cassa in Cloud su
`externalId` (dopo un processo morto a metà, il `ConflictValue` fa ritrovare
l'ordine esistente fra quelli del tavolo, invece di crearne un secondo).

**Cassa giù**: l'ordine resta `PENDING_SYNC` e la coda dei lavori di sempre
(`integration.order`) riprova con attesa crescente; la sala non si ferma.

### Cosa resta DA VERIFICARE con un account vero

1. **La riga d'ordine di un prodotto semplice.** La riga documentata ha solo
   `idProductVariant`, e il modello dice che serve «se il prodotto è
   multivariante». Oggi Foodtech rifiuta i prodotti semplici invece di
   indovinare: è **la prima cosa** da provare (`codiceProdottoPerOrdine`).
2. Che un ordine esterno con `deliveryMode: TABLE` compaia **come comanda del
   tavolo** sull'app POS, e vada in stampa o al KDS.
3. Se `idCustomer`/`idOrganization` siano obbligatori per un ordine al tavolo
   (il modello `Document` dice «almeno uno»).
4. Il formato di `dueDate` (la documentazione dice date «yyyy-mm-dd», ma la
   vuole futura), e il minimo di anticipo accettato dalle regole del portale.
5. Come si passano le liste in query (`idsSalesPoint=[101]` è una lettura,
   non un esempio della documentazione).
6. Gli stati HTTP degli errori (la documentazione elenca solo i codici,
   `InvalidId`, `ConflictValue`…), incluso il superamento del limite.
7. La firma dei webhook (vedi sopra) e i campi degli ordini collegati negli
   scontrini.
8. Il significato di `OrderStatus.PROCESSED` (oggi letto come «chiuso»).

### Le domande a cui rispondere

| Domanda | Risposta dalla documentazione | Verificata? |
|---|---|---|
| Possiamo **creare** ordini da Foodtech? | Sì, `POST /documents/orders/batch` | no |
| Possiamo associarli a un **tavolo**? | Sì, `idTable` + `deliveryMode: TABLE` | no; che compaiano come comanda al tavolo è DA VERIFICARE |
| Possiamo **aggiornarli** (aggiungere piatti)? | **No**: nessun endpoint di aggiornamento. Ogni comanda sarebbe un ordine nuovo | — |
| Possiamo gestire **pagamento e chiusura**? | **No**: si leggono pagamenti e scontrini; si scrive solo lo stato di un prepagamento | — |
| Possiamo arrivare al **documento commerciale**? | **Non via API**: lo emette la cassa (RT) quando l'operatore chiude il conto sull'app POS. Foodtech può solo leggerlo dopo (`GET /documents/receipts`, webhook `RECEIPT/CREATE`) | — |

Quindi il flusso **cameriere → comanda → cucina** è plausibile sulla carta
(da provare), mentre **conto → pagamento → documento fiscale senza toccare
la cassa** non è ottenibile con l'API documentata: la chiusura resta un gesto
sull'app Cassa in Cloud. Foodtech non parla mai con l'Agenzia delle Entrate.

### Cosa serve per la prova reale

- una **API Key** di un account con licenza Risto Enterprise o Retail
  Enterprise, con almeno un punto vendita con sale e tavoli configurati e un
  prodotto multivariante e uno semplice;
- installare Cassa in Cloud da Impostazioni → Integrazioni con quella chiave,
  scegliere il punto vendita, provare, attivare con «Tavoli», «Menu»,
  «Aliquote», «Invio ordini»;
- verificare gli otto punti DA VERIFICARE, nell'ordine; creare un webhook su
  MyCassa in Cloud con l'indirizzo mostrato e incollarne il segreto;
- mandare un ordine di prova con `inviaOrdine` (non dall'interfaccia: il
  pulsante «Invia comanda» non è collegato) e guardarlo comparire sulla cassa;
- solo dopo: `implementazione: "IMPLEMENTED"` e il collegamento di
  `fornitorePerLocale`.

Per provare l'interfaccia **senza** una chiave vera c'è
`CASSA_IN_CLOUD_API_BASE`, accettata solo se punta a `http://localhost` o
`http://127.0.0.1` (un server finto sulla stessa macchina); qualunque altro
valore è ignorato, così una variabile sbagliata non può mandare la chiave di
un ristorante altrove.

---

## Tilby

Terzo adattatore POS, 23 settembre 2026. Fonti: solo quelle ufficiali —
il portale https://developer.tilby.com/ (guide, `llms.txt` e le 164 pagine
del reference con lo schema OpenAPI incorporato) e il PDF ufficiale
«Stampa automatica comande e scontrini» (5 aprile 2024) linkato dal portale.
Nessun blog, forum o materiale commerciale. Stato: **IN_DEVELOPMENT /
PREVIEW**, «Anteprima» in interfaccia.

### I quattro bollini

| Bollino | Cosa vuol dire | Tilby |
|---|---|---|
| IMPLEMENTATO | il codice esiste | sì |
| FIXTURE TESTED | provato con risposte costruite sugli schemi e sugli esempi della documentazione | sì (adattatore, piattaforma su database, browser con server finto) |
| SANDBOX TESTED | provato contro la sandbox di Tilby | **no** — serve l'ammissione al Developer Program |
| REAL POS TESTED | provato su una cassa Tilby vera con stampante e RT | **no** |

Per ogni capacità, i livelli usati sotto: DOCUMENTED (lo dice la
documentazione), IMPLEMENTED, TESTED_WITH_FIXTURE, TESTED_SANDBOX,
TESTED_REAL_ACCOUNT, TESTED_REAL_POS. Oggi nessuna capacità supera
TESTED_WITH_FIXTURE.

### Developer Program (requisito, non aggirabile)

Dal portale: le richieste di accesso sono **valutate** da Tilby, e l'uso
delle API è **soggetto a un canone**. Il percorso documentato è:

1. richiesta di un ambiente sandbox; accesso da `login.tilby.com`;
2. richiesta di un token statico per la sandbox;
3. integrazione e prove in sandbox;
4. produzione: preventivo, firma, e token statico concesso dal titolare del
   negozio;
5. **certificazione** dell'integrazione, obbligatoria.

Ogni integrazione ha un **Client ID** che determina a quali API accede
(`GET /sessions/me` lo restituisce). Foodtech non ha ancora fatto richiesta:
nessun account è stato registrato e nessun piano acquistato.

### Autenticazione

- **Token statico per negozio**, `Authorization: Bearer <token>`. Un token
  vale per un solo shop. Scadenza, rinnovo, scope e revoca **non sono
  documentati** (l'endpoint `DELETE /webhooks` è intitolato «Delete a static
  token» nel reference: refuso probabile, DA VERIFICARE).
- In Foodtech il token si inserisce nel percorso di installazione, viene
  verificato subito con `GET /sessions/me`, e si salva **cifrato** (AES-GCM
  legato a locale e installazione) come credenziale di tipo `TOKEN`. Non
  torna mai al browser, non compare nei log (redazione del client HTTP) né
  nel registro delle sincronizzazioni.
- 401/403 → «Token Tilby non valido o revocato» (`AUTH_INVALID`), e
  l'integrazione passa a «richiede attenzione». Non c'è un rinnovo
  automatico perché non esiste un refresh documentato.

### Sandbox e produzione

L'ambiente si sceglie nella configurazione (scelta chiusa: `sandbox` /
`production`), **senza modificare il codice e senza indirizzi liberi**. Il
reference dichiara un solo host, `https://api.tilby.com/v2`; le guide usano
ancora il vecchio `api.scloby.com`. Un host separato per la sandbox **non è
documentato**: oggi entrambi gli ambienti puntano all'host ufficiale e la
differenza la fa il token (DA VERIFICARE al primo accesso alla sandbox; se
esiste un host diverso si cambia una riga in `adapters/tilby/config.ts`).

`TILBY_API_BASE` esiste **solo** per le prove con un server finto: accettata
se è `http://localhost` o `http://127.0.0.1` (porta e `/v2` facoltativi),
ignorata in ogni altro caso.

### Endpoint usati

| Endpoint | Uso |
|---|---|
| `GET /sessions/me` | verifica del token, negozio collegato |
| `GET /rooms` | sale con i loro tavoli (`tables[]`) |
| `GET /items`, `GET /categories` | prodotti (reparto, IVA, `price1…price10`, varianti) e categorie |
| `GET /vat` | aliquote |
| `GET /payment_methods` | metodi di pagamento con `payment_method_type_id` |
| `GET /customers` | clienti (solo sincronizzazione completa, lettura) |
| `POST /sales` | la comanda: vendita aperta al tavolo con `auto_print_order` |
| `GET /sales`, `GET /sales/{id}` | lettura del conto; ricerca per `uuid` / `external_id` |
| `PUT /sales/{id}` | aggiunte allo stesso conto; registrazione di un pagamento |
| `DELETE /sales/{id}` | annullamento (semantica fiscale DA VERIFICARE) |
| `GET/POST/DELETE /webhooks` | registrazione e rimozione dei webhook |

`/orders` è **deprecato dal 1° luglio 2024** (il reference rimanda a
`/sales`) e non si usa. Paginazione: `pagination=true&per_page=100&page=0…`,
massimo 20 pagine per risorsa per sincronizzazione.

### Matrice delle capacità

R/C/U/D = lettura, creazione, modifica, cancellazione **via API documentata**.
«Foodtech» = cosa usa l'adattatore oggi. Livello massimo raggiunto per tutte:
TESTED_WITH_FIXTURE.

| Entità | R | C | U | D | Webhook | Sandbox | Foodtech | Note |
|---|---|---|---|---|---|---|---|---|
| Negozio (location) | sì | — | — | — | — | DA VERIFICARE | legge | uno per token; catena via `/chain_shops/{id}` non usata |
| Sale | sì | sì | sì | sì | UPDATED | DA VERIFICARE | legge | |
| Tavoli | sì (dentro le sale) | via sala | via sala | via sala | via `rooms` | DA VERIFICARE | legge + mappa | |
| Prodotti | sì | sì | sì | sì | C/U/D | DA VERIFICARE | legge + mappa | reparto e IVA servono alla vendita |
| Varianti | sì (`variations`) | via prodotto | via prodotto | via prodotto | via `items` | DA VERIFICARE | legge | non inviate nelle righe |
| Modificatori | parziale (`ingredients` sulla riga) | — | — | — | — | DA VERIFICARE | no | vanno nella nota di riga |
| Categorie | sì | sì | sì | sì | UPDATED | DA VERIFICARE | legge + mappa | |
| Listini | sì (`price1…price10` sul prodotto) | — | — | — | via `items` | DA VERIFICARE | legge | la comanda usa il prezzo mappato |
| Aliquote | sì | — | — | — | — | DA VERIFICARE | legge + mappa | |
| Reparti | sì | sì | sì | sì | sì | DA VERIFICARE | legge (nel prodotto) | |
| Clienti | sì | sì | sì | sì | sì | DA VERIFICARE | legge (anteprima) | Foodtech non scrive clienti |
| Ordini `/orders` | deprecato | deprecato | deprecato | deprecato | — | — | **no** | sostituito da `/sales` |
| Righe d'ordine | dentro la vendita | via PUT | via PUT | via PUT | via `sales` | DA VERIFICARE | aggiunge | modificare/cancellare righe: DA VERIFICARE |
| Vendite | sì | sì | sì | sì | C/U/CLOSED/D | DA VERIFICARE | crea, aggiunge, legge, annulla | |
| Pagamenti | dentro la vendita | via PUT | via PUT | — | CLOSED | DA VERIFICARE | legge; scrittura presente ma **non usata** da nessuna schermata | |
| Scontrini | `sale_documents[]` | automatico (vedi sotto) | — | — | CLOSED | DA VERIFICARE | legge | emessi dalla cassa/RT |
| Fatture | `sale_documents[]` | UNKNOWN | — | — | CLOSED | DA VERIFICARE | legge | |
| Magazzino | sì | sì (movimenti) | — | — | sì | DA VERIFICARE | no | |
| Personale | non documentato | — | — | — | — | — | no | `seller_id` fisso a 0, come negli esempi |
| Cucina | stampa via `auto_print_order` + `exit` | — | — | — | — | DA VERIFICARE | sì (campo della vendita) | serve un dispositivo Tilby acceso con stampa automatica |
| Stampanti | sì (`/printers`) | — | — | — | — | DA VERIFICARE | no | |

### Ordini, cucina e aggiunte

La guida ufficiale alla stampa automatica descrive tre casi; Foodtech usa il
primo e il terzo:

- **Caso 1 — solo comanda**: `POST /sales` con `status: "open"`,
  `auto_print_order: true`, tavolo e sala (`table_id`, `room_id` e
  `tables[]`), ogni riga con `exit: 1`. La comanda esce sulla stampante di
  reparto; il conto resta aperto e si chiude in cassa.
- **Caso 3 — tavolo aperto con riordino continuo**: ogni aggiunta è un
  `PUT /sales/{id}` sulla **stessa vendita**, con le righe nuove a `exit`
  incrementato (massimo 10). È lo **scenario A** (aggiornare lo stesso
  ordine), documentato.
- **Caso 2 — comanda + scontrino**: la vendita si chiude da sola quando i
  pagamenti (`paid: true`, coppia `payment_method_id` /
  `payment_method_type_id` valida) coprono il totale. Foodtech **non** lo
  usa: chiudere il conto e far emettere lo scontrino resta alla cassa.

Idempotenza: `uuid` v4 obbligatorio e unico su testata e righe. Foodtech lo
deriva in modo deterministico dal riferimento della comanda (`ft-<id>`): se
la risposta di `POST /sales` si perde, il tentativo successivo riceve un
errore, cerca la vendita per `uuid` e la adotta invece di duplicarla. Le
aggiunte ripetute non raddoppiano i piatti (righe con lo stesso `uuid`
saltate). Reparto, aliquota e prezzo della riga vengono dalla mappatura del
prodotto; se mancano, la comanda non parte.

Il flusso completo (provato con fixture, non su cassa):

```
20:10  B2, prima comanda (2 antipasti)   → POST /sales, exit 1 → stampa in cucina
20:35  B2 aggiunge 2 dessert e 2 caffè   → PUT /sales/{id}, righe nuove exit 2
21:30  pagamento e scontrino             → in cassa, dall'operatore
       webhook sales/CLOSED              → Foodtech segna il conto chiuso
21:40  B2 ordina un amaro                → nuova vendita (il conto precedente è chiuso)
```

### Pagamenti e documenti fiscali

| Operazione | Classificazione |
|---|---|
| Registrare un pagamento (anche parziale, più metodi) | API_SUPPORTED (documentato), REQUIRES_REAL_TEST |
| Conto diviso | UNKNOWN — `sale_parent_id` / `split_sale_origin_uuid` esistono, semantica non documentata |
| Chiudere il conto | API_SUPPORTED **indirettamente**: chiusura automatica a pagamento completo; REQUIRES_REAL_TEST |
| Emettere scontrino / documento commerciale | emesso dal dispositivo Tilby con RT, attivato dal caso 2; REQUIRES_REAL_TEST |
| Leggere lo scontrino dopo | API_SUPPORTED: `sale_documents[]` (numero, data, `document_url`) + webhook `sales/CLOSED` |
| Fattura | UNKNOWN |
| Annullo / reso fiscale | POS_MANUAL_ONLY per quanto documentato (`DELETE /sales` su vendita chiusa: DA VERIFICARE) |

Foodtech **non** si collega all'Agenzia delle Entrate e **non** modifica il
proprio sistema fiscale: il fiscale resta alla cassa Tilby.

Scorciatoia documentata per l'operatore (solo app Windows/Mac): il deep link
`tilby://cashregister/sale/<id>?advancedpayments=true` apre la vendita nella
schermata di pagamento. Non è usato dal codice.

### Webhook

- Registrati **all'attivazione** con `POST /webhooks` (uno per coppia
  entità/evento per negozio, come da documentazione): `sales`
  CREATED/UPDATED/CLOSED/DELETED, `items` CREATED/UPDATED/DELETED,
  `categories` UPDATED, `rooms` UPDATED. Serve `TILBY_WEBHOOK_EMAIL` (campo
  obbligatorio): senza, l'attivazione riesce ma non registra niente, e lo
  scrive nei metadati.
- Se sulla stessa coppia c'è già il webhook di un altro integratore non si
  tocca (`webhookGiaDiAltri`). I nostri con un indirizzo vecchio si
  sostituiscono.
- Alla disinstallazione si cancellano quelli registrati; l'indirizzo cambia
  comunque, e il vecchio risponde 404.
- **Nessuna firma documentata.** L'autenticazione è l'indirizzo segreto
  (`/api/integrations/webhooks/tilby/<chiave casuale>`), come per ogni
  webhook della piattaforma; il corpo è validato nella forma.
- Idempotenza sul `notification_uuid` (`WebhookEvent`): i tentativi ripetuti
  di Tilby (almeno 3, ogni 15 minuti, `nRetry`) si lavorano una volta. La
  notifica di prova `SUBSCRIBED` riceve 200.
- `environment_id`: la documentazione lo descrive come id del negozio, ma
  l'esempio mostra `s3_e2e_restaurant`. Il confronto con il negozio
  collegato è **disattivato** finché non si vede una notifica vera (DA
  VERIFICARE).
- Traduzione: `sales` → stato del conto (CLOSED → chiuso + pagamento
  riuscito; DELETED → annullato); `items`/`categories` → sincronizzazione del
  menu in coda; `rooms` → sincronizzazione dei tavoli.

### Direzioni e fonte di verità

| Dato | Direzione | Fonte di verità |
|---|---|---|
| Sale, tavoli | Tilby → Foodtech (mappatura) | Tilby per la cassa, Foodtech per la pianta di sala |
| Prodotti, categorie, listini, IVA, reparti | Tilby → Foodtech (mappatura) | Tilby |
| Metodi di pagamento | Tilby → Foodtech | Tilby |
| Clienti | Tilby → Foodtech (anteprima, sola lettura) | Foodtech per il CRM |
| Comande (vendite aperte) | Foodtech → Tilby | Foodtech fino all'invio, poi Tilby |
| Stato del conto, pagamenti, scontrini | Tilby → Foodtech (webhook + lettura) | Tilby |

L'importazione iniziale **scrive solo mappature** (`ExternalEntityMapping`,
nessuna tabella propria di Tilby): abbina da sola solo il certo (nome
identico, uno a uno), il resto si abbina a mano nella schermata delle
mappature, e **non sovrascrive** prezzi, nomi o tavoli di Foodtech.

### Limiti di frequenza

Nessun limite documentato. Valgono quelli della piattaforma: 429 →
`RATE_LIMITED`, `Retry-After` rispettato se presente, backoff della coda; le
comande in errore temporaneo restano `PENDING_SYNC` e si riprovano.

### Il contratto con la sala

`fornitoreIntegrazione` (non collegato) ora sa fare le aggiunte: se la cassa
ha `updateOrder` e il tavolo ha già un conto aperto mandato da Foodtech, la
nuova comanda si accoda con `inviaOrdine(..., { aggiuntaA })`; se la prima
comanda è ancora in attesa, l'aggiunta aspetta (`ORDINE_BASE_IN_ATTESA`)
invece di aprire un secondo conto. **Il pulsante «Invia comanda» non è
collegato**: lo sarà solo per un fornitore con il bollino REAL POS TESTED.

### Cassa in Cloud e Tilby a confronto

Fatti documentati, non una classifica.

| | Cassa in Cloud | Tilby |
|---|---|---|
| Accesso alle API | chiave API generata dal cliente | Developer Program: valutazione, canone, certificazione |
| Autenticazione | API key → token a scadenza | token statico per negozio |
| Sandbox | non documentata | documentata (su richiesta), host DA VERIFICARE |
| Sedi per credenziale | più punti vendita | un negozio |
| Creare la comanda | `POST /documents/orders/batch` | `POST /sales` |
| Tavolo sulla comanda | `idTable` | `table_id` + `room_id` |
| Aggiunte allo stesso conto | nessun aggiornamento documentato → ordine nuovo | `PUT /sales/{id}` con `exit` incrementato |
| Stampa in cucina via API | non documentata | `auto_print_order` + `exit` (dispositivo acceso) |
| Idempotenza | `externalId` unico | `uuid` unico |
| Registrare pagamenti via API | solo lo stato di un prepagamento dell’ordine | `payments[]` con `paid: true` |
| Far emettere lo scontrino via API | no (lo emette la cassa alla chiusura) | indiretto: chiusura automatica a pagamento completo |
| Leggere lo scontrino | sì: `GET /documents/receipts`, webhook `RECEIPT/CREATE` | `sale_documents[]` |
| Webhook | configurati a mano, firmati HMAC-SHA1 | registrati via API, **senza firma** |
| Limiti di frequenza | 360 chiamate per API ogni 10 minuti | non documentati |
| Livello raggiunto in Foodtech | TESTATO CON FIXTURE | FIXTURE TESTED |

### Cosa resta DA VERIFICARE (sandbox o cassa vera)

1. host della sandbox; `environment_id` nelle notifiche;
2. che `POST /sales` con `auto_print_order` stampi davvero la comanda, e con
   quale ritardo, con un dispositivo acceso;
3. il `PUT` con righe nuove a `exit` 2: stampa solo le nuove?
4. cancellare o ridurre una riga già stampata (`deleted_at`? riga omessa?);
5. cambio tavolo, unione e divisione dei conti;
6. `seller_id: 0` accettato in produzione;
7. risposta di `POST /sales` a un `uuid` ripetuto (oggi si assume un errore
   4xx seguito da ricerca per `uuid`);
8. effetto di `DELETE /sales/{id}` su una vendita aperta e su una chiusa;
9. revoca del token; esistenza di scadenze.

### Cosa chiedere a Tilby per il Developer Program

- accesso alla sandbox e un token statico di prova; se la sandbox ha un host
  proprio;
- il Client ID di Foodtech e quali API abilita (vendite, stanze, prodotti,
  webhook);
- canone e condizioni per la produzione; requisiti della certificazione;
- conferma dei punti DA VERIFICARE sopra, in particolare stampa comande,
  aggiunte, righe annullate, `seller_id`, autenticità dei webhook, limiti di
  frequenza;
- un negozio di prova con stampante e RT per il test su cassa vera.

---

## Oracle MICROS Simphony

Quarto adattatore POS, 23 settembre 2026. Fonti: solo quelle ufficiali di
docs.oracle.com:

- la guida **Simphony Transaction Services Gen2 API**
  (https://docs.oracle.com/en/industries/food-beverage/simphony/omsstsg2api/)
  e il suo `swagger.json` (versione 2026.08.15);
- le collezioni Postman ufficiali;
- la guida **Configuration and Content API**
  (https://docs.oracle.com/en/industries/food-beverage/simphony/ccapi/);
- le pagine di Reporting and Analytics sugli API account.

Nessuna API Gen1: la guida Gen2 non la cita nemmeno.

Stato: **IN_DEVELOPMENT / PREVIEW**, «Anteprima» in interfaccia.

### I livelli di verifica

| Livello | Cosa vuol dire | Oracle Simphony |
|---|---|---|
| IMPLEMENTED | il codice esiste | sì |
| TESTED_WITH_FIXTURE | provato con un server finto costruito sullo swagger | sì (adattatore, piattaforma su database, browser) |
| TESTED_AGAINST_ORACLE_ENVIRONMENT | provato contro un ambiente Simphony Cloud di test | **no**: Oracle non offre una sandbox pubblica |
| TESTED_REAL_POS | provato su un POS vero (cucina, pagamenti, chiusura) | **no** |
| TESTED_REAL_POS_ITALY | provato su un Simphony italiano con RT e documento commerciale | **no** |

### Quali API di Oracle, e per cosa

| API | Cosa offre | Foodtech la usa? |
|---|---|---|
| STS Gen2 — Organization API | organizzazioni, location, revenue center (con `tables[]`, `orderTypes[]`, `orderChannels[]`) | sì |
| STS Gen2 — Configuration API v1/v2 | menu (voci, definizioni, prezzi, famiglie, condimenti), sconti, maggiorazioni, tender, tasse, voci non disponibili, barcode. **Sola lettura** | sì |
| STS Gen2 — Checks API | creare, leggere, annullare check; round; calcolo; stampa; `connectionStatus` | sì |
| STS Gen2 — Notifications API | notifiche di check, configurazione, organizzazione, dipendenti | sì |
| STS Gen2 — Employees API | verifica di un dipendente (`GET /employees?EmployeeId`) | solo per controllare il dipendente delle transazioni |
| Configuration and Content API (CCAPI) | **gestione** della configurazione (887 operazioni, tutte POST), comprese le scritture | **no** |

Perché la CCAPI non si usa:

- richiede un **API account di un altro tipo** («Simphony Configuration API»);
- è uno strumento di CRUD sul database senza le validazioni di EMC;
- ha limiti di frequenza bassi (1 chiamata al secondo per molti ambienti);
- usa identificativi (`hierUnitId`, `objectNum`) senza una corrispondenza
  ufficiale con quelli dei check (`locRef`, `rvcRef`, `menuItemId`).

Tutto ciò che serve a mandare comande esiste già in STS Gen2, con gli stessi
identificativi dei check. Oracle chiede anche di non usare STS Gen2 per
analisi, estrazioni massive o gestione della configurazione. Foodtech legge la
configurazione solo per ordinare, ogni 6 ore e quando una notifica dice che è
cambiata.

### Autenticazione: niente client secret

La richiesta partiva da un «Client ID + Client Secret». **La documentazione
non prevede un client secret né il grant `client_credentials`.** Il flusso
documentato per gli API account è OpenID Connect, Authorization Code + PKCE:

```
GET  {auth}/oidc-provider/v1/oauth2/authorize  response_type=code, client_id, scope=openid,
                                                redirect_uri=apiaccount://callback, code_challenge (S256)  → cookie
POST {auth}/oidc-provider/v1/oauth2/signin     username, password, orgname                              → redirectUrl?code=…
POST {auth}/oidc-provider/v1/oauth2/token      grant_type=authorization_code, code, code_verifier       → id_token, refresh_token
POST {auth}/oidc-provider/v1/oauth2/token      grant_type=refresh_token                                  → rinnovo
```

- **Il bearer è l'`id_token`**: l'`access_token` è documentato come «Not used».
- `id_token` valido 14 giorni, refresh token 28 giorni. Foodtech rinnova
  4 giorni prima della scadenza (Oracle consiglia 3–7 giorni). La
  sincronizzazione ogni 6 ore tiene viva la catena.
- La password dell'API account **scade dopo 60 giorni**; troppi tentativi
  sbagliati la bloccano per 30 minuti.
- **La password non si salva.** Serve solo al primo accesso. Si conservano,
  cifrati con AES-GCM legato a locale e installazione, `id_token`,
  `refresh_token`, indirizzi, Client ID e utente. Nulla torna al browser o
  finisce nei log (redazione del client HTTP).
- **Revoca:** Oracle non documenta un endpoint di revoca dei token. Alla
  disinstallazione Foodtech li cancella subito, e l'`id_token` scade da solo
  entro 14 giorni.
- Se il rinnovo fallisce («catena» interrotta, aggiornamento di Reporting
  and Analytics) l'integrazione passa a «richiede attenzione» e si
  ricollega con la password.

Gli **scope**: solo `openid`. I permessi li decide l'API account in Reporting
and Analytics: tipo «Simphony Transaction Services», Client Scope
(Both/Local/Cloud), Authorization Scope (tutto o per gerarchia/location).

### Indirizzi per installazione e SSRF

Ogni cliente ha i suoi indirizzi, visibili in EMC (Enterprise Parameters →
Applications): «Transaction Services Generation 2 Services» e «OpenID
Provider». Si inseriscono nel percorso di installazione e passano da
`src/server/integrations/indirizzi.ts`:

- solo `https:`, niente utente/password nell'indirizzo, niente query o
  frammento;
- niente IP scritti a mano, niente `localhost`;
- il dominio deve finire con un suffisso ammesso. Il predefinito è
  `oracleindustry.com`, l'unico esempio concreto della documentazione (guida
  CCAPI, «Find the URL»). L'operatore ne aggiunge altri con
  `ORACLE_SIMPHONY_DOMINI_CONSENTITI`, **mai** il ristoratore;
- **a ogni chiamata** il nome si risolve, e se un indirizzo è privato, di
  loopback, link-local (metadati cloud), CGNAT o riservato la chiamata non
  parte (protezione dal DNS che cambia dopo il salvataggio);
- i redirect sono vietati (`redirect: "error"`) su tutte le chiamate,
  comprese quelle di autenticazione;
- la password va all'OpenID Provider **solo dopo** questi controlli. Un
  indirizzo non ammesso non riceve nessuna chiamata (verificato nelle prove).

`ORACLE_SIMPHONY_ORIGINE_PROVA` ammette un'origine esatta di loopback, solo
per il server finto delle prove nel browser.

Solo la **Cloud API**. La Location API on-premises (porta 5443) vive nella
rete del ristorante, dove Foodtech non arriva, e non ha notifiche complete né
`connectionStatus`.

### Il modello multi-tenant

| Oracle | Foodtech | Perché |
|---|---|---|
| Organization (`orgShortName`) | nessuna corrispondenza automatica | è l'enterprise del cliente, e può servire più locali Foodtech |
| Location (`locRef`) + Revenue Center (`rvcRef`) | **un'installazione su un Venue** | il check nasce in un revenue center; `locRef` e `rvcRef` non sono unici da soli (la guida lo dice), quindi viaggiano insieme: `externalLocationId = "locRef:rvcRef"` |
| Order type (`orderTypeRef`) | configurazione dell'installazione | obbligatorio su ogni check |
| Dipendente (`checkEmployeeRef`) | configurazione dell'installazione | obbligatorio su ogni check: il «default transaction employee» configurato in EMC |
| Tavolo (`RevenueCenter.tables[]`, `tableName`) | `Table` Foodtech, via mappatura TABLE | solo identificativi: STS Gen2 non ha sale né posti |
| Check (`checkRef`) | il conto del tavolo, via mappatura ORDER | vedi sotto |

Un locale Foodtech con due revenue center (sala e bar) vuol dire oggi due
installazioni, cioè due Venue. **Un API account dedicato per locale**: la
registrazione delle notifiche è per API client, e due installazioni con lo
stesso account si ruoterebbero la chiave HMAC a vicenda.

### Stato della connessione

`HEAD /api/v1/checks/connectionStatus` risponde con `Simphony-POS-Connected`
(«ultimo stato noto»). È solo della Cloud API. Foodtech distingue:

- **API raggiungibile, POS collegato**: tutto normale;
- **API raggiungibile, POS scollegato**: la prova riesce ma avvisa («STS
  risponde, ma il revenue center non risulta collegato al POS»), la
  sincronizzazione lo scrive nel registro, e **una comanda non parte**:
  resta `PENDING_SYNC` e la coda riprova;
- **API giù** (5xx, 521 dopo 60 secondi, timeout): integrazione attiva e
  «da controllare», comande in attesa.

### Matrice delle capacità

R/C/U/D = lettura, creazione, modifica, cancellazione **via API documentata**.
Livello massimo raggiunto da ogni riga: TESTED_WITH_FIXTURE.

| Capacità | R | C | U | D | Notifica | Foodtech | Note |
|---|---|---|---|---|---|---|---|
| Organizations | sì | — | — | — | OrganizationsNotification | legge | quelle su cui l'API account è autorizzato |
| Locations | sì | — | — | — | idem | legge | |
| Revenue centers | sì | — | — | — | idem | legge, sceglie | con tavoli, tipi d'ordine, canali |
| Rooms | **no** | — | — | — | — | — | nessuna sala in STS Gen2 (la CCAPI non ha endpoint di sale) |
| Tables | sì (identificativi) | — | — | — | OrganizationsNotification | legge + mappa | CCAPI: CRUD dei dining tables, non usato |
| Menu items | sì | — | — | — | ConfigurationNotification (Menus) | legge + mappa | una voce per definizione (`menuItemId-definitionSequence`) |
| Condiments | sì | — | — | — | idem | legge + mappa (MODIFIER) | **non inviati** nelle comande |
| Modifiers / prefissi | sì (`options.condimentPrefixes`) | — | — | — | idem | no | `enable-condiment-prefix` non usato |
| Prices | sì (`prices[]`, livelli 0–8) | — | — | — | idem | legge | Foodtech non manda prezzi: li applica Oracle |
| Discounts | sì | — | — | — | Discounts | legge (DISCOUNT) | applicabili al check (`discounts[]`), non usati |
| Service charges | sì | — | — | — | ServiceCharges | legge (SERVICE_CHARGE) | idem |
| Taxes | sì | — | — | — | Taxes | legge | il calcolo è di Oracle |
| Tenders | sì | — | — | — | TenderItems | legge | `payment` o `serviceTotal` |
| Availability | sì (`/menus/items/unavailable`) | — | **no** | — | MenuItemAvailability | legge (`disponibile` nella mappatura) | **nessun endpoint per segnare un piatto esaurito** |
| Employees | solo verifica di un numero | — | — | — | EmployeesNotification | verifica il dipendente | nessun elenco |
| Checks | sì | sì | via round | sì (`DELETE`, «se permesso») | CheckNotification | crea, legge, annulla | |
| Rounds | sì (dentro il check) | sì | — | — | CheckNotification | aggiunge | `POST /checks/{checkRef}/round` |
| Check items | sì | con il check o un round | **no** | **no** | — | — | nessun void di riga, nessuna modifica di quantità |
| Payments | sì (`tenders[]`, `paymentTotal`) | sì (tender in un round) | **no** | **no** | — | legge; scrittura implementata, **non usata** | |
| Printed check | sì | — | — | — | — | legge (`getPrintedCheck`) | 40 colonne, non fiscale |
| Fiscal documents | **no** | **no** | — | — | — | — | nessuna menzione nella guida |

### Check = conto del tavolo

La mappatura ORDER si chiave sul **riferimento Foodtech** della comanda
(`ft-<comandaId>`). `invio.idEsterno` è il `checkRef`:

```
ft-cmd-1  (prima comanda di B2)  → idEsterno = checkRef 929aacee…   (POST /checks)
ft-cmd-2  (aggiunta)             → aggiuntaA = ft-cmd-1, stesso checkRef   (POST /checks/{checkRef}/round)
```

Dal `checkRef` di una notifica si risale al riferimento: è la prima comanda
inviata con quell'id (`eventi.ts`).

### Prima comanda: `POST /checks`

- Header del check con solo campi documentati: `orgShortName`, `locRef`,
  `rvcRef`, `idempotencyId`, `checkEmployeeRef`, `orderTypeRef`,
  `tableName`, `guestCount`.
- Righe: `menuItemId`, `definitionSequence` e `quantity` dalla mappatura
  prodotto. Nessun prezzo: lo applica Oracle.
- La nota va in `referenceText`, che Oracle limita a **20 caratteri**. Una
  nota più lunga **non si tronca**: potrebbe essere un'allergia, e la
  comanda si ferma con un errore chiaro.
- Un piatto con **condimenti obbligatori** (`CondimentGroupRule.minimumCount` ≥ 1)
  non parte: Foodtech non mappa ancora i condimenti.
- Nel check va un'**estensione** (`appName: "foodtech"`, `data` = riferimento,
  `options: ["includeInApiResponse"]`) che non si stampa e torna nelle
  risposte: serve a ritrovare il check.
- Prima del `POST`:
  1. `HEAD connectionStatus`: se il POS è scollegato la comanda resta in
     attesa;
  2. `GET /checks?tableName=…&includeClosed=true&sinceTime=…`: se il check
     con il nostro riferimento esiste già, lo si adotta.

**Check creato non vuol dire comanda stampata.** Documentato:

- `fireTime` è «quando la preparazione inizia»; senza, vale adesso;
- `preparationStatus: Submitted` vuol dire «almeno una voce mandata in
  cucina» (senza KDS da STS Gen2 1.9.1);
- in EMC si assegnano Order Devices e stampanti alla workstation «POSAPI
  Client» che lavora le richieste.

Non documentato in modo esplicito: che il `POST` mandi alle stampanti di
produzione. Classificazione: **DOCUMENTED** (segnali) +
**REQUIRES_REAL_POS_TEST** (stampa vera). Foodtech registra la
`preparazione` arrivata da `CheckNotification`, e la risposta al cameriere
resta `presaInCarico: false`: nessun «inviata in cucina» prima della
conferma di Oracle.

### Idempotenza nativa

- `Simphony-Features: detect-duplicate-request` su `POST /checks` e sui round
  (Simphony 19.8.4, STS Gen2 1.7.4).
- `header.idempotencyId`: UUID v4 senza trattini, **derivato** da
  `venue:riferimento:operazione` (`create`, `round`, `payment`, `calculate`).
  Lo stesso a ogni tentativo, anche dopo un riavvio.
- Oracle ricorda la richiesta per **300 secondi** e **solo sulla stessa
  workstation**. Un duplicato di una richiesta riuscita riceve la risposta
  originale con `isCachedResponse: true`. Un duplicato mentre la prima è
  ancora in lavorazione aspetta fino a 30 secondi, poi riceve 400
  `duplicate_request`: Foodtech lo tratta come «riprova».
- Oltre i 300 secondi, o su un'altra workstation, protegge la ricerca per
  estensione (check) e la marca nelle estensioni delle righe (round) e dei
  tender (pagamenti).
- Restano le guardie locali di sempre: mappatura unica, presa in carico
  condizionata, `PENDING_SYNC`, coda.

### Aggiunte: `POST /checks/{checkRef}/round`

«Aggiunge un round a un check esistente… non altera le voci dei round
precedenti.» È la primitiva di «Aggiungi comanda»:

```
20:10  B2: 2 antipasti, 2 primi      → POST /checks              → checkRef 929aacee…
20:40  B2: 2 dessert, 2 caffè        → POST /checks/929aacee…/round   (righe vecchie intatte, totale ricalcolato da Oracle)
21:30  il check viene pagato sul POS → status: closed
21:40  B2: 1 caffè                   → il round troverebbe il check chiuso: si apre un check nuovo
```

La scelta fra check nuovo e round vive nel **service layer**:

- `fornitoreIntegrazione` guarda se il tavolo ha un conto aperto mandato da
  Foodtech;
- `ordini.ts`, se l'adattatore risponde `contoChiuso` (check chiuso o
  sparito), apre un check nuovo, segna chiuso quello vecchio e fa diventare
  la comanda la base delle aggiunte successive.

Il **numero di sequenza del round** non è documentato come campo
(`tableGroupNumber` conta i check aperti sullo stesso tavolo, non i round).

### Righe già inviate

| Operazione | Classificazione |
|---|---|
| Cambiare quantità | NOT_SUPPORTED (nessun endpoint; il round non altera le righe precedenti) |
| Void / rimuovere una riga | NOT_SUPPORTED |
| Sostituire una voce | NOT_SUPPORTED |
| Modificare un condimento | NOT_SUPPORTED |
| Trasferire una voce | NOT_SUPPORTED |
| Riaprire un round | NOT_SUPPORTED |
| Annullare tutto il check | SUPPORTED con riserva: `DELETE /checks/{checkRef}` «se in uno stato in cui l'annullamento è permesso» → REAL_POS_TEST |

### Tavoli

| Caso | Cosa permette STS Gen2 |
|---|---|
| Leggere i tavoli | sì, identificativi del revenue center |
| Check al tavolo | sì, `tableName` (numero o nome secondo l'opzione 18 del revenue center) |
| Più check sullo stesso tavolo (B2 → due conti) | sì in creazione: `tableGroupNumber` li conta, e `checkName` deve essere unico fra i check aperti. Foodtech però accoda al primo conto aperto: due conti al tavolo non sono ancora un caso di Foodtech |
| Cambio tavolo (B2 → B4) | **NOT_SUPPORTED**: `tableName` sta nell'header ma nessun endpoint lo modifica |
| Tavolata unica (B2 + B3) | **NOT_SUPPORTED**: nessun merge |
| Split check | **NOT_SUPPORTED**: nessun endpoint |

### Calcolo del conto

`POST /checks/calculator` calcola i totali «tenendo conto di voci,
disponibilità, sconti e maggiorazioni» **senza creare il check**; i tender
sono ignorati. Foodtech lo espone come `calculateOrder`, e ne mostra i totali
(`CheckTotals`) senza mai ricalcolarli: Oracle è la fonte di verità. Una voce
non disponibile risponde 400 con `menu_item_not_available`.

### Leggere il conto

`GET /checks/{checkRef}` e `GET /checks` (`includeClosed`, `sinceTime`,
`tableName`, `checkNumbers`, `checkEmployeeRef`, `orderTypeRef`) restituiscono
righe, tasse, sconti, maggiorazioni, tender e i totali: `subtotal`,
`subtotalDiscountTotal`, `autoServiceChargeTotal`, `serviceChargeTotal`,
`taxTotal`, `paymentTotal`, `totalDue`. `status` è `open` o `closed`.

### Tender e pagamenti

- I tender si importano (`GET /tenders/collection`) come mappature
  PAYMENT_METHOD, con il tipo `payment` o `serviceTotal`. Cash, carta,
  voucher o gift card non sono tipi distinti: sono tender configurati
  dall'operatore, e Oracle ne espone solo `tenderId`, nome e tipo.
- **Il pagamento non ha un endpoint suo.** Si passa da `tenders[]` nel corpo
  di `POST /checks` o di un round (`CheckTenderItem`: `tenderId`, `total`,
  `chargedTipTotal`, `referenceText`, `paymentData`, `extensions`).
- `total: 0` vuol dire «tutto il dovuto»: Foodtech manda sempre un importo
  esplicito.
- Parziale: implicito (`chargedTipTotal` «non è supportato con il pagamento
  parziale», dunque il parziale esiste), non descritto altrove.
- Over-tendering: citato solo per le mance.
- `paymentData` (SPI) è «solo per i partner di pagamento Oracle»: Foodtech
  non lo usa, quindi il tender registra un incasso avvenuto fuori, non muove
  denaro.
- Void di un pagamento: **non documentato**.
- `createPayment` è implementato (un round con soli tender, `idOperazione`
  stabile obbligatorio, idempotente anche a check già chiuso) e **nessuna
  schermata lo usa**.

**Split payment** (€120: A €40 contanti, B €30 carta, C €50 carta): più
tender sullo stesso check sono ammessi dalla forma (`tenders[]` è un
elenco, e più round possono portarne). L'adattatore li supporta, provato con
fixture. Il comportamento vero del POS è REQUIRES_REAL_POS_TEST.

**Split check** (pizza A al conto 1, pizza B al conto 2, vino diviso):
**non esiste** in STS Gen2.

### Chiusura del check

Documentato: `status: closed` = «pagato per intero… non può più essere
modificato». Nessun endpoint di chiusura e nessun «final tender» nominato.
Si deduce che il check si chiuda quando i tender coprono il dovuto (**inferenza**;
l'esempio di stampa mostra «Check Closed» dopo il pagamento). Foodtech **non
collega** la chiusura a nessuna schermata. **Nessuna notifica di chiusura è
documentata**: `CheckNotification` porta lo stato di preparazione. Foodtech
lo scopre leggendo il check (al round successivo, o con `getOrder`).

### Printed check

`GET /checks/{checkRef}/printed` → `{ items: [righe] }`, «testo adatto a una
stampante a 40 colonne». L'esempio dello swagger è una **guest check**
(«CHK 75 TBL 2/1», voci, Subtotal, Payment, Change Due, «Check Closed»).
Richiede che la workstation POSAPI Client abbia configurate la Customer
Receipt Printer e la Guest Check Printer, «altrimenti l'output può essere
vuoto». Foodtech lo chiama **printed check**, mai «scontrino».

### Documento fiscale italiano

La guida STS Gen2 non parla di fiscalità, di Paesi o di RT. Vanno tenuti
separati:

- **Oracle check**: il conto nel POS;
- **Oracle payment**: i tender sul check;
- **printed check**: testo a 40 colonne;
- **documento commerciale / RT**: il fiscale italiano.

Se la chiusura via Simphony causi l'emissione fiscale su un'installazione
italiana: **REQUIRES_REAL_ITALIAN_POS_TEST**. Foodtech non comunica con
l'Agenzia delle Entrate e non ha toccato il proprio sistema fiscale.

### Notifiche

- **Registrazione:** `PUT /notifications/registration` con `keyId` (GUID),
  `hmacKey` (32 byte casuali, Base64) e `keyType: "hmac-sha256"`. È il metodo
  preferito da Oracle, anche per ruotare la chiave. La chiave si aggiunge ai
  segreti cifrati.
- **Iscrizioni** (`POST /notifications/subscriptions`, `PushOnePostOffice`):
  - Check, Configuration e Organizations a livello di revenue center;
  - Employees a livello di location, perché con `rvcRef` Oracle risponde 400.
- **Autenticazione:** intestazioni `Digest` (Base64 dell'HMAC-SHA256 del
  corpo codificato ASCII, con la chiave registrata) e `Key-Id`.
  - Foodtech rifiuta con 401 chi non ha una firma valida o una chiave
    diversa.
  - Non è documentata un'altra protezione: niente mTLS, niente bearer,
    niente timestamp contro il replay. Resta l'indirizzo segreto di ogni
    installazione.
- **Consegna:** una volta sola, senza riprovare, con un timeout di 15
  secondi. Serve HTTPS sulla porta 443 e un dominio .com .net .org .edu .ca
  .io .site .se .sa: da un altro indirizzo Foodtech non si iscrive e lo
  scrive nei metadati.
- **Deduplica:** su `messages[].id`; un lotto di più messaggi prende un id
  derivato.
- **Traduzione:**
  - `CheckNotification`: stato di preparazione sulla mappatura del conto
    (`Submitted` → IN_PROGRESS, `Prepared`/`AllPrepared`/`Packaged` → READY);
  - `ConfigurationNotification`: sincronizzazione in coda (Menus,
    MenuItemAvailability, Discounts, ServiceCharges, Barcodes → menu; Taxes →
    aliquote; TenderItems → metodi di pagamento);
  - `OrganizationsNotification`: tavoli;
  - `EmployeesNotification`: conservata e ignorata.
- **Revenue center:** un messaggio di un altro revenue center si conserva e
  si ignora (`sede_diversa`).
- **Disinstallazione:** via le iscrizioni e la registrazione.

Poiché Oracle **non ritenta**, una notifica persa (Foodtech giù in quel
momento) non torna: la sincronizzazione ogni 6 ore e la lettura del check al
round successivo coprono il buco.

### Fonte di verità

Non è una scelta di Foodtech: STS Gen2 espone la configurazione **in sola
lettura**, quindi non esiste un modo documentato perché Foodtech la cambi.

| Dato | Fonte di verità | Direzione |
|---|---|---|
| Tavoli | Oracle (per il POS); la pianta di sala resta di Foodtech | Oracle → mappatura |
| Menu | Oracle | Oracle → mappatura |
| Prezzi | Oracle (li applica al check) | nessuna: Foodtech non manda prezzi |
| Tasse | Oracle | Oracle → mappatura |
| Sconti | Oracle | Oracle → mappatura |
| Tender | Oracle | Oracle → mappatura |
| Check | Foodtech fino all'invio, poi Oracle | Foodtech → Oracle, poi lettura |
| Pagamenti | Oracle | lettura (scrittura non collegata) |

L'importazione iniziale scrive **solo mappature** (`ExternalEntityMapping`):
anteprima → abbinamento (automatico solo per il nome identico e unico) →
conferma a mano nella schermata delle mappature. Non sovrascrive nomi, prezzi
o tavoli di Foodtech.

### Disponibilità dei piatti

`GET /menus/items/unavailable` restituisce le definizioni non disponibili, e
`MenuItemAvailability` avvisa quando cambiano. Foodtech lo scrive nella
mappatura prodotto (`disponibile: false`): pronto per la dashboard del
cameriere, non ancora mostrato. «Esaurito», «disponibile» e
«temporaneamente non disponibile» non sono stati distinti da Oracle: c'è solo
«non disponibile». Segnare un piatto esaurito da Foodtech: **nessun endpoint**
(né in STS Gen2 né in CCAPI).

### Latenza on-premises

La guida avverte che molte operazioni sui check passano da servizi
on-premises, con latenza maggiore, e che Oracle risponde 521 dopo 60
secondi.

- Foodtech aspetta fino a 65 secondi sulle chiamate ai check.
- Il cameriere non aspetta mai: la comanda è salvata in Foodtech, l'invio è
  un lavoro in coda (`PENDING_SYNC` → riprova → `SYNCED`), e la risposta
  alla sala resta `presaInCarico: false` finché Oracle non ha confermato.

### Il contratto con la sala

```
Cameriere Foodtech → «Invia comanda» → inviaComanda() → fornitorePerLocale()   ← oggi: la cucina Foodtech
                                                   ↘ fornitoreIntegrazione()  ← pronto, NON collegato
                                                        → inviaOrdine({ aggiuntaA? })
                                                             → nessun conto aperto: createOrder  = POST /checks
                                                             → conto aperto:        updateOrder  = POST /checks/{checkRef}/round
                                                             → conto chiuso:        ripiego su POST /checks
```

«Invia comanda», «Paga» e «Chiudi conto» **non sono collegati**, e non lo
saranno prima di TESTED_AGAINST_ORACLE_ENVIRONMENT (comande),
TESTED_REAL_POS (cucina e pagamenti) e TESTED_REAL_POS_ITALY (qualunque
effetto fiscale).

### Cosa serve per una prova reale

- Simphony Cloud Service (Standard Cloud Service nell'Oracle Hosting Center)
  con **STS Gen2 abilitato da Oracle Hosting**, versione ≥ 19.8.4 con STS
  Gen2 ≥ 1.7.4 (idempotenza); ≥ 1.9.1 per `Submitted` senza KDS.
- In EMC:
  - opzione del revenue center «74 - Enable Simphony Transaction Services
    Gen 2»;
  - almeno una (Oracle ne consiglia due) workstation «3 - POSAPI Client» con
    «Transaction Services (Gen2) Cloud API», intervallo di numeri di check,
    tipo d'ordine predefinito, Order Devices e stampanti (Guest Check e
    Customer Receipt);
  - tender predefinito;
  - il **dipendente delle transazioni** con il suo operator record nel
    revenue center.
- Un **API account** in Reporting and Analytics:
  - Administration → System → API Accounts;
  - tipo «Simphony Transaction Services»;
  - privilegio «Manage API Accounts» per chi lo crea.
  Se ne ottengono Client ID, utente e password (con l'email di benvenuto),
  Enterprise Short Name, Authentication Server e Application Server.
- I due indirizzi (Services e OpenID Provider) e, se non sono su
  `oracleindustry.com`, il dominio in `ORACLE_SIMPHONY_DOMINI_CONSENTITI`.
- Location e revenue center autorizzati all'account.
- Per le notifiche, Foodtech raggiungibile in HTTPS su un dominio ammesso.
- **Non esiste una sandbox pubblica**: Oracle parla di ambienti di test e di
  produzione separati, dentro l'abbonamento del cliente.

### Cosa resta DA VERIFICARE

1. I domini veri degli ambienti Simphony Cloud.
2. Che le estensioni `includeInApiResponse` tornino davvero nelle risposte
   (servono a ritrovare check, round e pagamenti).
3. La stampa in cucina di `POST /checks` e dei round.
4. La chiusura automatica a dovuto zero; l'effetto fiscale in Italia.
5. Cosa risponde un round su un check chiuso (qui si legge il check prima).
6. Se `orgname` del signin distingue le maiuscole (Foodtech lo manda in
   minuscolo, come le intestazioni `Simphony-*`).
7. La firma delle notifiche con caratteri non ASCII.
8. `priceSequence`: Foodtech non lo manda e si affida al prezzo predefinito.
9. Se serve un tender `serviceTotal` per «mandare» un check senza pagamento
   («A service total is used to submit an order without payment»): oggi
   Foodtech non lo aggiunge.

### Confronto fra i quattro fornitori POS

Fatti documentati, non una classifica. «non letto» = la documentazione lo
offre ma Foodtech non ne ha letto il formato.

| | Lightspeed K-Series | Cassa in Cloud | Tilby | Oracle Simphony STS Gen2 |
|---|---|---|---|---|
| Creare ordine/conto | ordine locale (Order and Pay) | `POST /documents/orders/batch` | `POST /sales` | `POST /checks` |
| Tavolo | `tableNumber` | `idTable` | `table_id` + `room_id` | `tableName` |
| Round successivi | non implementato | nessun aggiornamento documentato → ordine nuovo | `PUT /sales/{id}` con `exit` incrementato | `POST /checks/{checkRef}/round` |
| Modificare righe inviate | non letto | no | `PUT` completo, effetto DA VERIFICARE | no |
| Cucina | non verificato | non documentata | `auto_print_order` + `exit` (dispositivo acceso) | Order Devices della workstation; `fireTime`, `preparationStatus` |
| Pagamenti | «Apply a Payment» esiste, non letto | solo stato di un prepagamento | `payments[]` con `paid: true` | `tenders[]` nel check o in un round |
| Parziali | non letto | no | documentati | impliciti (citati per le mance) |
| Più metodi sullo stesso conto | non letto | no | documentati | sì (`tenders[]` è un elenco) |
| Chiudere il conto | non letto | no (lo fa la cassa) | automatico a pagamento completo | `status: closed` a pagamento completo (inferenza), nessun endpoint |
| Stampa del conto | non letto | no | — | `GET /checks/{checkRef}/printed` (40 colonne, non fiscale) |
| Documento fiscale | non letto | lo emette la cassa; si legge `GET /documents/receipts` | lo emette la cassa; si legge `sale_documents[]` | nessuna menzione |
| Notifiche / webhook | registrati via API, autenticazione Basic | configurati a mano, HMAC-SHA1 | registrati via API, **senza firma** | registrati via API, HMAC-SHA256 (`Digest`), **nessun ritentativo** |
| Sandbox / prove | ambiente Trial (client partner) | non documentata | sandbox su richiesta (Developer Program) | nessuna sandbox pubblica; ambienti di test del cliente |
| Autenticazione | OAuth2 (client di Foodtech) | API key → token a scadenza | token statico per negozio | OIDC Authorization Code + PKCE con API account (niente client secret) |
| Multi-sede | più sedi per account | più punti vendita per chiave | un negozio per token | organizzazione → location → revenue center; un'installazione per revenue center |
| Idempotenza | non letto | `externalId` unico | `uuid` unico | `idempotencyId` + `detect-duplicate-request` (300 s, una workstation) |
| Livello raggiunto | TESTED_WITH_FIXTURE | TESTED_WITH_FIXTURE | TESTED_WITH_FIXTURE | TESTED_WITH_FIXTURE |

---

## Provider Certification

Dal 24 settembre 2026 nessun nuovo fornitore: la piattaforma si prepara alla
**prima prova su un POS vero**, in modo controllato e osservabile. Quattro
fornitori hanno un adattatore (Lightspeed K-Series, Cassa in Cloud, Tilby,
Oracle Simphony), e nessuno ha ancora superato le fixture.

Il codice sta in `src/server/integrations/certificazione/`:

| File | Cosa fa |
|---|---|
| `livelli.ts` | livelli, capacità certificabili, matrice, stato, regole di rilascio (funzioni pure) |
| `evidenze.ts` | registra le evidenze immutabili, calcola lo stato di un fornitore |
| `accesso.ts` | fasi di rilascio, accesso beta per locale, chi può installare, panoramica admin |
| `console.ts` | la console: connessione, letture, tavolo, prodotti, ordine di prova, traccia, seconda comanda, conto, pagamento, conferme manuali |

A cui si aggiungono:

- tabelle: migrazione `20260924090000_certificazione_integrazioni`;
- rotte: `/api/integrations/[slug]/certificazione` e `/api/admin/integrazioni`;
- interfaccia: la scheda «Certificazione» del dettaglio e la pagina
  `/admin/integrazioni`.

### Due stati separati, per capacità

| Stato | Dove | Valori |
|---|---|---|
| **Implementazione** | catalogo (`registry.ts`) | IN_DEVELOPMENT (mostrato come PREVIEW), IMPLEMENTED (READY) |
| **Certificazione** | calcolata dalle evidenze | PREVIEW, API_VERIFIED, POS_VERIFIED, POS_IT_VERIFIED |
| **Rilascio** | `IntegrationRollout`, deciso da Foodtech | INTERNAL, PRIVATE_BETA, PUBLIC_BETA, GENERAL_AVAILABILITY |

Non esiste un «verificato» unico per l'integrazione: ogni **capacità** ha un
esito per **livello**. Le capacità certificabili (`CAPACITA_CERTIFICABILI`)
sono compatibili con quelle della piattaforma: `create_order` corrisponde a
`orders.write`, `read_bill` a `orders.read`, `payment` a `payments.write`, e
così via. Esistono per un fornitore solo se il suo adattatore ha il metodo
(`getFloors`, `updateOrder`, `createPayment`, …).

| Capacità | Livelli | Essenziale | Effetto fiscale possibile |
|---|---|---|---|
| Connessione, Tavoli, Menu | Fixture, API | sì | no |
| Sedi, Sale, IVA, Metodi di pagamento | Fixture, API | no | no |
| Crea ordine, Ordine sul tavolo giusto, Seconda comanda | Fixture, API, POS | sì | no |
| Cucina (stampa o KDS) | Fixture, API, POS | sì | no |
| Leggi conto | Fixture, API | no | no |
| Pagamento | Fixture, API, POS, POS IT | no | **sì** |
| Chiusura conto | POS, POS IT | no | **sì** |
| Documento fiscale | POS IT | no | **sì** |

### I livelli, e chi può dichiararli

| Livello | Da dove viene | Chi lo dichiara |
|---|---|---|
| `FIXTURE` | `npx tsx scripts/certifica-fixture.ts <slug>`: esegue le prove automatiche del fornitore, e registra PASSED o FAILED per le capacità che coprono | lo script, solo dopo averle eseguite |
| `PROVIDER_API` | le azioni della console riuscite **contro il fornitore vero** (sandbox o account reale) | la console, automaticamente; mai contro un server finto |
| `REAL_POS` | una persona guarda il POS e risponde SÌ/NO nella console | il Super Admin che ha guardato, con nome, data, ordine di prova e riferimento alla foto |
| `REAL_POS_ITALY` | come sopra, su un POS italiano con RT, su un locale autorizzato alle operazioni fiscali | idem |

Regole scritte nel codice e provate:

- un'evidenza `REAL_POS` o `REAL_POS_ITALY` **senza conferma manuale** è
  rifiutata. Un 200 dell'API non promuove niente;
- una conferma manuale vale solo su una prova **arrivata alla cassa** (con id
  esterno) e fatta **contro un fornitore vero**;
- una prova contro un server finto si riconosce da sé e non produce
  evidenze: `fetch` delle prove, `TILBY_API_BASE`, `CASSA_IN_CLOUD_API_BASE`,
  `ORACLE_SIMPHONY_ORIGINE_PROVA` (`motivoAmbienteFinto`);
- un ordine rifiutato registra FAILED su «Crea ordine», non su «Ordine sul
  tavolo giusto»: un rifiuto non dimostra che il tavolo sia sbagliato;
- un ordine in `PENDING_SYNC` non registra niente finché non arriva.

### Le evidenze

`IntegrationCertificationEvidence` registra:

- fornitore, capacità, livello, esito (PASSED / FAILED / INCONCLUSIVE);
- locale (id e nome copiato), sede presso il fornitore, ambiente;
- operatore, `correlationId`, id esterno, prova di origine (`runId`);
- conferma manuale sì/no, riferimento alla foto o screenshot (**il
  riferimento, non il contenuto**), note, data.

Nessun dato fiscale oltre all'id della vendita presso la cassa.

- **Immutabili.** Un trigger del database rifiuta UPDATE e DELETE. Una prova
  ripetuta è una riga nuova, e la matrice legge la più recente per capacità
  e livello.
- **Nessuna deduzione.** Un POS superato non riempie la casella API.
- **Sopravvivono al locale.** Nessuna chiave esterna verso `Venue`.

Le prove della console (`IntegrationCertificationRun`) conservano la traccia:
richieste e risposte **ripulite**, cioè senza token, segreti, email,
telefoni, nomi di persona o chiavi, e troncate a 20.000 caratteri. Le
registra il client HTTP con un `AsyncLocalStorage` (`conRegistrazione`), solo
dentro la console.

### Stato di certificazione, «Invia comanda» e rilascio

- `API_VERIFIED`: ogni capacità essenziale con il livello API è superata a
  quel livello.
- `POS_VERIFIED`: ogni capacità essenziale con il livello POS è superata su
  un POS vero.
- `POS_IT_VERIFIED`: in più, «Documento fiscale» superato su un POS italiano.
- **«Invia comanda» resta scollegato.** La console mostra quando sarebbe
  pronto: «Crea ordine», «Ordine sul tavolo giusto», «Seconda comanda» e
  «Cucina» tutte superate a livello POS. Solo allora si collegherà
  `fornitorePerLocale`, con una modifica a parte.

Rilascio:

| Fase | Chi installa | Requisito per passarci |
|---|---|---|
| INTERNAL (predefinita per le anteprime) | solo locali con accesso beta | — |
| PRIVATE_BETA | solo locali con accesso beta | — |
| PUBLIC_BETA | tutti | certificazione ≥ API_VERIFIED |
| GENERAL_AVAILABILITY (predefinita per le voci già disponibili) | tutti | certificazione ≥ POS_VERIFIED |

Restringere è sempre possibile e non disinstalla niente: ferma solo le nuove
installazioni.

### Accesso beta e marketplace

`IntegrationBetaAccess` registra, per locale e fornitore: abilitato,
autorizzazione alle operazioni con possibile effetto fiscale (spenta per
difetto), chi l'ha concesso e quando, note.

- **Chi lo concede:** solo un Super Admin, dalla console del locale o da
  `/admin/integrazioni` (per id o slug del locale, anche senza esserne
  membro).
- **Revoca:** revocare l'accesso revoca anche l'autorizzazione fiscale.
- **Senza accesso:** in INTERNAL e PRIVATE_BETA il ristoratore vede la
  scheda con «Anteprima» e «Disponibilità su richiesta: Foodtech abilita
  questa integrazione locale per locale», senza pulsante Installa. La rotta
  risponde 403 (`integration_beta_required`).

### La console di certificazione

Impostazioni → Integrazioni → fornitore → **Certificazione**.

- **Chi la vede:** solo i Super Admin (`SUPER_ADMIN_EMAILS`), con due
  controlli: appartenere al locale attivo **ed** essere nell'elenco. A tutti
  gli altri, ristoratori compresi, la scheda non esiste e la rotta risponde
  404.
- **Cosa non tocca:** nessuna azione modifica dati di Foodtech (menu, tavoli,
  prezzi). Scrive solo le mappature ORDER degli ordini di prova, le prove e
  le evidenze.
- **Isolamento dalla sala:** gli ordini di prova hanno il riferimento
  `ft-test-…` e la nota «ORDINE DI PROVA FOODTECH - NON PREPARARE». Non
  diventano mai il conto aperto di un tavolo vero (`ordineApertoDelTavolo`
  li salta).

Le azioni:

1. **Test connessione reale**: provider, locale, sede, ambiente, tempo di
   risposta, tipo e scadenza dell'autenticazione, salute. Mai i segreti.
2. **Letture** (sedi, sale, tavoli, menu, prodotti, IVA, metodi di
   pagamento): risposta grezza del fornitore ripulita, accanto a quella
   normalizzata da Foodtech.
3. **Tavolo di prova**: id esterno, sala, stato, posti, abbinamento a
   Foodtech.
4. **Prodotti di prova**: uno semplice, uno con variante, uno con
   modificatore, scelti fra quelli importati. Per ciascuno il codice con cui
   si ordina (o l'errore dell'adattatore, per esempio la variante che Cassa
   in Cloud richiede) e la mappatura.
5. **Ordine di prova**: anteprima (provider, sede, tavolo, prodotti, importo
   atteso, effetti attesi per quel fornitore), poi la frase «CREA ORDINE DI
   TEST» e un'impronta dell'anteprima. Se la scelta cambia, non parte. Passa
   da `inviaOrdine`, lo stesso percorso di una comanda vera: idempotenza,
   `PENDING_SYNC`, coda.
6. **Traccia**: ordine creato → payload normalizzato → richieste e risposte
   (con durata) → id esterno → mappatura → webhook ricevuti che citano
   l'ordine → stato finale.
7. **Conferme su POS**: «La comanda è stata stampata / inviata al KDS?»,
   «L'ordine compare sulla cassa?», «È sul tavolo giusto?». SÌ o NO, note,
   riferimento alla foto.
8. **Seconda comanda** sullo stesso ordine: si accoda se la cassa accetta
   aggiunte (Tilby, Oracle), altrimenti nasce un ordine nuovo allo stesso
   tavolo (Cassa in Cloud), e l'anteprima lo dice. Poi: «Sono state stampate
   solo le nuove righe?».
9. **Leggi conto**: atteso da Foodtech (prezzi delle mappature), totale del
   fornitore, **differenza non corretta**, e il dettaglio (tasse, sconti,
   maggiorazioni, pagato, dovuto) quando la cassa lo espone (Oracle).
10. **Pagamento di prova**: vedi sotto.

### Sicurezza fiscale

Pagamento, chiusura del conto e documento fiscale sono
`FISCAL_SIDE_EFFECT_POSSIBLE`: potrebbero chiudere un conto, emettere uno
scontrino, mandare al RT. Il pagamento di prova è **disabilitato per
difetto** e parte solo se tutte queste condizioni valgono:

- chi agisce è un Super Admin;
- il locale ha l'accesso beta **con** l'autorizzazione alle operazioni
  fiscali, data esplicitamente;
- «Crea ordine» è verificato contro l'API vera del fornitore;
- l'ambiente non è finto;
- l'adattatore registra pagamenti;
- la schermata «ATTENZIONE» (provider, sede, ordine/check, importo, tender)
  è confermata con «CONFERMO PAGAMENTO DI PROVA»;
- l'operazione finisce nel registro di controllo (`integration.fiscal_operation`)
  prima di partire.

Le evidenze fiscali (pagamento, chiusura, documento, qualunque POS IT)
richiedono lo stesso locale autorizzato. Nessuna chiusura né emissione
automatica: la console non chiude conti e non chiede scontrini.

### Hardening prima della prima cassa vera (24 settembre 2026)

**L'intermittenza del test Tilby «conto chiuso via webhook».**

- **Causa.** Il webhook `sales/CLOSED` produce due eventi, stato dell'ordine
  e pagamento riuscito, che scrivono due mappature (ORDER e PAYMENT) con lo
  **stesso** `externalId`. Il test leggeva con
  `findFirst({ installationId, externalId })`, senza `entityType` e senza
  ordinamento: quale riga torni dipende dal piano di Postgres (indice o
  scansione sequenziale) e dalla posizione fisica delle righe. Nella suite
  completa altri file inseriscono e cancellano nella stessa tabella in
  parallelo, quindi a volte tornava la riga PAYMENT, senza `stato`.
- **Riprodotta** in modo deterministico con le scansioni con indice spente
  (`tests/integrazioni-certificazione-hardening.test.ts`).
- **Corretta** in 12 query di 4 file di prova, più una prova che fallisce se
  compare di nuovo una query per `externalId` senza `entityType`. Nel codice
  applicativo non c'erano query ambigue.

**Scritture concorrenti e transizioni monotone** (`stato-mappature.ts`).

- Lo stato presso la cassa si aggiorna dentro una transazione con
  `SELECT … FOR UPDATE`.
- L'esito dell'invio (`ordini.ts`) si **unisce** ai metadati invece di
  riscriverli: prima un webhook arrivato durante l'invio poteva perdere lo
  stato che aveva scritto.
- Transizioni: ACCEPTED → IN_PROGRESS → READY si va solo avanti; CLOSED,
  CANCELLED e REJECTED sono finali, e vince il primo arrivato. La
  preparazione (`Submitted` → `Prepared` → …) va solo avanti.
- Ciò che arriva e non si applica resta nello storico della mappatura
  (`eventi[]`: id dell'evento webhook, stato, applicato sì/no, motivo).

**Correlazione.**

```
prova (IntegrationCertificationRun.correlationId)
  = X-Correlation-Id delle richieste al fornitore
  = invio.correlationId della mappatura ORDER
  = correlationId delle evidenze della prova
id esterno ← risposta del fornitore → invio.idEsterno, run.externalEntityId
webhook → WebhookEvent.id → mappatura.eventi[].eventoId → traccia
```

- La traccia collega i webhook **per id**, non per testo o orario.
- I webhook non creano evidenze: le crea una prova (con il suo `runId`) o
  una persona che conferma **quella** prova.

**Casi provati.**

- Webhook di TEST-B mentre si certifica TEST-A: TEST-A non cambia e non si
  certifica.
- Webhook del vecchio ordine in ritardo: aggiorna solo il vecchio.
- Stesso evento 5 volte in parallelo: una riga, una transizione, nessuna
  evidenza.
- CLOSED prima di UPDATED: resta CLOSED.
- Evento della vecchia installazione dopo una reinstallazione: 404 sul
  vecchio indirizzo, 401 sul nuovo con la firma vecchia.

**Revoca dell'accesso beta e sospensione.**

- **La revoca** impedisce nuove installazioni, la prima attivazione e la
  riattivazione dopo uno spegnimento. Non interrompe un'integrazione ACTIVE.
  Una che si ricollega dopo un token scaduto (`activatedAt` presente) non è
  un'attivazione nuova.
- **«Sospendi integrazione»** (solo Super Admin, dalla console) è il freno
  d'emergenza:
  - porta a DISABLED e segna `metadata.sospensione` (chi, quando, perché);
  - nessuna chiamata al fornitore (guardia in `contestoFresco`, nel
    collegamento, nella prova, nell'installazione e nella macchina a stati);
  - nessuna sincronizzazione;
  - ordini in coda fermi in `PENDING_SYNC` (`INTEGRAZIONE_NON_ATTIVA`), senza
    consumare tentativi;
  - webhook conservati e ignorati;
  - configurazione e mappature intatte;
  - sopravvive alla disinstallazione.
  «Revoca sospensione» la toglie, e si riaccende con «Riattiva», che passa da
  una prova. Entrambe finiscono nel registro di controllo.

**Guardie fiscali.** Il pagamento di prova non parte, e nessuna chiamata
esce, se manca anche una sola di queste condizioni:

- Super Admin;
- locale autorizzato alle operazioni fiscali;
- ambiente vero;
- «Crea ordine» verificato contro l'API (non serve «Pagamento» già
  verificato, altrimenti la prima prova sarebbe impossibile);
- frase di conferma;
- integrazione attiva e non sospesa;
- ordine di prova `ft-test-…`;
- capacità `payments.write` nel catalogo e nell'adattatore.

L'intento (`ATTEMPTED`) si scrive nel registro di controllo **prima** della
richiesta e deve riuscire: se non si scrive, il pagamento non parte. Dopo si
scrive l'esito (`SUCCEEDED` o `FAILED`), e l'intento resta anche se il
fornitore rifiuta.

**Migrazione `20260924090000_certificazione_integrazioni`.**

- `esaminaMigrazione`: non distruttiva. Crea solo quattro tabelle, i loro
  indici, due chiavi esterne verso `Venue` e il trigger.
- La catena completa (55 migrazioni) si applica su un database vuoto; il
  trigger rifiuta UPDATE e DELETE.
- Il confronto fra database vuoto e `schema.prisma` mostra cinque differenze
  **preesistenti e volute**, che **non** sono in questa migrazione:
  `Organization.baseCurrency` e `Payment.fx*` escono dal database «con la
  prossima pubblicazione» (`20260921120000_via_i_sette_resti`, espandi e
  contrai), e resta il vecchio indice `BackgroundJob_status_runAt_idx`. Chi
  genera la prossima migrazione le troverà nel diff: vanno tolte solo con
  quella migrazione dedicata, non per caso.

### Procedura di onboarding di un fornitore (con una chiave o un token veri)

1. `DATABASE_URL=<prova> npx tsx scripts/certifica-fixture.ts <slug>`: le
   fixture passano, le evidenze FIXTURE ci sono.
2. `/admin/integrazioni`: accesso beta al locale di prova (id o slug).
3. Sul locale: Impostazioni → Integrazioni → fornitore → Installa, collega
   la chiave o il token, verifica la sede, attiva, sincronizza.
4. Scheda «Certificazione»: **Test connessione reale**.
5. **Leggi** sedi, sale, tavoli, menu, prodotti, IVA, metodi; confronta
   grezza e normalizzata.
6. Scegli un tavolo e tre prodotti (semplice, variante, modificatore).
7. **Anteprima → Crea ordine di test**. Guarda la traccia.
8. Guarda il POS: l'ordine c'è? è sul tavolo giusto? è uscito in cucina?
   Rispondi SÌ/NO, con la foto.
9. **Aggiungi seconda comanda**; guarda: solo le righe nuove? Rispondi.
10. **Leggi conto**: annota la differenza, se c'è (non si corregge).
11. Solo se serve e il locale è autorizzato: pagamento di prova.
12. La matrice si aggiorna da sola. Quando le capacità essenziali sono
    verificate: `PUBLIC_BETA` (API) o `GENERAL_AVAILABILITY` (POS). Per
    «Invia comanda» serve una decisione e una modifica a parte.

---

## Verifiche

| Cosa | Dove |
|---|---|
| Hardening: query ambigua (causa dell'intermittenza Tilby) riprodotta e vietata, correlazione prova → richiesta → id esterno → webhook → evidenza, webhook di un'altra prova, webhook vecchi, duplicati ×5 in parallelo, fuori ordine (anche in parallelo), esito dell'invio che non cancella lo stato del webhook, reinstallazione con URL e segreto vecchi, revoca beta, sospensione, ogni guardia fiscale senza chiamate, audit prima dell'effetto, livelli solo derivati, ambienti finti, ripetizioni sotto carico | `tests/integrazioni-certificazione-hardening.test.ts` (database) |
| Certificazione: isolamento fra locali e fornitori, Super Admin ammesso e ristoratore respinto (404), accesso beta al locale A e B respinto, evidenze create e immutabili (trigger), stato per capacità, operazioni fiscali e pagamento bloccati, conferma manuale su POS, certificazione ripetuta, rilascio con i suoi requisiti, traccia ripulita, niente evidenze contro un fornitore finto | `tests/integrazioni-certificazione.test.ts` (database) |
| Adattatore Oracle Simphony contro lo swagger ufficiale (indirizzi e SSRF, DNS privato, redirect vietati, OIDC + PKCE, password sbagliata o scaduta, rinnovo e refresh ruotato, organizzazione/location/RVC, prova con POS scollegato, menu/condimenti/tasse/tender/sconti/disponibilità, risposte malformate, check con intestazioni e idempotencyId, duplicato entro 300 s, round idempotente, check chiuso, note e condimenti obbligatori, calcolo, split payment €120, printed check, annullamento, notifiche firmate, guasti 503/521/timeout, duplicate_request) | `tests/integrazioni-oracle-simphony.test.ts` |
| Oracle Simphony nella piattaforma: un API account per locale, password mai salvata, indirizzo non ammesso senza chiamate, prova con POS scollegato, notifiche registrate e rimosse, importazione solo mappature, isolamento e segreti, prima comanda e round via fornitoreIntegrazione, CheckNotification firmata e duplicata, firma sbagliata e altro RVC, check pagato in cassa → check nuovo, POS scollegato → PENDING_SYNC → riprova, 521, invii concorrenti, STS giù, token revocato, disattiva, disinstalla, reinstalla | `tests/integrazioni-oracle-simphony-piattaforma.test.ts` (database) |
| Adattatore Tilby contro schemi ed esempi della documentazione (token, ambienti e host bloccato, negozio del token, sale e tavoli, prodotti/listini/IVA, paginazione, vendita con stampa automatica, uuid e vendita già creata, aggiunte con uscita incrementata e idempotenti, conto chiuso, 10 uscite, annullamento, pagamenti, documenti, webhook e SUBSCRIBED, notifiche malformate, giù/lento/limiti, 401) | `tests/integrazioni-tilby.test.ts` |
| Tilby nella piattaforma: token per negozio, ambiente, prova con il negozio sbagliato, webhook registrati e rimossi, importazione solo mappature, isolamento, segreti, prima comanda e aggiunta allo stesso conto, conto chiuso via webhook, aggiunta in attesa della base, invii concorrenti, Tilby giù e riprova, risposta persa, 429, notifica duplicata, token revocato, disattiva, disinstalla, reinstalla | `tests/integrazioni-tilby-piattaforma.test.ts` (database) |
| Adattatore Cassa in Cloud contro le forme della documentazione (token, chiave non valida, token scaduto, punti vendita, risposte malformate, giù/lento/limiti, paginazione, ordini e conflitti, webhook firmati) | `tests/integrazioni-cassa-in-cloud.test.ts` |
| Cassa in Cloud nella piattaforma: chiavi per locale, isolamento, segreti, webhook duplicati, sincronizzazioni concorrenti, ordini idempotenti, cassa giù e riprova, processo morto dopo l'invio, dalla comanda all'ordine, chiave revocata, disattiva, disinstalla, reinstalla | `tests/integrazioni-cassa-in-cloud-piattaforma.test.ts` (database) |
| Catalogo coerente (niente capacità senza metodo, niente AVAILABLE senza IMPLEMENTED) | `tests/integrazioni-catalogo.test.ts` |
| Stati, salute, errori leggibili, redazione, int64, abbinamento certo | `tests/integrazioni-regole.test.ts` |
| Cifratura legata, state OAuth (firma, scadenza, browser) | `tests/integrazioni-sicurezza.test.ts` |
| Adattatore Lightspeed contro le risposte della documentazione | `tests/integrazioni-lightspeed.test.ts` |
| Percorso completo, isolamento, segreti, webhook idempotenti, fornitore giù, rate limit, credenziali scadute, rinnovi concorrenti, disattiva, disinstalla, reinstalla, multi-sede | `tests/integrazioni-piattaforma.test.ts` (database) |
| Matrice dei permessi | `tests/permessi.test.ts` |
