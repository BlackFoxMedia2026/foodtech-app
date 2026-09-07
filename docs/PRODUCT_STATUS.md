# Stato del prodotto

Questo file dice **cosa esiste davvero** in Tavolo. Va aggiornato nello stesso commit che cambia lo stato di un modulo.

**Aggiornato:** 7 settembre 2026 · commit di riferimento `c6a1a82` + Phase 0

## Come si legge

| Stato | Significato |
|---|---|
| **LIVE** | Flusso completo: UI → validazione → API → logica → database → permessi → errori → feedback → stato vuoto → responsive |
| **BETA** | Funziona, ma manca un anello (test, scalabilità, un canale, un caso limite) |
| **PARTIAL** | Una parte utile funziona, ma il modulo non è completo |
| **PLANNED** | Deciso, non iniziato. Nessuna interfaccia che lo faccia sembrare esistente |
| **SCHEMA ONLY** | Esistono le tabelle. Non esiste codice |
| **BROKEN** | Esiste qualcosa che non fa quello che promette |
| **DEPRECATED** | Da rimuovere |

> Una tabella Prisma, un enum, una route vuota, una pagina segnaposto, una dipendenza installata o una voce di navigazione **non** sono una feature.

## Nucleo prenotazioni

| Modulo | Stato | Note |
|---|---|---|
| Panoramica | LIVE | KPI del giorno, timeline, alert da motore a regole |
| Prenotazioni (CRUD) | LIVE | Creazione, modifica, annullo, dettaglio |
| Disponibilità / anti-overbooking | LIVE | Unica fonte di verità per sala, API e widget. 45 verifiche automatiche |
| Calendario | PARTIAL | Navigazione per giorno. Nessuna vista settimana/mese |
| Widget pubblico | BETA | Funziona e propone solo orari accettabili. Fuori brand; da riportare alla palette dell'app |
| Walk-in | PARTIAL | Esiste come fonte prenotazione, manca il flusso rapido |
| Reminder prenotazione | PLANNED | Oggi solo email di conferma alla creazione |
| Caparra / garanzia carta | PLANNED | Schema pronto (`depositCents`, `depositStatus`, `Payment.stripePaymentId`). Stripe non implementato |

## Sala e servizio

| Modulo | Stato | Note |
|---|---|---|
| Sala / pianta tavoli | LIVE | Room Builder, layout salvati, zoom, trascinamento |
| Assegnazione tavolo a prenotazione | LIVE | Gestione collisioni con lock e 409 |
| Tavoli (anagrafica) | LIVE | |
| Camerieri | LIVE | Profili, ricerca, raggruppamento per ruolo |
| Contratti staff + promemoria scadenza | LIVE | Cron protetto, email, notifiche in-app |
| Assegnazioni cameriere ↔ tavolo | LIVE | |
| Modalità Servizio / reception | PLANNED | NOW / NEXT / ATTESE. È la prossima priorità di prodotto |
| Waitlist | SCHEMA ONLY | Schema completo (offerta, token, scadenza, conversione), zero codice |

## Ospiti e crescita

| Modulo | Stato | Note |
|---|---|---|
| Ospiti (anagrafica) | LIVE | Scheda, note, preferenze inserite a mano |
| Guest Intelligence (LTV, tag, comportamento) | PLANNED | Nessuna metrica calcolata oggi |
| Marketing / campagne email | BETA | Funziona via Brevo. L'invio non scala: una chiamata per ospite dentro la richiesta HTTP, serve una coda |
| QR code | LIVE | |
| Automazioni | SCHEMA ONLY | |
| Recensioni / NPS | SCHEMA ONLY | |
| Loyalty / coupon / gift card | SCHEMA ONLY | |

## Analisi

| Modulo | Stato | Note |
|---|---|---|
| Analytics | LIVE | Descrittivo: coperti, completamento, no-show, cancellazioni, fonti |
| Insight / alert | LIVE | Motore a regole |
| Revenue intelligence (RevPASH, occupazione) | PLANNED | |
| Previsione | PLANNED | |

## Piattaforma

| Modulo | Stato | Note |
|---|---|---|
| Autenticazione | LIVE | Credenziali + bcrypt + JWT. Nessun 2FA, nessun recupero password |
| Multi-locale | LIVE | Selettore locale, appartenenze per utente |
| Isolamento fra ristoranti | LIVE | `venueId` sempre dal server, mai dal client. Verificato su tutte le route |
| Permessi (RBAC) | LIVE | Matrice per ruolo, applicata a tutte le mutazioni |
| Semantica HTTP delle API | LIVE | 401/403/404/409/422/429 in JSON |
| Rate limiting | LIVE | Endpoint pubblici, login, agente AI, upload |
| Fuso orario del locale | LIVE | Ogni «oggi» è calcolato nel fuso del ristorante |
| Audit log | LIVE | Azioni sensibili tracciate con attore, entità e differenza |
| Migrazioni versionate | LIVE | `prisma migrate deploy` al deploy |
| Branding | LIVE | |
| Notifiche in-app | LIVE | Filtrate per ruolo |
| Agente AI | BETA | 8 strumenti, guardia permessi, quota mensile. Richiede `OPENAI_API_KEY`. Non proattivo |
| Test | PARTIAL | Vitest su permessi, isolamento, fuso, disponibilità. Nessun end-to-end |
| Multi-brand / catene | PLANNED | `Organization` esiste, gestione no |
| API pubbliche / webhook in uscita / SSO | PLANNED | |

## Non implementato (solo tabelle)

Menu · Ordini · Food cost · POS · Connettori · Centralino e voce · Wi-Fi captive portal · Preordini · Biglietti esperienze · Chat ospiti · Eventi privati e gruppi.

Le esperienze hanno una pagina in sola lettura: nessuna API per crearle o venderle. **Segnalazioni** (`/reports`) è un guscio fuori navigazione: da rimuovere o implementare.
