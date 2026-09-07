# Sicurezza

Stato al 7 settembre 2026, dopo la Phase 0.

## Come è protetta una richiesta

Ogni richiesta attraversa tre controlli, in questo ordine:

1. **Quante** — `src/middleware.ts` applica il limite di frequenza. Prima di toccare il database.
2. **Chi** — `requireVenueApi()` risolve la sessione. Senza: **401** in JSON.
3. **Se può** — la stessa funzione confronta il ruolo con la capacità richiesta. Senza: **403**.

```ts
export async function POST(req: Request) {
  const ctx = await requireVenueApi("manage_staff");
  if (!ctx.ok) return ctx.response;
  // qui ctx.venueId, ctx.role, ctx.userId sono garantiti
}
```

La capacità è un **argomento obbligatorio da scrivere**: dimenticarla è una scelta visibile in
revisione, non una distrazione. È così perché prima 11 mutazioni non controllavano il ruolo.

## Ruoli e capacità

| Capacità | MANAGER | RECEPTION | WAITER | MARKETING | READ_ONLY |
|---|---|---|---|---|---|
| `manage_venue` (sala, tavoli, brand) | ✅ | | | | |
| `manage_staff` (camerieri, assegnazioni) | ✅ | | | | |
| `manage_contracts` (contratti) | ✅ | | | | |
| `manage_bookings` (prenotazioni, ospiti) | ✅ | ✅ | ✅ | | |
| `edit_marketing` (campagne, QR) | ✅ | | | ✅ | |
| `view_revenue` (incassi) | ✅ | | | ✅ | |

`manage_org` esiste nel tipo ma nessun ruolo la ha e nessuna route la usa: l'amministrazione
dell'organizzazione non è ancora un prodotto.

La matrice è in `src/lib/abilities.ts` ed è fissata da `tests/permessi.test.ts`: allargarla
richiede aggiornare il test, cioè dichiarare l'intenzione.

## Isolamento fra ristoranti

La garanzia su cui poggia tutto il resto. Due regole, verificate:

1. **`venueId` non arriva mai dal client.** Viene sempre da `requireVenueApi()`.
2. **Ogni funzione filtra prima di scrivere.** `findFirst({ where: { id, venueId } })` e solo
   dopo `update` o `delete`.

`tests/isolamento-locali.test.ts` chiama tredici funzioni con il locale A e l'identificativo di
un elemento del locale B: la risposta corretta è «non esiste». Include la controprova dentro il
proprio locale, altrimenti passerebbero anche funzioni rotte che rifiutano tutto.

## Limiti di frequenza

| Endpoint | Limite | Perché |
|---|---|---|
| `POST /api/public/bookings` | 5 / 10 min | Il bersaglio più esposto: la disponibilità impedisce la prenotazione *impossibile*, non quella *finta* |
| `GET /api/public/availability` | 60 / min | Il widget la interroga a ogni cambio di data |
| `POST /api/auth/callback/*` | 10 / 10 min | Tentativi di accesso |
| `POST /api/agent/*` | 30 / min | Ogni messaggio costa una chiamata a un modello |
| `POST /api/public/booking-action` | 5 / 10 min | L'ospite conferma o annulla dal promemoria: è l'endpoint da cui si potrebbero provare token a caso |
| Upload immagini e documenti | 20 / min | |

I valori sono tarabili da variabile d'ambiente (`RATE_LIMIT_LOGIN`, …): il
difetto è quello di produzione, l'override serve per tarare sotto traffico
reale senza rilasciare e per non bloccare le prove automatiche in locale.

Conteggio per IP (primo indirizzo di `x-forwarded-for`). **Limite noto:** il conteggio sta in
memoria del processo, quindi su Vercel vale per istanza. `RateLimitStore` è un'interfaccia:
passare a Redis è una riga, il giorno in cui il traffico lo richiede.

## Link firmati per gli ospiti

I promemoria contengono link che confermano o annullano senza account:
`src/lib/booking-token.ts`. Tre proprietà:

- **Firmati** con `NEXTAUTH_SECRET`: un identificativo indovinato non basta ad
  annullare la cena di un altro.
- **Legati all'azione**: il link per confermare non serve ad annullare, perché
  l'azione è dentro la firma.
- **Rumorosi in caso di errore di configurazione**: senza segreto la firma
  sarebbe una formalità, quindi `sign()` solleva un errore invece di produrre
  un token indovinabile. Stessa correzione applicata al token di
  disiscrizione, che aveva lo stesso difetto.

L'azione non parte mai da una GET: i client di posta precaricano i link, e un
annullamento innescato da un'anteprima è una cena persa senza che nessuno abbia
cliccato. La pagina mostra, il POST agisce.

## Registro delle azioni

`src/server/audit.ts` scrive su `AuditLog`: attore, email, azione, entità, differenza dei soli
campi cambiati, IP, dispositivo. Coperte: prenotazioni (creazione, modifica, annullo,
cancellazione, walk-in, creazione forzata con il motivo), assegnazione tavolo — **con azione
distinta quando è forzata** —, lista d'attesa (ingresso, avviso, uscita, accomodamento),
camerieri, tavoli, ospiti, sale, contratti, brand, modalità di servizio, e le azioni compiute
dall'ospite dal link del promemoria (registrate con attore `guest`, senza utente interno:
è esattamente l'informazione utile).

Registrare non può far fallire l'operazione: se la scrittura va in errore, la prenotazione
resta salvata e l'errore finisce nei log.

## Endpoint pubblici e loro protezione

| Endpoint | Autenticazione | Protezione |
|---|---|---|
| `POST /api/public/bookings` | nessuna, per progetto | limite di frequenza; `venueId` verificato attivo; disponibilità server-side |
| `GET /api/public/availability` | nessuna | limite di frequenza |
| `GET /api/cron/staff-contracts-expiry` | `Authorization: Bearer $CRON_SECRET` | **si rifiuta di partire** se `CRON_SECRET` non è configurato |
| `POST /api/webhooks/brevo` | token in query | 401 senza token valido |
| `GET /api/unsubscribe` | token firmato | |

## Cosa resta aperto

Per gravità, non per difficoltà:

1. **Nessuna verifica del contatto sul widget pubblico.** Il limite di frequenza rallenta un
   bot, non lo fermano email e telefono inventati. Serve un captcha o una conferma via link.
2. **`force: true` su `assign-table`** bypassa il controllo dei posti ed è disponibile a
   chiunque abbia `manage_bookings` (quindi anche a `WAITER`), è tracciato ma senza motivo
   obbligatorio. La forzatura in creazione è già passata al modello giusto — motivo
   obbligatorio, azione distinta nel registro (`booking.create_forced`): resta da allineare
   questa.
3. **Nessun 2FA, nessun recupero password, nessuna scadenza di sessione configurata.**
4. **Credenziali demo note** (`owner@tavolo.demo`) su un ambiente pubblico.
5. **I form non hanno `method="post"`**: un invio prima dell'idratazione diventa una GET con i
   campi in query string — su `/sign-in` significa la password nella cronologia e nei log.
6. **Cancellazioni distruttive** su ospiti, camerieri e tavoli: nessun ripristino possibile,
   solo la traccia nel registro.
7. **Nessuna intestazione di sicurezza** (CSP, HSTS, `X-Frame-Options`). Il middleware è ora il
   posto naturale dove metterle.

## Se trovi una vulnerabilità

Scrivi a moncalvo@blackfoxmedia.agency prima di aprire una issue.
