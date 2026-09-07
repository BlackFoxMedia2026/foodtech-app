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
- [ ] Sala Live V2: stati con icona oltre al colore, unione e divisione tavoli, sposta prenotazione, libera tavolo, modalità mobile vera
- [x] Navigazione mobile: barra in basso con «+» centrale (fatta in Phase 1)
- [ ] Centro controllo servizio: collisioni previste, rischio overbooking, suggerimenti seating
      → i numeri della modalità Servizio sono la base: manca lo strato che li interpreta

## Phase 3 — Ospiti

- Guest Intelligence: LTV, frequenza, preferenze, ritenzione
- Timeline ospite (solo eventi realmente disponibili)
- Tag automatici configurabili
- Segmenti dinamici

## Phase 4 — Crescita

- Motore automazioni (segmento → trigger → condizione → azione → attesa), con coda
- WhatsApp e SMS come canali
- Recensioni e NPS
- Coupon

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
