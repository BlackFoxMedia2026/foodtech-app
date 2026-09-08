# Sicurezza

Stato all'8 settembre 2026.

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
| `POST /api/public/survey` | 5 / 10 min | La risposta al sondaggio: l'altro endpoint da cui si potrebbero provare token a caso |
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

## Token dei sondaggi

Diversi dai link dei promemoria: qui il token è **casuale e salvato**
(`Survey.token`, unico), non firmato. La differenza è voluta — un sondaggio
vale **una volta sola** e va potuto invalidare, e un token in tabella si
revoca; una firma no. La risposta è idempotente per costruzione: al secondo
tentativo il vincolo su `SurveyResponse.surveyId` risponde «già risposto».

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
| `GET /api/cron/*` (quattro: `jobs`, `booking-reminders`, `staff-contracts-expiry`, `survey-requests`) | `Authorization: Bearer $CRON_SECRET` | **si rifiutano di partire** se `CRON_SECRET` non è configurato |
| `POST /api/webhooks/brevo` | token in query | 401 senza token valido |
| `GET /api/unsubscribe` | token firmato | |
| `POST /api/public/wifi` | nessuna, per progetto | limite di frequenza (12 in 10 minuti: un tavolo di sei si collega dallo stesso indirizzo); il locale deve avere il portale configurato, altrimenti 409; la password torna **solo** nella risposta a una registrazione riuscita |

## Intestazioni di sicurezza

In `next.config.mjs`, su ogni risposta:

| Intestazione | Valore | Perché |
|---|---|---|
| `X-Content-Type-Options` | `nosniff` | un file caricato non diventa uno script perché il browser indovina |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | l'indirizzo di una pagina interna non finisce nei log di terzi |
| `X-Frame-Options` | `DENY` | nessuno incornicia l'applicazione per rubare clic |
| `Content-Security-Policy` | `frame-ancestors 'none'` | la stessa cosa detta ai browser moderni |
| `Strict-Transport-Security` | `max-age=31536000` | un anno di solo HTTPS. Senza `includeSubDomains`: i sottodomini di un dominio del cliente possono servire altro |
| `Permissions-Policy` | camera, microfono, posizione, pagamenti disattivati | non ci servono, e disattivarli chiude la porta a uno script incorporato |

**Eccezioni dichiarate**: `/book` (il widget di prenotazione) e `/m/<locale>` (il menu
pubblico) sono fatti per stare in un iframe sul sito del ristorante. Lì `X-Frame-Options` non
si manda e la CSP dice `frame-ancestors *`; tutte le altre intestazioni valgono anche per
loro. Applicare `DENY` a tutto avrebbe spento il widget e il menu su ogni sito cliente, in
silenzio.

Sono pagine di sola lettura, o con un modulo che al massimo scrive una prenotazione: non c'è
un'azione privilegiata da rubare con un clic. Il **portale Wi-Fi resta protetto** proprio per
la differenza opposta — è un modulo che raccoglie un contatto, quindi incorniciabile vuol dire
ingannabile, e nessun router ha bisogno di metterlo in una cornice: lo apre come pagina.

## Cosa resta aperto

Per gravità, non per difficoltà:

1. **La password del Wi-Fi sta in chiaro in tabella** (`Venue.wifiPassword`) e la riceve
   chiunque compili il modulo del portale. È deliberato: è la password della *rete ospiti*,
   quella che si dà a voce a chi entra nel locale, e in Impostazioni c'è scritto di non usare
   la rete a cui è collegata la cassa. Resta una cosa da sapere prima di configurarlo.
2. **Nessuna verifica del contatto sul widget pubblico.** Resta il buco vero: email e telefono
   inventati passano, e la difesa che li fermerebbe è un codice via email o SMS — cioè un
   fornitore che oggi non c'è. Non l'ho sostituita con un indovinello.
   Quello che invece c'è, dall'8 settembre: **idempotenza** (un doppio tocco su una rete lenta
   prenota una volta, e l'unicità la garantisce un indice, non un controllo che due richieste in
   parallelo non si vedono), **riconoscimento del doppione identico** (stessa persona, stesso
   orario, stessi coperti → si restituisce quella che c'è già), e un **campo trappola** che
   risponde con un rifiuto generico — mai con una finta conferma: far credere di avere un tavolo
   che non esiste è una bugia anche verso un programma.
   La regola che ha guidato tutte tre: *una difesa che rifiuta una prenotazione vera costa più del
   problema che risolve*. Nessuna euristica sul contenuto — nomi «strani», domini «sospetti» —
   solo fatti verificabili.
3. **`force: true` su `assign-table` resta disponibile a chiunque abbia `manage_bookings`**
   (quindi anche a `WAITER`). Il motivo obbligatorio ora c'è — allineato alla creazione
   forzata e alle tavolate — quindi ogni forzatura ha un perché scritto, un nome e un'ora nel
   registro. Resta aperto se questo gesto debba essere di un ruolo più alto.
4. **Nessun 2FA e nessun recupero password.** La scadenza della sessione invece ora è
   dichiarata: **sette giorni**, con rinnovo silenzioso ogni ventiquattr'ore di uso
   (`src/lib/auth.ts`). Prima valeva il valore per difetto di NextAuth — trenta giorni — su
   token che non si possono revocare. Sette giorni è un compromesso dichiarato: in un
   ristorante il dispositivo è condiviso e chi apre il servizio non deve trovare la schermata
   d'accesso ogni sera, ma un mese è troppo per una cosa che non si può richiamare indietro.
   La **revoca vera** resta aperta: richiede le sessioni sul database o una versione del token
   confrontata a ogni richiesta.
4-bis. **Non si può dare accesso a una persona del team, né toglierlo.** `VenueMembership` la
   scrive solo il seed: in tutto il prodotto non esiste una rotta che la crei o la cancelli.
   Non è un buco di sicurezza in senso stretto — chi non ha un locale non vede niente, e il
   controllo si rifà a ogni richiesta — ma è il motivo per cui oggi un ristorante non può dare
   l'accesso al suo maître, e per cui la matrice dei ruoli qui sopra è più teorica di quanto
   sembri.
5. **Credenziali demo note** (`owner@tavolo.demo`) su un ambiente pubblico.
6. **Una `Content-Security-Policy` completa sugli script.** Le intestazioni ci sono
   (`nosniff`, `Referrer-Policy`, `X-Frame-Options: DENY` con l'eccezione dichiarata di
   `/book`, HSTS, `Permissions-Policy`), ma la CSP dice solo chi può incorniciare le pagine.
   Una policy vera sugli script richiede un nonce generato a ogni richiesta e passato per
   tutto il rendering di Next: scritta a mano oggi, o rompe l'applicazione o contiene
   `'unsafe-inline'` e non protegge da niente.
7. **Cancellazioni distruttive** su ospiti, camerieri e tavoli: nessun ripristino possibile,
   solo la traccia nel registro.

8. **Nessuna conferma dal fornitore email.** Una campagna programmata viene consegnata a
   Brevo e l'esito non torna indietro: l'applicazione dice «consegnata al fornitore» e rimanda
   al suo pannello, che è la verità disponibile. Sapere *a quanti* è arrivata richiede
   interrogare il fornitore, quindi la sua chiave.

## Dare a una persona i suoi dati

`src/server/guest-export.ts`, dalla scheda del cliente, solo `manage_venue`, registrato nel
registro azioni. Un JSON scaricato come allegato, `cache-control: no-store`.

Sono gli **stessi sette posti** della cancellazione, letti invece che svuotati — e ci sono
dentro anche le **note scritte dal personale** e il motivo di un eventuale blocco: sono dati
su quella persona, e il fatto che siano scomodi da mostrare non li rende di qualcun altro. Un
export che tiene fuori le note riservate non è un export, è una vetrina.

Restano fuori gli identificativi interni: non dicono niente a chi legge e non sono dati suoi.

## Cancellare i dati di una persona

`src/server/guest-erasure.ts`, dalla scheda del cliente, solo `manage_venue`, motivo scritto
obbligatorio, registrato con nome e ora.

**Non si cancella la riga dell'ospite**: cancellarla porterebbe via le prenotazioni collegate
— quindi i coperti, quindi l'incasso — e il locale scoprirebbe a fine mese di aver perso tre
serate perché una persona ha esercitato un suo diritto. La riga resta, vuota e segnata.

I dati stanno in **sette posti**, non uno, e la funzione li tocca tutti dentro una sola
transazione:

| Dove | Cosa sparisce | Cosa resta |
|---|---|---|
| `Guest` | nome, cognome, email, telefono, compleanno, allergie, note riservate, preferenze, etichette, consenso | visite, spesa, no-show, ultima visita (numeri sull'andamento, non su di lei) |
| `Booking` | `notes`, `internalNotes` | data, coperti, stato, tavolo |
| `WifiLead` | nome, email, telefono, IP, dispositivo | che un accesso c'è stato, e quando |
| `MessageLog` | destinatario, oggetto, anteprima | che è stato inviato e quando (serve a non rimandarlo) |
| `ConsentLog` | IP, dispositivo | la scelta e la data: è la prova di cosa è stato acconsentito |
| `SurveyResponse` | il commento scritto di suo pugno | il voto |
| `Order` | nome, telefono, email, note scritte sul conto | il conto e le sue righe: incasso e costo del cibo |

È **irreversibile**, e viene detto prima: i dati vengono sovrascritti, non spostati in un
archivio. Prima di confermare, la finestra mostra due elenchi — cosa sparisce e cosa resta —
perché la paura di chi preme quel pulsante è di cancellare un mese di incassi, e non succede.

## Unire due schede della stessa persona

È l'unica operazione che **cancella una riga di anagrafica**, e per questo ha le sue regole.

**Chi può**: solo un Manager (`manage_venue`). Chi accoglie durante il servizio non deve
poterla fare per sbaglio da un menù.

**Su cosa si propone**: stessa email o stesso telefono, normalizzati, dentro lo stesso
locale. Mai su somiglianza di nomi — due «Marco Rossi» in un ristorante di quartiere sono due
persone, e unire le schede sbagliate significa mostrare a qualcuno le note riservate di un
altro. La verifica del segnale in comune la rifà il server: un controllo che sta solo
nell'interfaccia non è un controllo.

**Cosa non si può unire**: una scheda **anonimizzata**. I suoi dati sono stati cancellati su
richiesta della persona; attaccarli a un'altra riga sarebbe disfare una cancellazione.

**Il consenso al marketing**: vale **l'ultima parola detta**. I `ConsentLog` delle due schede
si uniscono, e se il più recente è una revoca la persona resta fuori dal marketing anche se
l'altra scheda diceva sì. Senza nessun consenso registrato si tiene il sì che una delle due
aveva: è un permesso raccolto davvero, e cancellarlo per un'unione sarebbe perderlo.

**Cosa resta scritto**: l'unione finisce nel registro delle azioni con chi l'ha fatta, quale
scheda è stata assorbita e cosa si è spostato. È l'unico posto dove quella scheda continua a
esistere.

## Se trovi una vulnerabilità

Scrivi a moncalvo@blackfoxmedia.agency prima di aprire una issue.
