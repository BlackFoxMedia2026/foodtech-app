# Tavolo — dove siamo, sezione per sezione

**Data:** 8 settembre 2026 (aggiornato dopo i due audit della notte) · **Repository:** `BlackFoxMedia2026/foodtech-app` · **Produzione:** foodtech-app.vercel.app

Questo documento è scritto per essere letto da chi non ha accesso al codice e deve capire lo stato reale del prodotto: cosa funziona per intero, cosa funziona a metà, cosa non esiste, e — soprattutto — **perché** ogni cosa è così. È autoconsistente: non serve aprire il repository per seguirlo.

Gli screenshot di ogni pagina e di ogni funzione stanno in `docs/audit-2026-09/audit-completo/` (25 pagine desktop, 7 su telefono, 16 finestre e funzioni, 6 pagine pubbliche).

---

## 1. Cos'è Tavolo

Un gestionale per ristoranti, in italiano, pensato per essere usato **durante il servizio** da persone che hanno una mano occupata. Non un CRM generico adattato alla ristorazione: le sue schermate rispondono alle domande che si fanno in sala.

Copre cinque mestieri diversi che in un ristorante convivono:

1. **prendere le prenotazioni** (telefono, sito, widget incorporabile, lista d'attesa, walk-in);
2. **governare il servizio** (chi è arrivato, chi è a tavola, quale tavolo si libera, cosa fare adesso);
3. **conoscere i clienti** (chi torna, chi non si presenta, chi ha allergie, quanto vale);
4. **far tornare la gente** (campagne, automazioni, coupon, gift card, punti, Wi-Fi in cambio del contatto);
5. **sapere se il locale guadagna** (conto al tavolo, costo del cibo, margine per piatto, costo delle assenze).

Multi-locale per costruzione: un'organizzazione può avere più ristoranti, ogni utente ha un ruolo per locale.

---

## 2. Com'è fatto

| | |
|---|---|
| Framework | Next.js 14, App Router, componenti server |
| Linguaggio | TypeScript |
| Database | PostgreSQL (Neon), Prisma 5.22 |
| Pubblicazione | Vercel, `main` → produzione automatica |
| Autenticazione | credenziali + bcrypt + JWT (NextAuth) |
| Email | Resend, **spento** (manca la chiave) |
| Pagamenti | schema pronto, **non implementati** |
| Lavori pianificati | 5 cron Vercel |

**Numeri, oggi:** 37 pagine · 107 rotte API · 112 moduli fra `server/` e `lib/` (~18.400 righe) · 166 componenti · **631 test in 39 file** · 17 migrazioni · 73 modelli di dati e 64 enumerazioni.

I conteggi sono quelli che si ottengono contando i file: `find src/app -name page.tsx`, `find src/app/api -name route.ts`, e così via. Un numero che non si può rifare contando non serve a nessuno.

I cinque lavori pianificati: smaltimento della coda ogni minuto, promemoria ogni 15 minuti, scadenze contratti alle 6:00, richieste di sondaggio alle 11:00, automazioni alle 10:00. **Tutti si rifiutano di partire se `CRON_SECRET` non è configurato** — un endpoint che scrive ai clienti e risponde a chiunque non è un endpoint.

---

## 2-bis. Cosa è cambiato nella notte fra il 7 e l'8 settembre

Due campagne di audit — una sul prodotto (confronto con CoverManager e
Pienissimo), una sull'interfaccia — hanno prodotto un elenco di cose da fare.
Sono state fatte tutte quelle che non dipendono da una chiave o da un
fornitore. In ordine di valore:

1. **La gift card ferma** — quarta automazione. Denaro già incassato e cena mai
   servita: passati i giorni scelti dal locale, chi ha una carta mai toccata
   riceve il promemoria. Scrive **solo** a chi il locale conosce già e ha dato
   il consenso.
2. **Il posto liberato da una disdetta** — ottava regola del centro controllo.
   Quando una prenotazione di oggi salta e in lista d'attesa c'è chi ci sta, lo
   dice con l'ora e il nome — dopo aver verificato che il posto sia **ancora**
   libero davvero.
3. **Il ponte verso le recensioni pubbliche, misurato.** Fino a quattro posti
   dove mandare chi risponde 9 o 10; il collegamento passa da una porta che
   conta il passaggio; in Analytics: «1 promotore è andato a scrivere una
   recensione, su 2». Si conta chi arriva alla porta, non chi scrive — e la
   pagina lo dice.
4. **Menu engineering** — stelle, cavalli, enigmi, cani, senza nessun dato
   nuovo. «Rende» è il margine per piatto, non la percentuale. Sotto tre
   vendite un piatto resta fuori, e sotto quattro piatti o venti vendite non si
   classifica niente.
5. **La finestra di prenotazione** — da quanti giorni prima si prenota online e
   quanto preavviso serve. Vale **solo per il canale pubblico**: al telefono si
   accetta fino all'ultimo minuto, altrimenti chi risponde aggira il software
   con una penna.
6. **«E allora quando?»** — davanti a un giorno pieno il widget propone i primi
   tre giorni con posto, e toccarne uno cambia data e orario in un colpo.
7. **I gruppi grandi** — oltre dodici persone il widget mostra il telefono
   invece del modulo.
8. **La lista d'attesa misurata** — coperti recuperati, conversione, attesa
   media. Risponde a «tenere una coda serve?», che era una questione di
   impressioni.
9. **L'affidabilità raccontata** — «2 su 12, l'ultima il 5 settembre» invece di
   un punteggio da 0 a 100.
10. **Quanto stanno a tavola** — la durata misurata dall'arrivo alla chiusura
    del conto, **accanto a quella impostata** sulle prenotazioni: quei 105
    minuti decidono quanti tavoli il motore vende ogni sera, ed erano una
    convenzione mai confrontata con la realtà. Più i giri per tavolo.
11. **L'overbooking, ma dichiarato** — una percentuale scritta dal locale,
    valida su ogni canale, con gli orari dentro il margine segnati **solo in
    sala**: al cliente non si racconta come il locale gestisce la propria
    capienza.
12. **Il debito delle gift card** fra i numeri d'insieme.
13. **Interfaccia**: il centro controllo non si autoaffoga più (nove avvisi
    identici diventano uno), il briefing prima del servizio in Panoramica,
    numeri detti una volta sola, il widget che chiede prima il tavolo e poi i
    dati con la data scritta per esteso, coupon con spesa minima e giorni
    validi, un traguardo nella raccolta punti, ricerca e filtri nel menu, le
    portate in cima al menu pubblico, i tavoli disegnati in scala sui posti, e
    gli scheletri di caricamento sulle sette pagine che ne erano senza.
14. **Quattro test che passavano di giorno e fallivano la notte** — misuravano il
    tempo con l'orologio del computer invece che con uno passato a mano. Per
    chiudere la questione l'intera batteria gira anche da UTC+14 e da UTC-11, e
    resta verde: è il modo di scoprirlo adesso invece che una notte a caso.

Resta fuori, e per un motivo dichiarato, la **riconferma obbligatoria**: il
promemoria che la chiederebbe non parte finché manca la chiave email, e una
riconferma che nessuno può dare sarebbe una funzione che non fa niente.

Una cosa l'audit l'aveva scritta male, e va corretta: la **personalizzazione
visiva del widget** non era assente — logo e colore d'accento del locale erano
già usati. Quello che manca è più fine (carattere, immagine di copertina), e
vale molto meno di come era stato scritto. Un audit che non si corregge quando
sbaglia diventa la fonte di verità sbagliata.

---

## 3. Le sei regole che spiegano ogni scelta

Non sono principi astratti: sono le regole con cui è stato deciso ogni singolo dettaglio, e ognuna nasce da un difetto vero trovato in questo progetto.

**① Un numero mostrato deve essere scritto da qualcuno.** All'inizio l'app mostrava «24.986 € di incassi», cinque contatori sul cliente e un tasso di conversione: nessuna riga di codice scriveva quei campi, erano valori del seed presentati come dati. Ora prima di mostrare un contatore si verifica chi lo aggiorna. Se nessuno lo aggiorna, si calcola dai fatti o non si mostra.

**② La verità sono le righe, non i contatori.** Punti fedeltà, utilizzi dei coupon, saldo delle gift card, totale di un conto: tutti calcolati sommando le righe. La colonna riassuntiva esiste e viene aggiornata **nella stessa transazione** — così chi legge il database non trova una bugia — ma nessun controllo si fida di lei.

**③ Stima e misura non si mescolano mai.** Dove c'è un conto chiuso si mostra l'incasso vero e si scrive «Incasso»; dove non c'è si mostra la stima e si scrive «Incassi stimati». Il confronto con ieri sparisce quando il numero di oggi è vero e quello di ieri è stimato: paragonare due cose diverse e chiamarlo crescita è peggio che non dire niente.

**④ Le percentuali non si estrapolano.** Se il costo delle materie prime è dichiarato su metà dei piatti venduti, il food cost si calcola su quella metà e accanto c'è scritto quanta parte è coperta. Moltiplicare per due sarebbe una moltiplicazione, non una misura.

**⑤ Una lista non taglia in silenzio.** Ogni elenco dice quanti sono in tutto («da 1 a 50 di 312»). Dove c'era un tetto fisso senza totale è stato tolto o dichiarato.

**⑥ Niente funzioni che sembrano esistere.** Un pulsante che non fa niente è peggio di un pulsante assente. Le pagine finte sono state rimosse, le funzioni a metà completate, e quando una cosa non si può fare c'è scritto perché.

---

## 4. Sezione per sezione

### 4.1 Prenotazioni — **completa**

Quattro strade d'ingresso: a mano dallo staff, dal widget pubblico incorporabile in qualsiasi sito, dalla lista d'attesa convertita, dal walk-in.

- **Disponibilità calcolata dal server**, mai dal browser: turni, capienza, durata, tavoli. 65 regole verificate in un test dedicato.
- **Tre viste**: elenco del giorno, piantina della sala con trascinamento, e **settimana** (sette giorni con coperti, prenotazioni, quante da confermare e quanto è pieno).
- **Forzatura tracciata**: si può accettare oltre orari, capienza o posti del tavolo, ma serve **un motivo scritto**, l'azione ha un nome suo nel registro (`booking.create_forced`, `booking.assign_table_forced`) e il motivo ci finisce dentro. Quattro percorsi dell'interfaccia lo facevano senza motivo: corretto oggi.
- **Tavolate**: due o più tavoli uniti per un gruppo, con controllo che siano uniti nella stessa sala e che il conflitto veda *tutti* i tavoli della tavolata — prima il secondo tavolo risultava libero e si poteva assegnare a due gruppi.
- **Il cliente si riconosce**: prenotando dal sito si cerca la persona che c'è già per email o telefono. Prima ogni prenotazione creava una scheda nuova, e con i punti fedeltà tre copie sarebbero tre saldi che non si sommano.

Cosa non c'è: **vista mese** (su trenta caselle i numeri diventano illeggibili, e «c'è posto sabato?» si risponde su una settimana), **caparra** (dipende dai pagamenti).

### 4.2 Servizio e sala viva — **completa**

La schermata che si guarda durante il servizio. Ogni prenotazione è una scheda con il gesto giusto in evidenza: accomoda, cambia tavolo, apri il conto, usa un coupon, chiama, apri la scheda.

- **Sala viva**: sette stati per tavolo (libero, prenotato, in arrivo, seduto, al conto, in ritardo, da pulire), derivati dai fatti e non da un campo che qualcuno deve aggiornare.
- **Centro controllo**: otto regole deterministiche che dicono cosa sta per andare storto — picco di arrivi, collisione sul tavolo, arrivi senza tavolo, rischio assenza (con lo storico del cliente), tavolo grande mezzo vuoto mentre una tavolata aspetta, tavolo libero per chi è in coda, posto liberato da una disdetta e offerto a chi è in lista, turno oltre la capienza. Ognuna con il posto dove andare a sistemarla. Nessuna intelligenza artificiale: regole, spiegate.
- Il selettore dei tavoli cerca i tavoli liberi **all'ora della prenotazione**, non adesso: prima alle 17:00 rispondeva «il locale è chiuso» per una prenotazione delle 19:30.
- Quando nessun tavolo è grande abbastanza lo dice con parole diverse da «sono tutti occupati», perché il rimedio è diverso (unire due tavoli).

### 4.3 Lista d'attesa — **completa**

Coda con posizione, stima dell'attesa, offerta del tavolo con link firmato e scadenza, conversione in prenotazione.

- Le offerte scadute si chiudono da sole leggendo la lista: senza, la lista mostrerebbe tre persone «avvisate» che sono andate altrove mezz'ora fa.
- **Corretto oggi:** una riga in lista da più di quattro ore non è una persona che aspetta, è una riga che nessuno ha chiuso. Esce dall'attesa media (che mostrava «538 minuti») e compare un invito a chiuderla. Non si chiude da sola: chiudere la riga di qualcuno che magari è ancora al bancone è peggio che mostrarla.

### 4.4 Clienti (CRM) — **completa**

- **Profilo calcolato dalle prenotazioni**: frequenza, abitudini (giorno e ora preferiti, dimensione del gruppo), affidabilità, ritenzione. Non da contatori.
- **Etichette automatiche con il motivo di ognuna** («4 assenze su 11 prenotazioni»), soglie in un posto solo.
- **Cronologia** con i soli eventi che esistono davvero.
- **Punti fedeltà** con saldo, valore in euro e storia dei movimenti.
- **Esportazione** e **cancellazione** dei dati su richiesta (§4.11).
- Elenco a pagine da 50 con il totale scritto.

### 4.5 Menu → conto al tavolo → costo del cibo — **completa, ed è la catena che cambia tutto**

È la parte che ha trasformato le cifre in euro da stime a misure.

- **Menu**: categorie e piatti con prezzo, descrizione, disponibilità, ordine. **Allergeni da elenco chiuso** (i quattordici obbligatori del Reg. UE 1169/2011) e regimi alimentari: non si scrivono a mano, perché un allergene scritto male è un problema sanitario. Costo materie prime facoltativo; dove c'è, mostra il **margine vero**.
- **Menu pubblico** su `/m/<locale>` per il QR sul tavolo: solo categorie attive e piatti disponibili, nessun costo, allergeni scritti per esteso (non sigle da interpretare).
- **Conto al tavolo**: si apre dalla scheda della prenotazione, si cerca un piatto e si tocca. **Il prezzo si fotografa quando si ordina**: alzare il prezzo domani non riscrive il conto di ieri. Il totale si ricalcola dalle righe. Fuori carta a mano. Un conto vuoto non si chiude (sarebbe un incasso da zero euro in mezzo ai dati veri).
- **Un conto solo per tavolo**: due camerieri che premono «conto» si ritrovano nello stesso conto.
- **Costo del cibo**: materie prime, quello che resta, e **su quanta parte dell'incasso conosciamo il costo**. Elenco dei piatti dal margine più alto al più basso — che risponde con una lista sola a «chi tiene su il conto» e «chi lo affonda». Nessuna soglia inventata su cosa sia un buon margine: cambia troppo fra un antipasto e una bottiglia.

### 4.6 Fedeltà e gift card — **completa**

- **Punti guadagnati sui conti chiusi**, dentro la transazione che li chiude: su una spesa stimata avrebbe distribuito premi su cifre inventate. Un solo accredito per conto.
- **Le due regole le dichiara il locale** (punti per euro, valore di un punto) e valgono solo insieme: mezza raccolta farebbe accumulare punti che non si possono spendere. In Impostazioni c'è scritto cosa significano in pratica: «un conto da 60 € dà 60 punti, che valgono 3,00 € — stai restituendo il 5%».
- Il valore di uno sconto in punti **si fotografa** quando si usa: cambiare domani quanto vale un punto non riscrive il conto di stasera.
- **Gift card**: denaro già incassato. Si usano in più volte e il resto resta sulla carta; non si scala più del residuo e l'errore dice quanto c'è; annullare un utilizzo scrive un movimento negativo, come in contabilità.
- **Sul conto, punti e gift card non sono righe**: le righe sono quello che è stato mangiato e servono così al costo del cibo. Sono modi di pagare, e sotto il totale compare «da incassare».
- Restano **due voci separate** perché sono due cose diverse: una gift card sposta il momento in cui il denaro è entrato, uno sconto in punti è incasso a cui si rinuncia. La Panoramica scrive quanta parte dell'incasso di oggi era già pagata, e l'elenco delle carte chiama il residuo col suo nome: **un debito verso i clienti**.
- Cosa non c'è di proposito: **la scadenza dei punti**. Far scadere i punti è cancellare una cosa che il cliente considera sua, secondo una regola che nessuno qui ha scritto.

### 4.7 Marketing — **completa (email), spenta all'invio**

- **Campagne email** con segmenti che filtrano su dati veri (il filtro sulla spesa, che leggeva un campo mai aggiornato, è stato rimosso).
- **Attribuzione**: il link nell'email si porta dietro la campagna, e la prenotazione che nasce da quel clic la ricorda. Il merito vale 30 giorni dall'invio, senza disdette e assenze. La campagna nel link è verificata dal server: un identificativo inventato non attribuisce niente e non impedisce la prenotazione.
- **Automazioni: tre, non un costruttore di regole** — compleanno, chi non torna da un po', invito a tornare dopo la prima volta. Un editor «se questo allora quello» sembra più potente e in un gestionale per ristoranti resta vuoto; e una regola scritta di fretta scrive a tutti la cosa sbagliata. Il numero di persone che toccherebbero si vede **prima** di accenderle, con nomi e motivo. Nascono spente.
- A ognuna si può allegare un **omaggio**: ogni persona riceve **un codice suo**, valido una volta, con scadenza. Un codice condiviso si gira agli amici e diventa uno sconto che il locale non ha deciso.
- **Coupon**: codice leggibile al telefono (senza O/0, I/1/L, S/5), tetti d'uso totali e per cliente, validità, pausa, archivio. Si usano al tavolo e l'utilizzo si annulla — lo sbaglio comune non è la frode, è il tocco di troppo.
- **Cinque difese contro l'invio di massa sbagliato**, fra cui: un segnaposto scritto prima di dire al fornitore «invia», così se il processo muore la campagna finisce in «non riuscita» col motivo, invece di reinviare a clienti veri.
- **Corretto oggi:** una campagna programmata restava «Programmata · partirà all'ora indicata» per sempre. Passata l'ora ora dice «Consegnata al fornitore», col rimando al suo pannello: l'ordine di invio l'abbiamo dato noi, l'esito non ci torna indietro. Nessuno stato inventato — si guarda l'orologio.

### 4.8 Wi-Fi in cambio del contatto — **completa**

Pagina pubblica su `/wifi/<locale>`: nome, un contatto, l'informativa accettata, e in cambio **il nome della rete e la password**.

- **Tavolo non apre la rete**: lo fa il router del locale, e fingere il contrario sarebbe la bugia più grossa possibile qui (la persona compila, noi diciamo «sei online», lei resta senza internet). Lo scambio è dichiarato, e funziona in qualunque locale senza toccare nessun apparato.
- La password **non arriva al browser prima del contatto**: altrimenti bastava aprire gli strumenti da sviluppatore.
- Se il locale non ha messo rete e password **la pagina pubblica non esiste**: un modulo che chiede l'email senza dare niente in cambio riempie il CRM di indirizzi finti.
- Consenso marketing come spunta separata e non preselezionata, registrato anche quando **manca** (un rifiuto è un'informazione), e un rifiuto qui non revoca un consenso dato altrove.
- In Marketing il numero grande non è quanti contatti sono stati raccolti: è **quanti hanno poi prenotato**.

### 4.9 Numeri e previsioni — **completa, con i limiti dichiarati**

- **Analytics descrittivo**: coperti, completamento, assenze, disdette, fonti, fasce orarie, giorni.
- **Occupazione media per giorno della settimana**, sulle sole settimane in cui il locale ha davvero registrato: prima le medie si dividevano per otto settimane anche quando i dati erano quattro, e le quattro vuote dimezzavano il risultato.
- **Previsione coperti a sette giorni** col modello degli alberghi: si confronta ogni giorno con gli stessi giorni della settimana e si guarda quanto era già prenotato **alla stessa distanza dal servizio**. Ogni numero porta la frase che lo spiega, le assenze attese sono sottratte, e dove la storia non basta **non si prevede**.
- **Costo delle assenze** (nuovo oggi): coperti persi, quanto valevano, in che giorni succede, chi ripete. Il valore di un coperto perso è **misurato sui conti chiusi** quando ce ne sono, altrimenti è lo scontrino medio dichiarato e c'è scritto che è una stima, altrimenti non si mostra. Nessuna percentuale sotto le 10 prenotazioni; «il giorno peggiore» si nomina solo se sta davvero sopra la media.
- **Sondaggi e NPS**: richiesta il giorno dopo la visita, due strade dopo la risposta, notifica immediata sui voti bassi. La risposta automatica a un voto basso resta fuori per scelta: a chi è uscito insoddisfatto scrive una persona.

### 4.10 Sala, personale, esperienze — **completa**

Piantina delle sale con tavoli posizionabili, blocchi, modalità di assegnazione (per sala o per tavolo). Camerieri con ruoli, contratti e scadenze (avviso alle 6:00). Esperienze con calendario e pubblicazione — **i biglietti non si vendono da Tavolo** (dipende dai pagamenti) e la pagina lo dice, col link a dove li vende il locale.

### 4.11 Privacy: dare e cancellare i dati — **completa**

I dati personali di un cliente stanno in **sette posti**, non uno: scheda, note delle prenotazioni, contatti dal Wi-Fi con l'indirizzo IP, destinatari e testi dei messaggi, IP dei consensi, commenti dei sondaggi, nome scritto sui conti.

- **Esportazione**: un file con tutto, **note del personale comprese** — sono dati su quella persona, e il fatto che siano scomodi da mostrare non li rende di qualcun altro. Un export che tiene fuori le note riservate non è un export, è una vetrina.
- **Cancellazione**: svuota tutti e sette i posti in **una sola transazione**, e **non tocca i conti**. Chi chiede di sparire ha diritto a sparire come persona, non a far sparire una cena servita e pagata: coperti, incassi, righe dei conti, punti e voti restano. La riga del cliente non si cancella — porterebbe via le prenotazioni, quindi l'incasso.
- Due righe si conservano per una ragione precisa: i messaggi tengono *che* sono stati inviati (senza, il promemoria ripartirebbe), e i consensi tengono la scelta e la data, perché sono **la prova** di cosa è stato acconsentito.
- La finestra di conferma non chiede «sei sicuro?»: mostra **due elenchi** coi numeri veri — cosa sparisce e cosa resta. Il secondo serve più del primo, perché la paura di chi preme quel pulsante è di cancellare un mese di lavoro.

---

## 5. Cosa è misurato, cosa è stimato, cosa non si mostra

| Numero | Stato |
|---|---|
| Coperti, prenotazioni, assenze, disdette, fonti | **misurati** |
| Occupazione per giorno | **misurata**, sulle sole settimane con dati |
| Previsione coperti | **calcolata**, con la frase che la spiega; assente dove la storia non basta |
| Incasso di una serata con conti chiusi | **misurato** |
| Incasso di una serata senza conti | **stimato** su scontrino medio dichiarato, e si chiama stima |
| Costo del cibo e margine per piatto | **misurati**, sulla parte di cui è dichiarato il costo, con la copertura scritta |
| Costo delle assenze | **misurato** dove ci sono conti chiusi, altrimenti stimato e dichiarato tale |
| Valore di un cliente | **stimato** su scontrino medio, dichiarato tale |
| Ricavo per posto per ora (RevPASH) | **non mostrato**: i ricavi veri esistono da poche serate |
| Previsione dei ricavi | **non mostrata**: sarebbe coperti previsti × scontrino medio, una stima moltiplicata per una stima |

---

## 6. Sicurezza e privacy

**In piedi:** isolamento fra ristoranti (il locale attivo viene sempre dal server, mai dal client, verificato su tutte le rotte) · permessi per ruolo applicati a tutte le scritture · limite di frequenza su endpoint pubblici, login, agente e upload · registro delle azioni con nome, ora, IP e differenza dei campi cambiati · cron che si rifiutano di partire senza segreto · intestazioni di sicurezza su ogni risposta (`nosniff`, `Referrer-Policy`, `X-Frame-Options: DENY`, HSTS, `Permissions-Policy`) con **due eccezioni dichiarate** (il widget di prenotazione e il menu pubblico, fatti per stare in un iframe sul sito del ristorante) · `method="post"` su tutti i moduli, così un invio prima dell'idratazione non mette la password nella cronologia.

**Aperto, e scritto:**
1. la password del Wi-Fi sta in chiaro e la riceve chi compila il modulo — è la rete ospiti, ed è detto in Impostazioni;
2. nessuna verifica del contatto sul widget pubblico (serve un captcha o una conferma via link);
3. forzare un tavolo è disponibile a chiunque abbia `manage_bookings`, cameriere compreso — con motivo obbligatorio e tracciato;
4. nessun 2FA, nessun recupero password, nessuna scadenza di sessione configurata;
5. credenziali demo note su un ambiente pubblico;
6. nessuna protezione completa sugli script del browser (richiede un nonce dentro Next: scritta a mano oggi, o rompe l'app o non protegge da niente);
7. cancellazioni distruttive su clienti, camerieri e tavoli senza ripristino;
8. nessuna conferma dal fornitore email su quante email sono arrivate.

---

## 7. Infrastruttura: le tre cose che tengono su il resto

**Il freno sulle migrazioni.** Su Vercel il database delle anteprime è quello di produzione, e il build esegue le migrazioni: quindi **l'anteprima di una richiesta di modifica migrava la produzione** prima che nessuno avesse fuso niente. Ora una pubblicazione vera applica tutto, un'anteprima applica solo migrazioni che *aggiungono*, e se fra quelle in attesa ce n'è una che porta via dati non applica nessuna e lo scrive nel registro del build. Inoltre: se non c'è niente da applicare, il comando non viene chiamato — anche a vuoto prende una serratura sul database, e due build sovrapposti si bloccavano a vicenda (ha fatto fallire una pubblicazione di produzione col database perfettamente in ordine).

**La coda dei lavori.** `BackgroundJob` su Postgres, smaltita ogni minuto. Presa in carico con scrittura condizionata (due cron sovrapposti non fanno partire due volte lo stesso invio), tentativi contati quando il lavoro *parte* — non quando finisce, altrimenti un lavoro che fa morire il processo riprova per sempre — lavori a lotti che cedono il turno, ripresa dei lavori rimasti appesi oltre dieci minuti, errori definitivi visibili in Impostazioni con «Riprova».

**La prima migrazione distruttiva.** Fatta oggi, in due pubblicazioni separate: prima il codice smette di dichiarare la colonna, poi la migrazione la cancella. Durante un deploy il codice vecchio serve ancora le richieste mentre le migrazioni sono già applicate, e un client che seleziona una colonna appena cancellata restituisce un errore a un utente. È dichiarata in una lista dentro i test: senza quella riga la suite fallisce, e mettercela significa aver deciso che quel dato si può perdere.

---

## 8. Qualità: l'audit del 7 settembre

**562 test in 36 file**, tutti verdi. Coprono permessi, isolamento fra locali, fusi orari, limiti di frequenza, registro azioni, disponibilità (65 regole), lista d'attesa, walk-in, forzature, promemoria, link firmati, sala viva, centro controllo, profilo cliente, sondaggi, coda dei lavori, invio campagne, automazioni, freno sulle migrazioni, previsione, attribuzione, tavolate, esperienze, coupon, omaggi automatici, paginazione, menu, conto del tavolo, costo del cibo, punti, gift card, numerazione dei conti, portale Wi-Fi, riconoscimento del cliente, motivo obbligatorio sulle forzature, cancellazione ed esportazione dati, settimana, costo delle assenze.

**Verifiche automatiche:** TypeScript pulito, ESLint pulito, nessuna deriva fra schema dichiarato e database.

**Verifica dal vivo (screenshot allegati):** 25 pagine dell'app, tutte con esito 200 e **zero errori in console**; 7 pagine su telefono con **zero scorrimento orizzontale**; 16 finestre e funzioni; 6 pagine pubbliche viste da telefono.

**Difetti trovati dall'audit e corretti in giornata:**

| Difetto | Perché contava |
|---|---|
| «Attesa media 538 minuti» | una riga in lista da stamattina non è una persona che aspetta: il numero era vero e inutilizzabile |
| Pagamenti diceva «Incassato 0,00 €», la Panoramica «Incasso 73,00 €» | stessa parola per due cose diverse: chi leggeva i due numeri aveva ragione a non fidarsi di nessuno dei due |
| Un tetto di 100 movimenti senza totale nella pagina Pagamenti | la stessa bugia per omissione già corretta altrove |
| Un test dipendente dall'ora del giorno | passava di giorno e falliva di sera |

**Difetti trovati nei giorni precedenti dalla verifica dal vivo, non dalla lettura del codice** (elenco parziale, perché è la parte che conta di più): il fornitore email che riportava «inviato» su un rifiuto; l'assegnazione di un tavolo che dava errore dopo la cancellazione di un conto; ogni prenotazione dal sito che creava un cliente nuovo; la card dello scontrino medio importata e mai mostrata in pagina; il selettore dei tavoli che cercava i tavoli liberi *adesso* invece che all'ora della prenotazione; il secondo tavolo di una tavolata che risultava libero; «il 100% dei coperti» che sembrava un difetto e non lo era.

---

## 9. Lo schema promette più del prodotto: 22 tabelle su 73 senza una riga di codice

È il dato più utile per capire dove siamo, e va letto senza allarme: il database è stato disegnato guardando lontano, e il prodotto è arrivato dietro. Oggi **24 modelli su 73 non sono toccati da nessuna riga di codice**. Classificati:

**Decisione già presa e scritta (1)**
- `WifiSession` — una sessione ha una fine, e la fine non è osservabile senza il router. Righe con `endedAt` sempre vuoto sarebbero i contatori mai scritti che questo progetto ha passato giorni a togliere.

**Aspettano i pagamenti (1)**
- `Ticket` — la vendita dei biglietti delle esperienze.

**Aspettano un apparato o un fornitore (6)**
- `Connector`, `ConnectorEvent`, `POSConnector`, `POSEvent` — collegamento a casse e POS.
- `MessageTemplate` — modelli di messaggio, oggi i testi sono nel codice.
- `ExchangeRate` — cambio valuta, serve solo a un gruppo multi-paese.

**Idee mai realizzate, da confermare o eliminare (16)**
- Voce e telefono: `CallLog`, `MissedCall`, `VoiceBookingDraft`.
- Chat: `ChatSession`, `ChatMessage`.
- Recensioni esterne: resta `Review`, cioè riportare dentro Tavolo le recensioni scritte su Google e simili — serve l'API della piattaforma. `ReviewLink` e `ReviewLinkClick` non sono più vuote: il ponte «promotore → recensione» è vivo e conta i passaggi.
- Preordine: `BookingPreorder`, `BookingPreorderItem`.
- Altri: `BookingEvent`, `StaffShift`, `CostEntry`, `MenuScan`, `FloorDecor`, `ApiToken`.

**La raccomandazione:** ognuna di queste sedici è o una funzione da fare o una tabella da cancellare. Lasciarle lì è la condizione che ha generato tutti i «contatori mai scritti» corretti in questo progetto — perché una tabella che esiste invita a mostrarne il contenuto, e il contenuto è vuoto.

---

## 10. Cosa manca, per categoria

**Aspetta una chiave o una decisione del proprietario**
1. **Pagamenti**: caparre, garanzia sulla carta, addebito assenze, biglietti. Schema pronto, codice no. È il buco più grosso.
2. **Chiave del fornitore email + indirizzo mittente**: promemoria, sondaggi e automazioni sono pronti e spenti, e l'app lo dice invece di far finta di aver spedito.
3. **Fornitore SMS/WhatsApp**: il posto nel codice c'è.
4. **Due numeri e una password**, da Impostazioni: le regole della raccolta punti e la rete Wi-Fi con la sua password.

**Aspetta un apparato o più storia**
5. **Casse e POS**: senza un apparato vero con cui parlare si costruirebbe un pulsante che non fa niente.
6. **RevPASH e previsione dei ricavi**: gli incassi veri esistono da poche serate; su tre serate sarebbero numeri precisi calcolati su niente.

**Si può fare, tocca una decisione di prodotto**
7. **Chi può forzare un tavolo**: oggi anche un cameriere, con motivo obbligatorio e tracciato. Alzarlo a manager è una scelta di come si lavora in quel locale.

**Si può fare, nessuno l'ha ancora chiesto**
8. 2FA e recupero password (il recupero dipende dalle email) · multi-brand per catene · API pubbliche e webhook in uscita · vista mese · le sedici tabelle del §9 da confermare o cancellare.

---

## 11. Rischi noti, in ordine di gravità

1. **Il database delle anteprime è quello di produzione.** C'è un freno, e funziona; la soluzione definitiva è un ramo di database separato per le anteprime (Neon lo sa fare, serve l'accesso alla console).
2. **Nessun 2FA e credenziali demo pubbliche** su un ambiente raggiungibile da chiunque.
3. **Nessuna verifica del contatto** sul widget pubblico: email e telefono inventati passano.
4. **Le sedici tabelle senza codice** (§9): ogni giorno che restano lì è un invito a mostrare un dato che nessuno scrive.
5. **Nessuna cache**: ogni pagina interroga il database a ogni caricamento. Oggi sostenibile, con dieci locali attivi va guardato.
6. **La coda dei lavori non ha priorità né limite per fornitore**: un invio di massa e un promemoria urgente sono nella stessa fila.

---

## 12. Come verificare tutto questo senza fidarsi

```bash
npm test                    # 631 verifiche
npx tsc --noEmit            # tipi
npx next lint --dir src     # stile e regole
npx prisma migrate status   # migrazioni allineate
npm run db:seed             # demo con dati coerenti
```

Screenshot: `docs/audit-2026-09/audit-completo/` — `pagine/` (25 desktop), `mobile/` (7), `funzioni/` (16 finestre), `pubbliche/` (6 dal telefono).

Documenti tenuti allineati al codice, non alle intenzioni: `docs/PRODUCT_STATUS.md` (stato di ogni modulo), `docs/ROADMAP.md` (fasi, con i motivi delle cose non fatte), `docs/ARCHITECTURE.md` (le decisioni e perché), `docs/SECURITY.md` (cosa è in piedi e cosa è aperto), `prisma/migrations/README.md` (le regole delle migrazioni).

---

## In una riga

Tavolo copre per intero il ciclo prenotazione → servizio → conto → margine → ritorno del cliente, con 631 verifiche e una disciplina esplicita sul non mostrare numeri che nessuno scrive. Quello che manca dipende quasi tutto da tre cose che non sono codice: un fornitore di pagamenti, una chiave email, e una cassa con cui parlare.
