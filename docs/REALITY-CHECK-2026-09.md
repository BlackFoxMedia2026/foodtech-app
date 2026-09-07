# TAVOLO — REALITY CHECK

**Data:** 7 settembre 2026 · **Commit ispezionato:** `c6a1a82` (`main`)
**Metodo:** ispezione diretta del repository (non derivata dall'audit precedente): schema Prisma modello per modello, tutte le 46 route API lette una a una, moduli server seguiti fino alla query, prove dal vivo con `curl` sull'applicazione in esecuzione, misure sul browser reale a 4 larghezze.

> **Come è stato deciso lo stato di ogni modulo.** LIVE solo se esiste il flusso completo UI → validazione → API → logica → database → permessi → errori → feedback → stato vuoto → responsive. Dove manca anche un solo anello, lo stato scende. «Ha una tabella» non conta. «Ha una pagina» non conta.

---

## 1. Executive Summary

Tavolo **non è** un prototipo: è un gestionale funzionante, in produzione, con un nucleo prenotazioni-sala di qualità reale. `tsc` e `eslint` sono puliti, non c'è un errore JavaScript a runtime, l'isolamento fra ristoranti è implementato correttamente in tutte le 46 route (dettaglio §4), e il controllo di disponibilità è l'unico modulo con verifiche automatiche — 45 su 45 verdi ancora oggi, dopo tre PR di terzi.

Ma la distanza fra ciò che il repository **sembra** e ciò che **fa** è ampia:

- **72 modelli nello schema, 29 usati dal codice.** I 43 restanti non hanno una riga di logica. E hanno una firma che lo dimostra: tutti e 43 hanno `id String @id` **senza** `@default(cuid())`, contro nessuno dei 29 attivi. Non sono stati scritti a mano nello schema: sono entrati da un database allineato con `db push`, mai da una migrazione ragionata.
- **Non esiste `prisma/migrations`.** Il build di produzione esegue `prisma db push --accept-data-loss`. Non è un rischio teorico: con tre persone su branch paralleli, il primo rename di colonna cancella dati veri al deploy successivo.
- **11 endpoint di mutazione non controllano il ruolo**, incluso `POST /api/bookings` — la funzione centrale del prodotto. La matrice dei permessi esiste, funziona, ed è applicata in 22 route su 33: è un'incoerenza, non un'assenza.
- **Nessun rate limiting da nessuna parte.** Il widget pubblico accetta prenotazioni senza limite, senza captcha, senza verifica del contatto.
- **Un test runner non esiste.** L'unica verifica automatica copre la disponibilità.

Il paradosso più costoso è commerciale: **la demo online è vuota**. I dati di esempio sono ancorati al giorno del seed (prenotazioni dal 1 luglio al 14 agosto), e oggi ogni schermata mostra zero — compreso il modulo Camerieri, che è il lavoro più recente e più curato. Chi apre il link vede un prodotto morto.

**Rispetto alla domanda finale del brief** — «un ristorante potrebbe tenere Tavolo aperto per tutto il servizio?» — oggi la risposta è **no**, per tre motivi in quest'ordine: non c'è una schermata che risponda a «cosa sta succedendo adesso», su telefono la navigazione mostra 1 voce su 9, e non esiste waitlist né walk-in rapido. Il resto (CRM intelligente, automazioni, revenue) viene dopo: sono i motivi per cui un ristoratore *sceglie* Tavolo, non quelli per cui lo *tiene aperto*.

---

## 2. Feature Reality Matrix

Legenda colonne: **UI** interfaccia · **API** endpoint · **DB** tabelle · **BL** logica di dominio · **RBAC** controllo ruolo · **T** test.
Legenda valori: ✅ completo · 🟨 parziale · ❌ assente · — non applicabile.

| # | Modulo | UI | API | DB | BL | RBAC | T | Stato |
|---|---|---|---|---|---|---|---|---|
| 1 | Panoramica | ✅ | — | ✅ | ✅ | ✅ | ❌ | **LIVE** |
| 2 | Prenotazioni (CRUD) | ✅ | ✅ | ✅ | ✅ | 🟨 | ❌ | **PARTIAL** — `POST /api/bookings` senza controllo ruolo |
| 3 | Disponibilità / anti-overbooking | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | **LIVE** — unico modulo verificato (45 asserzioni) |
| 4 | Calendario | 🟨 | ✅ | ✅ | ✅ | 🟨 | ❌ | **PARTIAL** — solo navigazione per giorno, nessuna vista settimana/mese |
| 5 | Sala / pianta tavoli | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | **LIVE** — Room Builder, layout, assegnazione con lock e 409 |
| 6 | Tavoli (anagrafica) | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | **PARTIAL** — create/patch/delete senza controllo ruolo |
| 7 | Camerieri | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | **PARTIAL** — modulo ricco, zero controlli di ruolo |
| 8 | Contratti staff + promemoria scadenza | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | **LIVE** — con cron protetto ed email |
| 9 | Assegnazioni cameriere↔tavolo | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | **PARTIAL** |
| 10 | Ospiti (anagrafica) | ✅ | ✅ | ✅ | 🟨 | ❌ | ❌ | **PARTIAL** |
| 11 | CRM / Guest Intelligence | 🟨 | 🟨 | ✅ | ❌ | ❌ | ❌ | **PARTIAL** — anagrafica e note, nessun LTV, tag, comportamento |
| 12 | Esperienze | 🟨 | ❌ | ✅ | ❌ | — | ❌ | **SCHEMA ONLY** — pagina in sola lettura, nessuna API, `Ticket` mai usato |
| 13 | Marketing / campagne email | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | **BETA** — funziona via Brevo, ma l'invio non scala (§3) |
| 14 | QR code | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | **LIVE** |
| 15 | Pagamenti | 🟨 | ❌ | ✅ | ❌ | — | ❌ | **SCHEMA ONLY** — Stripe presente solo in `package.json` |
| 16 | Analytics | ✅ | — | ✅ | ✅ | ✅ | ❌ | **LIVE** (descrittivo) — nessuna metrica revenue |
| 17 | Insight / alert | ✅ | — | ✅ | ✅ | ✅ | ❌ | **LIVE** — motore a regole in `insight-rules.ts` |
| 18 | Segnalazioni (`/reports`) | ❌ | ❌ | ✅ | ❌ | — | ❌ | **BROKEN** — testo fisso, `Ticket` mai letto, **rotta fuori navigazione** |
| 19 | Branding | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | **LIVE** |
| 20 | Widget pubblico | ✅ | ✅ | ✅ | ✅ | — | 🟨 | **LIVE** — ma fuori brand e senza rate limit |
| 21 | Notifiche in-app | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | **LIVE** — filtra per ruolo le categorie riservate |
| 22 | AI Agent | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | **BETA** — 8 strumenti, guardia permessi, quota 200/mese; nessuna chiave in locale |
| 23 | Waitlist | ❌ | ❌ | ✅ | ❌ | — | ❌ | **SCHEMA ONLY** — schema completo (offerta, token, conversione) |
| 24 | Walk-in | 🟨 | 🟨 | ✅ | 🟨 | 🟨 | ❌ | **PARTIAL** — esiste `BookingSource.WALK_IN`, nessun flusso rapido |
| 25 | Reminder prenotazione | ❌ | ❌ | ✅ | ❌ | — | ❌ | **PLANNED** — solo email di conferma, nessun promemoria |
| 26 | Automazioni | ❌ | ❌ | ✅ | ❌ | — | ❌ | **SCHEMA ONLY** |
| 27 | Recensioni | ❌ | ❌ | ✅ | ❌ | — | ❌ | **SCHEMA ONLY** |
| 28 | NPS / sondaggi | ❌ | ❌ | ✅ | ❌ | — | ❌ | **SCHEMA ONLY** |
| 29 | Loyalty | ❌ | ❌ | ✅ | ❌ | — | ❌ | **SCHEMA ONLY** |
| 30 | Coupon | ❌ | ❌ | ✅ | ❌ | — | ❌ | **SCHEMA ONLY** |
| 31 | Gift card | ❌ | ❌ | ✅ | ❌ | — | ❌ | **SCHEMA ONLY** |
| 32 | Wi-Fi / captive portal | ❌ | ❌ | ✅ | ❌ | — | ❌ | **SCHEMA ONLY** |
| 33 | Menu | ❌ | ❌ | ✅ | ❌ | — | ❌ | **SCHEMA ONLY** |
| 34 | Ordini | ❌ | ❌ | ✅ | ❌ | — | ❌ | **SCHEMA ONLY** |
| 35 | Food cost | ❌ | ❌ | ✅ | ❌ | — | ❌ | **SCHEMA ONLY** |
| 36 | POS | ❌ | ❌ | ✅ | ❌ | — | ❌ | **SCHEMA ONLY** |
| 37 | Voice / centralino | ❌ | ❌ | ✅ | ❌ | — | ❌ | **SCHEMA ONLY** |
| 38 | Audit log | ❌ | ❌ | ✅ | ❌ | — | ❌ | **SCHEMA ONLY** |
| 39 | Connettori | ❌ | ❌ | ✅ | ❌ | — | ❌ | **SCHEMA ONLY** |
| 40 | Eventi privati / gruppi | ❌ | ❌ | 🟨 | ❌ | — | ❌ | **PLANNED** — `Booking` ha già `isGroup`, `budgetCents`, `eventType` |
| 41 | Multi-locale | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | **LIVE** — selettore locale, appartenenze per utente |
| 42 | Autenticazione | ✅ | ✅ | ✅ | ✅ | — | ❌ | **LIVE** — credenziali + bcrypt + JWT; nessun 2FA, nessun recupero password |

**Conteggio:** LIVE 13 · BETA 2 · PARTIAL 8 · PLANNED 2 · SCHEMA ONLY 16 · BROKEN 1.

---

## 3. Problemi di architettura

**A1 — Nessuno storico delle migrazioni.** `prisma/migrations` non esiste. Lo schema di produzione è quello che l'ultimo `db push` ha deciso. Non c'è modo di sapere quando una colonna è comparsa, né di tornare indietro.

**A2 — 43 modelli con `id` senza valore predefinito.** Il codice compensa a mano (`id: crypto.randomUUID()` in `notifications.ts:20`, `campaigns.ts:244`). Funziona, ma qualunque nuovo `create` che se ne dimentichi va in errore a runtime. È debito che si paga a ogni nuova feature su quelle tabelle — cioè su tutte le 16 SCHEMA ONLY.

**A3 — L'invio campagne non scala e non è transazionale.** `prepareRecipients` (`campaigns.ts:217-234`) esegue **una chiamata a Brevo più una scrittura su database per ogni ospite**, in sequenza, dentro la richiesta HTTP. Nessun `maxDuration` è configurato. Con qualche centinaio di ospiti la funzione viene interrotta a metà: contatti sincronizzati in parte, campagna in stato incoerente, nessuna ripresa. Serve una coda. **[Risolto il 7 settembre 2026]** `BackgroundJob` + `/api/cron/jobs`: l'invio è un lavoro a lotti, ripartibile, con l'avanzamento visibile.

**A4 — Nessun middleware.** Non esiste `middleware.ts`: autenticazione, rate limiting e intestazioni di sicurezza non hanno un punto centrale dove vivere. Ogni route se la cava da sola.

**A5 — Nessuna paginazione reale.** Le liste hanno tetti fissi (`bookings.ts:42` `take: 200`, `guests.ts:44` `take: 500`). Oltre quel numero i dati **spariscono in silenzio**, senza avviso né «carica altri».

**A6 — Nessun `error.tsx`.** Ci sono 6 `loading.tsx`, ma zero confini d'errore: un'eccezione lato server mostra la pagina d'errore grezza di Next, senza via d'uscita e fuori dal brand.

**A7 — Nessuna cache.** 17 pagine su 25 sono `force-dynamic` e non esiste un solo `revalidate`. Scelta difendibile per una dashboard operativa, discutibile su Analytics che aggrega 90 giorni a ogni caricamento.

---

## 4. Problemi di sicurezza

**S1 🔴 — 11 mutazioni senza controllo di ruolo.** Verificato leggendo tutte le route:

| Endpoint | Metodi scoperti |
|---|---|
| `/api/bookings` | **POST** ← nucleo del prodotto |
| `/api/tables` · `/api/tables/[id]` | POST, PATCH, DELETE |
| `/api/waiters` · `/api/waiters/[id]` · `/api/waiters/[id]/photo` | POST, PATCH, DELETE |
| `/api/waiter-assignments` · `/api/waiter-assignments/table` | POST, DELETE |
| `/api/guests` · `/api/guests/[id]` | POST, PATCH |
| `/api/staff/eligible` | GET (elenco personale) |

Un membro `READ_ONLY` — che nella matrice non ha **nessuna** capacità — può creare prenotazioni, cancellare camerieri, riscrivere la pianta della sala e modificare le schede degli ospiti. La correzione è una riga per endpoint, sul modello già presente in `bookings/[id]/assign-table/route.ts:23`.

**S2 🟠 — Le API rispondono 307 invece di 401.** `getActiveVenue()` usa `redirect()` (`tenant.ts:13`), pensato per le pagine. Provato: `curl /api/waiters` → `307 → /sign-in`. Il client segue il redirect, riceve HTML, e `res.json()` esplode: l'utente con sessione scaduta vede un errore di parsing invece di «rientra».

**S3 🟠 — Zero rate limiting.** Nessuna occorrenza in tutto `src/`. Esposti: creazione prenotazione pubblica, disponibilità pubblica, login, agente AI, caricamento immagini.

**S4 🟠 — `force: true` bypassa la capienza.** `assign-table/route.ts:34` → `booking-floor.ts:88`. Nessun client lo invia, quindi è un override non documentato disponibile a chiunque abbia `manage_bookings` (anche al ruolo `WAITER`), senza traccia.

**S5 🟠 — Nessuna tracciabilità.** `AuditLog` ha lo schema giusto (attore, azione, entità, `diff`, IP, user agent) e non viene mai scritto.

**S6 🟡 — Nessun form ha `method="post"`.** Un invio prima dell'idratazione diventa una GET con i campi in query string. Riprodotto: `/sign-in?email=…&password=tavolo2026`. Bassa probabilità, conseguenza no: password nella cronologia, nei log di Vercel, nel `Referer`. Vale anche per il form pubblico, dove finirebbero nome, email e telefono dell'ospite.

**S7 🟡 — Credenziali demo note in produzione**, create dal seed che gira a ogni build.

**S8 🟡 — Nessun 2FA, nessun recupero password, nessuna scadenza di sessione configurata.**

### ✅ Isolamento fra ristoranti: verificato e solido

Da segnalare perché è l'errore più comune nei SaaS multi-tenant, ed **è stato evitato**. Ho verificato tutte le 46 route e le 14 funzioni server corrispondenti:

- `venueId` non arriva **mai** dal client: viene sempre da `getActiveVenue()`.
- Ogni route con `[id]` passa `ctx.venueId` alla funzione server, e ogni funzione filtra davvero (`findFirst({ where: { id, venueId } })` prima di `update`/`delete`).
- Le notifiche filtrano per ruolo anche le categorie riservate (`notifications.ts:44`).

Resta un dettaglio teorico: il pattern «controlla poi agisci» ha una finestra di gara trascurabile; `updateMany` con `where` composto la chiuderebbe del tutto.

---

## 5. Problemi di UX

**U1 — Nessuna schermata risponde a «cosa sta succedendo adesso».** È il vuoto più grave rispetto all'obiettivo di prodotto. Panoramica risponde a «com'è la giornata», Prenotazioni a «chi viene», Sala a «dove li metto». Durante il servizio, il maître ha bisogno di NOW/NEXT/ATTESE su una schermata sola, e non esiste.

**U2 — Il wizard del brand riparte a ogni caricamento.** `layout.tsx:16` lo mostra finché `onboardingStatus === "NOT_STARTED"`, e il componente parte con `useState(true)` (`brand-setup-dialog.tsx:24`). «Configura più tardi» chiude la finestra ma non salva niente: al ricaricamento torna. Non esiste un modo di rinviare davvero.

**U3 — Il widget pubblico è di un altro brand.** È l'unica pagina che vede il cliente del ristorante, ed è l'unica rimasta con la vecchia palette gialla su fondo scuro. L'app è verde bosco, crema e terracotta.

**U4 — In Sala le etichette si sovrappongono.** Le pillole «Non assegnato» sono più larghe del passo fra i tavoli: nella fila T1-T8 si accavallano e coprono la dicitura dei posti.

**U5 — Il form interno non mostra la disponibilità.** Il widget pubblico propone solo gli orari accettabili; lo staff ha un campo ora libero e scopre il conflitto dopo il 409 — al telefono, con il cliente in linea. Collegato: `skipAvailabilityCheck` è predisposto per la forzatura consapevole ma non ha interfaccia.

**U6 — Gli stati vuoti non offrono l'azione successiva.** «Nessun cameriere registrato ancora.» spiega il fatto e si ferma. L'eccezione positiva è Analytics, che spiega *cosa comparirà*: è il modello da estendere.

**U7 — Testi di sistema, non di ospitalità.** Convivono registri diversi; alcuni messaggi d'errore sono generici («Impossibile salvare. Verifica i dati.»).

**U8 — Le pagine con pochi dati lasciano due terzi di schermo vuoto** (Prenotazioni, Pagamenti, Camerieri).

---

## 6. Problemi mobile

**M1 🔴 — La navigazione è quasi inaccessibile.** Misurato sul browser reale (`overflow-x-auto` in `header.tsx:82`):

| Viewport | Contenuto barra | Visibile | Voci leggibili |
|---|---|---|---|
| 390 px | 1120 px | 144 px | **1 su 9** |
| 768 px | 1120 px | 522 px | 4 su 9 |
| 1024 px | 1120 px | 762 px | 6 su 9 |
| 1440 px | 1178 px | 1178 px | 9 su 9 |

Le altre voci si raggiungono solo scorrendo di lato, e **nulla lo suggerisce**: nessuna sfumatura, nessuna freccia, nessun menu. Pesa perché `PRODUCT.md` descrive come utenti secondari lo staff di sala, che lavora col telefono in mano.

**M2 — La sala su telefono è una miniatura.** La pianta viene rimpicciolita invece di avere una modalità propria (elenco tavoli con stato, o zoom per zone).

**M3 — Nessuna azione rapida a portata di pollice.** Niente barra in basso, niente pulsante «+» per walk-in o nuova prenotazione: le azioni sono in alto a destra.

**M4 — Positivo:** nessuno sfondamento orizzontale della pagina a 390 px su nessuna schermata provata.

---

## 7. Problemi di database e schema

| # | Problema | Evidenza |
|---|---|---|
| D1 | Nessuna migrazione versionata; deploy con `--accept-data-loss` | `package.json`, assenza di `prisma/migrations` |
| D2 | 43 modelli con `id` senza `@default(cuid())`, 10 anche con `updatedAt` senza `@updatedAt` | analisi dello schema modello per modello |
| D3 | `Shift` senza indici, ma interrogato a **ogni** verifica di disponibilità | `availability.ts:380` |
| D4 | `TableBlock` senza indici, interrogato per tavolo e intervallo su ogni verifica | schema |
| D5 | `Campaign` senza indice su `venueId` | schema |
| D6 | Nessun vincolo di integrità applicativo: un pagamento può essere `SUCCEEDED` senza `stripePaymentId` | schema + assenza di logica |
| D7 | `Organization` esiste, `orgId` è usato solo di riflesso: non c'è vera gestione multi-brand | `OrgMembership` usato 1 volta |
| D8 | Soft delete presente su `Booking` e `Payment` (`deletedAt`, `deletedBy`) ma **non** su ospiti, camerieri, tavoli: cancellazioni distruttive | schema |

**Da preservare:** 82 indici dichiarati, 84 `onDelete` su 100 relazioni, e uno schema che nella parte usata è pensato bene — `Booking` ha già `depositCents`, `depositStatus`, `arrivedAt`/`seatedAt`/`closedAt`, `combinedTableIds`, `isGroup`, `budgetCents`. `WaitlistEntry` ha già `offerToken`, `offerExpiresAt`, `convertedBookingId`, `position`. Chi ha disegnato lo schema aveva in testa il prodotto completo: **le fasi 1-6 non richiedono quasi nuove tabelle, richiedono codice.**

---

## 8. Debito tecnico

1. Nessun test runner; unica verifica automatica sulla disponibilità.
2. 43 modelli con difetti di schema (§7 D2).
3. Nessun confine d'errore, nessuna paginazione reale.
4. `DESIGN.md` e `PRODUCT.md` descrivono la palette gialla «ember»: l'app è verde da settimane, e `CLAUDE.md` impone di seguire quei documenti. Chi obbedisce alle istruzioni del repository sbaglia i colori.
5. `OPENAI_API_KEY` e `OPENAI_MODEL` non documentati in `.env.example`.
6. Superfici verdi troppo simili fra loro: manca una gerarchia semantica (`surface-1…3`, `elevated`, `selected`).
7. 4 `<img>` grezzi senza `alt` e senza ottimizzazione.
8. Un dialogo senza `DialogTitle` genera 2 errori di accessibilità su **ogni** pagina (`PRODUCT.md` dichiara WCAG 2.1 AA).
9. Decisioni di prodotto documentate solo nel corpo delle pull request.
10. Dati demo ancorati al giorno del seed.

---

## 9. Capacità di livello concorrenza che mancano

Rispetto a CoverManager, SevenRooms, TheFork Manager, Pienissimo:

| Capacità | Stato | Peso commerciale |
|---|---|---|
| Caparra / garanzia con carta | assente | **alto** — è la richiesta numero uno contro i no-show |
| Waitlist operativa | schema pronto, zero codice | **alto** |
| Promemoria automatici (email/SMS/WhatsApp) | assente | **alto** |
| Modalità servizio / reception | assente | **alto** — è il differenziatore possibile |
| CRM con LTV, tag, comportamento | anagrafica sola | **alto** |
| Automazioni marketing (trigger→azione) | assente | medio-alto |
| Recensioni e NPS | assente | medio |
| Walk-in rapido | parziale | medio |
| Metriche revenue (RevPASH, occupazione) | solo descrittive | medio |
| Previsione occupazione e no-show | assente | medio |
| Eventi privati e gruppi | campi pronti | medio (alto margine) |
| Reserve with Google | assente | medio |
| Fidelity, coupon, gift card | schema pronto | basso-medio |
| Menu, ordini, food cost, POS | schema pronto | basso (ma è la catena più lunga) |
| 2FA, SSO, API pubbliche, webhook | assenti | basso oggi, alto per catene |

---

## 10. Capacità esistenti da preservare

Da non toccare se non per estenderle:

1. **Il motore di disponibilità** (`availability.ts`, 556 righe) — unica fonte di verità per sala, API e widget, rispetta il fuso del locale, raccoglie *tutti* i motivi di rifiuto, ha 57 verifiche automatiche. È il pezzo migliore del progetto.
2. **L'isolamento fra ristoranti** — implementato correttamente in tutte le route (§4).
3. **L'assegnazione tavoli con gestione delle collisioni** — lock, 409 con messaggi in chiaro, riprova.
4. **Il Room Builder e la pianta sala** — zoom, trascinamento, layout salvati, piantina caricabile.
5. **Contratti staff con cron protetto e promemoria email** — flusso completo, RBAC corretto, cron che si rifiuta di partire senza segreto.
6. **L'agente AI** — 8 strumenti di dominio, guardia sui permessi (`permission-guard.ts`), quota mensile, suggerimenti pertinenti. La struttura è giusta: va estesa, non rifatta.
7. **Il wizard campagne a blocchi** e l'adattatore Brevo con webhook autenticato.
8. **L'identità visiva** — verde bosco, crema, terracotta, serif editoriale. È riconoscibile e non somiglia a un pannello enterprise: va resa più gerarchica, non sostituita.
9. **Gli stati vuoti di Analytics** — spiegano cosa comparirà: sono il modello per tutti gli altri.
10. **`prefers-reduced-motion` e forced-colors** — entrambi rispettati e verificati.

---

## 11. Bloccanti P0

Nessuna feature commerciale prima di questi.

| # | Bloccante | Perché ora |
|---|---|---|
| P0-1 | Migrazioni versionate; `db push --accept-data-loss` fuori dal build | Ogni deploy può cancellare dati di produzione |
| P0-2 | RBAC sulle 11 mutazioni scoperte, centralizzato | `READ_ONLY` può modificare prenotazioni, sala, personale, ospiti |
| P0-3 | Semantica HTTP: 401/403/404/409/422/429, mai 307 dalle API | Sessione scaduta = errore incomprensibile |
| P0-4 | Rate limiting su widget, login, AI, endpoint costosi | Endpoint pubblici oggi illimitati |
| P0-5 | Fuso orario del locale in tutti i punti che calcolano «oggi» | Fra mezzanotte e le 02:00 l'app mostra ieri |
| P0-6 | `AuditLog` reale sulle azioni sensibili | Nessuna tracciabilità, con ruoli e dati personali |
| P0-7 | Test: permessi, isolamento, disponibilità, fuso | Non si può indurire ciò che non si può verificare |
| P0-8 | Schema: `@default(cuid())` sui 43 modelli, indici su `Shift`/`TableBlock`/`Campaign` | Debito che si paga a ogni feature futura |
| P0-9 | Dati demo con date relative a oggi | La demo online sembra un prodotto morto |

## 12. Priorità P1

Booking OS e Servizio — è qui che Tavolo diventa «tenibile aperto per tutto il servizio».

1. **Stripe**: caparra, preautorizzazione, pagamento pieno; policy per esperienza/giorno/fascia/coperti; rimborsi e addebito no-show.
2. **Waitlist operativa**: stati, offerta con token e scadenza, conversione in prenotazione, suggerimento automatico quando si libera capienza compatibile.
3. **Walk-in rapido**: coperti → tavolo → accomoda, in pochissimi tocchi.
4. **Promemoria** con provider astratto (email ora, SMS/WhatsApp dopo) e azioni cliente conferma/modifica/annulla.
5. **Modalità Servizio (reception)**: NOW / NEXT / ATTESE, pensata per tablet e una mano.
6. **Sala Live V2**: stati tavolo con icona oltre al colore, unione/divisione, sposta prenotazione, libera tavolo; modalità mobile vera.
7. **Navigazione mobile**: barra in basso OGGI / SALA / OSPITI / ALTRO con «+» centrale.
8. **Disponibilità nel form interno** + forzatura consapevole tracciata.
9. **Stati vuoti con azione** e confini d'errore.

## 13. Priorità P2

10. **Guest Intelligence**: LTV, frequenza, preferenze, tag automatici, timeline ospite (solo eventi reali).
11. **Centro controllo servizio**: collisioni previste, rischio no-show, suggerimenti seating.
12. **Motore automazioni**: segmenti, trigger, condizioni, azioni, attese; con coda.
13. **Recensioni e NPS**.
14. **Revenue intelligence**: occupazione, RevPASH, spesa media, ROI campagne; «dati insufficienti» quando lo sono.
15. **AI proattiva**: «3 cose da sapere oggi», azioni con anteprima e conferma.
16. Poi: eventi privati, previsione, loyalty/coupon/gift card, menu→ordini→food cost, POS, connettori, enterprise.

---

## 14. File, componenti e route interessati dalla Phase 0

| Intervento | File |
|---|---|
| Migrazioni | `package.json` (script `build`), nuova `prisma/migrations/`, `prisma/schema.prisma` (43 `@default(cuid())`, 3 indici) |
| Helper API centrale | nuovo `src/lib/api-auth.ts`; 46 route in `src/app/api/**/route.ts` |
| RBAC | `src/app/api/bookings/route.ts`, `tables/route.ts`, `tables/[id]/route.ts`, `waiters/route.ts`, `waiters/[id]/route.ts`, `waiters/[id]/photo/route.ts`, `waiter-assignments/route.ts`, `waiter-assignments/table/route.ts`, `guests/route.ts`, `guests/[id]/route.ts`, `staff/eligible/route.ts` |
| Rate limiting | nuovo `src/lib/rate-limit.ts`; `api/public/*`, `api/auth`, `api/agent/*`, upload |
| Fuso orario | nuovo `src/lib/venue-time.ts`; `floor/page.tsx:27`, `ai/tools/assign-waiter.ts:68`, `day-picker.tsx:45`, `booking-form.tsx:65`, `assign-service-dialog.tsx:41`, `waiter-profile-dialog.tsx:81`, `new-waiter-dialog.tsx:59`, `waiter-contract-section.tsx:91` |
| Audit log | nuovo `src/server/audit.ts`; `bookings.ts`, `booking-floor.ts`, `waiters.ts`, `guests.ts`, `staff-contracts.ts`, `rooms.ts`, `tables/[id]` |
| Test | nuovo `vitest.config.ts`, `tests/**`; `package.json` |
| Dati demo | `prisma/seed.ts` |
| Documentazione | `docs/PRODUCT_STATUS.md`, `ROADMAP.md`, `ARCHITECTURE.md`, `SECURITY.md`, `INTEGRATIONS.md`, `AI_AGENT.md`; correzione di `DESIGN.md` e `PRODUCT.md` |

---

## 15. Sequenza di implementazione proposta

**Phase 0 — Fondamenta** (in quest'ordine, ogni passo con commit atomico)

1. Documentazione dello stato reale (questo documento + `PRODUCT_STATUS.md`) — così i passi successivi hanno un riferimento.
2. Schema: `@default(cuid())` sui 43 modelli + 3 indici mancanti. **Prima** della baseline, così la baseline nasce corretta.
3. Baseline delle migrazioni + `prisma migrate deploy` nel build + seed fuori dal build.
4. `src/lib/api-auth.ts`: `requireVenueApi()` che restituisce 401/403 JSON, e sua applicazione a tutte le route — chiude S2 e S1 in un colpo.
5. Rate limiting.
6. Fuso orario del locale.
7. Audit log sulle azioni sensibili.
8. Test: vitest + permessi, isolamento, fuso, disponibilità.
9. Dati demo relativi a oggi.

**Phase 1** Stripe → waitlist → walk-in → promemoria → disponibilità nel form interno.
**Phase 2** Modalità servizio → Sala Live V2 → navigazione mobile → centro controllo.
**Phase 3-7** come al §12-13 del brief.

---

## 16. Rischi di regressione

| Rischio | Dove | Mitigazione |
|---|---|---|
| La baseline delle migrazioni non combacia col database di produzione e il primo `migrate deploy` fallisce o riscrive | produzione | Baseline generata dallo schema attuale e marcata come già applicata (`migrate resolve --applied`); provata prima su un database di prova identico |
| Aggiungendo i controlli di ruolo, un'interfaccia che oggi funziona inizia a ricevere 403 perché usa un ruolo che non ha la capacità | Camerieri, Tavoli, Ospiti | Verificare la matrice prima: `RECEPTION` e `WAITER` hanno `manage_bookings`; il personale va sotto `manage_staff` (solo `MANAGER`). Da concordare: **oggi RECEPTION può creare camerieri, domani no** |
| Passando da 307 a 401, un client che oggi «funziona per caso» seguendo il redirect si rompe | fetch nei componenti | Cercare tutti i `fetch` e gestire 401 con messaggio e rientro |
| Il rate limiting in memoria non funziona su più istanze serverless | Vercel | Implementazione con interfaccia astratta: memoria in sviluppo, servizio esterno in produzione quando servirà |
| Cambiare «oggi» da UTC a fuso del locale sposta di un giorno viste e query in casi limite | Sala, calendario, contratti | Test sui casi limite (00:30 italiane, ora legale/solare) |
| `db push` di un collega dopo l'introduzione delle migrazioni disallinea di nuovo lo schema | squadra | Va comunicato a Filippo e Vasile: dopo questo cambio, `db:push` solo in locale |
| Toccare `header.tsx` per la navigazione mobile può rompere il pill animato desktop | navigazione | Screenshot alle 4 larghezze prima e dopo |

---

## 17. Ciò che sembra implementato e non lo è

La lista da tenere davanti agli occhi, perché è quella che genera aspettative sbagliate:

| Sembra | In realtà |
|---|---|
| **Pagamenti** — voce in navigazione, pagina con tre contatori, `Payment` nello schema, `stripe` fra le dipendenze | Zero righe di Stripe in `src/`. La pagina legge una tabella vuota. Nessun incasso è mai passato da qui |
| **Segnalazioni** — pagina con titolo e icona | Testo fisso, nessuna query, `Ticket` mai letto, e la rotta non è nemmeno in navigazione |
| **Esperienze** — voce in navigazione, pagina che elenca 2 esperienze | Nessuna API: non si può creare, modificare, vendere un biglietto. I 2 record vengono dal seed |
| **Waitlist** — schema completo con offerta, token, scadenza, conversione | Nessuna riga di codice. Nessuna interfaccia |
| **Automazioni** — `AutomationWorkflow`, `AutomationRun`, `MessageTemplate` | Nessuna riga di codice |
| **Recensioni / NPS** — 5 tabelle | Nessuna riga di codice |
| **Loyalty / coupon / gift card** — 5 tabelle, `LoyaltyTier` sugli ospiti | Nessuna riga di codice. Il livello fedeltà è un campo che nessuno aggiorna |
| **Menu / ordini / food cost** — 7 tabelle | Nessuna riga di codice |
| **POS / connettori** — 4 tabelle, `Connector` con `health()` implicito | Nessuna riga di codice |
| **Centralino** — `CallLog`, `MissedCall`, `VoiceBookingDraft` | Nessuna riga di codice |
| **Wi-Fi** — `WifiLead`, `WifiSession` | Nessuna riga di codice |
| **Audit log** — schema completo e corretto | Mai scritto |
| **CRM** — sezione Ospiti con schede | Anagrafica, note, preferenze manuali. Nessun LTV, nessun tag automatico, nessun comportamento calcolato |
| **Reminder** — `MessageLog`, `MessageTemplate` | Solo email di conferma alla creazione. Nessun promemoria prima del servizio |
| **Multi-brand** — `Organization`, `OrgMembership` | Un'organizzazione esiste, ma non c'è gestione multi-brand: `OrgMembership` è usato una volta sola |
| **Test** — `npm run check:availability` in `package.json` | Copre solo la disponibilità. Niente altro è verificato |

---

*Fine del Reality Check. Segue l'implementazione della Phase 0.*
