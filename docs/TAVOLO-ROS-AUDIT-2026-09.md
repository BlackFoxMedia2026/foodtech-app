# TAVOLO — Restaurant Operating System · Audit di stato e piano

**Data:** 8 settembre 2026, notte · **Commit:** `718625d` · **Produzione:** foodtech-app.vercel.app
**Contro:** il master prompt «Tavolo = Restaurant Operating System» (92 sezioni)

Questo documento è la risposta al §91: *audit prima del codice*. Non contiene
implementazioni.

Due avvertenze, per non far perdere tempo a chi legge.

**Prima:** una parte importante di quel prompt **è già viva**, e in molti casi è
stata fatta nelle ultime venti ore (audit prodotto, audit interfaccia, e le
tredici funzioni nate da entrambi — PR #39→#51). Il §0 dice di non dare per
assente ciò che il prompt chiede di migliorare: qui ogni voce è stata
verificata sul codice, non dedotta dal prompt.

**Seconda:** dove scrivo `NON VERIFICATO` significa che non l'ho aperto, non
che manchi. Preferisco dirlo.

---

## Stato dei lavori — aggiornato l'8 settembre, pomeriggio

**Dove siamo: la roadmap che non dipende da nessuno è finita**, tranne una
voce (il *realtime push* su sala e servizio, P4-5) e le cose che aspettano una
tua decisione o una chiave. Tredici cantieri chiusi e pubblicati l'8
settembre — dalle difese del widget alla coda dei lavori — con 834 test
unitari e 9 percorsi end-to-end verdi.

**Cosa aspetta te**, in ordine di quanto sblocca:

| Cosa | Quanto ci vuole | Cosa sblocca |
|---|---|---|
| **Una chiave email** (Brevo o Resend) su Vercel | dieci minuti | promemoria, sondaggi, automazioni, riconferma, recupero password, metà del *Growth OS* |
| **`CHIAVE_CIFRATURA`** su Vercel (`openssl rand -base64 32`) | un minuto | la password del Wi-Fi smette di stare in chiaro nel database |
| **Un fornitore di error tracking** (Sentry o simile) | dieci minuti | il primo allarme su `coda.lavoro_arreso` e `cron.*.non_riuscito`: da «lo scopriamo da un cliente» a «lo sappiamo prima» |
| **Un ramo di database per le anteprime** (console Neon) | dieci minuti | le anteprime smettono di poter toccare la produzione, e il freno delle migrazioni diventa una rete e non l'unica difesa |
| **Le sei decisioni sui pagamenti** (`docs/PROGETTO-PAGAMENTI.md`) | una conversazione | caparre, gift card online, biglietti per le esperienze |
| **Quando finisce la giornata di un ristorante** | una risposta | P2-9, e diciannove punti del codice che oggi usano la mezzanotte UTC |
| **Chi può forzare un tavolo** | una risposta | P1-8, il permesso granulare |
| **Le credenziali demo pubbliche** (`owner@tavolo.demo`) | una risposta | oggi funzionano in produzione: va deciso, non lasciato per inerzia |
| **Il cliente fra più locali** (`docs/NOTA-CRM-FRA-LOCALI.md`) | una scelta fra tre | P3-3 |

---

## Cosa era aperto il 7 settembre

Questo documento resta la fotografia del momento in cui è stato scritto: la
tabella qui sotto **non** viene riscritta ogni volta che si chiude una voce,
altrimenti non sarebbe più un audit. Qui invece si tiene il conto.

| Voce | Stato |
|---|---|
| 4 · zero test end-to-end | ✅ **chiuso per cinque percorsi su cinque** (8 set): harness in repo (`npm run test:e2e`), **nove prove verdi in 27 secondi**. Il sesto — caparra→rimborso — non si può scrivere senza pagamenti |
| 8 · centro notifiche muto | ✅ **chiuso**: da quattro categorie a otto, con la regola scritta nel modulo (si notifica solo ciò che nessun'altra schermata già mostra) |
| 9 · N+1 nel motore automazioni | ✅ **chiuso**: due letture per tutta la platea, e un test che conta le letture |
| 5 · sessione senza scadenza | 🟡 **mitigato**: la durata è dichiarata (sette giorni, rinnovo ogni ventiquattr'ore) invece dei trenta giorni per difetto. La revoca vera resta in roadmap |
| 13 · nessuna difesa anti-abuso sul widget | 🟡 **fatte tre su quattro**: idempotenza, doppione identico, campo trappola. Resta la verifica del contatto, che richiede un fornitore |
| 7 · nessuna osservabilità | 🟡 **fatta la parte senza fornitore**: log strutturati, i cinque cron con un `try` e la durata, la coda che distingue riprovato da arreso. Resta la scelta del fornitore e il primo allarme |
| 10 · pagamenti | 🟡 **progettato**: `docs/PROGETTO-PAGAMENTI.md` — livello agnostico, cinque policy, sette regole, sei decisioni in attesa. Nessuna riga di codice, per scelta |
| 6 · gestione del team | ✅ **chiuso**: invito con link da consegnare, ruoli assegnabili, rimozione, e le due difese contro il chiudersi fuori. Era «riscritto dopo verifica»: non è «`authorize` non controlla l'utente attivo», è che **non si può dare accesso a nessuno**. Vedi 5-bis |
| P2-1 · sala viva completa | ✅ **chiuso**: il conto aperto sul tavolo (col numero di righe, perché «conto vuoto» e «zero euro» sono due fatti diversi), la previsione di liberazione contata **da quando si sono seduti** e con la durata misurata qui quando ce n'è abbastanza, e chi arriva dopo su quel tavolo — anche mentre è occupato, con l'avviso «non fa in tempo». Trovato e corretto un difetto: la previsione partiva dall'orario prenotato, quindi un tavolo seduto in ritardo risultava libero mentre leggevano il menu |
| P2-3 · durata contestuale | ✅ **chiuso**: il motore non vende più tutto con 105 minuti. La durata si misura per gruppo, fascia e tipo di giorno, con una scala che si allarga quando i campioni non bastano e finisce sulla predefinita dichiarandolo. Proposta nel modulo con la frase che dice su cosa poggia; **una durata scritta a mano resta quella** |
| P2-4 · cosa sapere di questo ospite | ✅ **chiuso**: allergia, occasione, nota scritta dal personale, preferenze, chi è, assenze — al massimo quattro righe, in ordine di urgenza, con la fonte in ogni riga e **lo stesso aspetto in tutte le schermate**. Il tetto non taglia mai un avviso: dal vivo si è visto sparire «una volta non si è presentato» per far posto a «non ama la musica alta» |
| P2-2 · avvisi completi + due regole | ✅ **chiuso**: tutti e dieci gli avvisi hanno ora **problema → motivo → impatto → azione**, con l'impatto quantificato sui dati che ci sono. Le due regole nuove sono «sta per liberarsi» e «oltre la durata», e la seconda ha portato una regola generale: **un avviso senza impatto non si mostra** — un tavolo oltre la durata che nessuno aspetta non è un problema, è una serata che va bene |
| P2-7 · impostazioni e «Altro» raggruppati | ✅ **chiuso**: le tredici schede sono quattro parti con un indice in cima (Il locale · Prenotazioni · Ospiti · Sistema), e «Altro» ha tre gruppi con l'etichetta, uguali su scrivania e telefono. L'indice sono ancore, non schede: funziona senza JavaScript, si può condividere il link a una parte, e il tasto indietro fa quello che ci si aspetta |
| P2-5 · sintesi di Analytics | ✅ **chiuso**: «Com'è andata», cinque righe in cima con i problemi per primi. Solo fatti misurati — le misure che il locale non ha (food cost senza costi dichiarati, voti senza risposte) **non compaiono**, invece di diventare righe «dato non disponibile» |
| P2-6 · menu admin da telefono | ✅ **chiuso**: da quattro pulsanti a icona per piatto a un solo «⋯» con le azioni scritte. Ci è entrata anche **«segna come finito»**, che è il gesto più frequente durante il servizio e prima richiedeva di aprire la scheda del piatto. Da tablet in su la fila di pulsanti resta: col mouse funziona meglio del menù |
| P2-8 · deduplica e unione ospiti | ✅ **chiuso**: le coppie con la stessa email o lo stesso telefono si propongono, **nessuna unione è automatica**, e l'unione la può fare solo un Manager. Niente si perde: tutto si sposta, note e allergie si uniscono, i contatori si ricalcolano dalle righe. Una revoca di consenso più recente vince su un consenso più vecchio, e una scheda anonimizzata non si unisce mai |
| P1-9 · cifratura della password Wi-Fi | ✅ **chiuso**: AES-256-GCM con chiave da `CHIAVE_CIFRATURA`. Non può essere un'impronta — il portale la consegna a chi lascia un contatto — quindi si mette sotto chiave. Senza chiave resta in chiaro **con l'etichetta**, e la schermata lo dice. Nel farlo è emerso che il freno delle migrazioni chiamava distruttivo anche diventare `text`: adesso distingue |
| 16 · le domande operative dell'agente | ✅ **chiuso**: le cinque domande del §56 sono cinque strumenti deterministici sui dati che esistevano già. Nessun modello: dove la misura non basta la risposta dice **cosa manca** invece di stimare, e ogni numero porta la sua base |
| P3-6 · coda: priorità, quote, storia | ✅ **chiuso**: tre livelli di priorità (chi aspetta adesso, lavoro del locale, spedizioni), una quota per fornitore che vale sia come limite verso Brevo sia come garanzia che una campagna non occupi tutto il giro, e la storia dei lavori conclusi che si tiene due settimane — mentre **i non riusciti non si toccano mai**. È il lavoro che serviva prima di accendere l'email |
| §60 · il progetto della prenotazione al telefono | ✅ **scritto**: `docs/PROGETTO-VOCE.md`. Il prompt chiede il progetto e non l'implementazione, e non l'avevo scritto: tre strade in ordine di costo (non perdere la chiamata → la segretaria che scrive → l'agente che risponde), le regole che valgono per tutte, e cinque decisioni tue. Zero righe di codice |
| soglia dei gruppi numerosi | ✅ **chiuso**: era una costante (dodici), ora è un'impostazione del locale. Dodici va bene per una trattoria e non per una sala che fa banchetti |
| ritardo nella rotazione | ✅ **chiuso**: l'undicesima regola del centro controllo. Le cene chiuse **di stasera** contro la mediana del locale, con almeno tre cene chiuse e almeno una conseguenza — un servizio lento con la sala mezza vuota non è un problema |
| tutte le altre | aperte, nell'ordine della roadmap |

---

# A. EXECUTIVE AUDIT — i venti problemi che contano

In ordine di gravità reale, non di comodità.

| # | Problema | Perché conta | Evidenza |
|---|---|---|---|
| 1 | **Le anteprime condividono il database di produzione** | Una migrazione sbagliata in una PR toccherebbe i dati veri. C'è un freno (`scripts/migrate-safe.ts`: le anteprime applicano solo migrazioni additive), ma è un freno, non una separazione | `[CODE]` `scripts/migrate-safe.ts`, `tests/migrazioni-sicure.test.ts` |
| 2 | **Nessun recupero password, nessuna verifica email, nessun 2FA** — e i campi per il 2FA esistono già nello schema senza una riga di codice (`totpEnabled`, `totpSecret`, `recoveryCodesHash`) | Un ristoratore che perde la password oggi non ha modo di rientrare. E tre colonne di sicurezza mai scritte sono una promessa scritta nel database | `[CODE]` `src/lib/auth.ts`, `[DATABASE]` `model User` |
| 3 | **Il limite di frequenza vive nella memoria del processo** | Su Vercel ogni istanza ha il suo conteggio: con tre istanze, tre volte le richieste. È la differenza fra un freno e un freno vero, e riguarda login e widget pubblico | `[CODE]` `src/lib/rate-limit.ts` (documentato nel file) |
| 4 | **Zero test end-to-end nel repository** | I 631 test coprono i moduli; nessuno percorre *prenoto → arrivo → conto → CRM*. Ogni collaudo dei percorsi è stato fatto a mano da me con Playwright, fuori dal repo: domani nessuno lo rifà | `[CODE]` niente `playwright.config`, `tests/` sono tutti Vitest |
| 5 | **La sessione non scade e non si può revocare** | JWT con la durata di default (30 giorni), nessuna invalidazione: un dispositivo perso resta dentro un mese. E `model Session` esiste ma non viene mai scritto | `[CODE]` `src/lib/auth.ts` |
| 5-bis | **Correzione a questo audit** (verificata dopo averlo scritto): «`authorize()` non controlla che l'utente sia attivo» era **più grave di com'è**. L'accesso ai dati non passa dall'autenticazione ma dall'appartenenza al locale, ricontrollata a ogni richiesta (`resolveActiveVenue`): chi non ha più un locale può autenticarsi e non vede niente — viene mandato all'onboarding. Aggiungere una colonna `User.active` che nessuno scriverebbe sarebbe stato l'ennesimo campo morto | `[CODE]` `src/lib/tenant.ts` |
| 6 | **Non si può aggiungere né togliere una persona dal team** | `VenueMembership` viene scritta **solo dal seed**: in tutto il prodotto non esiste una rotta che la crei o la cancelli. Un ristorante che compra Tavolo non può dare l'accesso al suo maître. I cinque ruoli e le sette abilità esistono e funzionano — ma non c'è modo di assegnarli `[CODE]` |
| 7 | **Nessuna osservabilità** | Zero error tracking, zero log strutturati, zero allarmi sui cron falliti. Se stanotte una automazione fosse esplosa in produzione, lo scopriremmo da un cliente | `[CODE]` nessun Sentry/equivalente in `package.json` |
| 8 | **Il centro notifiche è quasi muto: 4 categorie su 20 vengono scritte** | Scritte: voto basso, automazione fallita, contratto in scadenza/scaduto. Mai scritte: prenotazione creata, prenotazione annullata, waitlist accettata, gift card usata, contatto dal Wi-Fi, VIP senza tavolo. La campanella è quasi sempre vuota | `[CODE]` conteggio su tutte le 20 voci di `NotificationKind` |
| 9 | **N+1 nel motore automazioni: due query per candidato** | Aprire *Automazioni* con 300 clienti raggiungibili costa oltre mille viaggi al database. Oggi la demo ha 121 clienti e non si nota; con un locale vero è la pagina più lenta del prodotto | `[CODE]` `src/server/automations/engine.ts:175-186` |
| 10 | **I pagamenti non esistono come dati**: nessuna riga `Payment` viene mai creata | La pagina Pagamenti è un elenco di qualcosa che nessuno scrive. È dichiarato onestamente a schermo, ma è il buco commerciale numero uno: caparre, garanzia, biglietti, gift card vendute online | `[CODE]` `db.payment` compare solo in lettura |
| 11 | **Chi può forzare un tavolo è chiunque possa gestire prenotazioni** — cameriere compreso | Con motivo obbligatorio e tracciato, ma senza un permesso dedicato. Il §48 chiede `booking.force`: oggi l'abilità è `manage_bookings` | `[CODE]` `src/lib/abilities.ts` |
| 12 | **«Oggi» è la giornata del processo, non quella del locale** | Su Vercel (UTC) per un locale italiano viene una finestra 02:00→01:59, che *per caso* somiglia a una giornata di servizio. Nessuno ha ancora deciso quando finisce la giornata di un ristorante | `[CODE]` 19 chiamate a `startOfDay`; scritto in `ANALISI` §11.7 |
| 13 | **Nessuna difesa anti-abuso sul widget oltre al limite di frequenza** | Nessun honeypot, nessuna idempotenza, nessun riconoscimento del doppione, nessuna verifica del contatto: email e telefono inventati passano | `[CODE]` `src/app/api/public/bookings/route.ts` |
| 14 | **23 modelli su 73 non hanno una riga di codice** | Era 24 ieri, ne sono stati chiusi due (`ReviewLink`, `ReviewLinkClick`). Restano fra gli altri `Connector`, `POSConnector`, `POSEvent`, `CallLog`, `MissedCall`, `VoiceBookingDraft`, `ChatSession`, `Review`, `Ticket`, `ApiToken`, `StaffShift`, `MessageTemplate` | `[DATABASE]` conteggio rifatto stanotte |
| 15 | **L'email è spenta in produzione** | Promemoria, sondaggi, automazioni e campagne sono pronti e non partono. Il prodotto lo dichiara invece di finto-inviare, ma metà del *Growth OS* è ferma per una chiave | `[CODE]` `src/server/messaging/*` |
| ~~16~~ | ~~**L'agente AI non risponde a nessuna delle domande del §56**~~ — **chiuso l'8 settembre** | Esiste, ed è ben fatto (10 intenti deterministici, quota mensile, conferma sulle azioni). Ma non sa dire chi rischia di non presentarsi, quali tavoli stanno andando lunghi, chi non torna, quali piatti rendono meno, qual è il giorno peggiore — cioè le domande operative | `[CODE]` `src/server/ai/intent-router.ts` |
| 17 | **Il riconoscimento degli intenti è a espressioni regolari sull'italiano** | «come siamo messi stasera?» non corrisponde a nessuna regola e finisce nella quota esterna. Fragile per costruzione, e la fragilità la paga la quota | `[CODE]` `src/server/ai/intent-router.ts` |
| 18 | **Nessuna deduplica ospiti a posteriori, né merge** | Il riconoscimento all'ingresso c'è (email/telefono) ed è stato messo stanotte, ma i doppioni già in archivio non si possono unire: una scheda sbagliata resta sbagliata | `[CODE]` `src/server/guest-match.ts` |
| 19 | **Nessuna cache, e ogni pagina interroga il database a ogni caricamento** | Oggi sostenibile e in parte voluto (sala e servizio devono essere freschi). Con dieci locali attivi va guardato, e va guardato **prima** che diventi un incendio | `[INFERENCE]` architettura RSC senza livello di cache |
| 20 | **Credenziali demo pubbliche su un ambiente raggiungibile da chiunque** | `owner@tavolo.demo` / `tavolo2026` sono nei documenti e funzionano in produzione. È utile per vendere e va deciso esplicitamente, non per inerzia | `[CODE]` `prisma/seed.ts` |

---

# B. FEATURE MATRIX

Legenda: **EXISTS** (fatto e verificato) · **PARTIAL** (funziona a metà, o
funziona senza il pezzo commerciale) · **MISSING** · **IMPROVE** (esiste e
merita un salto) · **DEFER** (non ora, per scelta).

## BOOKING OS

| Area | Stato | Nota |
|---|---|---|
| Disponibilità server-side | **EXISTS** | Unica fonte per sala, API e widget. 65 regole verificate |
| Turni, capienza, durata, blocchi, sovrapposizioni | **EXISTS** | |
| Tavoli combinati | **EXISTS** | Controllo su *tutti* i tavoli uniti |
| Prenotazione manuale · widget · walk-in · waitlist→booking | **EXISTS** | |
| Modifica, disdetta, conferma, no-show, assegnazione | **EXISTS** | |
| Storico modifiche / audit override | **EXISTS** | Azione dedicata `booking.cancel`, forzatura con motivo |
| Finestra di prenotazione (anticipo massimo, preavviso) | **EXISTS** | Fatta stanotte. Vale **solo** sul canale pubblico |
| Overbooking dichiarato | **EXISTS** | Fatto stanotte. Percentuale del locale, segnata in sala, invisibile al cliente |
| Permesso dedicato `booking.force` | **MISSING** | §48; oggi basta `manage_bookings` |
| Gruppi numerosi → contattaci | **EXISTS** | Fatto stanotte, soglia fissa a 12 |
| Soglia gruppi configurabile | **EXISTS** | Fatta l'8 settembre: impostazione del locale (`largePartyFrom`), non più una costante. Dodici resta il valore per difetto |
| Alternative quando non c'è posto | **EXISTS** | Fatto stanotte: primi tre giorni con posto, un tocco per accettarli |
| Alternative *nello stesso giorno* | **PARTIAL** | Gli orari del giorno si vedono tutti; non c'è «il primo orario successivo» in evidenza |
| Alternative in un altro locale del gruppo | **MISSING** | §10, §46. Dipende dalla decisione sul multi-locale |
| Riconferma obbligatoria con scadenza | **MISSING** | **Bloccata**: senza email il promemoria non parte, sarebbe una funzione che non fa niente |
| Verifica contatto / OTP sul widget | **MISSING** | §11 |
| Idempotenza, honeypot, doppioni, bot protection | **EXISTS** | Fatte l'8 settembre (PR #60). Resta la verifica del contatto, che richiede un fornitore |
| Durata contestuale (per giorno/fascia/gruppo) | **EXISTS** | Fatta l'8 settembre. Scala a quattro gradini: gruppo+fascia+tipo di giorno → gruppo+fascia → gruppo → locale → predefinita, e si scende solo dove ci sono almeno dieci cene chiuse |

## SERVICE OS

| Area | Stato | Nota |
|---|---|---|
| Modalità Servizio | **EXISTS** | Chi arriva, chi è a tavola, cosa fare adesso |
| Stati tavolo derivati dai fatti | **EXISTS** | Sette stati, nessuno stato manuale duplicato |
| Centro controllo | **EXISTS** | **Otto** regole deterministiche, ognuna con il suo rimedio e un'urgenza |
| — picchi di arrivi | **EXISTS** | |
| — collisioni di tavoli | **EXISTS** | |
| — prenotazioni senza tavolo | **EXISTS** | |
| — ritardi e rischio no-show (con lo storico del cliente) | **EXISTS** | Oltre tre ore diventa «non arrivata»: una riga, non otto |
| — tavoli grandi sottoutilizzati | **EXISTS** | |
| — waitlist compatibile | **EXISTS** | |
| — capacità turno superata | **EXISTS** | |
| — posto liberato da una disdetta | **EXISTS** | Fatto stanotte |
| — tavoli che stanno per liberarsi | **EXISTS** | Fatto l'8 settembre: avviso un quarto d'ora prima, solo se c'è qualcuno che ci starebbe |
| — tavoli oltre la durata prevista | **EXISTS** | Fatto l'8 settembre: regola del centro controllo, col conto nel motivo. Non scatta se nessuno aspetta quel tavolo |
| — ritardo nella rotazione | **EXISTS** | Fatto l'8 settembre: le cene chiuse di stasera contro la mediana del locale, con almeno tre cene e una conseguenza |
| Sala viva | **EXISTS** | Stato, ospite, coperti, orario, ritardo, allergie, tavolate |
| Sala viva: conto sul tavolo, previsione di liberazione, prossima prenotazione | **EXISTS** | Fatte tutte e tre (8 set). La previsione dice anche su cosa poggia: durata misurata qui, o durata prevista sulla prenotazione |
| Tavoli in scala sui posti | **EXISTS** | Fatto stanotte |
| Floor plan editor | **EXISTS** | Drag & drop, forme, capienza, rotazione, unione, piantina di sfondo |
| Conto al tavolo | **EXISTS** | Prezzo fotografato, totale dalle righe, un conto per tavolo |
| Coupon / punti / gift card sul conto | **EXISTS** | Trattati come **modi di pagare**, non righe: il food cost non viene falsato |
| Waitlist completa (posizione, stima, offerta, scadenza, conversione) | **EXISTS** | Righe dimenticate escluse dalle medie |
| Azioni rapide sulla coda (avvisa/accomoda/rimuovi/chiama) | **PARTIAL** | Le prime tre ci sono; «chiama» come gesto diretto no |

## GUEST INTELLIGENCE

| Area | Stato | Nota |
|---|---|---|
| Profilo calcolato dalle prenotazioni | **EXISTS** | Visite, prima/ultima, frequenza, coperti medi, anticipo, disdette, assenze |
| Assenze raccontate, non punteggiate | **EXISTS** | Fatto stanotte: «2 su 12, l'ultima il 5 settembre» |
| Abitudini (giorno, fascia, sala, tavolo) | **EXISTS** | Solo con almeno tre visite: sotto non è un'abitudine |
| Tag automatici con motivazione | **EXISTS** | Ogni tag porta il suo perché |
| Allergie, note riservate, occasioni | **EXISTS** | |
| Consenso separato da quello operativo, con prova | **EXISTS** | |
| Export e cancellazione su richiesta | **EXISTS** | Sette posti in una transazione, i conti non si toccano |
| Deduplica e unione schede ospite | **EXISTS** | Fatto l'8 settembre: proposte su segnali esatti, unione manuale, registro dell'azione, e nove test che verificano che si **rifiuti** |
| Sintesi «cosa sapere di questo ospite» | **EXISTS** | Fatta l'8 settembre: quattro righe al massimo, in ordine di urgenza, uguali in Servizio, Sala e prenotazione. Gli avvisi non si tagliano mai |
| Riconoscimento all'ingresso (email/telefono) | **EXISTS** | |
| Deduplica a posteriori e merge controllato | **EXISTS** | Fatta l'8 settembre: proposte su segnali esatti, unione manuale da Manager, registro dell'azione |
| Valore economico dell'ospite | **PARTIAL** | Solo dai conti chiusi su Tavolo; senza POS resta parziale — ed è dichiarato |

## GROWTH & REVENUE OS

| Area | Stato | Nota |
|---|---|---|
| Menu (categorie, prezzo, costo, margine, allergeni UE, disponibilità) | **EXISTS** | 14 allergeni da elenco chiuso |
| Ricerca e filtri nel menu | **EXISTS** | Fatto stanotte, oltre i dodici piatti |
| Menu mobile admin senza rumore | **EXISTS** | Fatto l'8 settembre: un solo «⋯» per piatto, con «segna come finito» dentro |
| Menu pubblico da QR | **EXISTS** | Con navigazione per portate, fatta stanotte |
| Food cost con copertura, senza estrapolare | **EXISTS** | «Le percentuali valgono sui € di cui conosciamo il costo» |
| Menu engineering | **EXISTS** | Fatto stanotte: stelle/cavalli/enigmi/cani, e il rifiuto di classificare con pochi dati |
| Rotazione: durata reale vs prevista | **EXISTS** | Fatto stanotte, con il consiglio operativo quando lo scarto supera i 10′ |
| Rotazione segmentata (giorno, fascia, gruppo, zona) | **EXISTS** per gruppo, fascia e tipo di giorno | Fatta l'8 settembre dentro il motore (durata contestuale). La **zona** resta fuori: le sale hanno pochi tavoli e i campioni non basterebbero |
| Analytics: incassi, occupazione, fonti, fasce, giorni | **EXISTS** | |
| Costo delle assenze in euro misurati | **EXISTS** | |
| Lista d'attesa misurata (coperti recuperati) | **EXISTS** | Fatto stanotte |
| Debito gift card nei numeri d'insieme | **EXISTS** | Fatto stanotte |
| Previsione coperti conservativa | **EXISTS** | Con il ragionamento dietro ogni numero |
| Executive summary mobile | **EXISTS** | Fatto l'8 settembre: cinque righe in cima ad Analytics, problemi per primi, ognuna con la sua base. Funzione pura sui numeri già letti: nessuna lettura in più |
| Campagne (segmento, anteprima destinatari, consenso, attribuzione) | **EXISTS** | Invio via Brevo |
| Automazioni | **EXISTS** | **Quattro**, catalogo chiuso, cinque difese contro l'invio di massa |
| Coupon (con spesa minima e giorni validi) | **EXISTS** | |
| Loyalty (punti dai conti chiusi, traguardo) | **EXISTS** | |
| Gift card (emissione, uso parziale, debito) | **PARTIAL** | Manca solo **incassarle online** |
| Wi-Fi (contatto in cambio della password, misurato fino alla prenotazione) | **EXISTS** | Dichiara di non aprire il router, invece di finger di farlo |
| Credenziali Wi-Fi cifrate a riposo | **EXISTS** | Fatta l'8 settembre (AES-256-GCM). Senza `CHIAVE_CIFRATURA` resta in chiaro **e la schermata lo dice** |
| Reputation: sondaggio, NPS, due strade, ponte alle recensioni misurato | **EXISTS** | Fatto stanotte: `/r/<id>` conta il passaggio |
| Recensioni vere dentro Tavolo | **MISSING** | Serve l'API delle piattaforme |
| QR manager | **PARTIAL** | Crea e scarica; nessuna scansione tracciata (e non la inventa) |

## PIATTAFORMA

| Area | Stato | Nota |
|---|---|---|
| Multi-locale (organizzazione, ruoli per locale) | **EXISTS** | |
| Ospiti/punti/gift card condivisi fra locali | **MISSING** | Tre strade in `NOTA-CRM-FRA-LOCALI.md`, decisione aperta |
| Reporting di gruppo | **MISSING** | §46 |
| Brand / white label sulle pagine guest | **EXISTS** | Logo e colore su widget, menu, Wi-Fi, sondaggio |
| Ruoli e permessi | **PARTIAL** | 5 ruoli, 7 abilità, applicati dappertutto; mancano `booking.force` e la granularità del §48 |
| Gestione del team (invito, ruolo, rimozione) | **EXISTS** | Fatta: invito con link da consegnare, ruoli, rimozione, e le due difese contro il chiudersi fuori. Era il buco più grosso della piattaforma dopo i pagamenti |
| Audit sulle azioni sensibili | **EXISTS** | 40+ azioni tipizzate |
| Coda lavori su Postgres + 5 cron | **EXISTS** | |
| Coda: priorità, dead-letter, limite per fornitore | **EXISTS** | Fatta l'8 settembre: tre priorità, quota per fornitore, storia di due settimane e i non riusciti che non si cancellano mai |
| Email production | **MISSING** | Chiave |
| WhatsApp / SMS | **MISSING** | Fornitore |
| Pagamenti | **MISSING** | §12: nessuna riga `Payment` scritta |
| POS / channel layer | **MISSING** | Modelli presenti, zero codice |
| Reserve with Google | **MISSING** | |
| API pubbliche / webhook | **MISSING** | `ApiToken` senza codice |
| Realtime | **PARTIAL** | Polling: servizio 30″, sala, campanella. Nessun push |
| Osservabilità | **PARTIAL** | Log strutturati, cron con un `try` e la durata, coda che distingue riprovato da arreso. Resta la scelta del fornitore di error tracking e il primo allarme |
| Test unitari e di integrazione | **EXISTS** | 631 in 39 file, verdi da quattro fusi diversi |
| Test end-to-end | **EXISTS** | Cinque flussi su cinque l'8 settembre (nove prove). Il sesto — caparra→rimborso — richiede i pagamenti |
| Seed realistico | **EXISTS** | Ripulito dalle assurdità (577′, 536′, tutti VIP) |
| AI: agente con quota, conferme, permessi | **EXISTS** | 10 intenti, 1 azione |
| AI: le domande operative del §56 | **EXISTS** | Fatte tutte e cinque l'8 settembre, come strumenti deterministici: chi rischia di mancare, quali tavoli vanno lunghi, chi non torna, quali piatti rendono meno, qual è il giorno peggiore. Dove la misura non basta, la risposta è che non basta |
| AI: insight proattivi | **PARTIAL** | Esistono, ma **fuori** dall'agente: sono le otto regole del centro controllo. È probabilmente il posto giusto |
| Voice booking | **PROGETTATO** | `docs/PROGETTO-VOCE.md` (8 set): tre strade in ordine di costo, le regole che valgono per tutte, cinque decisioni tue. Nessuna riga di codice, perché il §60 chiede il progetto |

---

# C. UX GAP AUDIT

L'audit interfaccia completo è di ieri (`TAVOLO-UX-UI-VISUAL-GAP-AUDIT-2026-09.md`)
e la sua lista è **chiusa**. Quello che resta, letto con gli occhi di questo
master prompt:

## Desktop

1. **«Altro» nasconde il lato commerciale del prodotto.** Dietro ci sono
   Analytics, Menu, Marketing, Campagne, Automazioni, Coupon, Gift card,
   Wi-Fi, QR, Esperienze, Camerieri, Pagamenti, Impostazioni. Il §3 chiede di
   non gonfiare la navigazione — giusto — ma chi compra Tavolo per il
   marketing lo trova sotto «Altro». **Serve un raggruppamento dentro
   «Altro»**, non una voce in più.
2. ~~**Impostazioni è una colonna di tredici schede.**~~ — chiuso l'8
   settembre: quattro parti (Il locale · Prenotazioni · Ospiti · Sistema) con
   un indice in cima, come il menu pubblico.
3. ~~**La sala non dice tutto quello che potrebbe** (§6)~~ — chiuso l'8 settembre. Restava: manca l'importo del
   conto e la prossima prenotazione sul riquadro del tavolo.
4. ~~**La Panoramica è già una mission control** (briefing + tre avvisi), ma
   l'avviso non ha ancora la forma completa del §4~~ — chiuso l'8 settembre:
   tutti e dieci gli avvisi hanno *problema → motivo → impatto → azione*.
5. **Densità uniforme** (rilevato ieri, non risolto): Servizio dovrebbe essere
   più denso di Impostazioni, e oggi respirano allo stesso modo.

## Mobile

6. ~~**Analytics mobile è il desktop compresso** (§28)~~ — chiuso l'8
   settembre: «Com'è andata» sta in cima, cinque righe con i problemi per
   primi e la base di ogni numero.
7. ~~**Il menu admin da telefono è rumoroso** (§21)~~ — chiuso l'8 settembre:
   da telefono un solo «⋯» con le azioni scritte a parole, più «segna come
   finito» che prima si raggiungeva solo aprendo la scheda del piatto.
8. **Il «+» centrale fa meno di quanto potrebbe** (§52): verificare quali
   azioni offre davvero e portarlo a sei gesti a una mano. `NON VERIFICATO` in
   dettaglio.
9. **Servizio da telefono è già stato corretto** ieri (prima cosa fare, poi
   quanti). Regge.

---

# D. TECHNICAL GAP AUDIT

## Database

- 73 modelli, **23 senza una riga di codice** (`OrderItem` era un falso
  positivo del mio conteggio: si usa in scrittura annidata).
- I 23 vanno chiusi con una decisione, non lasciati: `Connector`,
  `ConnectorEvent`, `POSConnector`, `POSEvent` (arriveranno con il POS);
  `CallLog`, `MissedCall`, `VoiceBookingDraft` (voice/caller ID);
  `ChatSession`, `ChatMessage`; `Review`; `Ticket`; `ApiToken`; `StaffShift`;
  `MessageTemplate`; `CostEntry`; `MenuScan`; `FloorDecor`; `ExchangeRate`;
  `BookingEvent`; `BookingPreorder(+Item)`; `WifiSession` (**non scritta di
  proposito**: una sessione ha una fine e non possiamo vederla); `Session`
  (inutile con JWT).
- Indici: presenti sulle letture calde (`[venueId, startsAt]`,
  `[venueId, status]`, `[venueId, email]`…). `NON VERIFICATO` un audit
  sistematico dei piani di query.
- **Nessun soft delete coerente**: `Booking` ha i campi, le liste non li
  filtrano tutte.

## API

- 107 rotte. Guardia unica `requireVenueApi(ability?)` con unione discriminata:
  buona, usata dappertutto.
- Errori tipizzati con messaggi in italiano: buono.
- **Nessuna idempotenza** su nessuna scrittura pubblica.
- **Nessuna versione** delle API (irrilevante finché non sono pubbliche).

## Sicurezza

- Intestazioni: `nosniff`, `Referrer-Policy`, `X-Frame-Options`,
  `frame-ancestors`, HSTS, `Permissions-Policy`. **CSP sugli script assente**,
  e il motivo è scritto nel file: serve un nonce per riga di rendering, e
  scriverne una con `unsafe-inline` sarebbe chiamare sicurezza una cosa che non
  protegge.
- Limite di frequenza su login, widget, sondaggio, azione prenotazione, Wi-Fi,
  disponibilità, agente, upload. **In memoria per istanza.**
- CSRF: NextAuth lo gestisce sul login; le rotte API sono JSON con sessione
  via cookie — `NON VERIFICATO` il comportamento su `SameSite`.
- Segreti: variabili d'ambiente, `CRON_SECRET` obbligatorio (i cron rifiutano
  di girare senza).
- **Password Wi-Fi in chiaro nel database.**

## Infrastruttura

- Anteprime sullo stesso database della produzione, con freno.
- Nessuna regione dichiarata in `vercel.json`: se la funzione finisse lontana
  dal database di Francoforte, il prodotto diventerebbe lento senza cambiare
  una riga. **Da mettere: `regions: ["fra1"]`.**
- 5 cron. Nessun allarme se un cron fallisce.

## Prestazioni

- **N+1 confermato** nel motore automazioni: due query per candidato, quattro
  automazioni per caricamento.
- `listAutomations` chiama `ensureAutomation` (una scrittura potenziale) per
  ogni automazione a ogni apertura della pagina.
- Nuovo stanotte, già limitato: la regola della disdetta chiedeva
  «c'è ancora posto?» una volta per disdetta → ora massimo cinque.
- Polling: Servizio 30″ (solo la fotografia, non gli avvisi), sala, campanella.
  Accettabile; il §77 chiede di valutare il push.

## Job

- Coda su Postgres con presa in carico atomica, ritentativi, recupero degli
  appesi. Manca: priorità, dead-letter, limite per fornitore.

## Integrazioni

- Vive: Brevo (campagne), Resend (spento), OpenAI (agente, con quota), Vercel
  Blob, Vercel Cron. **Cinque.**
- Nessun livello di astrazione per POS o canali: i modelli ci sono, il codice no.

---

# E. COMPETITOR GAP

Il confronto completo è di ieri
(`TAVOLO-PRODUCT-GAP-AUDIT-2026-09.md`). Sintesi aggiornata a stanotte:

| | Tavolo | CoverManager | Pienissimo |
|---|---|---|---|
| Motore prenotazioni | **8/10** — unica fonte server-side, 65 regole, finestra, overbooking, alternative | 9 | 6 |
| Gestione sala e servizio | **9/10** — è il differenziatore | 7 | 4 |
| Pagamenti e caparre | **0/10** | 9 | 6 |
| CRM ospite | **8/10** — comportamentale, spiegato | 7 | 7 |
| CRM fra locali | **0/10** | 9 | ? |
| Marketing e automazioni | **7/10** — quattro ricette che partono davvero | 5 | 9 |
| Reputation | **6/10** — ponte misurato, recensioni non importate | 6 | 8 |
| Integrazioni | **1/10** — cinque | 9 (130+ dichiarate) | 6 |
| Onestà del dato | **10/10** | ? | ? |

Le tre distanze che contano, nell'ordine: **pagamenti**, **integrazioni
(POS/canali)**, **CRM fra locali**. Tutto il resto è pari o a favore.

---

# F. TAVOLO DIFFERENTIATORS — cosa non dobbiamo perdere

Se una modifica futura mette in discussione una di queste, la modifica ha torto
fino a prova contraria.

1. **Niente dati finti.** Ogni numero è misurato, o dichiara di non esserci.
   È già dentro il codice in almeno dodici punti: copertura del food cost,
   `NON estrapolare`, «ancora presto per dirlo», soglie minime prima di dare
   una percentuale, righe dimenticate escluse dalle medie.
2. **La verità sono le righe, mai un contatore.** Saldo punti, residuo gift
   card, totale del conto: si sommano le righe. I contatori si aggiornano nella
   stessa transazione perché chi legge il database non venga ingannato.
3. **Stato derivato dai fatti, non dichiarato a mano.** I sette stati del
   tavolo e «in ritardo» non sono colonne: sono conti sull'ora.
4. **Regole deterministiche invece di un modello.** Le otto regole del centro
   controllo si possono leggere, discutere e cambiare. Un modello generativo
   aggiungerebbe incertezza a dati esatti.
5. **Il catalogo chiuso invece del costruttore di regole.** Quattro automazioni
   che partono valgono più di un editor che fa tutto e resta vuoto.
6. **Cinque difese contro l'invio di massa**, e il numero delle persone che
   verrebbero toccate **prima** di accendere.
7. **Italiano da ristoratore.** «Quanto è rimasto», «quanto costano le
   assenze», «quanto stanno a tavola», «chi non torna».
8. **Ogni funzione dichiara i propri limiti** dove li ha: il Wi-Fi non apre il
   router, il ponte recensioni conta chi arriva alla porta, non chi scrive.
9. **Le anteprime non migrano la produzione** (il freno).
10. **La forzatura chiede un motivo**, e il motivo finisce nel registro con
    nome e ora.

---

# G. ROADMAP

Impatto (1-5) · Complessità (S/M/L) · Rischio (basso/medio/alto).

## P0 — FONDAZIONE (nulla di commerciale prima di questo)

| # | Cosa | Impatto | Compl. | Dipendenze | Rischio |
|---|---|---|---|---|---|
| P0-1 | **Ramo di database per le anteprime** (Neon) + `regions: ["fra1"]` | 5 | S | accesso console Neon → **tuo** | basso |
| ~~P0-2~~ | ~~**Test end-to-end in repo**: i cinque flussi del §80~~ — **fatto**: cinque su cinque l'8 settembre (il sesto richiede i pagamenti) | 5 | M | nessuna | basso |
| P0-3 | **Osservabilità minima**: error tracking, log strutturati, allarme sui cron falliti | 5 | S | scelta del fornitore | basso |
| P0-4 | **Sessione**: scadenza dichiarata (**fatta**), `authorize` che controlla l'utente attivo (**rivisto: non serviva**, l'accesso è già verificato a ogni richiesta), revoca (**resta**) | 4 | S | nessuna | basso |
| ~~P0-5~~ | ~~**Widget hardening**~~ — **fatte tre su quattro** l'8 settembre: idempotenza, doppione identico, campo trappola. Resta la verifica del contatto (serve un fornitore) e il limite di frequenza su store condiviso | 4 | M | uno store (Upstash o tabella) | medio |
| ~~P0-6~~ | ~~**N+1 automazioni** → due query aggregate~~ — **fatto** | 3 | S | nessuna | basso |
| P0-7 | **Recupero password + verifica email** | 4 | M | **chiave email** | basso |
| P0-8 | **Architettura pagamenti** (livello agnostico + modello delle policy), senza fornitore — **progettata** in `docs/PROGETTO-PAGAMENTI.md`, sei decisioni in attesa | 5 | M | nessuna per il progetto | medio |
| ~~P0-9~~ | ~~**Gestione del team**: dare accesso, cambiare ruolo, togliere l'accesso~~ — **fatto**: invito con link da consegnare a voce, senza email. Con le due difese contro il chiudersi fuori | 5 | M | — | medio |

## P1 — COMPLETEZZA COMMERCIALE

| # | Cosa | Impatto | Compl. | Dipendenze | Rischio |
|---|---|---|---|---|---|
| P1-1 | **Caparra e garanzia carta** sul flusso di prenotazione | 5 | L | P0-8 + fornitore | alto |
| P1-2 | **Gift card vendute online** | 4 | M | P1-1 | medio |
| P1-3 | **Email in produzione** e sblocco di promemoria/sondaggi/automazioni | 5 | S | chiave | basso |
| P1-4 | **Riconferma obbligatoria con scadenza** | 4 | M | P1-3 | medio |
| P1-5 | **WhatsApp** (conferma, promemoria, tavolo pronto) | 4 | M | fornitore | medio |
| ~~P1-6~~ | ~~**Notifiche che esistono davvero**~~ — **fatto**: da quattro categorie a otto | 3 | S | nessuna | basso |
| P1-7 | **2FA** (i campi ci sono già) | 3 | M | P0-7 | basso |
| P1-8 | **Permesso `booking.force`** e granularità del §48 | 3 | S | decisione tua su chi forza | basso |
| ~~P1-10~~ | ~~**Soglia dei gruppi numerosi** configurabile~~ — **fatto l'8 settembre**: era una costante | 2 | S | nessuna | basso |
| ~~P1-9~~ | ~~**Cifratura credenziali Wi-Fi**~~ — **fatto l'8 settembre** | 3 | S | nessuna | basso |

## P2 — DIFFERENZIAZIONE (dove Tavolo diventa Tavolo)

| # | Cosa | Impatto | Compl. | Dipendenze | Rischio |
|---|---|---|---|---|---|
| ~~P2-1~~ | ~~**Sala viva completa** (§6): conto, previsione di liberazione, prossima prenotazione sul tavolo~~ — **fatto l'8 settembre** | 5 | M | nessuna | basso |
| ~~P2-2~~ | ~~**Avviso → problema/motivo/impatto/azione** e due regole nuove (tavolo che sta per liberarsi, tavolo oltre la durata)~~ — **fatto l'8 settembre** | 4 | M | nessuna | basso |
| ~~P2-3~~ | ~~**Durata contestuale** nel motore (§15), solo con campioni sufficienti~~ — **fatto l'8 settembre** | 5 | M | rotazione (fatta) | medio |
| ~~P2-4~~ | ~~**«Cosa sapere di questo ospite»** dove serve: servizio, sala, prenotazione~~ — **fatto l'8 settembre** | 4 | S | nessuna | basso |
| ~~P2-5~~ | ~~**Executive summary mobile** per Analytics (§28)~~ — **fatto l'8 settembre** | 4 | M | nessuna | basso |
| ~~P2-6~~ | ~~**Menu mobile admin** con menu contestuale (§21)~~ — **fatto l'8 settembre** | 3 | S | nessuna | basso |
| ~~P2-7~~ | ~~**Impostazioni raggruppate** + «Altro» raggruppato (§3)~~ — **fatto l'8 settembre** | 3 | S | nessuna | basso |
| ~~P2-8~~ | ~~**Deduplica e merge ospiti** (§19)~~ — **fatto l'8 settembre** | 4 | M | nessuna | alto (dati) |
| P2-9 | **Giornata di servizio configurabile** (§12 dell'audit A) | 4 | M | decisione tua | medio |

## P3 — CRESCITA

| # | Cosa | Impatto | Compl. | Dipendenze | Rischio |
|---|---|---|---|---|---|
| P3-1 | **POS layer** + primo adapter italiano | 5 | L | partner | alto |
| P3-2 | **Reserve with Google** | 4 | L | account | medio |
| P3-3 | **Cliente fra più locali** | 4 | L | decisione (nota già scritta) | alto |
| P3-4 | **Recensioni importate** e risposta | 3 | L | API piattaforme | medio |
| P3-5 | **Biglietti per le esperienze** | 3 | M | P1-1 | medio |
| ~~P3-6~~ | ~~**Coda: priorità, dead-letter, limiti per fornitore**~~ — **fatto l'8 settembre** | 3 | M | nessuna | basso |

## P4 — INTELLIGENZA

| # | Cosa | Impatto | Compl. | Dipendenze | Rischio |
|---|---|---|---|---|---|
| ~~P4-1~~ | ~~**Le domande del §56 dentro l'agente**, come strumenti sui dati che già esistono~~ — **fatto l'8 settembre** | 4 | M | nessuna | basso |
| P4-2 | **Caparra suggerita e spiegata** (§13) | 4 | M | P1-1 | medio |
| P4-3 | **Insight proattivi dell'agente** sopra le regole esistenti | 3 | M | P4-1 | medio |
| ~~P4-4~~ | ~~**Voice booking**: progetto, non implementazione (§60)~~ — **fatto l'8 settembre**: `docs/PROGETTO-VOCE.md`. L'implementazione resta fuori, e la prima strada non è codice: è contare quante chiamate si perdono | 3 | L | fornitore voce | alto |
| P4-5 | **Realtime push** su sala/servizio/attesa | 3 | M | nessuna | medio |

---

# H. IMPLEMENTATION PLAN — i primi cinque cantieri

Solo i P0 senza dipendenze da terzi, con i file presumibilmente coinvolti.

### 1. Test end-to-end (P0-2)

`playwright.config.ts` (nuovo) · `tests/e2e/*.spec.ts` (nuovi) ·
`package.json` (script `test:e2e`) · `prisma/seed-e2e.ts` (nuovo, dati
deterministici).

Cinque flussi: prenotazione pubblica → CRM · waitlist → offerta → prenotazione ·
conto → gift card + punti → chiusura · campagna → clic → attribuzione ·
sondaggio → promotore → clic recensione.

Regola: ogni flusso parte da un seed proprio e non dipende dall'ora.

### 2. Osservabilità minima (P0-3)

`src/lib/observability.ts` (nuovo) · `src/app/(app)/error.tsx` ·
`src/app/api/cron/*/route.ts` (esito strutturato) · `src/server/jobs/queue.ts`
(esiti falliti con contesto) · `src/lib/api-auth.ts` (correlazione richiesta).

Niente stack trace in faccia al manager: il §75 lo chiede esplicitamente.

### 3. Sessione e account (P0-4)

`src/lib/auth.ts` (durata, `authorize` che verifica l'appartenenza attiva,
callback) · `prisma/schema.prisma` (`User.active`, `User.emailVerifiedAt`) ·
migrazione additiva · `tests/permessi.test.ts`.

### 4. Difese del widget (P0-5)

`src/app/api/public/bookings/route.ts` (idempotenza per chiave, honeypot,
riconoscimento doppione) · `src/lib/rate-limit.ts` (interfaccia store già
pronta: aggiungere un'implementazione condivisa) · `src/components/bookings/public-booking-form.tsx`
(campo trappola) · `tests/limite-frequenza.test.ts` · nuovo
`tests/widget-difese.test.ts`.

### 5. N+1 automazioni (P0-6)

`src/server/automations/engine.ts` (`resolveDestinatari`: due `groupBy` invece
di due query per candidato) · `tests/automazioni.test.ts` (aggiungere una prova
che il numero non cambia e che le query non crescono con i candidati).

### E, in parallelo, il progetto dei pagamenti (P0-8)

Documento, non codice: `docs/PROGETTO-PAGAMENTI.md` — livello agnostico
(`PaymentProvider` con `authorize/capture/refund/hold`), modello delle policy
(nessuna garanzia · carta · caparra fissa · per persona · prepagato) e i punti
di innesto nel motore prenotazioni. Lo scrivo prima di toccare una riga, perché
è la parte che tocca il denaro di qualcun altro.

---

## Cosa NON farò senza che tu lo decida

1. **Togliere le credenziali demo pubbliche.** Oggi servono a mostrare il
   prodotto: la scelta è tua.
2. **Il cliente fra più locali** (nota già scritta, tre strade).
3. **Quando finisce la giornata di un ristorante** (§12 dell'audit A).
4. **Chi può forzare un tavolo.**
5. **Cancellare le 23 tabelle senza codice**: propongo, non cancello.
6. **Qualunque migrazione distruttiva.**
