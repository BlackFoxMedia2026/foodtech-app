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

## Phase 1 — Booking OS

Obiettivo: parità competitiva sul nucleo prenotazioni.

- Stripe: caparra, preautorizzazione, pagamento pieno; policy per esperienza, giorno, fascia, coperti; rimborsi e addebito no-show
- Waitlist operativa: stati, offerta con scadenza, conversione, suggerimento quando si libera capienza compatibile
- Walk-in rapido
- Promemoria (email; poi SMS e WhatsApp) con conferma/modifica/annullo dal cliente
- Disponibilità anche nel form interno + forzatura consapevole tracciata

## Phase 2 — Servizio

Obiettivo: «un ristorante può tenere Tavolo aperto per tutto il servizio».

- Modalità Servizio / reception: NOW / NEXT / ATTESE, per tablet e una mano
- Sala Live V2: stati con icona oltre al colore, unione e divisione tavoli, sposta prenotazione, libera tavolo, modalità mobile vera
- Navigazione mobile: barra in basso OGGI / SALA / OSPITI / ALTRO con «+» centrale
- Centro controllo servizio: collisioni previste, rischio overbooking, suggerimenti seating

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
