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
- [x] **Centro controllo servizio**: otto regole deterministiche, ognuna con la sua azione. Restano da aggiungere, quando ci saranno i dati: previsione dei coperti e ottimizzazione dell'occupazione (Phase 5)

## Phase 3 — Ospiti 🔄 in corso

- [x] **Guest Intelligence**: frequenza, abitudini, affidabilità, ritenzione — calcolate dalle prenotazioni
- [x] **Timeline ospite**, con i soli eventi che esistono davvero
- [x] **Tag automatici** con il motivo di ognuno; soglie in un posto solo, pronte a diventare configurabili per locale
- [x] I segmenti delle campagne filtrano su dati **veri**: i contatori sono riallineati alle prenotazioni e il filtro sulla spesa (che leggeva un campo mai aggiornato) è stato rimosso
- [x] Segmenti basati direttamente sulle etichette calcolate («manda a chi è a rischio»)
- [x] Il valore in euro era una **stima dichiarata**; dai conti al tavolo (Phase 6) le serate con un conto chiuso portano il numero vero, e le due cose non si mescolano né si sommano

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
- [x] **Le campagne programmate non dicono più «partirà»** un giorno dopo che l'ora è passata: consegnato l'ordine al fornitore, l'esito non ci torna indietro, e adesso c'è scritto quello — «consegnata al fornitore», con il rimando al suo pannello. Nessuno stato inventato: si guarda l'orologio
- [x] `Campaign.bookedCount` **cancellata**, in due pubblicazioni separate: prima il codice ha smesso di dichiararla, poi la migrazione l'ha eliminata. È la prima migrazione distruttiva del progetto, dichiarata in `DICHIARATE_DISTRUTTIVE` (il test fallisce senza quella riga), e la prima volta che il freno delle anteprime si è visto all'opera su un caso vero
- [ ] RevPASH (ricavo per posto a sedere per ora): ora i ricavi veri ci sono, ma su qualche serata. Ha senso quando la storia degli incassi copre qualche settimana, altrimenti è un numero preciso calcolato su niente
- [ ] Previsione dei ricavi: è la previsione dei coperti per lo scontrino medio. Facile da mostrare, e per questo pericolosa — meglio dopo gli incassi reali
- [x] **Quanto costano le assenze**: coperti persi, valore, giorni in cui succede, clienti che ripetono. Il rischio della singola prenotazione c'era già nel centro controllo; mancava la domanda che si fa il proprietario a fine mese
      → il valore di un coperto perso è **misurato sui conti chiusi** quando ce ne sono, e solo altrimenti è lo scontrino medio dichiarato, detto stima. Senza nessuno dei due non si mostra: inventare un prezzo per un coperto perso è il modo più rapido di far prendere una decisione sbagliata
      → nessuna percentuale sotto le 10 prenotazioni, e «il giorno peggiore» si nomina solo se sta davvero sopra la media — altrimenti è il primo dell'elenco travestito da diagnosi

## Funzioni che sembravano finite e non lo erano

Chiuse il 7 settembre 2026, perché una promessa non mantenuta è peggio di una funzione assente (§23).

- [x] **Unire e dividere i tavoli** — vedi Phase 2
- [x] **Esperienze**: la pagina esisteva in sola lettura con un pulsante «Nuova esperienza» che non faceva niente. Ora si creano, si modificano, si pubblicano. I biglietti **non si vendono da Tavolo** (servono i pagamenti): c'è il link a dove li vende il locale, e la pagina lo dice
- [x] **Segnalazioni** (`/reports`): pagina vuota raggiungibile dal menu del profilo, che prometteva un canale di assistenza inesistente. Rimossa
- [x] **Le liste lunghe non mentono più**: gli ospiti sono a pagine con il totale scritto, e le etichette del filtro si leggono tutte
- [x] **Schermata d'errore**: un'eccezione non mostra più la pagina grezza di Next
- [x] **Il tetto silenzioso sulle prenotazioni è sparito**: `take: 200` senza totale era l'ultimo posto in cui una lista poteva mentire per omissione. Una giornata si legge per intero — è la capienza del locale a fare da tetto, non un numero scelto da noi — e chi un giorno leggerà un intervallo ampio dovrà passare un limite e mostrare il totale, come già fa l'elenco degli ospiti
- [ ] Vendita dei biglietti delle esperienze → dipende da Stripe, come le caparre

## Phase 6 — Ecosistema

- Loyalty, gift card e Wi-Fi: fatti. Restano i connettori (POS e simili)
- [x] **Menu**: categorie e piatti, allergeni da elenco chiuso, disponibilità, ordine, costo facoltativo con il margine. Più il **menu pubblico** per il QR sul tavolo. Serve a sé, e regge i due passi dopo
- [x] **Ordini / conto del tavolo**: si apre dalla prenotazione, si cerca un piatto e si tocca. Prezzo fotografato all'ordine, totale dalle righe, fuori carta a mano. Chiuso il conto, la Panoramica smette di stimare e mostra l'**incasso**
      → `Order` era pensato per l'asporto (nome e telefono obbligatori, nessun legame con la prenotazione): aggiunto `bookingId` e resi facoltativi i due campi, invece di inventare un nome e un telefono per ogni tavolo
- [x] **Costo del cibo, il quadro d'insieme**: in Analytics, sul periodo scelto. Materie prime, quello che resta, e la **copertura** — su quanta parte dell'incasso conosciamo il costo. Le percentuali valgono su quella parte e non si estendono al resto: sarebbe una moltiplicazione, non una misura. L'elenco va dal margine più alto al più basso, e risponde con una lista sola a «chi tiene su il conto» e «chi lo affonda»
      → **la catena menu → ordini → costo del cibo è chiusa.** Da qui l'applicazione ha numeri veri dove prima aveva stime
- [x] **Raccolta punti**: i punti si guadagnano **sui conti chiusi**, non sulle visite né su una spesa stimata — è la ragione per cui questa funzione arriva dopo i conti e non prima. Le due regole (punti per euro, valore di un punto) le dichiara il locale, e senza entrambe la raccolta resta spenta. Si usano come sconto al tavolo; correzione a mano con il motivo obbligatorio
      → `Guest.loyaltyPoints` era un contatore che nessuno scriveva, come i cinque già smontati. Ora la verità è la somma con il segno delle righe di `LoyaltyTransaction`, e la colonna è una copia aggiornata nella stessa transazione
      → il valore di uno sconto in punti si **fotografa** quando si usa (`amountCents`), come il prezzo su una riga del conto: cambiare domani quanto vale un punto non riscrive il conto di stasera
- [x] **Gift card**: si emettono al bancone (serve solo l'importo), si scalano dal conto **anche in più volte** — quello che resta resta sulla carta. Il residuo si calcola dalle righe, non si scala più di quello che c'è, e annullare un utilizzo scrive un movimento negativo che rimette i soldi sulla carta
      → sul conto, gift card e punti sono **modi di pagare**, non righe: le righe sono quello che è stato mangiato, e serve così com'è al costo del cibo. Sotto il totale compare «da incassare»
      → una gift card **non è un incasso di oggi**: sposta il momento in cui il denaro è entrato. La Panoramica dice quanta parte dell'incasso di oggi era già pagata, e l'elenco delle carte chiama il residuo col suo nome — un **debito** verso i clienti
- [x] **Portale Wi-Fi**: pagina pubblica su `/wifi/<locale>`, contatto in cambio della password della rete, consenso registrato con data e provenienza, sconto personale facoltativo. In Marketing: quanti contatti e — l'unico numero che conta — quanti hanno **poi prenotato**
      → mancava nello schema la cosa per cui una persona compila un modulo: la password. Tavolo non apre la rete (lo fa il router del locale), quindi lo scambio è dichiarato invece che finto, e funziona in qualunque locale senza toccare nessun apparato
      → `WifiSession` resta **non scritta di proposito**: una sessione ha una fine, e la fine non possiamo vederla. Righe con `endedAt` sempre vuoto sarebbero i contatori mai scritti che abbiamo passato giorni a togliere
- [x] **Riconoscimento del cliente**: prenotazioni dal sito e contatti dal Wi-Fi cercano la persona che c'è già prima di crearne una copia
      → `createBooking` creava **sempre** un ospite nuovo: chi prenotava dal sito per la terza volta finiva nel CRM per la terza volta. Nessun doppione era ancora comparso, ma con i punti fedeltà tre copie sono tre saldi che non si sommano
- [x] **Cancellazione dei dati di un ospite su richiesta**: `anonymizedAt` era sullo schema e nessuno lo scriveva. Svuota i dati personali nei sette posti dove stanno, dentro una transazione, e **non riscrive i conti** — chi chiede di sparire ha diritto a sparire come persona, non a far sparire una cena servita e pagata
- POS e altri connettori sopra un livello di integrazione astratto

## Vista settimana (7 settembre 2026)

- [x] **La settimana sui libri**, in Prenotazioni accanto a Elenco e Mappa: sette giorni con coperti, prenotazioni, quante da confermare e quanto è pieno. Si tocca un giorno e si entra in quella serata
      → tornano **sette totali già sommati**, non l'elenco di sette giorni: una lista di sette giorni andrebbe paginata o troncata, sette totali no
      → conta la stessa popolazione della previsione (`PRESENTI`, esportata da `forecast.ts`): due schermate che contano persone diverse per lo stesso sabato sono un difetto che questo progetto ha già visto
      → e la pagina dice in che cosa è diversa dalla previsione, perché due numeri vicini che rispondono a due domande diverse sembrano una contraddizione
- [ ] Vista mese: per ora no. Su trenta caselle i numeri diventano illeggibili, e la domanda vera («c'è posto sabato?») si fa su una settimana

## Dopo gli audit (7-8 settembre 2026)

Correzioni nate dal Product Gap Audit e dall'UX Audit, fatte subito perché
costavano poco e valevano molto.

- [x] **Il centro controllo non si autoaffoga**: oltre tre ore un ritardo non è un ritardo ma una riga da chiudere, e diventa un avviso solo invece di otto identici. I ritardi veri si mostrano a tre, dal più recente. Il tempo si dice in ore
- [x] **Su telefono, in Servizio, prima cosa fare e poi quanti**: il primo avviso passa da sotto la piega a 222 px
- [x] **Il briefing prima del servizio** in Panoramica: «57 coperti · 63% pieno · alle 13:30 ne arrivano 13 insieme», e le sole cose che chiedono attenzione, ognuna con il suo collegamento
- [x] **Numeri detti una volta sola**: coperti e occupazione non compaiono più due volte nella stessa schermata, e la card degli avvisi duplicati è stata rimossa
- [x] **Il widget chiede prima il tavolo, poi i dati** — e la data si legge per esteso, perché `mm/dd/yyyy` a un cliente italiano fa prenotare il 9 luglio invece del 7 settembre
- [x] **Dal giorno vuoto alla campagna, in un tocco**: il segmento è già impostato, il nome suggerito
- [x] **Marketing con i numeri** invece di sole descrizioni
- [x] **Coupon con spesa minima e giorni**: le due condizioni che un ristoratore chiede per prime
- [x] **Un traguardo nella raccolta punti**: «mancano 40 punti per una bottiglia della casa»
- [x] **La gift card ferma**: la quarta automazione. Denaro già incassato e cena mai servita: passati i giorni scelti dal locale, chi ha una carta mai toccata riceve il promemoria del credito. Scrive **solo a chi il locale conosce già** — l'indirizzo della carta deve corrispondere a un cliente in archivio con il consenso: una carta comprata da uno sconosciuto per un altro sconosciuto non autorizza nessuna email
      → nasce senza omaggio, e per questa più che per le altre: chi ha già un credito non ha bisogno di uno sconto, e regalarglielo sopra svaluta la carta che ha in mano
- [x] **Il posto liberato da una disdetta**: quando una prenotazione di oggi salta e in lista d'attesa c'è qualcuno che ci sta, il centro controllo lo dice con l'ora e il nome. Tre condizioni, tutte necessarie: l'ora deve avere senso per chi aspetta (chi ha chiesto le 20:30 non vuole le 22:30; chi aspetta in piedi non vuole un tavolo fra tre ore), il posto deve essere **ancora** libero davvero — nel frattempo può averlo preso qualcun altro — e si dice una disdetta sola, non l'elenco delle disdette
- [x] **Il ponte verso le recensioni pubbliche, misurato**: il locale dichiara fino a quattro posti dove recensire; chi risponde 9 o 10 li vede, chi risponde meno no. Il collegamento passa da `/r/<id>`, che conta il passaggio e poi rimanda, e in Analytics compare «quanti promotori sono andati a scrivere, su quanti»
      → si conta chi **arriva alla porta**, non chi scrive: se la recensione sia stata scritta lo sa solo la piattaforma, e la pagina lo dice invece di lasciarlo credere
      → un collegamento tolto viene **spento, non cancellato**: cancellarlo porterebbe via i clic raccolti, e i numeri dell'anno scorso cambierebbero da soli
      → di chi clicca non registriamo niente (né IP né browser): serve a contare, non a profilare
- [x] **Scheletri di caricamento** sulle sette pagine che ne erano senza (Servizio, Attesa, Menu, Marketing, Campagne, Esperienze, Brigata): hanno la forma vera della pagina, non un rettangolo generico. Uno scheletro che non somiglia a quello che arriva fa saltare il testo sotto gli occhi, ed è peggio di una pagina bianca
- [x] **Quanto stanno a tavola, e quante volte gira un tavolo**: durata media dall'arrivo alla chiusura del conto, accanto alla **durata prevista** sulle prenotazioni. Quel numero (105 minuti) decide quanti tavoli il motore accetta di vendere ogni sera, ed era una convenzione mai confrontata con la realtà del locale
      → quando lo scarto supera i dieci minuti la pagina dice cosa farne: se le cene durano di più il motore vende tavoli che non si liberano, se durano di meno tiene occupati tavoli già liberi
      → si misura **solo su chi si è seduto e ha chiuso il conto**, e accanto c'è sempre su quante prenotazioni: chi viene accomodato senza toccare Tavolo qui non c'è
- [x] **Il debito delle gift card fra i numeri d'insieme**: era solo nella sua pagina, e a fine mese lo si cerca in Analytics. Non dipende dal periodo scelto — è quanto il locale deve *adesso* a chi ha già pagato
- [x] **La lista d'attesa misurata**, in Analytics: quante persone escono dalla coda, quante si siedono, i coperti recuperati, quanto hanno aspettato. Risponde a «tenere una lista serve?», che finora era una questione di impressioni
      → si misura su chi è **uscito** dalla coda: chi aspetta adesso non è né un successo né una perdita
      → sotto cinque righe niente percentuale, e le righe che nessuno ha chiuso si contano a parte: non sono clienti persi, sono un gesto mancato in sala, e mescolarle racconterebbe una serata peggiore di com'è andata
- [x] **L'affidabilità raccontata, non punteggiata**: sulla scheda cliente le assenze portano la data dell'ultima. «2 su 12, l'ultima il 5 settembre» dice se è un cliente da richiamare o una cosa vecchia; un 17% da solo non lo dice — ed è il motivo per cui questo progetto non mette un punteggio da 0 a 100
- [x] **«E allora quando?»**: davanti a una giornata piena il widget non dice più solo «non c'è posto», propone i primi tre giorni con posto e l'ora — e toccarne uno cambia data e orario in un colpo
      → la ricerca parte **solo** quando il giorno scelto è pieno: chi trova posto al primo colpo non paga il conto di una domanda che non ha fatto
      → tre settimane avanti, con **una sola lettura** del database per tutte: ventuno letture per rispondere a una domanda renderebbero lenta la pagina più delicata che abbiamo
      → se in tre settimane non c'è niente, si dice: una domanda lasciata in sospeso è peggio di un no
- [x] **I gruppi grandi non passano da un modulo**: oltre dodici persone il widget smette di chiedere dati e mostra il numero di telefono. Un tavolo così si organizza — due tavoli uniti, a volte un menu concordato — e far compilare tutto per poi scrivere «vi richiamiamo» è il modo di perdere il gruppo e la serata
- [x] **Finestra di prenotazione online**: con quanto anticipo al massimo, e con quanto preavviso minimo. Le due cose che ogni gestionale serio ha e che qui mancavano
      → **vale solo per il canale pubblico.** Se alle 20:40 squilla il telefono e c'è posto, chi risponde deve poter scrivere quella prenotazione: un software che glielo impedisce viene aggirato con una penna, e da lì in poi la sala e lo schermo non dicono più la stessa cosa
      → fuori finestra il cliente **non** legge «non ci sono orari»: legge che può chiamare. È la differenza fra un coperto perso e una telefonata
      → gli orari fuori finestra si tolgono invece di mostrarsi spenti, e il motivo si dice una volta sola sotto l'elenco
- [x] **Menu engineering**: quanto piace incrociato con quanto rende, senza un dato nuovo. Quattro gruppi con il nome del metodo classico — stelle, cavalli, enigmi, cani — e sotto ognuno la frase che dice cosa farne, perché «cavallo» da solo non dice a nessuno cosa fare lunedì
      → «rende» è il **margine per piatto**, non la percentuale: un caffè con l'80% di margine lascia in cassa un ventesimo di una bistecca al 40%, e confrontare le percentuali direbbe il contrario di quello che succede davvero
      → la classifica **si rifiuta di esistere** quando i dati non bastano (meno di 4 piatti o meno di 20 vendite), e un piatto venduto due volte resta fuori invece di diventare un «cane»: dire a un ristoratore di togliere dalla carta qualcosa che non ha mai avuto una possibilità è il modo di fargli perdere soldi con un grafico
- [x] **La lista UX è chiusa**: le quattro voci rimaste (dimensione del tavolo, ricerca nel menu, scheletri, navigazione del menu pubblico) sono fatte

## Master prompt «Restaurant Operating System» (8 settembre 2026)

- [x] **Percorsi end-to-end, in repository** (P0-2, primo cantiere): configurazione Playwright, dati di prova separati dalla demo, un solo accesso riusato, e il **primo percorso verde in 5,6 secondi** — dal widget alla scheda cliente, passando per conferma, arrivo, tavolo, conto e punti accreditati. `npm run test:e2e`
      → il locale di prova ha un turno 00:00–23:59: le prove riguardano la funzione, non l'ora in cui girano
      → scrivendolo sono emerse due cose sul prodotto, corrette **nel test** perché il codice aveva ragione: una prenotazione dal widget ha «Approva/Rifiuta» invece del menu degli stati, e il selettore dei tavoli propone già il primo tavolo che basta (il test lo deselezionava)
- [x] **Le automazioni non chiedono più al database una volta per candidato** (P0-6): due letture per tutta la platea invece di due per persona. Con trecento clienti raggiungibili erano seicento viaggi per aprire una pagina, e quattro automazioni ne facevano duemilaquattrocento
      → il test conta le letture: con tre candidati o con trenta devono restare due. È l'unico modo di impedire che il difetto rientri quando qualcuno aggiungerà un controllo dentro il ciclo
- [x] **La campanella suona per otto categorie** invece di quattro (P1-6): prenotazione dal sito che aspetta una decisione, disdetta entro 48 ore, contatto nuovo dal Wi-Fi, gift card usata
      → la regola che decide se una categoria vale una notifica: **si notifica solo ciò che nessun'altra schermata già mostra, e solo quando una persona può farci qualcosa**. Quindi niente «VIP senza tavolo» o «picco di arrivi» — il centro controllo li dice meglio, in ordine di urgenza e col rimedio accanto
      → i silenzi sono difesi da altrettanti test: una prenotazione presa al telefono non suona, una disdetta per il mese prossimo no, e sei persone dello stesso tavolo che si collegano al Wi-Fi fanno suonare una volta sola
- [x] **Le difese del widget** (P0-5, ultimo P0 senza dipendenze): idempotenza sul tentativo, doppione identico riconosciuto, campo trappola
      → **la regola che le tiene insieme**: una difesa che rifiuta una prenotazione vera costa più del problema che risolve. Nessuna euristica sul contenuto: solo fatti verificabili
      → metà dei tredici test verifica che le difese **non scattino dove non devono**: orario diverso, coperti diversi, prenotazione annullata e riprenotata, chiave assurda (che si ignora invece di rifiutare), altro locale
      → chi fa scattare la trappola riceve un rifiuto generico e **non una finta conferma**: se un giorno scattasse per errore su una persona vera, la conferma falsa sarebbe il danno peggiore
      → resta fuori la **verifica del contatto** (codice via email o SMS): è la difesa vera contro gli indirizzi inventati e serve un fornitore. Non l'ho sostituita con un indovinello
- [x] **Il P3 del redesign: card, densità, tablet** — ed è venuto fuori diverso da come era scritto
      → **le card non erano 190 oggetti diversi**: era un riquadro ripetuto ~120 volte con quattro spaziature. E il linguaggio aveva già due livelli dichiarati — `.surface` (le card che galleggiano) e `.recessed` (i pozzi incisi) — mentre quello usato più di tutti, il riquadro semplice, non era dichiarato da nessuna parte. Adesso è `.riquadro`, accanto agli altri due: **niente cambia a vedersi**, cambia che esiste un posto dove cambiarlo invece di centoventi
      → **la scala di densità** (`.denso` dove si lavora, `.comodo` dove si legge) dichiarata nello stesso posto, più le due densità del componente tabella. È del contesto e non dell'utente: la sceglie la schermata, non un'impostazione
      → **il tablet sbagliava due volte**, e in due direzioni opposte: la barra mostrava **sei icone senza nome** (come un desktop stretto) e il contenuto usava il layout del telefono — una colonna, tre numeri su sei, avvisi a piena larghezza, ottocento pixel sprecati. È l'unico schermo che una hostess tiene su un supporto
      → adesso è una modalità sua: **etichette sotto le icone** — in fila chiedevano 671 px contro 522 disponibili, e infatti la pillola veniva tagliata e finiva sotto la sfera dell'agente — tutti e sei i numeri, avvisi su due colonne, **due colonne di lavoro** (tre a 820 px sarebbero da 273 px l'una, illeggibili). Il lavoro comincia a **728 px invece di 995**
      → misurato a 768, 820, 900 e 1024 px: la barra sta dentro lo spazio a tutte e quattro le larghezze, e sopra i 1024 le etichette tornano accanto alle icone
- [x] **Il prompt su UX e design, applicato** — l'audit c'era, la direzione visiva no
      → **direzione C — Premium Control Room** sulle quattro schermate dove si lavora: intestazioni compatte, i numeri in sans tabellari, colore solo semantico. Dove si legge — Panoramica, Analytics, Marketing, Impostazioni, pagine pubbliche — l'identità editoriale resta intatta: è l'8 in pagella e l'unica cosa che i concorrenti non possono copiare in un trimestre
      → il risultato misurato: in Servizio il lavoro comincia a **~690 px invece di 850** (sopra la piega su un portatile) e su telefono si vedono **tre avvisi invece di due**; gli urgenti pesano e il resto è una riga col «perché» che si apre, senza perdere nessuna delle quattro parti
      → **il modulo prenotazione a due livelli**: cinque campi invece di nove, gli altri dentro un `<details>` che sta nello stesso form (quindi si inviano comunque). I cinque essenziali si compilano in 2,6 secondi di interazione, contro i 20-30 stimati dall'audit
      → **una tabella sola** per Prenotazioni e Ospiti, con due densità scelte dalla schermata e non dall'utente
      → **un segno per stima e misura** accanto ai numeri che poggiano su qualcosa, uguale in tutto il prodotto
      → **un solo vocabolario**: sul telefono la Panoramica si chiamava «Oggi» e il Servizio «Ora»
      → e quattro difetti che nessun test poteva prendere, usciti solo guardando le schermate: «in attesa da **937 min**», «**2** in attesa» accanto a «**9** persone in coda», una riga in sospeso dipinta con `bg-red-50` — un rosso da tema chiaro, invisibile su fondo verde, che nessuno vedeva perché la demo non ha quasi mai prenotazioni in sospeso — e gli importi **`1118,00 €` sul server contro `1.118,00 €` nel browser**, cioè un *hydration mismatch* su ogni pagina con un totale a quattro cifre
- [x] **Le tre cose del prompt che avevo lasciato indietro** — chieste esplicitamente dal master prompt e non fatte fino a ieri
      → **§60, il progetto della prenotazione al telefono** ([`docs/PROGETTO-VOCE.md`](PROGETTO-VOCE.md)): il prompt chiede *il progetto, non l'implementazione*, e mancava. Tre strade in ordine di quanto costano — «la chiamata persa non si perde» (un SMS a chi ha chiamato invano, nessuna voce), «la segretaria che scrive» (voce → bozza, decide una persona), «l'agente che risponde» — con le regole che valgono per tutte e tre e cinque decisioni che restano a Luca. **Zero righe di codice**, e la ragione è scritta dentro: la prima cosa da fare non è programmare, è contare quante chiamate si perdono
      → **la soglia dei gruppi numerosi** era una costante: dodici. Dodici va bene per una trattoria e non per una sala che fa banchetti, e il punto in cui una prenotazione «diventa un'organizzazione» lo sa il locale. Adesso è un'impostazione, accanto alla finestra di prenotazione, e il modulo pubblico si adatta: messa a sei, l'elenco arriva a «Più di 6» e il riquadro dice «per più di 6 persone parliamone»
      → **«ritardo nella rotazione»**, l'undicesima regola del centro controllo: le cene **già chiuse stasera** contro la mediana misurata del locale. Tre condizioni, e servono tutte — il locale deve avere un «solito» (dieci cene misurate), stasera devono essere almeno tre (sotto è l'aneddoto di due tavoli), e ci deve essere una conseguenza. Un servizio lento con la sala mezza vuota **non è un problema**: è una serata tranquilla
      → e una bugia nella documentazione: la matrice delle funzioni diceva ancora `MISSING` per otto cose che esistono e `PARTIAL` per due chiuse in mattinata. Le tredici che restano `MISSING` dipendono tutte da una chiave, un fornitore o una decisione
- [x] **La coda impara la priorità, la quota e quanto tenere la storia** (P3-6): è il lavoro che serviva **prima** di accendere l'email
      → il difetto: la coda era in ordine di orario, e quattrocento email di una campagna accodate alle 20:00 stavano davanti alla **conferma di una prenotazione** arrivata alle 20:01. Il cliente aspettava di sapere se aveva un tavolo dietro una spedizione pubblicitaria
      → tre livelli, e il criterio è **chi sta aspettando**: 10 un messaggio a un ospite (se non arriva subito non serve più), 50 le automazioni (vanno fatte oggi, non in questo minuto), 100 le campagne (nessuno le aspetta col telefono in mano). La priorità la decide il tipo, così due punti del codice non possono dare due urgenze diverse allo stesso lavoro
      → la **quota per fornitore** risolve due problemi con una cosa sola: Brevo accetta un tot di chiamate al minuto — mandargliene duecento in venticinque secondi significa farsi rifiutare le ultime, e un rifiuto del fornitore diventa un tentativo bruciato per un messaggio che non aveva niente di storto — e una spedizione non deve occupare tutto il giro. Venti invii per giro, un giro al minuto: 1.200 all'ora, con spazio per tutto il resto
      → chi resta fuori per la quota **non consuma tentativi**: non è successo niente, torna nel giro dopo
      → la storia dei lavori **conclusi** si tiene due settimane: ogni messaggio è una riga, e un locale che ne manda cento al giorno ne accumula trentaseimila in un anno su una tabella che si legge ogni minuto. I lavori **non riusciti non si toccano mai**, per la stessa ragione per cui restano in tabella invece di sparire: un invio che non è andato è una cosa che qualcuno deve poter vedere anche fra sei mesi
- [x] **Le cinque domande operative, dentro l'agente** (P4-1): chi rischia di non presentarsi, quali tavoli stanno andando lunghi, chi non torna, quali piatti rendono meno, qual è il giorno peggiore
      → l'agente sapeva rispondere a «quanti coperti abbiamo» e «quali tavoli sono liberi»: numeri che stanno già scritti sulla schermata che chi chiede ha davanti. Le domande che un ristoratore fa davvero erano altre cinque, e a quelle non rispondeva nessuno
      → tutte e cinque si rispondono con dati che **esistono già**: nessuna colonna nuova, nessun modello, nessuna chiamata esterna. Sono gli stessi conti delle schermate, chiesti a parole — e siccome sono deterministici, la stessa domanda dà sempre la stessa risposta
      → **dove la misura non basta, la risposta è che non basta**: «servono almeno quattro piatti col costo dichiarato, qui ce ne sono zero» è una risposta utile; un margine inventato no. Provate dal vivo tutte e cinque sul locale dimostrativo, e tre su cinque hanno risposto «non lo so ancora, ed ecco cosa manca» — che è esattamente quello che dovevano fare
      → l'ordine delle regole conta: «quali tavoli non si liberano» prima finiva su «tavoli liberi» — una risposta plausibile alla domanda sbagliata, che è il modo peggiore di sbagliare perché nessuno se ne accorge. Un test copre tredici formulazioni e tre domande vecchie, per verificare che le regole nuove non rubino le domande già coperte
- [x] **La password del Wi-Fi è cifrata a riposo** (P1-9)
      → è l'unico segreto del prodotto che **deve restare leggibile**: il portale la consegna a chi lascia un contatto, ed è il motivo per cui esiste. Quindi non può diventare un'impronta come la password di un utente — si può solo mettere sotto chiave
      → AES-256-GCM, chiave da `CHIAVE_CIFRATURA`, vettore d'inizializzazione nuovo a ogni scrittura (due locali con la stessa password non hanno la stessa riga), e la versione davanti al formato per il giorno in cui si cambia algoritmo
      → **GCM e non CBC** perché porta con sé un sigillo: se qualcuno modifica un byte la lettura *fallisce* invece di restituire una password sbagliata — e una password sbagliata mostrata a un cliente è peggio di un errore, perché il cliente prova, non si collega, e dà la colpa al ristorante
      → **senza chiave** il valore resta in chiaro con un'etichetta esplicita e la schermata lo dice: la stessa scelta fatta per l'email e per l'error tracking. Rifiutare il lavoro vorrebbe dire che un locale non può accendere il portale finché non si configura una chiave, e perderebbe contatti veri per un rischio ipotetico
      → **nessuna migrazione di dati**: le righe scritte prima si leggono come sono e passano sotto chiave alla prima riscrittura. Verificato dal vivo: dopo un salvataggio dalle impostazioni il database contiene `v1:…` e il portale pubblico consegna la password vera
      → per strada: il freno delle migrazioni chiamava distruttivo **qualunque** cambio di tipo, compreso diventare `text`. Ora distingue, con un motivo che sta scritto: `text` non ha limite di lunghezza, quindi ogni valore già in tabella ci sta e nessuna scrittura che funzionava prima comincia a fallire. Restringere resta vietato — non per il dato (Postgres fa fallire l'istruzione) ma per il **codice**, che in produzione comincerebbe a ricevere errori partendo da un ramo mai approvato
- [x] **Il quinto percorso end-to-end: dalla campagna al merito** — i cinque flussi del §80 sono completi (il sesto, caparra→rimborso, non si può scrivere senza pagamenti)
      → l'invio vero passa da un fornitore che in prova non c'è e ha già i suoi test; quello che nessuno percorreva è la parte **dal clic in poi**, che è quella su cui si regge la domanda «il marketing serve?»: il link porta a prenotare, la prenotazione nasce col merito della campagna, e il merito si vede nei risultati coi **coperti** — «una prenotazione» non dice se è una coppia o una tavolata
      → il secondo test è quello che conta: una prenotazione fatta **senza** quel link non deve finire sul conto di nessuna campagna. Un'attribuzione che si prende meriti che non ha è peggio di nessuna attribuzione, perché fa spendere soldi su un numero gonfiato
      → provati **al contrario**, uno per volta: togliendo il merito dalla route cade il primo, attribuendo ogni prenotazione alla prima campagna inviata cade il secondo. Ognuno prende il suo difetto
- [x] **I doppioni degli ospiti si vedono e si uniscono** (P2-8): l'ultima voce P2 senza dipendenze
      → da settembre chi prenota viene riconosciuto, ma i doppioni nati prima sono ancora lì, e ne nascono di nuovi in modi che nessun riconoscimento prende: uno prenota dal sito con la mail, poi telefona e lascia il numero. **Tre copie della stessa persona sono tre saldi punti che non si sommano** e tre conteggi di visite che dicono «prima volta» a un cliente abituale
      → **niente unione automatica**: il sistema propone, una persona decide. Fondere due schede sbagliate è peggio che tenerne due — significa mostrare a qualcuno le note riservate di un altro — e non si torna indietro
      → **solo segnali esatti**: stessa email o stesso telefono, normalizzati. Nessuna somiglianza sui nomi: due «Marco Rossi» in un ristorante di quartiere sono due persone. La stessa regola vale nel server e non solo nell'interfaccia: l'API rifiuta di unire due schede senza un contatto in comune, perché un controllo che sta solo nell'interfaccia non è un controllo
      → **niente si perde**: prenotazioni, conti, punti, consensi, messaggi, sondaggi, code, coupon e pagamenti si spostano; note e allergie si **uniscono** invece di sovrascriversi (perdere un'allergia si paga in sala); il livello di fedeltà più alto vince; un blocco non si perde
      → i contatori **si ricalcolano dalle righe**, non si sommano fra loro: visite, assenze e saldo punti tornano a essere la somma dei fatti — sommare due contatori avrebbe contato due volte tutto quello che era già sbagliato
      → **una revoca di consenso più recente vince su un consenso più vecchio.** Se la scheda A ha detto sì a gennaio e la B ha detto no a marzo, la persona ha detto no: resta fuori dal marketing
      → una scheda **anonimizzata non si unisce**: i suoi dati sono stati cancellati su richiesta, e rimetterli in circolo sarebbe disfare una cancellazione
      → l'unione la può fare solo un **Manager** (`manage_venue`), non chi accoglie durante il servizio, e finisce nel registro delle azioni con cosa si è spostato: è l'unico posto dove resta scritto quale scheda è stata assorbita, perché quella riga non esiste più
      → due difetti trovati provandolo dal vivo: la conferma di cosa era stato spostato **spariva insieme alla coppia** appena l'elenco si aggiornava (ora sta in cima e resta), e la colonna dei punti leggeva il contatore invece delle righe. Più un test che è fallito una volta su tre: due schede create nello stesso istante tornavano in ordine arbitrario, e la principale proposta cambiava fra un caricamento e l'altro
- [x] **Il menu, da telefono, non è più un muro di frecce** (P2-6): un solo «⋯» per piatto con le azioni scritte a parole
      → ogni piatto portava **quattro** pulsanti a icona — su, giù, modifica, elimina: quattro bersagli per riga su un elenco di centoventi piatti, e il nome del piatto diventava il testo fra le icone
      → nel menù contestuale le voci sono **parole, non simboli**: «Elimina il piatto» dice più di un cestino, e sta in fondo dopo una riga di separazione perché è l'unica azione che non si disfa
      → ci è entrata anche **«Segna come finito»**, che è il gesto più frequente durante un servizio (lo si fa in cucina alle nove di sera, con una mano) e prima si raggiungeva solo aprendo la scheda del piatto
      → **da tablet in su la fila di pulsanti resta**: col mouse quattro bersagli in fila si raggiungono più in fretta di un menù da aprire. Non è la stessa interfaccia rimpicciolita, ed è il punto
- [x] **«Com'è andata»: Analytics dice in cinque righe com'è andata** (P2-5)
      → Analytics è undici pannelli, sedici numeri e quattro grafici: su una scrivania si legge, su un telefono era la stessa pagina compressa. Chi la apre fra due servizi non aveva modo di capire in trenta secondi se la settimana è andata bene
      → **prima i problemi**, ordinati per gravità e non per argomento: «13 assenze, 58 coperti persi — 847 €» sta sopra «499 coperti, il 15% in più del periodo prima»
      → **niente aggettivi al posto dei numeri**, e ogni riga porta la sua base: «Misurato su 40 cene con arrivo e chiusura registrati», «84% dell'incasso ha un costo dichiarato: sul resto non si può dire». Un numero senza la sua base è un'opinione con la faccia di un dato
      → le misure che il locale **non ha** non compaiono: nessuna riga «dato non disponibile», perché occuperebbe il posto di un fatto. E se non c'è davvero niente da segnalare lo dice: «nessuno scostamento rilevante rispetto al periodo prima»
      → una riga nuova che nessun altro pannello diceva: quando la durata misurata si scosta di oltre un quarto d'ora da quella prevista, la sintesi spiega **cosa fa al motore** — troppo corta e si vendono tavoli che non si liberano in tempo, troppo lunga e si rifiutano prenotazioni che ci starebbero
      → è una **funzione pura** sui numeri che la pagina aveva già letto: nessuna lettura in più tranne una somma per l'incasso del periodo prima, e si verifica senza database (14 test)
- [x] **Impostazioni in quattro parti, e «Altro» a gruppi** (P2-7): la colonna di tredici schede era diventata di sedici
      → il criterio del raggruppamento è **di chi è la decisione**: *Il locale* (chi siamo, chi lavora, com'è fatta la sala), *Prenotazioni* (le regole con cui si accettano), *Ospiti* (cosa si fa con chi è venuto), *Sistema* (invii, integrazioni, stato dei lavori)
      → l'indice sono **ancore, non schede**: funziona senza JavaScript, si può mandare a un collega il link a una parte, e il tasto indietro fa quello che ci si aspetta. Con `scroll-mt` il titolo della parte non finisce sotto la barra fissa
      → nel menù «Altro» le sette voci sono tre gruppi con l'etichetta (Il locale · Crescita · Sistema), **uguali su scrivania e su telefono**: sul telefono il foglio ne elenca undici, e a gruppi si trovano invece di scorrerle
- [x] **Gli avvisi dicono anche cosa succede se nessuno fa niente** (P2-2): *problema → motivo → impatto → azione*, su tutte e dieci le regole
      → mancava **l'impatto**, che in un centro controllo è la parte che decide se vale la pena alzarsi: «quattro posti fermi mentre cinque persone aspettano» è una frase su cui si agisce, «il tavolo è grande» no. Ed è quantificato sui dati che ci sono, non con aggettivi
      → il motivo è un **fatto misurato**, non un consiglio: «Il tavolo era previsto libero verso le 21:40 e Lorenzo è ancora a tavola: il conto è aperto con 6 righe». Un avviso di cui non si può verificare la causa, la seconda volta non lo si legge — e c'è un test che pretende che nessun motivo cominci con un imperativo
      → **due regole nuove**: «il tavolo sta per liberarsi» (per avvisare chi aspetta *prima*, non dopo) e «il tavolo è oltre la durata», dove il motivo dice anche a che punto è il conto, perché cambia cosa si fa
      → e da lì una **regola generale**: un avviso senza impatto non si mostra. Un tavolo oltre la durata che nessuno aspetta e con la sala mezza vuota **non è un problema**: è una serata che va bene, e consigliare di alzarli sarebbe il consiglio peggiore che questo prodotto possa dare
      → il test più importante non riguarda una regola: mette la sala in uno stato che accende più regole insieme e pretende che **ognuna** abbia tutte e quattro le parti piene. Serve a impedire che una regola nuova nasca senza impatto
- [x] **«Cosa sapere di questo ospite», dove si lavora** (P2-4): fino a quattro righe in ordine di urgenza, uguali in Servizio, in Sala e sulla prenotazione
      → i fatti c'erano tutti, ognuno in una schermata diversa: l'allergia in Sala, l'occasione fra le pillole del Servizio, la nota riservata dentro la scheda CRM, le visite in un'altra pagina. Durante un servizio pieno nessuno apre quattro schermate, quindi **nessuno di quei fatti arrivava al tavolo**
      → l'ordine è quello dell'urgenza: prima ciò che può far male (allergie), poi ciò che rende la serata (l'occasione), poi ciò che una persona ha scritto **a mano** per questo momento, poi chi è, e per ultimo l'avviso sulle assenze — fatto, non etichetta sulla persona
      → **il tetto non taglia mai un avviso.** La prima versione tagliava in fondo, e dal vivo si è visto sparire «una volta non si è presentato» per far posto a «non ama la musica alta»: il fatto che decide se tenere un tavolo perdeva il posto a favore di una preferenza. Ora gli avvisi restano tutti e gli altri riempiono quello che avanza
      → ogni riga porta la sua fonte nel suggerimento («Nota riservata scritta dal personale sulla scheda»): un fatto senza fonte è un'opinione. Nessun punteggio, nessuna «probabilità di gradimento»
      → se non c'è niente da sapere **non si scrive niente**: «nessuna informazione disponibile» occuperebbe lo spazio di un fatto senza esserlo
      → un componente solo, con colore **e** icona: se l'allergia è rossa in una schermata e grigia in un'altra, la seconda volta non la si vede
      → per strada: la scheda della prenotazione mostrava l'occasione come `BIRTHDAY`, e «libero fra ~1 ora e 19» del Servizio è diventato «libero verso 12:53» come in Sala — due modi di dire la stessa cosa nelle due schermate che si guardano di seguito
- [x] **Il motore non vende più tutte le cene con la stessa durata** (P2-3): quanto si sta a tavola si **misura**, per gruppo, fascia e tipo di giorno
      → i 105 minuti uguali per tutti sono il compromesso che sbaglia due volte nella stessa giornata: regalano ritardi la sera e buttano via coperti a pranzo. Nel locale di prova, con la stessa data e le stesse quattro persone, la proposta è passata da **1 ora e 15 a pranzo** a **2 ore e 25 a cena** — due risposte diverse alla stessa domanda, che è il motivo per cui questa funzione esiste
      → **la scala**: gruppo+fascia+tipo di giorno → gruppo+fascia → gruppo → tutto il locale → durata predefinita. Si scende di specificità solo quando i campioni non bastano (dieci cene chiuse), e l'ultimo gradino **si dichiara** invece di far finta di aver misurato
      → **una durata scritta a mano non si corregge mai**: chi è al telefono può sapere che quella tavolata festeggia una laurea, e una statistica no. Nel modulo la durata è *proposta*: appena la si tocca, la proposta si ferma e lo dice
      → si arrotonda a cinque minuti («137 minuti» è precisione finta) e si tiene fra 45 minuti e 4 ore: una mediana di quattro ore e mezza non è una cena lunga, è un conto chiuso a fine serata, e senza limite chiuderebbe la sala
      → cambia **solo** la durata proposta a chi crea una prenotazione e quella con cui il motore calcola gli orari liberi: le prenotazioni già in agenda non si toccano
      → la stessa durata la usano il modulo dello staff, il widget, il walk-in, la lista d'attesa e la ricerca dei tavoli liberi: cercare con 105 minuti e poi prenotare con 145 vuol dire proporre un tavolo che non c'è
      → la lettura delle cene chiuse ha un **tetto di duemila righe**: sta sull'endpoint pubblico più caldo, e senza tetto un locale da duecento coperti al giorno la trasformerebbe in diciottomila righe a ogni apertura del widget
- [x] **La sala dice tutto quello che serve per decidere** (P2-1): sul riquadro del tavolo ci sono ora il **conto aperto**, **quando si libera** e **chi arriva dopo**
      → scrivendolo è venuto fuori un difetto vero: la previsione partiva dall'**orario prenotato**. Un tavolo delle 20:00 che si siede alle 20:30 risultava «libero fra 15 minuti» mentre leggevano il menu — e chi sta in sala lo sa, quindi smette di guardare quel numero. Un dato di cui non si fida è peggio di un dato assente, perché occupa il posto della risposta vera. Ora si conta **da quando si sono seduti**
      → la durata è quella **misurata in questo locale** (mediana delle cene chiuse degli ultimi 90 giorni) quando ce n'è abbastanza; sotto le dieci cene misurate non si finge di sapere e si usa la durata prevista. Mediana e non media: un conto rimasto aperto fino a chiusura conta come una cena di sei ore e con la media sposterebbe la previsione di tutti i tavoli
      → una durata **decisa da una persona** su una prenotazione vince sulla mediana: chi scrive tre ore per una tavolata di dodici sa più della statistica
      → la fonte è dichiarata **una volta per schermata** invece di un'etichetta su ogni riga: «le previsioni usano la durata misurata qui: 2 ore e 20, su 214 cene chiuse», oppure «usano la durata prevista: non ci sono ancora abbastanza cene misurate». L'etichetta per riga compare solo quando quella riga si scosta
      → «conto aperto, nulla battuto» non è «0,00 €»: sono due fatti diversi per chi deve capire se un tavolo sta girando
      → la prossima prenotazione si vede **anche mentre il tavolo è occupato**, con «— non fa in tempo» quando la previsione supera l'orario di chi sta arrivando: sapere che si libera verso le 22:30 serve a poco se non si sa che alle 22:15 arriva qualcuno lì
      → una sola formula per «quando si libera» (`lib/liberazione.ts`), usata dalla mappa, dall'elenco e dal centro controllo: erano due conti scritti in due file, ed è il difetto che torna sempre
- [x] **Osservabilità, la parte che non dipende da un fornitore** (P0-3): log strutturati con un evento cercabile per fatto, i cinque cron con un solo posto per l'autorizzazione e **un `try` che prima non c'era**, la coda che distingue «riprovato» da «arreso», e gli errori API non gestiti con un nome su cui costruire un allarme. Come si legge tutto: [`docs/OSSERVABILITA.md`](OSSERVABILITA.md)
      → **cosa non finisce nei log, mai**: email, telefoni, nomi, token, codici. Un log è il posto meno protetto in cui un dato personale può finire e ci resta per mesi; quando serve sapere di chi si parla c'è l'identificativo, o `mascheraEmail()`
      → il test più importante verifica **cosa non esce**: quando un cron esplode, chi chiama riceve `cron_failed` e non una parola del guasto, mentre nei log c'è il messaggio intero
      → resta da scegliere il fornitore per l'error tracking, e da accendere il primo allarme su `coda.lavoro_arreso` e `cron.*.non_riuscito`: è quello che trasforma «lo scopriamo da un cliente» in «lo sappiamo prima»
- [ ] **I pagamenti**: progetto scritto prima del codice in [`docs/PROGETTO-PAGAMENTI.md`](PROGETTO-PAGAMENTI.md) — cosa c'è già (il conto, le gift card, i punti come modi di pagare), cosa nello schema nessuno scrive (`Payment`, `depositCents`, `Ticket`), la forma del livello agnostico, le cinque policy, le sette regole che non si negoziano e **le sei decisioni che non sono mie**
      → la regola che conta più delle altre: **niente si addebita da solo.** Trattenere una caparra a chi non si è presentato è una decisione di una persona, con un motivo scritto — un addebito automatico è il modo più rapido di trasformare un cliente in una recensione da una stella
      → e il primo passo non ha niente di visibile (livello, righe, notifiche in coda, idempotenza) e va fatto per intero prima del secondo: è la differenza fra un pagamento che si può spiegare a un cliente arrabbiato e uno di cui non sappiamo dire cosa è successo
- [x] **Dare accesso a una persona del team** (P0-9, era il buco più grosso della piattaforma dopo i pagamenti): `VenueMembership` la scriveva solo il seed, e i cinque ruoli funzionavano senza che ci fosse modo di assegnarli
      → **un link da consegnare a mano**, non un'email: l'invio di Tavolo è spento finché manca la chiave del fornitore, e una funzione che dipende da una chiave che non c'è è una funzione che non c'è. Il manager copia e manda su WhatsApp, come già fa col QR del menu
      → vale **sette giorni e una volta sola**: un link ancora valido dopo l'uso è un accesso in più che nessuno sa di avere
      → chi ha già un accesso a Tavolo **non se ne fa un secondo**: gli si aggiunge il locale, e la sua password non si tocca
      → le due difese contro il chiudersi fuori stanno **sul server**, non nell'interfaccia: su di sé non si agisce (né togliersi l'accesso né abbassarsi il ruolo), e l'ultimo manager non si tocca — senza manager nessuno potrebbe più invitare nessuno e il locale diventerebbe inaccessibile per sempre
      → provato dal vivo per intero, compresa la cosa che conta: la persona invitata **entra davvero**, e una reception che prova a invitare via API riceve 403
- [x] **Cinque percorsi end-to-end verdi in 26 secondi** (P0-2 chiuso per la parte che si può chiudere): dal sito al cliente, dalla coda al tavolo, la gift card usata a metà, e il voto che diventa recensione (con la strada opposta: voto basso → nessun invito pubblico)
      → rilanciandoli scattava il limite di frequenza sull'endpoint pubblico: la soluzione non è stata allentare i limiti — una prova con difese diverse da quelle vere non verifica il prodotto vero — ma presentarsi come un cliente nuovo a ogni esecuzione, che è quello che fa un proxy
- [ ] Resta un percorso del §80: **campagna → clic → attribuzione** (il meccanismo ha i suoi test; il percorso passa dalla finestra più lunga del prodotto). Il quinto — caparra→disdetta→rimborso — **non si può scrivere**: i pagamenti non esistono, e scriverlo con dati finti darebbe una copertura inventata


Audit di stato contro il master prompt in 92 sezioni:
[`docs/TAVOLO-ROS-AUDIT-2026-09.md`](TAVOLO-ROS-AUDIT-2026-09.md) — venti
problemi reali, matrice di tutte le aree (EXISTS/PARTIAL/MISSING/IMPROVE),
gap tecnico, confronto competitivo, i dieci differenziatori da non perdere,
e una roadmap P0→P4 con impatto, complessità, dipendenze e rischio.

I primi cinque cantieri, tutti senza dipendenze da terzi: test end-to-end in
repo, osservabilità minima, sessione e account, difese del widget, N+1 delle
automazioni. Più il progetto dei pagamenti, scritto prima di toccare codice.

## Una schermata, nessuno scorrimento (9 settembre 2026)

> «Tutto deve stare in una pagina non voglio scroll, rivedi completamente la
> struttura delle pagine.»

Non una rifinitura: una regola di costruzione, e adesso è quella. In sala
nessuno scorre — chi accoglie ha una persona davanti e tre secondi, e ciò che
sta sotto la piega per lui non esiste.

**Come si costruisce una pagina, da qui in poi:** quattro classi in
`globals.css` — `.schermo` (la colonna), `.fissa` (non si comprime),
`.fill` (assorbe l'altezza rimasta), `.fill-scroll` (la assorbe e scorre
dentro) — e una sola regione elastica per schermata. Il `main` dell'area
operativa non è più lo scroller. Tutto scritto in `DESIGN.md` §7.

**Cosa è cambiato nelle pagine:** Analisi sforava di 5 791 pixel ed è diventata
quattro viste (`?vista=`); Impostazioni, 2 915, quattro parti (`?parte=`) —
con l'indirizzo, non con lo stato del client, così una vista si condivide e
risponde al tasto Indietro. Le tabelle scorrono da sole con l'intestazione
`sticky`. La barra `position: fixed` della procedura guidata campagne, con il
suo `pb-24` indovinato, è diventata l'ultima riga `.fissa` della colonna.

**Quello che ha fatto entrare la Panoramica non è stata la compressione.**
Coperti e occupazione erano scritti due volte — nel briefing e in una card da
266 px — e «Nuova prenotazione» era una tessera da 268 px accanto al pulsante
che fa la stessa cosa. Lo spazio c'era già: era occupato da ripetizioni.

**Verificato, non guardato:** 28 rotte × 4 risoluzioni (1440×900, 1280×800,
820×1180, 390×844) su una build di produzione, `scrollHeight - clientHeight`
su `document.scrollingElement` e su `main`. **112 misure, tutte zero.** Le
pagine che sfioravano erano proprio le secondarie che nessuno guarda:
Automazioni sforava di 1 672 px e non era in nessuna lista.

Tre difetti trovati guardando le schermate, non cercandoli: l'asse del grafico
settimanale perdeva la prima cifra (`margin left: -16` su un asse da 32 px:
«40» si leggeva «0»); Analisi scriveva «gli ultimi 30 giorni» sopra numeri di
sette, per un `Math.max(30, …)` che serviva ai voti degli ospiti e non
all'etichetta — ora i voti hanno la loro finestra e la dichiarano; e in
Impostazioni il titolo della parte era ripetuto sotto la pillola che lo
nomina.

## Phase 7 — Enterprise

- **Quando finisce la giornata di un ristorante?** Oggi «oggi» è il giorno del processo (UTC su Vercel), e per un locale italiano viene una finestra dalle 02:00 di ieri alle 01:59 di oggi: assomiglia per caso a una giornata di servizio. Delimitarla nel fuso del locale **peggiorerebbe le cose** — alle 00:30 la schermata Servizio si svuoterebbe con i tavoli ancora seduti. Serve una decisione: «la giornata di servizio comincia alle 05:00», impostazione del locale, usata in tutti e diciannove i punti che chiamano `startOfDay`. Descritto in `docs/ANALISI-STATO-2026-09-07.md` §11.7
- Il **cliente fra più locali** è l'ultima voce P1 che non dipende da un fornitore, e non va fatta senza una scelta: tre strade, con quello che ciascuna costa e quello che non si può più disfare, in [`docs/NOTA-CRM-FRA-LOCALI.md`](NOTA-CRM-FRA-LOCALI.md). Dentro c'è anche la riga SQL che dice **quanti clienti sono davvero in comune** fra due locali della stessa organizzazione: se sono venti su duemila, la strada più invasiva non si fa e la discussione finisce con un numero invece che con un'impressione

- Permessi avanzati, multi-locale e multi-brand, SSO, 2FA
- API pubbliche e webhook in uscita
