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
src/app/b/[token]/     la pagina dell'ospite: conferma o annulla dal promemoria
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

### Gli avvisi sono regole, non un modello

`src/server/service-intelligence.ts` incrocia prenotazioni, tavoli e lista
d'attesa per dire cosa sta per andare storto. Sette condizioni scritte a mano,
con soglie in cima al file e fissate da un test.

Deliberatamente **non** un modello generativo: qui i dati sono esatti, e un
modello aggiungerebbe solo incertezza. Una regola si può leggere, discutere e
correggere — se un ristoratore dice «questo per me non è un problema», si
cambia una costante. La stessa scelta che il brief chiede al §17.

La qualità di questo strato si misura sul **silenzio**: un motore che avvisa
sempre non avvisa mai. Per questo esiste un test che verifica che una sala
tranquilla non produca niente, e che lo stesso tavolo non venga proposto a tre
gruppi diversi.

### Due piante, due scopi

`/floor` è la pianta con cui si **configura** il locale: disegnare, spostare,
assegnare il personale. `/service/room` è la sala che si **guarda** durante il
servizio: chi c'è su ogni tavolo, da quando, quanto manca.

Sono due componenti distinti di proposito. Il renderer del servizio non
trascina e non salva niente: posiziona i tavoli in percentuale dei limiti del
disegno, col testo **dentro** il riquadro. Era il difetto della pianta
precedente in modalità operativa — le pillole appese sotto i tavoli vicini si
accavallavano fino a coprire i posti.

### Lo stato del servizio è calcolato, non salvato

`src/server/service.ts` costruisce la fotografia di «cosa sta succedendo
adesso» **derivando tutto dall'ora**: «in ritardo» è una prenotazione confermata
il cui orario è passato oltre la tolleranza, «da liberare» è una seduta la cui
durata prevista è scaduta. Nessuna colonna nuova nel database.

Uno stato calcolato non può andare fuori sincrono con la realtà; una colonna
sì — basta un aggiornamento che non passa dal posto giusto. Il costo è che i
confini (tolleranza, soglie) vanno fissati da un test, perché un errore di
segno qui dichiara assente un ospite che sta parcheggiando.

### Una sola risposta a «quali tavoli sono liberi»

`src/server/table-search.ts` risponde a «quali tavoli possono accogliere N
persone a quest'ora». La usano la lista d'attesa e il walk-in, e la useranno i
suggerimenti di seating. Non contiene regole proprie: interroga il motore di
disponibilità tavolo per tavolo. Costa una query per tavolo — decine, non
migliaia — e in cambio non può sfasarsi dalle regole vere.

### Un solo punto d'uscita per i messaggi

`src/server/messaging/send.ts`. Registra su `MessageLog` prima di inviare, così
un processo interrotto lascia comunque la traccia del tentativo; `bookingId` +
`kind` impediscono il doppio invio. I canali stanno in `PROVIDERS`: aggiungerne
uno non tocca il resto, e finché non c'è il fornitore chi chiama riceve
`no_channel` invece di un silenzio.

Ci sono due uscite: `enqueueMessage` (la normale: scrive la riga come `QUEUED`
e lascia consegnare alla coda) e `sendMessage` (immediata, per quando serve
sapere subito com'è andata). Entrambe passano dagli stessi controlli e scrivono
la stessa riga.

**La risposta del fornitore si legge.** Il client di Resend non solleva un
errore quando l'invio viene rifiutato: torna un oggetto con `error` dentro. Il
codice guardava solo `data?.id ?? null` e considerava riuscito tutto: con una
chiave non valida i promemoria risultavano «inviati». `esitoResend` ora
pretende un identificativo e solleva altrimenti — trovato provando dal vivo
con una chiave finta, non ragionando sul codice.

### Il lavoro lungo sta in una coda, su Postgres

`src/server/jobs/queue.ts` più il cron `/api/cron/jobs`, ogni minuto.

L'invio di una campagna sincronizzava i contatti col fornitore uno per uno
**dentro** la richiesta del browser: trecento destinatari e la richiesta
scadeva a metà, lasciando parte dei contatti sincronizzati, nessun invio
partito e nessun errore mostrato. Le regole che rendono la coda affidabile
senza aggiungere un servizio esterno:

- **chi chiede non aspetta**: l'API scrive una riga e risponde;
- **un lavoro non parte due volte**: si prende in carico con una scrittura
  condizionata (`PENDING` → `RUNNING`); chi vede zero righe aggiornate sa che
  qualcun altro è arrivato prima. Due cron sovrapposti sono innocui;
- **un lavoro può cedere il turno**: `{ again: true }` lo rimette in coda, e
  così un budget di venticinque secondi basta anche per mille destinatari. I
  rinvii si contano a parte dai tentativi, altrimenti un invio lungo si
  esaurirebbe solo per essere stato lungo;
- **niente lavori appesi**: una riga rimasta `RUNNING` oltre dieci minuti torna
  in coda. I tentativi si contano quando il lavoro *parte*, non quando finisce:
  altrimenti un lavoro che fa morire il processo riproverebbe per sempre;
- **un errore definitivo resta visibile**: tentativi esauriti significa
  `FAILED` in tabella con il motivo, e un avviso al locale. Un invio che non è
  partito e sparisce è peggio di uno che non è partito e si vede.

L'invio di una campagna è ripartibile in ogni punto: i contatti già
sincronizzati durante quel lavoro non si risincronizzano (è perché il momento
di messa in coda sta nel payload), la campagna presso il fornitore si crea una
volta sola, e se il processo muore **dopo** aver dato l'ordine di invio, al
giro dopo la campagna finisce in «non riuscita» con scritto perché — mai un
secondo invio alla cieca a clienti veri.

### Lo stato di una prenotazione lo decide il canale, non il client

`BookingInput.status` **non** viene usato in creazione: lo stato dipende dalla
fonte (`determineBookingStatus`), altrimenti una prenotazione dal widget
pubblico potrebbe dichiararsi già confermata. Chi sa di più — la lista
d'attesa e il walk-in, che stanno accomodando qualcuno adesso — passa da
`BookingWriteOptions.status`, che non è raggiungibile da nessuna richiesta.
Stessa forma di `skipAvailabilityCheck`, che ora richiede anche un motivo
scritto (`forceReason`) e finisce nel registro come azione distinta.

### Un regalo automatico è intestato, non condiviso

Quando un'automazione allega un omaggio, per ogni destinatario nasce un coupon
**suo**: `Coupon.guestId` valorizzato, un solo uso, con una scadenza. La
scelta fra codice personale e codice unico per tutti non è una preferenza:
un codice condiviso dentro un'email di compleanno viene girato agli amici, e
il ristorante si ritrova a pagare una promozione che non ha deciso. Il costo è
una riga di coupon per destinatario — cinquanta compleanni al mese fanno
seicento righe l'anno, che non sono un problema.

Due conseguenze pratiche:

- **il coupon si prepara prima del messaggio.** Se non riesce, quella persona
  si salta: un'email che promette un regalo con un codice che non esiste è
  peggio di nessuna email;
- **un coupon già attivo e non usato si riusa** invece di crearne un secondo.
  Il divieto di ripetizione dei messaggi rende il caso raro, ma «raro» non è
  «impossibile» e due coupon per lo stesso regalo sono uno sconto doppio.

Nell'invio di prova il codice è dichiaratamente finto (`CODICE-DI-PROVA`):
creare un coupon vero per una prova vorrebbe dire regalare qualcosa a nessuno.

### Una percentuale che non si estrapola

`src/server/food-cost.ts`.

La tentazione, in un calcolo di food cost, è estendere: se il costo è
dichiarato su metà dei piatti venduti, la percentuale «del locale» si ottiene
moltiplicando quella metà per due. Sarebbe una moltiplicazione, non una
misura, e un ristoratore che ci crede alza i prezzi sbagliati.

Quindi la percentuale si calcola **solo sulla parte coperta**, e accanto c'è
scritto quanta parte è coperta: «valgono sui 91 € di cui conosciamo il costo,
non su tutto l'incasso». I piatti senza costo dichiarato non entrano nel
calcolo e non spariscono — stanno in un elenco a parte, che è anche la lista
di cose da completare. Il fuori carta (una riga scritta a mano, senza piatto
del menu) non può avere un costo, e viene contato come tale invece di essere
ignorato in silenzio.

E nessuna soglia inventata su cosa sia un margine «buono»: cambia troppo fra
un antipasto e una bottiglia, e un colore rosso deciso da noi sarebbe un
giudizio travestito da dato. L'elenco è ordinato dal margine più alto al più
basso, e questo risponde a due domande con una lista sola.

### Il prezzo si fotografa quando si ordina

`src/server/orders.ts`.

La riga del conto porta **nome e prezzo copiati dal menu in quel momento**
(`OrderItem.name`, `priceCents`). Alzare il prezzo di un piatto domani non
deve riscrivere il conto di ieri, e un conto che cambia da solo dopo essere
stato pagato è un problema contabile, non un dettaglio.

Il **totale si ricalcola dalle righe** dentro la stessa transazione che le
cambia. `Order.totalCents` resta aggiornato perché chi legge il database non
trovi un numero falso, ma la verità sono le righe: è la stessa disciplina dei
coupon e dei contatori degli ospiti.

Tre decisioni che restano scritte:

- **un conto solo per tavolo.** Due camerieri che premono «conto» sullo stesso
  tavolo si ritrovano nello stesso conto; altrimenti a fine serata ci sono due
  totali e nessuno sa quale sia quello giusto;
- **un conto vuoto non si chiude.** Sarebbe un incasso da zero euro in mezzo
  ai dati veri, indistinguibile da un tavolo che non ha consumato niente. Se
  era uno sbaglio, si annulla — e l'annullato resta in tabella;
- **il fuori carta si scrive a mano.** Costringere a inventare un piatto nel
  menu per batterlo sul conto vorrebbe dire sporcare la carta che legge il
  cliente.

`Order` era modellato per l'asporto: `customerName` e `phone` obbligatori,
nessun legame con la prenotazione. Per un conto al tavolo il cliente **è** la
prenotazione, e l'unico modo di aprirne uno sarebbe stato scrivere un nome e un
telefono finti. Aggiunto `bookingId`, resi facoltativi quei due campi: rendere
una colonna facoltativa non porta via niente a nessuno.

**E qui l'applicazione smette di stimare.** Appena un conto si chiude, la
Panoramica mostra l'incasso vero al posto della stima, e cambia anche
l'etichetta: «Incasso» invece di «Incassi stimati». Le due cifre non si
sommano e non si mescolano — sono risposte a due domande diverse. Per la
stessa ragione il confronto con ieri sparisce quando il numero è vero: ieri è
una stima, e scriverci «▲ 20%» sarebbe un paragone fra due cose diverse
presentato come una crescita.

### Gli allergeni non si scrivono a mano

`src/server/menu.ts`.

Sono un elenco chiuso: i quattordici a dichiarazione obbligatoria del
Regolamento UE 1169/2011, con le loro chiavi. Un campo libero produce
«glutine», «Glutine», «GLUTINE» e «farina di grano» nella stessa carta, e un
cliente celiaco non può fidarsi di una ricerca che non trova la parola giusta.
Stessa forma per i regimi alimentari, che sono un'altra domanda («come si
mangia») e un altro elenco.

Il menu è il primo anello di **menu → ordini → costo del cibo**, e serve a
qualcosa da solo: è quello che il cliente legge dal QR sul tavolo. La pagina
pubblica mostra **solo** categorie attive e piatti disponibili — un piatto
finito non si legge, così nessuno lo ordina e nessuno resta deluso — e non
contiene costi né margini, che sono numeri del locale.

Due cose che non si cancellano:

- **una categoria con dei piatti**: la cascata porterebbe via anche quelli;
- **un piatto già ordinato**: il conto di una serata chiusa sopravvive (la
  riga d'ordine ha la sua copia di nome e prezzo), ma si perderebbe il
  collegamento, cioè la storia di quante volte quel piatto è stato venduto —
  che è precisamente ciò che serve al costo del cibo.

In entrambi i casi il rimedio è disattivare, e il messaggio d'errore lo dice.

E una nota sul margine: dove il costo è dichiarato, il margine è l'unico
numero in euro di questa applicazione che **non** è una stima. Prezzo e costo
li scrive il locale; non li deduciamo da nulla.

### Un coupon non si usa più volte di quelle previste

`src/server/coupons.ts`.

La parte difficile di un coupon non è crearlo, è il momento in cui viene usato:
con il cliente al tavolo che aspetta, serve una risposta in un secondo e
nessun uso in più di quelli previsti. I controlli stanno **dentro** una
transazione serializzabile — due camerieri che passano lo stesso codice nello
stesso istante da due tablet non devono poter superare il tetto, ed è lo stesso
motivo per cui l'assegnazione dei tavoli è serializzabile. C'è una prova che
lancia due utilizzi in parallelo e verifica che ne passi uno.

Tre scelte che vale la pena conoscere:

- **la verità sugli utilizzi sono le righe di `CouponRedemption`**, non il
  contatore `redemptionCount`. Il contatore si aggiorna nella stessa
  transazione, così chi guarda il database non legge una bugia, ma i controlli
  contano le righe: in questo progetto i contatori scollegati dai fatti hanno
  già fatto abbastanza danni;
- **«scaduto» si calcola dalle date**, non si scrive nello stato: `status` è
  quello che ha deciso il locale (attivo, in pausa, archiviato), la scadenza
  dipende dall'orologio. «Esaurito» invece è un fatto compiuto e si può
  scrivere;
- **una funzione sola decide e mostra** (`couponUsability`), usata sia
  dall'elenco sia dal momento dell'uso. Con una distinzione che il primo
  collaudo dal vivo ha reso necessaria: valutare *in generale* non è come
  valutare *per una persona*, e nell'elenco — dove un cliente non c'è — i
  limiti per persona non si possono giudicare. Senza quella distinzione ogni
  coupon compariva «non valido».

### Un tavolo non si dà a due gruppi, nemmeno per sbaglio

`assignBookingToTable` e `combineTablesForBooking` in `src/server/booking-floor.ts`.

La verifica dei conflitti guardava solo `tableId`: il secondo tavolo di una
tavolata risultava **libero**, e si poteva assegnare a qualcun altro. Il motore
di disponibilità lo sapeva (legge anche `combinedTableIds`), questa strada no —
due verità su cosa sia occupato, e quella sbagliata era proprio quella che usa
lo staff durante il servizio. Ora c'è una funzione sola (`trovaConflitto`) che
guarda entrambi i campi.

E spostare una prenotazione su un tavolo singolo **scioglie la tavolata**: senza
questo, gli altri tavoli restavano attaccati a una prenotazione che era
altrove, cioè occupati da nessuno per il resto della serata.

Le regole per unire stanno tutte in un posto: almeno due tavoli, stessa sala,
solo tavoli dichiarati unibili (`Table.combinable`, un campo che esisteva e che
nessuno leggeva), posti sufficienti — o un motivo scritto, come per la
forzatura della disponibilità.

### Il merito di una campagna si guadagna, non si dichiara

`Booking.campaignId` più `getCampaignAttribution` in `src/server/campaigns.ts`.

Il link dentro l'email si porta dietro la campagna (`/book?venue=…&c=…`), il
widget lo rimanda al server, e la prenotazione che nasce da quel clic la
ricorda. Tre vincoli, e ognuno risponde a un modo diverso di mentire con i
numeri:

- **la campagna nel link si verifica.** Arriva dal mondo esterno: prima di
  finire in tabella si controlla che sia una campagna di *quel* locale. Un
  identificativo inventato non attribuisce niente — e non fa fallire la
  prenotazione, perché un link storto non deve impedire a un cliente di
  prenotare;
- **il merito ha una scadenza** (30 giorni). Chi riapre quella email a marzo e
  prenota non l'ha prenotata per quella email. Senza finestra, il merito di
  una campagna cresce per sempre: è il modo più comune di far sembrare
  efficace il marketing;
- **una disdetta non ha portato nessuno a tavola.** Disdette e assenze
  restano fuori dal conteggio, come nell'occupazione e nella previsione: la
  stessa popolazione in tutta l'applicazione.

Il valore in euro è coperti per scontrino medio dichiarato, e si mostra solo
se quel numero c'è: chiamarlo «incasso» sarebbe la stessa bugia di
`Guest.totalSpend`.

### Un tetto che non si vede è una bugia

`listGuests` aveva `take: 200` e nient'altro: un locale con cinquecento
clienti ne vedeva duecento e **non lo sapeva**. Nessun messaggio, nessun
pulsante — i trecento restanti semplicemente non esistevano, e chi cercava
qualcuno che era in archivio concludeva che la ricerca fosse rotta.

Un tetto ci vuole: una tabella da diecimila righe non si disegna. Quello che
non ci vuole è tacerlo. Ora la funzione torna anche il **totale**, la pagina
scrive «da 1 a 50 di 312», e una pagina oltre l'ultima riporta all'ultima
invece di mostrare una schermata vuota che sembra un archivio svuotato.

Stessa storia per le etichette: si leggevano quelle dei primi cinquecento
ospiti, quindi un'etichetta usata solo dai clienti più vecchi **spariva dal
filtro**. Una domanda così è una riga di SQL (`unnest` sull'array, distinti,
ordinati), non un ciclo su un campione.

### Quando qualcosa si rompe, non si perde la navigazione

`src/app/(app)/error.tsx` e `src/app/error.tsx`.

Prima non c'era nessun confine d'errore: un'eccezione dal server mostrava la
schermata grezza di Next — sfondo bianco, testo inglese, nessuna via d'uscita
oltre al pulsante del browser. Nel mezzo di un servizio, con un tablet in
mano, quella schermata vuol dire «il programma è morto».

Ora restano tema e navigazione, c'è un pulsante che riprova senza ricaricare
tutto (`reset()` rimonta solo la parte caduta) e una via d'uscita verso la
Panoramica. Il messaggio tecnico non si mostra — a chi serve è nei registri —
ma il codice dell'errore sì, piccolo, perché è quello che permette di
ritrovarlo. Fuori dall'applicazione (widget pubblico, link dell'ospite) il
tono cambia: lì chi legge è un cliente del ristorante, e la cosa importante da
dirgli è che **nessuna prenotazione è stata registrata**.

### La previsione dice anche quanto fidarsi

`src/server/forecast.ts`.

Il modello è quello degli alberghi, e sta in una riga: **a tre giorni dal
servizio, di solito hai già il 60% dei coperti finali** — quindi se oggi ne hai
42, la sera finirà intorno a 70. Non serve niente di più complicato, e
soprattutto niente che non si possa raccontare a un ristoratore: un numero di
cui non capisci la provenienza o lo ignori o ci compri la spesa.

Tre freni sulla falsa precisione:

- **si confrontano giorni comparabili**: un sabato con i sabati. In un
  ristorante il giorno della settimana spiega quasi tutto;
- **sotto quattro giorni comparabili non si prevede**, e la schermata lo dice.
  Con due o tre il numero c'è ma è dichiarato debole;
- **non si divide per una quota minuscola**: a dieci giorni dal servizio il
  libro può essere al 3%, e dividere per 0,03 amplifica il rumore. Sotto una
  soglia si passa alla mediana storica di quel giorno, dicendolo.

E due cose imparate guardando i numeri veri invece del codice: quando la quota
già prenotata è vicina a uno, dire «hai già il 100% dei coperti finali» sembra
un errore del programma — vuol dire «da te si prenota in anticipo», e va detto
così. E le medie storiche vanno calcolate **solo sulle settimane in cui il
locale ha davvero registrato qualcosa**: dividere per otto settimane quando ce
ne sono quattro di dati dimezzava l'occupazione, e le due tabelle della stessa
schermata si contraddicevano.

### Le anteprime non possono cancellare dati di produzione

`scripts/migrate-safe.ts` più `src/lib/migration-safety.ts`.

Su Vercel il database è lo stesso per produzione e anteprime, e il build
esegue le migrazioni: quindi l'anteprima di una richiesta di modifica migrava
il database di produzione, prima che nessuno avesse fuso niente. Non è un caso
di scuola — è come le migrazioni delle fasi 0-4 sono finite in produzione,
scoperto solo controllando prima di pubblicare.

Il confine è tracciato dove sta il pericolo vero: una migrazione che
**aggiunge** passa anche in anteprima (il codice vecchio la ignora), una che
**porta via dati** solo su una pubblicazione vera. In anteprima, se fra le
migrazioni in attesa ce n'è una distruttiva non se ne applica **nessuna** e il
registro del build lo scrive: l'anteprima gira sullo schema attuale e le parti
nuove possono rompersi. Un'anteprima rotta si vede, dei dati cancellati no.

Una prova esamina tutte le migrazioni del repo, non solo esempi: la prima
distruttiva legittima farà fallire i test, e va dichiarata a mano. È attrito
voluto.

### Le automazioni sono un catalogo, non un editor

`src/server/automations/catalogue.ts` (cosa esiste) e `engine.ts` (come parte).

Un costruttore «se questo allora quello» sembra più potente e in un gestionale
per ristoranti resta vuoto: chi apre alle 19 non progetta diagrammi. Peggio,
una regola scritta di fretta scrive a tutti la cosa sbagliata. Quindi le
automazioni sono tre, scritte nel codice, e aggiungerne una è un commit —
dove si può ragionare e provare.

La domanda progettuale non è «cosa sanno fare», è **come si evita che
scrivano a tutti tre volte**. Cinque difese, tutte con un test:

1. **la finestra è stretta.** «Chi non torna da sessanta giorni» guarda solo
   chi ha *appena* superato la soglia (sette giorni di finestra), non
   l'archivio: accendere l'automazione non fa partire un diluvio. La finestra
   larga sette giorni con un passaggio al giorno significa anche che se il
   lavoro pianificato salta un giorno, nessuno viene saltato;
2. **una volta per periodo per persona** (`cooldownDays`);
3. **silenzio dopo qualunque nostro messaggio** (`SILENZIO_GIORNI`): chi ieri
   ha ricevuto «com'è andata?» oggi non riceve l'invito a tornare. È la regola
   che tiene insieme moduli che non si conoscono fra loro;
4. **un tetto per esecuzione** (50): un errore di configurazione fa danni a
   cinquanta persone, non a mille, e il resto slitta al giorno dopo;
5. **il numero si vede prima di accendere**, con i nomi e il motivo. Anteprima
   e invio passano dalla stessa funzione (`resolveDestinatari`): se fossero due
   strade diverse, l'anteprima sarebbe una stima.

E le automazioni nascono **spente**, senza un momento di installazione: la
riga di configurazione si crea da sé la prima volta che serve.

Il motore non manda niente: mette in coda. Il cron giornaliero accoda
un lavoro per automazione accesa, quel lavoro accoda i messaggi, e la coda li
consegna — quindi tentativi, errori visibili e nessun timeout, gratis.

### Le date pure restano stringhe

Un giorno di servizio è `"2026-09-07"`, non un `Date`. `shiftDateKey` fa i conti su date pure,
così la notte del cambio d'ora non salta un giorno.

## Cosa manca, e si sa

- **Il database delle anteprime è ancora quello di produzione.** C'è il freno sulle
  migrazioni distruttive (sopra), ma il codice di un'anteprima **legge e scrive dati veri**:
  chi prova una funzione in anteprima sta toccando i clienti del ristorante. La soluzione è
  un ramo di database per anteprima (Neon lo sa fare); il freno serve finché non c'è.
- **La coda non ha priorità né limiti per fornitore.** Prende i lavori in ordine di
  scadenza, venticinque per giro: se una campagna grossa è in mezzo, un promemoria aspetta
  qualche minuto. Basta oggi; con più locali serviranno una priorità e un tetto di chiamate
  al minuto per fornitore.
- **Le campagne programmate restano «programmate».** L'orario lo tiene il fornitore, e
  nessuno riporta indietro il momento in cui è partita davvero: lo stato non diventa mai
  «inviata». Si risolve leggendo le statistiche del fornitore, non con un altro cron.
- **Le prenotazioni hanno ancora un tetto fisso** (`take: 200` in `listBookings`). Sulla
  giornata è generoso — duecento prenotazioni in un giorno sono un locale grande — ma su un
  intervallo ampio i dati spariscono in silenzio come succedeva agli ospiti.
- **Nessuna cache.** 17 pagine su 25 sono `force-dynamic`, nessun `revalidate`.
- **Soft delete a metà.** `Booking` e `Payment` hanno `deletedAt`/`deletedBy` ma il codice
  cancella davvero, e le liste non filtrano quei campi. Ospiti, camerieri e tavoli non hanno
  nemmeno i campi. Chi implementa il ripristino deve fare entrambe le cose insieme.
