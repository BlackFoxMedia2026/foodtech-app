# Roadmap

Ordine vincolante. Non si salta una fase perché la successiva è più interessante.

Riferimento sullo stato reale di ogni modulo: [PRODUCT_STATUS.md](PRODUCT_STATUS.md). Fotografia di partenza: [REALITY-CHECK-2026-09.md](REALITY-CHECK-2026-09.md).

## Phase 0 — Fondamenta ✅ in corso

Obiettivo: rendere il prodotto sicuro da modificare e da rilasciare.

- [x] Stato reale documentato
- [x] Schema: `@default(cuid())` sui modelli che ne erano privi, indici mancanti
- [x] Migrazioni versionate, `db push --accept-data-loss` fuori dal deploy
- [x] Permessi su tutte le mutazioni, centralizzati
- [x] Semantica HTTP corretta (mai 307 da un'API)
- [x] Rate limiting su endpoint pubblici, login, AI, upload
- [x] Fuso orario del locale in ogni calcolo di «oggi»
- [x] Audit log sulle azioni sensibili
- [x] Test su permessi, isolamento, fuso, disponibilità
- [x] Dati demo con date relative a oggi
- [x] Documenti di design allineati alla palette reale (verde/crema/terracotta)
- [x] Widget pubblico riportato nell'identità dell'applicazione

## Phase 1 — Booking OS 🔄 in corso

Obiettivo: parità competitiva sul nucleo prenotazioni.

- [x] Waitlist operativa: stati, offerta con scadenza, conversione, suggerimento dei tavoli compatibili
- [x] Walk-in rapido
- [x] Promemoria email 24h e 3h, con conferma e annullo dal link firmato
- [x] Disponibilità anche nel form interno + forzatura consapevole tracciata
- [x] Navigazione mobile operativa (anticipata dalla Phase 2: il decimo elemento in barra l'ha resa urgente)
- [ ] **Stripe: caparra, preautorizzazione, pagamento pieno**; policy per esperienza, giorno, fascia, coperti; rimborsi e addebito no-show
      → **bloccato**: servono le chiavi di test Stripe. Senza, il codice si scriverebbe ma non si potrebbe verificare, e una integrazione di pagamento non verificata è peggio di nessuna
- [ ] SMS e WhatsApp come canali dei promemoria e delle offerte della lista d'attesa
      → il posto è pronto in `PROVIDERS` (`src/server/messaging/send.ts`): manca il fornitore

## Phase 2 — Servizio 🔄 in corso

Obiettivo: «un ristorante può tenere Tavolo aperto per tutto il servizio».

- [x] **Modalità Servizio / reception**: ADESSO / PROSSIMI / ATTESA, per tablet e una mano
- [x] **Sala viva**: sette stati con icona oltre al colore, sposta prenotazione, libera tavolo, elenco per stato su telefono
- [x] **Unire e dividere le tavolate dall'interfaccia**: un tocco assegna, due o più uniscono, i posti si sommano sotto gli occhi. Prima `combinedTableIds` si poteva scrivere solo dal database, pur essendo rispettato da tutto il resto
- [x] Navigazione mobile: barra in basso con «+» centrale (fatta in Phase 1)
- [x] **Centro controllo servizio**: sette regole deterministiche, ognuna con la sua azione. Restano da aggiungere, quando ci saranno i dati: previsione dei coperti e ottimizzazione dell'occupazione (Phase 5)

## Phase 3 — Ospiti 🔄 in corso

- [x] **Guest Intelligence**: frequenza, abitudini, affidabilità, ritenzione — calcolate dalle prenotazioni
- [x] **Timeline ospite**, con i soli eventi che esistono davvero
- [x] **Tag automatici** con il motivo di ognuno; soglie in un posto solo, pronte a diventare configurabili per locale
- [x] I segmenti delle campagne filtrano su dati **veri**: i contatori sono riallineati alle prenotazioni e il filtro sulla spesa (che leggeva un campo mai aggiornato) è stato rimosso
- [x] Segmenti basati direttamente sulle etichette calcolate («manda a chi è a rischio»)
- [ ] Il valore in euro resta una **stima dichiarata** finché non ci sono ordini o incassi

## Phase 4 — Crescita 🔄 in corso

- [x] **Recensioni e NPS**: richiesta il giorno dopo la visita, due strade dopo la risposta, notifica immediata sui detrattori, pannello in Analytics
- [x] **Coda dei lavori in background** (`BackgroundJob` + `/api/cron/jobs` ogni minuto): era il prerequisito. L'invio campagne e i messaggi agli ospiti non stanno più dentro la richiesta HTTP; l'avanzamento e gli errori si vedono
- [x] **Automazioni**: tre, non un costruttore di regole — compleanno, chi non torna da un po', invito a tornare dopo la prima volta. Il numero di persone che toccherebbero si vede **prima** di accenderle, con i nomi e il motivo. Nascono spente
      → la forma scelta: un catalogo chiuso invece di un editor «se questo allora quello». Un editor sembra più potente e in un gestionale per ristoranti resta vuoto; e una regola scritta di fretta scrive a tutti la cosa sbagliata. Quando serviranno automazioni nuove si aggiungono al catalogo, dove si possono ragionare e provare
      → restano fuori, per mancanza di dati: coupon, Wi-Fi, ordini. E resta fuori per scelta la risposta automatica a un voto basso: a chi è uscito insoddisfatto scrive una persona
- [ ] WhatsApp e SMS come canali (il posto è pronto in `PROVIDERS`, manca il fornitore)
- [x] **Coupon**: codice leggibile al telefono (senza O/0, I/1/L, S/5), tetti d'uso totali e per cliente, validità, pausa e archivio. Si usano **al tavolo**, dalla scheda della prenotazione, e l'utilizzo si può **annullare** — lo sbaglio comune non è la frode, è il tocco di troppo
      → due camerieri che passano lo stesso codice nello stesso istante non possono superare il tetto: i controlli stanno dentro una transazione serializzabile, come per l'assegnazione dei tavoli
- [x] **Coupon dentro le automazioni**: a ognuna delle tre si può allegare un omaggio, e ogni persona riceve **un codice suo** — intestato a lei, valido una volta, con una scadenza. La scelta fra codice personale e codice condiviso è stata presa: condiviso si gira agli amici e diventa uno sconto che il locale non ha deciso
      → se il coupon non si riesce a creare, quella persona **si salta**: un'email che promette un regalo con un codice che non esiste è peggio di nessuna email, e al tavolo la discussione la fa il cameriere

## Phase 5 — Revenue 🔄 in corso

- [x] **Occupazione vera** per giorno della settimana, sulle sole settimane in cui il locale ha davvero registrato: prima le medie si dividevano per otto settimane anche quando ce n'erano quattro di dati, e le quattro vuote dimezzavano il risultato
- [x] **Previsione coperti a sette giorni**, col modello degli alberghi: si confronta ogni giorno con gli stessi giorni della settimana e si guarda quanto era già prenotato alla stessa distanza dal servizio. Ogni numero porta la sua frase, le assenze attese sono sottratte, e dove la storia non basta **non si prevede**
- [x] Tolto `bookedCount` dai risultati di campagna: nessuno lo scriveva, quindi ogni campagna mostrava zero prenotazioni generate — una bocciatura inventata
- [x] **ROI delle campagne**: il link dentro l'email si porta dietro la campagna, e la prenotazione che nasce da quel clic la ricorda (`Booking.campaignId`). Il merito vale per 30 giorni dall'invio, senza disdette e assenze; il valore in euro è la stima sullo scontrino medio, detta stima. La campagna nel link viene **verificata** lato server: un identificativo inventato non attribuisce niente e non impedisce la prenotazione
- [ ] `Campaign.bookedCount` è una **colonna morta**: nessuno la scrive e nessuno la legge più. Da eliminare con una migrazione distruttiva dichiarata (vedi prisma/migrations/README.md)
- [ ] RevPASH (ricavo per posto a sedere per ora): la capienza c'è, i ricavi sono una stima dichiarata. Ha senso quando ci saranno incassi veri
- [ ] Previsione dei ricavi: è la previsione dei coperti per lo scontrino medio. Facile da mostrare, e per questo pericolosa — meglio dopo gli incassi reali
- [ ] Intelligenza no-show oltre il singolo tavolo (il rischio per prenotazione c'è già nel centro controllo)

## Funzioni che sembravano finite e non lo erano

Chiuse il 7 settembre 2026, perché una promessa non mantenuta è peggio di una funzione assente (§23).

- [x] **Unire e dividere i tavoli** — vedi Phase 2
- [x] **Esperienze**: la pagina esisteva in sola lettura con un pulsante «Nuova esperienza» che non faceva niente. Ora si creano, si modificano, si pubblicano. I biglietti **non si vendono da Tavolo** (servono i pagamenti): c'è il link a dove li vende il locale, e la pagina lo dice
- [x] **Segnalazioni** (`/reports`): pagina vuota raggiungibile dal menu del profilo, che prometteva un canale di assistenza inesistente. Rimossa
- [x] **Le liste lunghe non mentono più**: gli ospiti sono a pagine con il totale scritto, e le etichette del filtro si leggono tutte
- [x] **Schermata d'errore**: un'eccezione non mostra più la pagina grezza di Next
- [ ] Paginare anche le prenotazioni su intervalli ampi (sulla giornata il tetto attuale basta)
- [ ] Vendita dei biglietti delle esperienze → dipende da Stripe, come le caparre

## Phase 6 — Ecosistema

- Loyalty, gift card, Wi-Fi
- Menu → ordini → food cost (in quest'ordine: è una catena)
- POS e altri connettori sopra un livello di integrazione astratto

## Phase 7 — Enterprise

- Permessi avanzati, multi-locale e multi-brand, SSO, 2FA
- API pubbliche e webhook in uscita
