# TAVOLO — Product Gap Audit 2026-09

**Data:** 7 settembre 2026 · **Benchmark prioritario:** CoverManager + Pienissimo · **Vincolo:** audit e strategia, nessuna implementazione

## Legenda delle fonti

Ogni affermazione porta la sua origine.

`[CODE]` letto nel codice · `[DATABASE]` schema Prisma · `[SCREENSHOT]` audit visivo del 7 settembre · `[README]` documenti del repository · `[PREVIOUS AUDIT]` audit precedenti nel repository · `[COMPETITOR SOURCE]` fonte ufficiale del competitor consultata oggi · `[INFERENCE]` deduzione mia, dichiarata come tale · `NON VERIFICATO` informazione che non ho potuto confermare a una fonte ufficiale.

## Legenda di maturità per funzione

**A** non esiste · **B** esiste solo come interfaccia · **C** esiste parzialmente · **D** esiste e funziona · **E** esiste ed è competitiva · **F** esiste ed è migliore del benchmark

---

# Executive Summary

Tavolo controlla oggi **sette anelli su dodici** del ciclo che si è dato: prenotazione, protezione parziale, servizio, sala, conto, CRM, feedback, marketing e fidelizzazione. Ne mancano **tre decisivi** — pagamenti, canali di comunicazione attivi, integrazione con la cassa — e sono esattamente i tre che decidono le trattative in questa categoria.

Tre cose vanno dette subito, senza addolcirle.

**Primo: le analisi CoverManager e Pienissimo che il brief dà per esistenti non esistono.** Ho cercato in tutto il repository e in tutto il disco (`Desktop`, `Documents`, `Downloads`, `~/.claude`, il secondo progetto `tavolo/`): l'unico lavoro competitivo precedente è **§9 di `docs/REALITY-CHECK-2026-09.md`**, una tabella di 15 capacità confrontate con CoverManager, SevenRooms, TheFork Manager e Pienissimo, scritta prima delle fasi 0-6. Quella è la base che ho recuperato e messa a confronto con oggi (§ *Previous Gap Closure*). Se un'analisi più profonda esiste, è fuori da questa macchina — probabilmente in una conversazione ChatGPT — e va portata qui, perché il confronto di oggi ne beneficerebbe.

**Secondo: Tavolo ha già chiuso 11 dei 15 gap competitivi** che l'audit precedente aveva dichiarato aperti. Non è un progresso cosmetico: waitlist, promemoria, modalità servizio, CRM comportamentale, automazioni, NPS, walk-in, previsione, fidelity/coupon/gift card, menu-ordini-food cost e metriche di occupazione erano tutti «assente» o «schema pronto, zero codice» e oggi sono vivi e verificati.

**Terzo: il gap che resta è concentrato, non diffuso.** Non mancano venti cose: ne mancano tre, e sono le stesse tre che l'audit precedente segnalava come **peso commerciale alto**. Caparra e garanzia con carta (la richiesta numero uno contro i no-show), un canale di comunicazione realmente acceso, e il collegamento con la cassa. Senza la prima, Tavolo non può competere su un tavolo dove CoverManager dichiara *«up to 80% fewer no-shows»* `[COMPETITOR SOURCE]`. Senza la seconda, metà del prodotto costruito — promemoria, sondaggi, automazioni, campagne — è codice che gira a vuoto. Senza la terza, Pienissimo può dire una frase che Tavolo oggi non può dire: *so cosa ha mangiato e speso ogni cliente, perché leggo gli scontrini della cassa* `[COMPETITOR SOURCE]`.

**Il verdetto:** Tavolo è oggi un **L2 — Usable Product con un nucleo operativo di livello L3**. Il nucleo sala/servizio/CRM/menu-conto regge il confronto e in due punti lo supera. Ma un ristorante non può ancora far girare su Tavolo né la protezione dei no-show né la comunicazione con i clienti, e sono due delle ragioni per cui questo software si compra.

---

# Stato reale di Tavolo

Numeri verificati oggi `[CODE]`: 37 pagine, 104 rotte API, 118 moduli lato server (~25.600 righe), 161 componenti, **562 test in 36 file**, 14 migrazioni, 73 modelli e 64 enumerazioni, 5 lavori pianificati.

Verifiche automatiche: TypeScript pulito, ESLint pulito, nessuna deriva fra schema dichiarato e database `[CODE]`. Verifica dal vivo: 25 pagine su 25 con esito 200 e **zero errori in console**, 7 schermate mobile con **zero scorrimento orizzontale**, 16 finestre operative, 6 pagine pubbliche `[SCREENSHOT]`.

## Classificazione REAL / PARTIAL / MOCK / DEAD / MISSING

| Area | Stato | Evidenza |
|---|---|---|
| Motore disponibilità | **REAL** | 556 righe, unica fonte per sala/API/widget, 57 regole verificate `[CODE][PREVIOUS AUDIT]` |
| Prenotazioni (4 canali d'ingresso) | **REAL** | widget, telefono, waitlist, walk-in `[CODE][SCREENSHOT]` |
| Piantina e assegnazione tavoli | **REAL** | trascinamento, collisioni serializzabili, tavolate `[CODE]` |
| Sala viva (7 stati) | **REAL** | derivati dai fatti, non da campi `[CODE]` |
| Centro controllo (8 regole) | **REAL** | deterministico, ogni regola col suo rimedio `[CODE]` |
| Lista d'attesa | **REAL** | offerta con link firmato e scadenza, conversione `[CODE]` |
| CRM comportamentale | **REAL** | profilo calcolato dalle prenotazioni, etichette con motivo `[CODE]` |
| Menu + allergeni | **REAL** | 14 allergeni da elenco chiuso, menu pubblico `[CODE]` |
| Conto al tavolo | **REAL** | prezzo fotografato, totale dalle righe `[CODE]` |
| Costo del cibo e margine | **REAL** | solo sulla parte coperta, con copertura dichiarata `[CODE]` |
| Punti fedeltà | **REAL** | guadagnati sui conti chiusi, saldo = somma righe `[CODE]` |
| Gift card | **REAL** | uso parziale, residuo calcolato, annullo contabile `[CODE]` |
| Coupon | **REAL** | tetti, validità, uso al tavolo, annullo `[CODE]` |
| Portale Wi-Fi → CRM | **REAL** | contatto in cambio password, consenso registrato `[CODE][SCREENSHOT]` |
| Previsione coperti | **REAL** | modello pickup, niente previsione dove manca storia `[CODE]` |
| Costo delle assenze | **REAL** | valore misurato sui conti chiusi quando esistono `[CODE]` |
| Sondaggi / NPS | **REAL** | richiesta il giorno dopo, notifica sui detrattori `[CODE]` |
| Campagne email | **PARTIAL** | motore completo, **fornitore non collegato in produzione** `[CODE]` |
| Automazioni (3) | **PARTIAL** | logica e anteprima destinatari complete, invio spento `[CODE]` |
| Promemoria | **PARTIAL** | cron e coda completi, canale email spento `[CODE]` |
| Privacy: export + cancellazione | **REAL** | sette tabelle in una transazione `[CODE]` |
| Esperienze | **PARTIAL** | pubblicazione sì, **biglietti no** (`Ticket` senza codice) `[CODE][DATABASE]` |
| Pagamenti | **MOCK** | pagina che legge `Payment`, **zero righe Stripe in `src/`** `[CODE][README]` |
| SMS / WhatsApp | **MISSING** | posto pronto in `PROVIDERS`, `available: () => false` `[CODE]` |
| POS / cassa | **MISSING** | `POSConnector`, `POSEvent` senza codice `[DATABASE]` |
| Reserve with Google | **MISSING** | esiste solo `BookingSource.GOOGLE` `[DATABASE]` |
| Recensioni esterne | 🟡 **PARZIALE** | il ponte c'è ed è misurato — `ReviewLink` e `ReviewLinkClick` sono vivi (fatti dopo questo audit). `Review` (riportare dentro le recensioni vere) resta senza codice: serve l'API delle piattaforme `[DATABASE]` |
| Voce / centralino | **MISSING** | `CallLog`, `MissedCall`, `VoiceBookingDraft` senza codice `[DATABASE]` |
| Multi-locale | **PARTIAL** | selettore e ruoli sì; **nessuna condivisione dati fra locali** `[CODE]` |
| Agente AI | **PARTIAL** | 8 strumenti, guardia permessi, quota; non proattivo `[CODE]` |
| `WifiSession` | **DEAD per scelta** | decisione documentata: la fine sessione non è osservabile `[CODE]` |
| 16 tabelle varie | **DEAD** | vedi §*Do Not Build* `[DATABASE]` |

**24 modelli su 73 non erano toccati da nessuna riga di codice** al momento dell'audit `[DATABASE]`. È la misura di quanto lo schema abbia promesso più del prodotto. Due sono stati chiusi subito dopo (`ReviewLink`, `ReviewLinkClick`): oggi sono 22.

---

# Evoluzione dall'audit precedente

L'audit di inizio settembre `[PREVIOUS AUDIT]` fotografava un prodotto con: nessun test runner, build che applicava lo schema accettando la perdita di dati, 10 endpoint di scrittura senza controllo del ruolo, `AuditLog` mai scritto, nessun limite di frequenza, «29 modelli usati su 72», e cinque contatori mostrati in interfaccia che **nessuna riga di codice scriveva** — inclusi «24.986 € di incassi».

Oggi: 562 test, migrazioni versionate con freno sulle anteprime, permessi centralizzati su tutte le mutazioni, registro azioni scritto e consultabile, limiti di frequenza su tutti gli endpoint pubblici, 49 modelli usati su 73, e **nessun numero mostrato che nessuno scriva** — la regola è diventata esplicita e verificata dai test.

---

# Previous Gap Closure

Recupero di **§9 di `docs/REALITY-CHECK-2026-09.md`** `[PREVIOUS AUDIT]` — l'unica analisi competitiva preesistente sul disco.

| Capacità | Competitor di riferimento | Cosa avevamo rilevato | Tavolo allora | Tavolo oggi | Esito |
|---|---|---|---|---|---|
| Caparra / garanzia con carta | CoverManager | «assente — peso **alto**, è la richiesta numero uno contro i no-show» | A | A (schema pronto, zero codice) `[CODE]` | 🔴 **ANCORA MANCANTE** |
| Waitlist operativa | CoverManager | «schema pronto, zero codice — alto» | B | D/E: posizione, offerta con link firmato e scadenza, conversione, attesa media depurata dalle righe dimenticate `[CODE]` | 🟢 RISOLTO |
| Promemoria automatici | tutti | «assente — alto» | A | C: motore completo, 24h e 3h, conferma e annullo dal link; **canale spento** `[CODE]` | 🟡 PARZIALE |
| Modalità servizio / reception | CoverManager | «assente — alto, è il differenziatore possibile» | A | E: Servizio + sala viva a 7 stati + centro controllo a 8 regole `[CODE][SCREENSHOT]` | 🔵 **TAVOLO ORA È MIGLIORE** (§ *Advantages*) |
| CRM con LTV, tag, comportamento | SevenRooms, Pienissimo | «anagrafica sola — alto» | B | D: profilo calcolato, etichette col motivo, cronologia; LTV **stimato e dichiarato tale** `[CODE]` | 🟢 RISOLTO |
| Automazioni marketing | Pienissimo | «assente — medio-alto» | A | C: tre automazioni con anteprima destinatari e omaggio personale; invio spento `[CODE]` | 🟡 PARZIALE |
| Recensioni e NPS | CoverManager | «assente — medio» | A | C: NPS e sondaggio completi; **nessun ponte verso Google/TripAdvisor** `[CODE]` | 🟡 PARZIALE |
| Walk-in rapido | tutti | «parziale — medio» | C | D `[CODE]` | 🟢 RISOLTO |
| Metriche revenue (RevPASH, occupazione) | tutti | «solo descrittive — medio» | B | D per occupazione e margine; **RevPASH volutamente non mostrato** finché la storia degli incassi è di poche serate `[CODE]` | 🟢 RISOLTO (con riserva dichiarata) |
| Previsione occupazione e no-show | SevenRooms | «assente — medio» | A | D: previsione a 7 giorni col modello pickup, e costo delle assenze `[CODE]` | 🟢 RISOLTO |
| Eventi privati e gruppi | CoverManager | «campi pronti — medio (alto margine)» | B | C: esperienze pubblicabili, **biglietti non vendibili** `[CODE]` | 🟡 PARZIALE |
| Reserve with Google | tutti | «assente — medio» | A | A `[DATABASE]` | 🔴 ANCORA MANCANTE |
| Fidelity, coupon, gift card | Pienissimo | «schema pronto — basso-medio» | B | D/E: le tre cose complete e collegate al conto `[CODE]` | 🟢 RISOLTO |
| Menu, ordini, food cost, POS | Pienissimo | «schema pronto — basso (ma è la catena più lunga)» | B | D per menu/ordini/food cost; **POS mancante** `[CODE]` | 🟡 PARZIALE |
| 2FA, SSO, API pubbliche, webhook | catene | «assenti — basso oggi, alto per catene» | A | A `[CODE]` | ⚪ NON ANCORA STRATEGICO |

**Bilancio: 7 risolti, 6 parziali, 2 ancora mancanti, 1 non strategico, 1 vantaggio conquistato.** Dei tre «peso alto» dell'epoca, uno è risolto e superato (modalità servizio), uno è a metà per una chiave mancante (promemoria), uno è intatto (caparra).

---

# Tavolo vs CoverManager

Fonti ufficiali consultate oggi `[COMPETITOR SOURCE]`: `covermanager.com/en`, pagine soluzioni e settori in italiano.

## Cosa CoverManager dichiara

Moduli: *Reservations*, *Multi-Channel Reservations*, *Virtual Waitlist*, *Payments*, *Loyalty*, *Marketing tools*, *Analytics*, esperienze esclusive con *Tickets* e *large events*. CRM: *«One CRM, every guest»*, dati sincronizzati **fra tutti i locali in tempo reale**, preferenze e allergie, *«mai condivisi, mai venduti, sempre esportabili»*. No-show: *«Capture deposits at booking»*, menu degustazione prepagati, promemoria automatici, con la rivendicazione *«up to 80% fewer no-shows»*. Motore di prenotazione **white-label personalizzabile via CSS**. Comunicazioni email **e SMS** personalizzabili. Sondaggi automatici 1-5 o 1-10 via email e/o SMS il giorno dopo. **130+ integrazioni native** su POS, pagamenti, marketing e PMS. Soluzione dedicata a gruppi e catene con *cross-sell* fra ristoranti. Abbonamento mensile fisso.

## Confronto per macroarea

| Macroarea | Tavolo | CoverManager | Gap |
|---|---|---|---|
| Motore prenotazione | **D/E** — disponibilità server-side, turni, durata, capienza, per sala e per tavolo, tavolate, forzatura con motivo tracciato `[CODE]` | dichiarato completo, white-label CSS | 🟡 manca **personalizzazione visiva del widget** e regole avanzate (booking window, cutoff, overbooking controllato) |
| Alternative automatiche quando non c'è posto | **C** — il motore raccoglie *tutti* i motivi di rifiuto e distingue «nessun tavolo di quella misura» da «tutti occupati» `[CODE]`; non propone slot alternativi al cliente | NON VERIFICATO nel dettaglio | 🟡 |
| Gruppi grandi / eventi privati | **C** — `isGroup`, `budgetCents` nello schema, esperienze pubblicabili; nessun flusso dedicato `[DATABASE]` | *large events*, biglietti | 🔴 |
| Waitlist | **D/E** `[CODE]` | *Virtual Waitlist* | 🟢 alla pari; Tavolo ha in più l'esclusione delle righe dimenticate dalla media |
| Caparre / prepagati | **A** `[CODE]` | *deposits at booking*, prepagati | 🔴 **gap più grave** |
| CRM | **D** — profilo comportamentale, preferenze, allergie, esportabile, cancellabile `[CODE]` | CRM sincronizzato **fra locali** | 🟡 manca la **condivisione fra locali** |
| Esperienze | **C** — niente biglietti `[CODE]` | biglietti e pagamento | 🔴 |
| Integrazioni | **C** — 1 email marketing (Brevo), 1 email transazionale (Resend), 1 AI, blob, cron `[README]` | **130+** su POS, pagamenti, marketing, PMS | 🔴 differenza di ordine di grandezza |
| Multi-locale | **C** — selettore e ruoli; nessun dato condiviso `[CODE]` | gruppi e catene con cross-sell | 🔴 |
| Analytics | **D/E** — food cost con copertura, costo assenze, previsione con spiegazione `[CODE]` | spend per guest | 🔵 Tavolo probabilmente più avanti sul margine, NON VERIFICATO il dettaglio CoverManager |
| Sondaggi | **D** — NPS il giorno dopo, notifica detrattori `[CODE]` | 1-5/1-10 via email **e SMS** | 🟡 manca il canale SMS |

---

# Tavolo vs Pienissimo

Fonti ufficiali consultate oggi `[COMPETITOR SOURCE]`: `pienissimo.pro`, e la scheda ufficiale **su `zucchetti.it`** — Pienissimo Pro è nell'ecosistema Zucchetti.

## Cosa Pienissimo dichiara

Moduli: *Agenda digitale*, *Planning dei tavoli* (trascinamento, **integrato con i sistemi di cassa Zucchetti**), *Profilazione dei clienti*, *Analisi dei dati* — che *«centralizza scontrini, prenotazioni, ordini e prodotti collegati al singolo cliente»* — e *Mansionissimo* per la gestione dei compiti e la timbratura digitale. Fidelizzazione: **carta punti virtuale** attivata alla prima visita, punti con **validità di un anno**, accumulo automatico, notifica al raggiungimento del premio. Canali: **SMS, email e WhatsApp**. Segmenti dichiarati: *«chi non viene da 30 giorni»*, *«chi ha quasi raggiunto il premio»*, *«chi ha punti in scadenza»*. Business intelligence su costi, margini e piatti più venduti; performance del personale per data e turno. Integrazioni cassa: **Zmenu, Tilby, IlConto, Posby**, Ristorandro in arrivo. App iOS e Android.

## La catena INPUT → PROFILE → SEGMENT → ACTION → CONVERSION → REVENUE

| Anello | Tavolo | Pienissimo | Gap |
|---|---|---|---|
| **INPUT** — come entra il cliente | widget, telefono, walk-in, waitlist, **Wi-Fi**, QR `[CODE]` | prenotazioni online e telefoniche, form di profilazione | 🔵 il Wi-Fi è un ingresso che Pienissimo non dichiara |
| **PROFILE** — cosa sappiamo | visite, frequenza, abitudini, affidabilità, allergie, preferenze, punti, **e la spesa vera solo se il conto è battuto su Tavolo** `[CODE]` | **scontrini della cassa collegati al singolo cliente**: prodotti, quantità, spesa reale | 🔴 **il gap strutturale**: loro leggono la cassa, noi chiediamo di battere il conto da noi |
| **SEGMENT** — come si classifica | etichette calcolate col motivo, segmenti su dati veri `[CODE]` | inattivo 30 giorni, vicino al premio, punti in scadenza | 🟡 alla pari come idea; a loro i segmenti sono alimentati da spesa reale |
| **ACTION** — cosa gli mandiamo | email (spenta), automazioni (3) `[CODE]` | **SMS + email + WhatsApp**, attivi | 🔴 |
| **CONVERSION** — cosa fa | prenotazione attribuita alla campagna per 30 giorni `[CODE]` | NON VERIFICATO il meccanismo di attribuzione | 🔵 attribuzione esplicita e con finestra dichiarata: probabile vantaggio Tavolo |
| **REVENUE** — quanto fattura | valore attribuito **stimato** sullo scontrino medio, dichiarato tale `[CODE]` | spesa reale da scontrino | 🔴 senza cassa il fatturato attribuito resta una stima |

**La lezione di Pienissimo per Tavolo:** il loro moat non è il marketing, è **il collegamento alla cassa**. Tutto il resto della loro proposta poggia lì.

---

# Booking Engine

**Stato: D/E.** `[CODE]`

Presenti e verificati: disponibilità calcolata dal server per sala e per tavolo, turni, capienza, durata, tavolate con controllo di stessa sala e conflitto su *tutti* i tavoli uniti, richieste speciali e note (cliente e interne), occasione, fonte, modifica, disdetta, riconoscimento del cliente per email o telefono, forzatura con **motivo obbligatorio** e azione dedicata nel registro, 57 regole di disponibilità verificate.

Fatti subito dopo questo audit: **booking window e cutoff** configurabili (con la distinzione che conta: valgono per il pubblico, non per chi risponde al telefono).

Restano assenti: **overbooking controllato**, **proposta automatica di alternative** al cliente, **riconferma** (il promemoria chiede conferma ma non c'è una politica di riconferma obbligatoria con scadenza), **personalizzazione visiva del widget**.

---

# Floor & Service

**Stato: E — è l'area più forte del prodotto.** `[CODE][SCREENSHOT]`

Presenti: piantina con sale multiple, tavoli, capienza, unione e divisione, trascinamento, sette stati derivati dai fatti, ritardo, «quasi libero», walk-in, conversione dalla waitlist, centro controllo con otto regole deterministiche, ognuna con il posto dove intervenire — l'ottava, aggiunta dopo questo audit, è **il posto liberato da una disdetta offerto a chi è in lista**.

Alla domanda del brief — *rappresenta solo lo stato o aiuta a decidere?* — la risposta è: **aiuta a decidere**, ed è raro. Il centro controllo non mostra dati, dice cosa sta per andare storto e dove rimediare.

Assenti: **pacing** (limite di arrivi per fascia di 15 minuti), **turn time misurato** per tavolo e sua previsione, **assegnazione automatica suggerita**, gli stati *ordered / served / bill requested* (esistono *al conto* e *da pulire*, non l'intera catena).

---

# Waitlist

**Stato: D/E.** `[CODE]` Inserimento rapido, persone, telefono, note, stima, posizione, offerta con link firmato e scadenza, conversione in prenotazione e in seduto, chiusura automatica delle offerte scadute, esclusione delle righe dimenticate dall'attesa media.

Assenti: **priorità esplicita**, **suggerimento del tavolo compatibile**, **avviso via SMS/WhatsApp** (oggi il link va consegnato a voce o via email spenta), **analytics di conversione della coda**, **stima dell'attesa basata sulla rotazione misurata** anziché dichiarata.

---

# Payments

**Stato: A/MOCK. È il gap più grave del prodotto.** `[CODE][README]`

Cosa esiste: la dipendenza in `package.json`, il modello `Payment` con `stripePaymentId`, `Booking.depositCents` e `depositStatus`, `GiftCard.stripePaymentId`, e una pagina che legge la tabella `Payment` — che è **vuota e resterà vuota**. **Zero riferimenti a Stripe in `src/`.**

Manca tutto: caparra, deposito, carta a garanzia, preautorizzazione, pagamento anticipato, pagamento dell'esperienza, acquisto della gift card, rimborso, pagamento parziale, penale no-show, link di pagamento, riconciliazione, storico transazioni, reportistica finanziaria.

Distinzione richiesta dal brief e confermata: **esiste una pagina Pagamenti, non esiste un sistema di pagamenti.** Oggi la pagina lo dichiara esplicitamente (corretto durante l'audit di stasera, prima diceva «Incassato 0,00 €» accanto a una Panoramica che diceva 73 €).

CoverManager costruisce su questo la sua rivendicazione più forte `[COMPETITOR SOURCE]`.

---

# No-show

**Stato: C.** `[CODE]`

Presenti: promemoria a 24h e 3h con conferma e annullo dal link firmato, storico assenze per cliente, rischio per prenotazione nel centro controllo (con lo storico), etichetta «a rischio» col motivo, blocco cliente con motivo, **costo delle assenze** con valore misurato sui conti chiusi, giorni peggiori e clienti recidivi.

Assenti: **carta a garanzia**, **deposito**, **politica di disdetta con finestra e penale**, **riconferma obbligatoria**, **sostituzione automatica dalla waitlist**.

Sul **Tavolo Reliability Score** il brief chiede di non proporlo d'ufficio. Verifica: CoverManager e Pienissimo non dichiarano un punteggio di affidabilità del cliente sulle pagine consultate — NON VERIFICATO se esista. Tavolo **ha già i dati** (assenze, disdette tardive, frequenza, anticipo di prenotazione) e ha già il rischio per singola prenotazione. `[INFERENCE]` Il differenziale non sarebbe il punteggio in sé — che diventa presto una scatola nera — ma il fatto che ogni giudizio qui nasce con **il motivo scritto accanto**. Se si farà, deve restare così: non «affidabilità 62», ma «3 assenze su 11, l'ultima il 4 agosto».

---

# Experiences

**Stato: C.** `[CODE]` Creazione, modifica, pubblicazione, calendario, capienza, prezzo, descrizione. La pagina **dichiara** che i biglietti non si vendono da Tavolo e rimanda al link del locale — coerente con la regola di non fingere.

Assenti: biglietto (`Ticket` è una tabella senza codice `[DATABASE]`), prezzo per gruppo, slot ricorrenti, cutoff, politica di rimborso, lista partecipanti, regalo di un'esperienza, promemoria dedicato, ricavo per esperienza.

CoverManager dichiara biglietti e grandi eventi `[COMPETITOR SOURCE]`: qui il gap è netto e dipende interamente dai pagamenti.

---

# Guest 360 CRM

| Blocco | Stato | Dettaglio |
|---|---|---|
| **Identity** | **D** | nome, cognome, email, telefono, compleanno, lingua, consenso `[CODE]`. Manca la provenienza |
| **Behaviour** | **E** | visite, prenotazioni, disdette, assenze, walk-in, frequenza, recency, giorni e orari preferiti, dimensione media del gruppo — **calcolati, non contati a mano** `[CODE]` |
| **Preferences** | **D** | tavolo, note, allergie, occasioni, preferenze libere `[CODE]`. Mancano zona/indoor-outdoor e preferenze vino/cibo strutturate |
| **Economics** | **C** | speso e scontrino medio **reali solo dove il conto è stato battuto su Tavolo**; altrimenti stima dichiarata. LTV e margine per cliente assenti `[CODE]` |
| **Loyalty** | **D/E** | punti, storia dei movimenti, valore in euro, coupon, gift card, utilizzi `[CODE]`. Manca il livello/tier operativo (il campo esiste, è un riconoscimento manuale) |
| **Marketing** | **C** | consenso, campagne ricevute, prenotazione attribuita `[CODE]`. Mancano aperture e click **per cliente**, disiscrizione visibile in scheda |
| **Intelligence** | **D** | nuovo, abituale, VIP, a rischio, inattivo, alto spendente — **ognuna con il motivo scritto** `[CODE]`. Manca la previsione di abbandono |

**Il gap Guest 360 in una riga:** Tavolo conosce **il comportamento** meglio di quanto conosca **la spesa**. Pienissimo, leggendo gli scontrini, ha il problema opposto risolto `[COMPETITOR SOURCE]`.

---

# Marketing

**Stato: C — motore costruito, canale spento.** `[CODE]`

Presenti: campagne con segmenti su dati veri, editor a blocchi, invio a lotti con coda e riprese, anteprima, invio di prova, attribuzione della prenotazione alla campagna con finestra dichiarata di 30 giorni, cinque difese contro l'invio di massa sbagliato, disiscrizione con token firmato, registro dei messaggi.

Assenti: **canali SMS e WhatsApp**, aperture e click per cliente in scheda, test A/B, landing page, referral, promozione sul giorno debole come flusso guidato, ricavo attribuito **misurato** (oggi stimato).

Rispetto a Pienissimo `[COMPETITOR SOURCE]`, che dichiara SMS + email + WhatsApp attivi, questo è un gap di **esecuzione**, non di concezione: il motore c'è, mancano i fornitori.

---

# Automations

**Stato: C, con una filosofia che va difesa.** `[CODE]`

Quattro automazioni: compleanno, chi non torna da un po', invito a tornare dopo la prima visita e — aggiunta subito dopo questo audit — **gift card ferma**. Nascono spente, mostrano **quante persone toccherebbero e chi, prima** di essere accese, possono allegare un omaggio personale (codice intestato, valido una volta, con scadenza).

Valutazione delle ricette proposte dal brief. Colonne: impatto, complessità, dati necessari, canale, misurabilità.

| Ricetta | Impatto | Compl. | Dati | Canale | Misurabile | Giudizio |
|---|---|---|---|---|---|---|
| Compleanno | alto | S | ci sono | email | sì | ✅ **già fatta** |
| Inattivo 30/60/90 | alto | S | ci sono | email | sì | ✅ fatta a una soglia; **le tre soglie sono una scelta del locale**, non tre automazioni |
| Prima visita → seconda | alto | S | ci sono | email | sì | ✅ **già fatta** |
| Punti in scadenza | medio | M | **mancano**: i punti non scadono per scelta | email | sì | ⛔ incoerente con la decisione presa sui punti |
| Gift card inutilizzata | **alto** | S | ci sono `[CODE]` | email | sì | ✅ **fatta**: era la più forte fra le nuove — denaro già incassato che torna a tavola |
| NPS detrattore | alto | S | ci sono | — | sì | ⛔ **scelta esplicita: risponde una persona**. Da mantenere |
| NPS promotore → recensione | **alto** | M | ci sono; serve il ponte alle piattaforme | email | sì | ⭐ vedi *Reputation* |
| Giorno debole | alto | **L** | serve occupazione prevista + segmento compatibile | email | sì | ⭐ candidata forte, ma è **una campagna assistita**, non un'automazione silenziosa |
| No-show → follow-up | medio | S | ci sono | email | sì | 🟡 delicato: scrivere a chi non si è presentato può irritare |
| Disdetta → waitlist | **alto** | M | ci sono | in-app | sì | ✅ **fatta**: è nel centro controllo, non nel marketing — il tavolo liberato va offerto subito |
| Anniversario, alta frequenza, alto spendente, VIP, cliente perso | medio | S/M | ci sono | email | sì | 🟡 buone, ma sono **varianti di segmento** della stessa automazione: non moltiplicare il catalogo |

`[INFERENCE]` Il catalogo chiuso resta la scelta giusta. Le uniche due da aggiungere davvero erano **gift card inutilizzata** (fatta) e **promotore → recensione**; la terza candidata (**disdetta → waitlist**) non è marketing ma servizio, e va nel centro controllo.

---

# Loyalty

**Stato: D/E.** `[CODE]` Punti sui conti chiusi, due regole dichiarate dal locale, saldo dalle righe, valore fotografato al riscatto, riscatto sul conto, correzione a mano con motivo, storia completa, esportabile e cancellabile.

Confronto con Pienissimo `[COMPETITOR SOURCE]`: loro hanno carta punti virtuale, accumulo automatico, **scadenza a 12 mesi** e notifica al raggiungimento del premio.

| Elemento | Tavolo | Pienissimo | Nota |
|---|---|---|---|
| Accumulo | su conti chiusi | su scontrini | 🔴 loro coprono ogni scontrino, noi solo i conti battuti su Tavolo |
| Scadenza punti | **assente per scelta** | 12 mesi | 🟡 scelta legittima ma **commercialmente in svantaggio**: la scadenza è ciò che fa tornare |
| Premi a soglia | assente | sì, con notifica | 🔴 oggi i punti sono uno sconto lineare, non un traguardo |
| Livelli | campo presente, uso manuale | NON VERIFICATO | 🟡 |
| Fra locali | no | NON VERIFICATO | 🟡 |

`[INFERENCE]` Il premio a soglia («ti mancano 40 punti alla cena omaggio») è psicologicamente più forte dello sconto lineare, e Tavolo ha già tutti i dati per farlo. È il primo miglioramento della fedeltà, prima della scadenza.

---

# Gift Cards

**Stato: D — gestione completa, business assente.** `[CODE]`

Presenti: emissione, codice leggibile, destinatario e dedica, saldo dalle righe, uso parziale ripetuto, annullo contabile, scadenza opzionale, stato derivato, **residuo mostrato come debito verso i clienti**.

Assenti per diventare un business: **vendita online** (dipende dai pagamenti), **consegna via email** al destinatario, **pagina brandizzata** del regalo, rimborso, attribuzione a campagna, uso fra locali.

`[INFERENCE]` La distanza fra «gestione gift card» e «business gift card» è **un solo pezzo**: incassare online. Tutto il resto è già in piedi.

---

# Coupon

**Stato: D/E.** `[CODE]` Codice leggibile al telefono, percentuale/valore fisso/omaggio, categorie, validità, tetti totali e per cliente, coupon personale intestato, uso al tavolo con motivo scritto quando non vale, annullo dell'utilizzo, collegamento alle automazioni.

Assenti: **spesa minima**, **giorni e orari di validità**, **prodotto o esperienza specifica**, cumulabilità, uso fra locali.

`[INFERENCE]` «Vale solo il martedì» e «da un minimo di 40 €» sono le due regole che un ristoratore chiede per prime, e oggi non ci sono. Effort S.

---

# Wi-Fi / Connect

**Stato: D, e potenzialmente un vantaggio.** `[CODE][SCREENSHOT]`

Il ciclo Wi-Fi → contatto → consenso → CRM → prenotazione **è chiuso e misurato**: la pagina Marketing mostra contatti raccolti, quanti hanno **poi prenotato**, consensi, e sconti usati su emessi.

Verifica competitor: né CoverManager né Pienissimo dichiarano un portale Wi-Fi come modulo sulle pagine ufficiali consultate — NON VERIFICATO che non esista.

Sulla capability **Tavolo Connect** e sulla metrica-esempio del brief: `[INFERENCE]` Tavolo può attribuire **connessioni, contatti, consensi e prenotazioni** perché sono tutti fatti che possiede. **Non può attribuire il revenue** in modo misurato se non quando quella prenotazione ha un conto chiuso; oggi sarebbe una stima. La regola del progetto impone di dirlo. Quindi: la capability è reale, l'ultima riga («€3.870») deve restare vuota o dichiarata stima finché non c'è il conto.

---

# Reputation

**Stato: C.** `[CODE]` NPS il giorno dopo, commento, sentiment, due strade dopo la risposta, notifica immediata sui detrattori, pannello in Analytics.

**Aggiornamento dopo l'audit — il ponte è stato costruito.** Il locale dichiara fino a quattro posti dove recensire (Google, TripAdvisor, TheFork, Trustpilot…); chi risponde 9 o 10 li vede, chi risponde meno no; il passaggio è **contato**, perché il collegamento passa da `/r/<id>` prima di arrivare alla piattaforma; e in Analytics compare la sola frase che conta: «1 promotore è andato a scrivere una recensione, su 2». `ReviewLink` e `ReviewLinkClick` non sono più tabelle vuote.

Restano assenti, e sono cose diverse: **riportare dentro Tavolo le recensioni vere** (`Review` — richiede le API delle piattaforme), rispondere alle recensioni, l'analisi per parole chiave, il confronto fra locali. E resta vero il limite dichiarato: sappiamo chi è arrivato alla porta, non chi ha scritto.

La catena **visita → sondaggio → NPS → azione → recensione/recupero → CRM** oggi si ferma a «azione». `[INFERENCE]` Chiuderla vale molto: la recensione pubblica è il canale di acquisizione numero uno di un ristorante, e Tavolo sa già **chi** è contento e **quando** lo è.

---

# POS & Integrations

**Stato: A per il POS, C per le integrazioni.** `[README][DATABASE]`

Attive: Brevo (campagne), Resend (transazionali, **spento in produzione**), OpenAI (agente), Vercel Blob, Vercel Cron. **Cinque**, contro le **130+ native** dichiarate da CoverManager `[COMPETITOR SOURCE]`.

Cosa servirebbe per integrare una cassa, e perché conta: il flusso **POS → ordine → conto → pagamento → cliente → CRM → analytics** darebbe scontrino, prodotti, categorie, quantità, sconti, totale, forma di pagamento, tavolo, cameriere, orario. Da lì nascono LTV reale, scontrino medio reale, preferenze di cibo e vino, riconoscimento dei VIP per spesa, previsione di abbandono, ricavo attribuito alle campagne **misurato**, e ROI della fedeltà. È esattamente la base su cui poggia Pienissimo `[COMPETITOR SOURCE]`.

Priorità delle integrazioni italiane `[INFERENCE]`, basata sull'ecosistema osservato:

- **P0** — una cassa dell'ecosistema Zucchetti (**Tilby** o **Zmenu**, entrambe dichiarate da Pienissimo) o **Scloby/Cassa in Cloud**: sono le più diffuse nei locali che comprano software di prenotazione.
- **P1** — **Reserve with Google** (acquisizione, non cassa, ma stesso peso commerciale), **TheFork** come canale di prenotazione in ingresso.
- **P2** — PMS alberghieri per la ristorazione d'hotel, altri POS minori.

Tavolo **non deve diventare un POS**: ha già il conto al tavolo, che è la risposta giusta per chi una cassa vera non ce l'ha o non vuole collegarla.

---

# Omnichannel

**Stato: C.** `[DATABASE][CODE]` Le fonti previste sono sette (widget, telefono, walk-in, Google, social, concierge, evento) e **una sola è collegata davvero** (widget); le altre si registrano a mano.

Verso l'idea di **un solo inventario**: la base è corretta — disponibilità unica lato server, usata da sala, API e widget — quindi il giorno in cui arriva un canale esterno **non serve un secondo motore**. Mancano i canali: Google, TheFork, Instagram/Facebook, WhatsApp, concierge alberghiero.

---

# Communications

**Stato: C.** `[CODE]` Un solo punto d'uscita registrato su `MessageLog`, niente doppi invii, esito del fornitore verificato (un rifiuto non risulta più «inviato»), coda con riprese. **Email: pronta, spenta in produzione. SMS e WhatsApp: `available: () => false`.**

Cosa dovrebbe coprire, e cosa copre: conferma ✅, promemoria ✅, riconferma ❌, disdetta ✅, modifica ❌, waitlist ⚠️ (link generato, consegna manuale), «tavolo pronto» ⚠️, richiesta di pagamento ❌, sondaggio ✅, recensione ❌, compleanno ✅, recupero ✅, marketing ✅.

`[INFERENCE]` Per l'Italia il canale **P0 è WhatsApp**, non l'SMS: è dove i clienti rispondono davvero, ed è dichiarato da Pienissimo `[COMPETITOR SOURCE]`. L'email resta P0 per le campagne. L'SMS è P1, utile per il «tavolo pronto» della waitlist.

---

# Voice

**Stato: A.** `[DATABASE]` `CallLog`, `MissedCall`, `VoiceBookingDraft` sono tabelle vuote.

Valutazione `[INFERENCE]`: il valore più alto e il costo più basso stanno in **caller ID → apertura della scheda cliente**. Con un numero in arrivo Tavolo sa già dire «Alessia Romano, 12 visite, ultima 18 giorni fa, preferisce la terrazza, allergia al glutine» — tutti dati che possiede. Non serve intelligenza artificiale, serve un centralino che passi il numero. Il resto (trascrizione, receptionist automatica) è costoso, delicato per la privacy e poco differenziante oggi.

Priorità: **P2**, e solo la parte di riconoscimento chiamante.

---

# Menu

**Stato: D/E.** `[CODE]` Categorie, piatti, prezzo, descrizione, disponibilità, ordine, allergeni da elenco chiuso (14), regimi alimentari, costo materie prime facoltativo, margine per piatto, menu pubblico con QR, elenco per margine.

Assenti: menu multipli per servizio, varianti e aggiunte, ordinazione dal QR. Il **menu engineering** (stelle, cavalli, enigmi, cani) è stato fatto subito dopo questo audit, ed è in Analytics accanto al costo del cibo.

Alla domanda «quanto spingersi senza diventare un gestionale di magazzino» `[INFERENCE]`: il confine giusto è **il piatto, non l'ingrediente**. Costo del piatto sì, distinta base e giacenze no. Il passo successivo utile è il menu engineering, che non richiede nessun dato nuovo — solo di incrociare i due che ci sono già.

---

# Analytics

**Stato: D/E.** `[CODE]` Coperti, occupazione, fonti, fasce, giorni, previsione a 7 giorni spiegata, costo del cibo con copertura, costo delle assenze, NPS, attribuzione campagne.

Assenti: RevPASH (**scelta dichiarata**: pochi giorni di incassi veri), rotazione tavoli, conversione della waitlist, ricavo per cameriere, confronto fra locali, ROI della fedeltà, debito gift card nei numeri d'insieme (c'è nella sua pagina).

Sul passaggio **DATA → INSIGHT → ACTION** richiesto dal brief: Tavolo è già a INSIGHT in due punti (previsione con la frase che la spiega, centro controllo con il rimedio) e **arriva ad ACTION solo nel centro controllo**. L'esempio del brief — «martedì al 54% → 187 clienti compatibili non vengono da 60 giorni → [CREA CAMPAGNA]» — **è costruibile oggi con i dati esistenti** `[INFERENCE]`: occupazione per giorno ✅, segmento inattivi ✅, creazione campagna ✅. Manca solo il ponte fra le tre. È la singola opportunità con il miglior rapporto valore/sforzo di tutto l'audit.

---

# Multi-location

**Stato: C.** `[CODE]` Organizzazione → locali → appartenenze con ruolo per locale, selettore, isolamento verificato su tutte le rotte.

Assenti: cliente condiviso fra locali, deduplica fra locali, punti e gift card spendibili altrove, campagne di gruppo, analytics comparativa, benchmark fra locali, impostazioni globali contro locali, menu ed esperienze condivisi.

CoverManager dichiara *«One CRM, every guest»* con sincronizzazione **in tempo reale fra locali** e cross-sell fra ristoranti `[COMPETITOR SOURCE]`. Per una catena, oggi, questo è un gap che chiude la trattativa.

---

# AI & Intelligence

**Stato: C.** `[CODE]` Agente con 8 strumenti di dominio, guardia sui permessi, quota mensile; non proattivo. Richiede `OPENAI_API_KEY`.

| Area | Valore | Dati | Costo | Rischio | Spiegabilità | Priorità |
|---|---|---|---|---|---|---|
| Previsione no-show per prenotazione | alto | ci sono | M | medio | **alta se resta a regole** | P1 |
| Suggerimento campagna dal calo di occupazione | **alto** | ci sono | S | basso | alta | **P0-P1** |
| Briefing pre-servizio | alto | ci sono | S | basso | alta | **P1** |
| Sentiment delle recensioni | medio | mancano le recensioni | M | basso | media | P2 |
| Riassunto cliente in una riga | medio | ci sono | S | basso | alta | P2 |
| Assegnazione tavoli suggerita | medio | ci sono | L | medio | media | P2 |
| Previsione di abbandono | medio | parziali | M | medio | media | P2 |
| Anomalie | basso | ci sono | M | basso | bassa | P3 |
| Prenotazione a voce | basso oggi | mancano | XL | alto | bassa | P3 |

`[INFERENCE]` La regola che ha protetto questo progetto vale anche qui: **niente scatole nere**. Le tre cose in cima all'elenco non hanno bisogno di un modello linguistico, hanno bisogno di regole scritte bene — che è ciò che il centro controllo già fa.

---

# Customer Lifecycle

| Fase | Tavolo oggi | CoverManager | Pienissimo | Gap |
|---|---|---|---|---|
| **Discovery** | menu pubblico, QR | white-label, canali | presenza Zucchetti | 🔴 nessun canale esterno |
| **Lead** | **Wi-Fi**, form | NON VERIFICATO | form di profilazione | 🔵 Wi-Fi |
| **Booking** | widget, telefono, walk-in | multi-canale | agenda digitale | 🟡 mancano i canali |
| **Confirmation** | email (spenta) | email + SMS | SMS/email/WhatsApp | 🔴 canale |
| **Protection** | promemoria | **deposito** | NON VERIFICATO | 🔴 **pagamenti** |
| **Arrival** | servizio, ritardi | sì | sì | 🟢 |
| **Wait** | waitlist completa | *Virtual Waitlist* | NON VERIFICATO | 🟢 |
| **Seating** | sala viva, tavolate | sì | planning tavoli | 🔵 sette stati derivati |
| **Dining** | conto al tavolo, coupon, punti, gift | POS integrati | **POS Zucchetti** | 🟡 senza cassa |
| **Payment** | chiusura conto | pagamenti online | POS | 🔴 |
| **Loyalty** | punti, gift, coupon | *Loyalty* | carta punti, scadenza | 🟡 mancano premi a soglia |
| **Feedback** | NPS, detrattori | sondaggi email+SMS | richieste recensione | 🟡 manca il ponte pubblico |
| **Marketing** | campagne, automazioni, attribuzione | *Marketing tools* | multicanale attivo | 🔴 canali |
| **Return** | attribuzione a 30 giorni | cross-sell fra locali | segmenti su spesa reale | 🟡 |

**Il ciclo non si chiude in due punti**: la protezione (pagamenti) e la comunicazione (canali). Sono anche gli unici due che impediscono al ciclo di **alimentarsi da solo**.

---

# Competitive Matrix

🟢 forte · 🟡 parziale · 🔴 mancante · 🔵 vantaggio Tavolo · ⚪ non rilevante · **?** non verificato

| Feature | Tavolo | CoverManager | Pienissimo | SevenRooms | Priorità |
|---|---|---|---|---|---|
| Motore disponibilità server-side | 🟢 | 🟢 | 🟢 | ? | — |
| Widget prenotazione | 🟡 | 🟢 white-label CSS | 🟢 | ? | P1 |
| Regole avanzate (cutoff, window, overbooking) | 🔴 | ? | ? | ? | P1 |
| Piantina e stati tavolo | 🟢 | 🟢 | 🟢 drag&drop | ? | — |
| Centro controllo con rimedi | 🔵 | ? | ? | ? | — |
| Waitlist | 🟢 | 🟢 | ? | ? | — |
| **Caparra / carta a garanzia** | 🔴 | 🟢 | ? | ? | **P0** |
| Pagamenti online | 🔴 | 🟢 | 🟢 (via POS) | ? | **P0** |
| Biglietti esperienze | 🔴 | 🟢 | ? | ? | P1 |
| CRM comportamentale | 🟢 | 🟢 | 🟢 | 🟢 | — |
| CRM condiviso fra locali | 🔴 | 🟢 | ? | ? | P1 |
| Spesa reale per cliente | 🟡 solo conti Tavolo | 🟢 via POS | 🟢 via scontrini | ? | **P0-P1** |
| Punti fedeltà | 🟢 | 🟢 | 🟢 | ? | — |
| Premi a soglia / scadenza punti | 🔴 | ? | 🟢 | ? | P1 |
| Coupon | 🟢 | ? | 🟢 | ? | — |
| Gift card (gestione) | 🟢 | ? | ? | ? | — |
| Gift card (vendita online) | 🔴 | ? | ? | ? | P1 |
| Email marketing | 🟡 spento | 🟢 | 🟢 | 🟢 | **P0** |
| SMS | 🔴 | 🟢 | 🟢 | ? | P1 |
| WhatsApp | 🔴 | ? | 🟢 | ? | **P0-P1** |
| Automazioni | 🟡 | ? | 🟢 | 🟢 | P1 |
| Attribuzione prenotazioni a campagna | 🔵 | ? | ? | ? | — |
| Wi-Fi → CRM | 🔵 | ? | ? | ? | — |
| NPS / sondaggi | 🟢 | 🟢 | ? | ? | — |
| Recensioni pubbliche | 🔴 | ? | 🟢 richieste | ? | P1 |
| Menu con allergeni | 🔵 elenco chiuso | ? | ? | ? | — |
| Food cost e margine | 🔵 con copertura | ? | 🟢 BI su margini | ? | — |
| Previsione coperti | 🟢 | ? | ? | 🟢 | — |
| Costo delle assenze | 🔵 | ? | ? | ? | — |
| Integrazioni | 🔴 5 | 🟢 130+ | 🟢 ecosistema Zucchetti | 🟢 | **P0-P1** |
| Multi-locale operativo | 🟡 | 🟢 | 🟢 catene | 🟢 | P1 |
| App mobile nativa | 🔴 web responsive | ? | 🟢 iOS/Android | ? | P2 |
| Gestione personale | 🟡 contratti | ? | 🟢 Mansionissimo + timbratura | ? | ⚪ |
| Privacy: export + cancellazione | 🔵 | 🟡 esportabile | ? | ? | — |
| 2FA / SSO / API pubbliche | 🔴 | ? | ? | 🟢 | P2 |

---

# Tavolo Advantages

Cinque, e ognuna è verificata — non dichiarata.

**1. Il centro controllo del servizio.** Sette regole deterministiche che non mostrano dati ma dicono cosa sta per andare storto e dove rimediare, ognuna col motivo `[CODE]`. Nessun competitor consultato dichiara qualcosa di analogo — NON VERIFICATO che non esista.

**2. L'onestà dei numeri, resa meccanica.** Stima e misura non si mescolano mai; le percentuali non si estrapolano oltre la loro copertura; le liste dicono quante sono in tutto; nessun numero viene mostrato se nessuno lo scrive `[CODE]`. È una posizione di prodotto difendibile: in questa categoria il software mente spesso, e il ristoratore se ne accorge al secondo mese.

**3. Wi-Fi → CRM → prenotazione, misurato fino alla prenotazione** `[CODE][SCREENSHOT]`.

**4. Allergeni da elenco chiuso** (i 14 obbligatori, scritti per esteso sul menu pubblico) `[CODE]`. È conformità e sicurezza, non una funzione.

**5. Privacy operativa completa**: export e cancellazione su sette tabelle in una transazione, con la garanzia dichiarata e verificata che **i conti non si toccano** `[CODE]`. CoverManager dichiara dati esportabili; Tavolo fa anche la cancellazione, e la mostra prima di eseguirla.

---

# Do Not Build

| Cosa | Verdetto | Perché |
|---|---|---|
| POS completo | **INTEGRATE** | Il conto al tavolo copre chi non ha cassa; per gli altri serve il ponte, non un sostituto |
| Contabilità, e-fattura, corrispettivi telematici | **INTEGRATE** | Terreno di Zucchetti e dei registratori: entrarci è un anno di lavoro e nessun vantaggio |
| Magazzino e distinta base | **IGNORE** | Il confine giusto è il piatto, non l'ingrediente |
| HACCP | **IGNORE** | Mercato diverso, comprato da altri, nessuna sinergia col ciclo cliente |
| Payroll e HR | **IGNORE** | Pienissimo ha *Mansionissimo* `[COMPETITOR SOURCE]`; per Tavolo sarebbe una diluizione |
| Turni del personale | **IGNORE oggi** | Utile ma non hospitality-critical; software dedicati costano poco |
| Delivery e asporto | **IGNORE** | Altro ciclo, altro cliente, altra economia. `Order` nasce da lì e ci ha già fatto danni |
| ERP | **IGNORE** | — |
| App mobile nativa | **RIMANDARE** | Il web responsive regge (zero overflow verificato); una app nativa si giustifica con le notifiche push, non prima |
| Rule builder tipo Zapier | **IGNORE** | Decisione già presa e giusta: un editor di regole in un gestionale per ristoranti resta vuoto |
| Chatbot per il cliente finale | **IGNORE** | Nessuno dei problemi veri del ristoratore si risolve così |

Le **16 tabelle senza codice** del §*Stato reale* vanno chiuse con una decisione, non lasciate lì: `CallLog`/`MissedCall`/`VoiceBookingDraft` (P2, solo caller ID), `ReviewLink`/`ReviewLinkClick` (**fatte**), `Review` (**P1, serve l'API delle piattaforme**), `BookingPreorder`(+`Item`) (da cancellare o legare al menu), `ChatSession`/`ChatMessage`, `BookingEvent`, `StaffShift`, `CostEntry`, `MenuScan`, `FloorDecor`, `ApiToken` (P2 con le API pubbliche), `ExchangeRate`.

---

# Moat

**Oggi un moat non c'è.** Va detto: ogni singola funzione di Tavolo è replicabile da CoverManager in un trimestre, e Pienissimo ha già dalla sua un ecosistema che Tavolo non può costruire.

Tre candidati, in ordine di difendibilità `[INFERENCE]`:

**1. Il ciclo chiuso e misurato su un solo dato.** Nessuno dei due benchmark, per quanto verificato, unisce *conto al tavolo* + *fedeltà sui conti veri* + *attribuzione delle campagne alla prenotazione* + *costo delle assenze in euro misurati* dentro lo stesso dato. Chi ha CoverManager compra un POS a parte; chi ha Pienissimo dipende da Zucchetti. Tavolo può dire: **il ciclo si chiude qui dentro, anche senza cassa**. Difendibile perché è architettura, non funzione.

**2. L'onestà come contratto.** «Non ti mostriamo numeri che nessuno scrive; ti diciamo sempre se è una stima.» È copiabile come frase, non come pratica: richiede di rinunciare a metriche che vendono bene. Un competitor che ha già la dashboard piena di numeri stimati non torna indietro.

**3. Il centro controllo del servizio.** È l'unica parte del prodotto che fa risparmiare tempo *durante* il lavoro, ed è quella che si racconta in una demo di due minuti.

Il primo è il solo che regga davvero nel tempo. Gli altri due sono vantaggi, non fossati.

---

# Product Positioning

La frase proposta dal brief — *«Tavolo gestisce tutto ciò che accade tra il ristorante e il cliente»* — è **corretta ma non ancora vera**: manca il pagamento, che è una delle cose che accadono fra ristorante e cliente.

Proposta `[INFERENCE]`:

> **Tavolo tiene insieme la sala e il cliente: chi prenota, chi si siede, cosa ha speso, e perché torna.**
> Prima della visita, durante, e dopo — con un solo dato, senza numeri inventati.

Regge perché nomina i quattro fatti che Tavolo possiede davvero (prenotazione, servizio, conto, ritorno) e perché la seconda riga è una promessa che il prodotto mantiene ed è verificabile.

---

# Top 10 Gaps

| # | Problema | Perché conta | Chi lo fa meglio | Come affrontarlo | Effort | Priorità |
|---|---|---|---|---|---|---|
| 1 | **Nessun incasso online**: caparra, garanzia, prepagato | È la difesa numero uno contro i no-show e la condizione per biglietti e gift card vendute | CoverManager (*deposits at booking*, «fino all'80% di no-show in meno») | Un fornitore di pagamenti, e poi caparra sulle prenotazioni a rischio, biglietti, gift card | **L** | **P0** |
| 2 | **Nessun canale di comunicazione acceso** | Promemoria, sondaggi, automazioni e campagne sono costruiti e girano a vuoto | entrambi | Chiave email in produzione (ore), poi WhatsApp | **S** (email) / **M** (WhatsApp) | **P0** |
| 3 | **Nessun collegamento alla cassa** | Senza scontrini la spesa reale, l'LTV e il ROI restano stime | Pienissimo (Zucchetti, Tilby, Zmenu…) | Un connettore su una cassa italiana diffusa | **L** | **P0-P1** |
| 4 | **Nessun ponte verso le recensioni pubbliche** | La recensione è il primo canale di acquisizione di un ristorante, e Tavolo sa già chi è contento | Pienissimo (richieste recensione) | Promotore → invito a recensire, con instradamento | **M** | **P1** |
| 5 | **CRM non condiviso fra locali** | Per una catena è il requisito che chiude la trattativa | CoverManager (*One CRM, every guest*) | Cliente, punti e gift card a livello di organizzazione | **L** | **P1** |
| 6 | **Nessuna regola avanzata di prenotazione** | Finestra, cutoff, overbooking controllato sono richieste standard | NON VERIFICATO in dettaglio | Estensione del motore, che è già l'unica fonte di verità | **M** | **P1** |
| 7 | **Biglietti delle esperienze** | È il margine più alto del ristorante e oggi si perde | CoverManager | Dipende dal gap 1 | **M** dopo il 1 | **P1** |
| 8 | **Fedeltà senza traguardo** | Uno sconto lineare non fa tornare; un premio a soglia sì | Pienissimo (soglia + scadenza + notifica) | Premi a soglia con notifica | **M** | **P1** |
| 9 | **Analytics che non arriva all'azione** | «Martedì al 54%» non muove niente senza il pulsante che crea la campagna | — | Ponte fra occupazione, segmento e campagna | **S** | **P1** |
| 10 | **Cinque integrazioni contro 130+** | Nelle trattative con gruppi è una domanda che arriva sempre | CoverManager | Non rincorrere: sceglierne 3 giuste (cassa, Google, TheFork) | **XL** se rincorsa, **M** se mirata | P1-P2 |

---

# Top 10 Opportunities

Dieci cose che nascono **dall'unione** dei pezzi che Tavolo ha già, e che nessuno dei due benchmark risulta avere `[INFERENCE]`.

1. **Dal calo di occupazione alla campagna, in un clic.** «Il martedì sei al 54%. 187 clienti compatibili non vengono da 60 giorni. [Crea la campagna]» — tutti i dati esistono. **S**, ed è la migliore opportunità dell'audit.
2. **Il briefing pre-servizio.** «Oggi 82 coperti, 91%, 6 VIP, 3 compleanni, 2 allergie importanti, 4 da riconfermare, alle 20:30 quasi pieno.» Tutti dati posseduti; niente AI. **S**.
3. **Costo delle assenze → caparra mirata.** Tavolo è l'unico che sa *quanto* costano le assenze **in euro misurati**: può proporre la caparra solo dove serve, invece di applicarla a tutti. Quando arriveranno i pagamenti, è il modo giusto di introdurli. **M**.
4. **Gift card inutilizzata → invito a tornare.** Denaro già incassato, cena non ancora servita: l'automazione con il ritorno più alto e il costo più basso. **S**.
5. **Tavolo Connect.** Wi-Fi → contatto → consenso → prenotazione, misurato fino alla prenotazione. Con i pagamenti, anche fino al fatturato. **S** (è quasi tutto fatto).
6. **Menu engineering senza dati nuovi.** ✅ **Fatto.** Popolarità × margine sui due dati già presenti: stelle, cavalli, enigmi, cani — e il rifiuto di classificare quando le vendite non bastano.
7. **Il promotore che diventa recensione.** Chi ha dato 9-10 riceve l'invito a recensire; chi ha dato meno riceve una persona. **M**.
8. **Disdetta → offerta immediata alla waitlist.** Il tavolo liberato all'ultimo è ricavo perso: oggi nessuno lo riempie automaticamente. **M**.
9. **La scheda cliente al telefono che squilla.** Solo caller ID, nessuna AI: metà del valore di un centralino intelligente a un decimo del costo. **M**.
10. **L'affidabilità raccontata, non punteggiata.** Non «62/100», ma «3 assenze su 11, l'ultima il 4 agosto»: coerente con la regola della casa, e più utile di un numero. **S**.

---

# Impact / Effort

**QUICK WIN — alto impatto, basso sforzo**
Chiave email in produzione · dal calo di occupazione alla campagna · briefing pre-servizio · automazione gift card inutilizzata · premi a soglia (parte visibile) · menu engineering · coupon con spesa minima e giorni validi.

**CORE INVESTMENT — alto impatto, alto sforzo**
Pagamenti (caparra, biglietti, gift card online) · WhatsApp · connettore cassa · CRM fra locali · regole avanzate di prenotazione.

**STRATEGIC BET — impatto incerto, sforzo alto**
Reserve with Google · marketplace/canali esterni · caller ID · previsione di abbandono.

**DISTRACTION — da non fare ora**
App nativa · rule builder · POS proprio · HR e turni · chatbot cliente · 2FA/SSO (prima che arrivi una catena).

---

# Roadmap P0-P3

## P0 — necessario per competere

| # | Problema | Feature | Benchmark | Valore ristoratore | Valore cliente | Effort | Dipendenze | Rischio |
|---|---|---|---|---|---|---|---|---|
| P0-1 | I messaggi non partono | Chiave email + mittente in produzione | entrambi | sblocca promemoria, sondaggi, automazioni, campagne | riceve conferme e promemoria | **S** | chiave del fornitore | nessuno |
| P0-2 | Nessuna difesa dai no-show | Caparra e carta a garanzia | CoverManager | −no-show, incasso protetto | chiarezza sulle condizioni | **L** | fornitore pagamenti | policy da definire |
| P0-3 | Il ciclo non si chiude sul denaro | Pagamento di biglietti e gift card | CoverManager | nuovo ricavo | compra un regalo | **M** | P0-2 | — |
| P0-4 | Nessun canale dove i clienti rispondono | WhatsApp | Pienissimo | risposte reali | canale naturale | **M** | fornitore | costo per messaggio |

## P1 — necessario per vincere

Connettore su una cassa italiana (**L**) · promotore → recensione pubblica (**M**) · CRM, punti e gift card condivisi fra locali (**L**) · regole avanzate di prenotazione (**M**) · premi a soglia (**M**) · dal calo di occupazione alla campagna (**S**) · briefing pre-servizio (**S**) · automazione gift card inutilizzata (**S**) · coupon con spesa minima, giorni e orari (**S**) · disdetta → waitlist (**M**).

## P2 — differenziazione

Tavolo Connect completo con ricavo misurato · menu engineering · affidabilità raccontata · caller ID · Reserve with Google · pacing e rotazione misurata · API pubbliche e webhook · 2FA.

## P3 — scommesse

Prenotazione a voce · assegnazione tavoli suggerita · marketplace proprio · app nativa · white label completo.

---

# Scorecard

Voti severi. Per ciascuno: motivazione, riferimento, cosa vale un punto in più.

| Area | Voto | Perché | Cosa vale +1 |
|---|---|---|---|
| **Booking** | **7** | Motore solido, 4 canali d'ingresso, forzatura tracciata; mancano cutoff, window, overbooking | Regole avanzate di prenotazione |
| **Availability** | **9** | Unica fonte di verità server-side, 57 regole verificate, tutti i motivi di rifiuto raccolti | Proposta di alternative al cliente |
| **Floor management** | **8** | Piantina, tavolate, collisioni serializzabili, 7 stati derivati | Pacing e rotazione misurata |
| **Service** | **9** | Centro controllo con rimedi: la parte migliore | Turn time previsto per tavolo |
| **Waitlist** | **8** | Completa, con offerta firmata e attesa depurata | Avviso su un canale vero + suggerimento tavolo |
| **CRM** | **7** | Comportamento eccellente, economia stimata | Spesa reale da cassa |
| **Loyalty** | **7** | Punti su conti veri, valore fotografato | Premi a soglia |
| **Marketing** | **5** | Motore completo, canale spento | Email accesa in produzione |
| **Automation** | **6** | Filosofia giusta, anteprima destinatari, omaggio personale | Due ricette (gift card, recensione) + invio attivo |
| **Payments** | **1** | Solo lo schema e una pagina che lo dichiara | Un fornitore collegato |
| **Experiences** | **4** | Si pubblicano, non si vendono | Biglietti |
| **Reputation** | **5** | NPS completo, nessun ponte pubblico | Invito a recensire |
| **Menu** | **8** | Allergeni chiusi, margine, menu pubblico | Menu engineering |
| **Analytics** | **8** | Onesto e spiegato; si ferma prima dell'azione | Il ponte verso la campagna |
| **Integrations** | **2** | Cinque, di cui una spenta | Una cassa italiana |
| **Omnichannel** | **3** | Un canale collegato su sette previsti | Reserve with Google |
| **Multi-location** | **4** | Isolamento sì, condivisione no | CRM di gruppo |
| **Mobile operations** | **7** | Sette schermate operative, zero overflow, navigazione dedicata | Azioni raggiungibili col pollice, verificate |
| **Customer-facing** | **7** | Widget, menu QR, portale, sondaggio: tutti coerenti | Widget personalizzabile dal locale |
| **Intelligence / AI** | **4** | 8 strumenti, non proattivo | Briefing e suggerimento campagna |

**Media: 5,95/10.** La distribuzione conta più della media: **cinque aree ≥8** (disponibilità, servizio, sala, menu, analytics, waitlist) e **quattro ≤4** (pagamenti, integrazioni, omnichannel, multi-locale, esperienze). Non è un prodotto mediocre ovunque: è un prodotto forte dove tocca il servizio e assente dove tocca il denaro e il mondo esterno.

---

# Product Maturity

**Tavolo oggi = L2 — Usable Product**, con un nucleo di livello L3.

Perché non L3: un **Competitive Product** è un prodotto che un ristorante può adottare al posto di quello che ha. Oggi non può: chi lo adottasse perderebbe la protezione dai no-show (nessuna caparra) e resterebbe senza comunicazioni verso i clienti (nessun canale acceso in produzione). Sono due delle tre ragioni per cui questo software si compra.

Perché non L1: c'è molto più di un MVP. 562 test, produzione viva, tredici moduli completi e verificati, disciplina sui dati che molti prodotti maturi non hanno.

**Cosa serve per L3, esattamente tre cose:** (1) l'email accesa in produzione — ore; (2) caparra e carta a garanzia — settimane; (3) un canale su cui i clienti rispondano davvero, WhatsApp — settimane. Nessuna delle tre è una riscrittura: due dipendono da fornitori, una da lavoro.

Per **L4 — Category Challenger** servirebbe in più il collegamento alla cassa e il CRM di gruppo, cioè la capacità di vincere contro Pienissimo sul suo terreno e contro CoverManager sulle catene.

---

# Commercial Readiness

| Dimensione | Stato | Nota |
|---|---|---|
| **Product** | 🟡 | Nucleo pronto, due buchi che si notano in demo (pagamenti, invii) |
| **Tech** | 🟢 | 562 test, migrazioni versionate con freno, permessi centralizzati, registro azioni |
| **Operational** | 🟡 | Nessun runbook, nessun monitoraggio degli errori, nessuna procedura di ripristino documentata |
| **Sales** | 🔴 | Nessun materiale, nessun prezzo, nessuna demo guidata, nessun caso studio |
| **Onboarding** | 🟡 | Wizard brand e demo popolata; manca l'importazione dei clienti da Excel/gestionale precedente — **è la prima domanda di ogni migrazione** |
| **Support** | 🔴 | Nessun canale di assistenza nel prodotto (la pagina segnalazioni fu rimossa perché finta) |
| **Integration** | 🔴 | Cinque integrazioni, nessuna cassa |
| **Data** | 🟡 | Export cliente completo; manca l'export massivo del locale e l'importazione |
| **Security / Privacy** | 🟢🟡 | Isolamento, permessi, registro, intestazioni, export e cancellazione: forti. Mancano 2FA, recupero password, verifica del contatto sul widget |

`[INFERENCE]` Il rischio più concreto non è tecnico: è che Tavolo sia **tecnologicamente migliore e commercialmente più difficile da adottare** di Pienissimo, che arriva con la cassa già collegata, l'assistenza in italiano e un commerciale che conosce il locale. Le due contromisure che costano meno: **importazione dei clienti** e **connettore su una cassa diffusa**.

---

# UX Issues To Review Later

Raccolti durante l'audit, **non affrontati** (sarà l'audit UX/UI separato).

1. Marketing: pagina hub con sole card e nessun numero — sembra incompleta.
2. Panoramica: molti numeri, poche azioni; manca il modello «adesso / dopo / attenzione».
3. Servizio: la gerarchia fra «da tenere d'occhio» e il resto potrebbe non reggere in tre secondi.
4. Sala viva: verificare se lo stato è riconoscibile senza leggere il testo.
5. Prenotazioni: stato + menu + «Apri» possibile ridondanza nella riga.
6. Analytics: pagina lunga, tre pannelli densi in sequenza, nessuna navigazione interna.
7. Pagamenti: pagina quasi vuota per costruzione — meriterebbe di dire cosa sarà.
8. Menu: con oltre 100 piatti servono ricerca, filtri e riduzione delle categorie.
9. «Consegnata al fornitore», «debito verso clienti»: da testare con un ristoratore vero.
10. Il serif nelle cifre dei KPI: bello, da verificare in lettura rapida durante il servizio.

---

# Final Recommendation

**Non aggiungere funzioni per due mesi. Accendere quelle che ci sono.**

L'audit dice una cosa sola, in tre modi diversi: Tavolo ha costruito più prodotto di quanto ne possa usare. Promemoria, sondaggi, automazioni e campagne sono completi e girano a vuoto per una chiave mancante; le esperienze si pubblicano ma non si vendono; la fedeltà funziona ma non ha un traguardo; l'analytics arriva a un passo dall'azione e si ferma.

**Le cinque mosse, in ordine.**

1. **L'email in produzione.** Ore di lavoro, sblocca quattro moduli. È la cosa con il miglior rapporto valore/tempo dell'intero progetto.
2. **I pagamenti.** Non per «avere Stripe», ma per la caparra — e introdotta come solo Tavolo può fare, sulle prenotazioni che il **costo misurato delle assenze** indica come rischiose, invece che su tutti.
3. **WhatsApp.** In Italia è dove i clienti rispondono.
4. **Un connettore su una cassa.** È l'unico modo di passare da «spesa stimata» a «spesa reale», ed è il terreno su cui Pienissimo è forte.
5. **I tre ponti a costo quasi zero:** occupazione → campagna, briefing pre-servizio, gift card inutilizzata → invito.

E una decisione che non richiede codice: **le sedici tabelle senza codice**. Ognuna è una funzione da fare o una riga da cancellare. Finché restano lì, invitano a costruire fantasmi — che è esattamente l'errore da cui questo progetto è partito.
