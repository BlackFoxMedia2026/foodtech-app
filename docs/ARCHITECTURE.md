# Architettura

Stato al 7 settembre 2026. Descrive il codice come è, non come vorremmo che fosse.

## Forma generale

Next.js 14 con App Router. Non ci sono server action: **ogni scrittura passa da una route API**
sotto `src/app/api/`. Le pagine sono componenti server che leggono direttamente dai moduli di
dominio in `src/server/`; i componenti client scrivono via `fetch` verso le route.

```
src/app/(app)/…        pagine dell'applicazione (componenti server)
src/app/(auth)/…       accesso
src/app/book/…         widget pubblico di prenotazione
src/app/api/…          46 route: l'unico modo di scrivere
src/components/…       115 componenti, per area funzionale
src/server/…           logica di dominio, 21 moduli — l'unico posto che parla col database
src/lib/…              infrastruttura condivisa (sessione, permessi, fuso, limiti, database)
src/middleware.ts      limite di frequenza, prima di tutto il resto
prisma/                schema (72 modelli) e migrazioni versionate
tests/                 56 verifiche
```

## I quattro strati e le loro responsabilità

**Middleware** — decide *quante* richieste accettare. Gira sull'edge, non ha accesso a Prisma,
quindi non può sapere né chi sei né in quale locale stai. Solo limite di frequenza.

**Route API** — decide *se puoi*. Ogni route inizia con `requireVenueApi(capacità)`
(`src/lib/api-auth.ts`), che risolve sessione, locale attivo e ruolo, e risponde 401 o 403 in
JSON quando manca qualcosa. Le route non contengono logica di dominio: chiamano un modulo server.

**Moduli server** (`src/server/`) — contengono le regole. Ricevono `venueId` come primo
argomento, **sempre dal contesto della route, mai dal corpo della richiesta**: è così che
l'isolamento fra ristoranti regge. Validano con Zod, sollevano errori con nomi parlanti
(`not_found`, `conflict`) che `apiErrorResponse` traduce in status HTTP.

**Prisma** — un solo client, riusato tra i ricaricamenti a caldo (`src/lib/db.ts`).

## Le decisioni che vale la pena conoscere

### Un solo giudice sulla disponibilità

`src/server/availability.ts` (556 righe) è l'**unica** fonte di verità su «questa prenotazione
si può accettare?». Sta nello strato server e non nelle route, così la stessa regola vale per la
sala, per l'API interna, per il widget pubblico e per qualunque canale futuro. Raccoglie tutti i
motivi di rifiuto invece di fermarsi al primo, e legge i turni nel fuso del locale.

È l'unico modulo con una batteria di verifiche dedicata (45 controlli in
`scripts/check-availability-rules.ts`, collegata a `npm test`).

### Il locale attivo

Un utente può appartenere a più ristoranti (`VenueMembership`). Quello attivo è scelto da un
cookie `tavolo.venue`, con la prima appartenenza come ripiego. `resolveActiveVenue()` in
`src/lib/tenant.ts` dice cosa manca senza decidere; sopra ci sono due strati:

- `getActiveVenue()` per le pagine: redirige a `/sign-in` o `/onboarding`
- `requireVenueApi()` per le API: risponde 401 o 403 in JSON

Questa separazione esiste perché prima le route usavano il redirect e restituivano 307: il
client seguiva il redirect, riceveva HTML e `res.json()` esplodeva.

### I permessi stanno in un file senza dipendenze

`src/lib/abilities.ts` contiene la matrice ruolo → capacità e nient'altro. Separato da
`tenant.ts` perché quello usa `cache()` di React, che esiste solo dentro un rendering e rendeva
la matrice non verificabile con un test.

### Il fuso è del ristorante

`Venue.timezone` (`Europe/Rome` per difetto). Ogni calcolo di «oggi» passa da
`src/lib/venue-time.ts`; i componenti client leggono il fuso da un contesto montato nel layout
(`VenueTimeProvider`). Mai `new Date().toISOString()` per ottenere una data: quello è UTC.

### Le date pure restano stringhe

Un giorno di servizio è `"2026-09-07"`, non un `Date`. `shiftDateKey` fa i conti su date pure,
così la notte del cambio d'ora non salta un giorno.

## Cosa manca, e si sa

- **Nessuna coda.** `sendCampaignNow` sincronizza un contatto per ospite dentro la richiesta
  HTTP: con qualche centinaio di ospiti va in timeout a metà, lasciando la campagna in stato
  incoerente. È il primo posto dove servirà un lavoro in background.
- **Nessuna paginazione reale.** Le liste hanno tetti fissi (`take: 200`, `take: 500`): oltre,
  i dati spariscono in silenzio.
- **Nessun confine d'errore.** Ci sono 6 `loading.tsx` e zero `error.tsx`: un'eccezione lato
  server mostra la pagina d'errore grezza di Next.
- **Nessuna cache.** 17 pagine su 25 sono `force-dynamic`, nessun `revalidate`.
- **Soft delete a metà.** `Booking` e `Payment` hanno `deletedAt`/`deletedBy` ma il codice
  cancella davvero, e le liste non filtrano quei campi. Ospiti, camerieri e tavoli non hanno
  nemmeno i campi. Chi implementa il ripristino deve fare entrambe le cose insieme.
