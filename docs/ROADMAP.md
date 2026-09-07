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
- [x] **Sala viva**: sette stati con icona oltre al colore, sposta prenotazione, libera tavolo, elenco per stato su telefono. Le tavolate unite si *leggono* (`combinedTableIds`, rispettato anche dalla disponibilità); **unire e dividere dall'interfaccia** resta da fare
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
- [ ] **Motore automazioni** (segmento → trigger → condizione → azione → attesa)
      → ora si può: la coda regge l'attesa fra un passo e l'altro (`runAt`), i nuovi tentativi e i lotti. Serve deciderne la forma: quali eventi generano un'esecuzione, dove si fermano le condizioni, e come si evita che una regola scritta male scriva a tutti tre volte
- [ ] WhatsApp e SMS come canali (il posto è pronto in `PROVIDERS`, manca il fornitore)
- [ ] Coupon

## Phase 5 — Revenue

- Occupazione, RevPASH, spesa media, ROI campagne
- Previsione coperti e ricavi
- Intelligenza no-show

## Phase 6 — Ecosistema

- Loyalty, gift card, Wi-Fi
- Menu → ordini → food cost (in quest'ordine: è una catena)
- POS e altri connettori sopra un livello di integrazione astratto

## Phase 7 — Enterprise

- Permessi avanzati, multi-locale e multi-brand, SSO, 2FA
- API pubbliche e webhook in uscita
