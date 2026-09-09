# Stato del prodotto

> Per una lettura d'insieme, sezione per sezione, con l'audit visivo di ogni pagina:
> [`docs/ANALISI-STATO-2026-09-07.md`](ANALISI-STATO-2026-09-07.md) e `docs/audit-2026-09/audit-completo/`.

Questo file dice **cosa esiste davvero** in Tavolo. Va aggiornato nello stesso commit che cambia lo stato di un modulo.

**Aggiornato:** 7 settembre 2026 · commit di riferimento `c6a1a82` + Phase 0 + Phase 1 + Phase 2 + Phase 3 + Phase 4 (in corso)

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
| Prenotazioni (CRUD) | LIVE | Creazione, modifica, annullo, dettaglio. Forzatura consapevole con motivo obbligatorio e traccia nel registro |
| Disponibilità / anti-overbooking | LIVE | Unica fonte di verità per sala, API e widget. 65 verifiche automatiche |
| Quanto stanno a tavola | LIVE | Durata media dall'arrivo alla chiusura del conto, **confrontata con la durata impostata** sulle prenotazioni: è il numero che decide quanti tavoli il motore vende ogni sera, e finora nessuno l'aveva mai confrontato con la realtà. Più i giri per tavolo. Sotto dieci misure non si dà una media |
| Lista d'attesa misurata | LIVE | Quante persone escono dalla coda, quante si siedono, i **coperti recuperati** e quanto hanno aspettato. Sotto cinque righe niente percentuale; le righe mai chiuse si contano a parte, perché non sono clienti persi ma un gesto mancato in sala |
| Alternative a un giorno pieno | LIVE | «Il primo posto libero: giovedì 10 alle 12:00». Tre proposte, un tocco per accettarne una. Cercate solo quando servono, in una sola lettura |
| Gruppi grandi | LIVE | Oltre dodici persone il widget mostra il telefono invece del modulo: un tavolo così si organizza, non si prenota |
| Finestra di prenotazione | LIVE | Da quanti giorni prima si prenota online, e quanto preavviso serve. **Vale solo per il widget**: al telefono il locale accetta fino all'ultimo minuto. Chi arriva fuori finestra legge che può chiamare, non che è tutto pieno. Nasce senza limiti: chi non dichiara niente continua come prima |
| Calendario | LIVE (giorno + settimana) | Giorno con elenco e piantina; **settimana** con i sette giorni sui libri — coperti, prenotazioni, quante da confermare e quanto è pieno dove la capienza è dichiarata. Si tocca un giorno e si entra in quella serata. Nessuna vista mese: su trenta caselle i numeri diventano illeggibili e la domanda vera («c'è posto?») si fa su una settimana |
| Widget pubblico | BETA | Funziona e propone solo orari accettabili, ora nell'identità dell'app. Manca la verifica del contatto: il limite di frequenza rallenta un bot, non ferma email e telefono inventati |
| Walk-in | LIVE | Persone → tavolo → accomoda, con i soli tavoli davvero liberi. Dal «+» della barra mobile e dalle azioni rapide |
| Reminder prenotazione | LIVE (email) | 24 ore e 3 ore prima, con conferma e annullo dal link. SMS e WhatsApp: il posto è pronto in `PROVIDERS`, i fornitori no — vedi PLANNED sotto |
| Caparra / garanzia carta | PLANNED | Schema pronto (`depositCents`, `depositStatus`, `Payment.stripePaymentId`). Stripe non implementato: **servono le chiavi di test** per farlo e verificarlo davvero |

## Sala e servizio

| Modulo | Stato | Note |
|---|---|---|
| Sala / pianta tavoli (configurazione) | LIVE | Room Builder, layout salvati, zoom, trascinamento, assegnazione personale |
| Tavolate (unire e dividere) | LIVE | Dal selettore tavoli del Servizio: un tocco assegna, due o più uniscono, i posti si sommano e se non bastano serve un motivo scritto. Vincoli: stessa sala, solo tavoli dichiarati unibili, nessuno occupato in quella fascia. Dividere libera gli altri tavoli |
| Sala viva (durante il servizio) | LIVE | Sette stati derivati con colore **e** icona, chi c'è su ogni tavolo con orario e minuti oltre il previsto, tavolate unite mostrate su tutti i tavoli che usano, elenco per stato su telefono al posto di una mappa illeggibile |
| Tablet come modalità sua | LIVE | Non un desktop stretto né un telefono grande: etichette **sotto** le icone nella barra (come nella barra in basso del telefono, stesse parole), tutti e sei i numeri del servizio, avvisi su due colonne e due colonne di lavoro. In Servizio il lavoro comincia a 728 px invece di 995 |
| Un riquadro dichiarato, tre livelli | LIVE | Il linguaggio aveva `.surface` (le card che galleggiano) e `.recessed` (i pozzi incisi); il riquadro semplice — usato ~120 volte — non era dichiarato. Ora è `.riquadro`, con la scala di densità (`.denso` dove si lavora, `.comodo` dove si legge) nello stesso posto |
| Direzione visiva: identità dove si legge, densità dove si lavora | LIVE | Servizio, Sala, Attesa e Conto hanno intestazioni compatte, numeri in sans tabellari e colore solo semantico; Panoramica, Analytics, Marketing, Impostazioni e le pagine pubbliche tengono il serif e il respiro. Il lavoro in Servizio comincia a ~690 px invece di 850, e su telefono si vedono tre avvisi invece di due |
| Modulo prenotazione a due livelli | LIVE | Al telefono si vedono i cinque campi che servono — nome, telefono, quando, quanti — e gli altri sei si aprono. Restano dentro lo stesso form, quindi si inviano comunque |
| Una tabella sola, due densità | LIVE | Prenotazioni e Ospiti usano lo stesso componente: densità scelta dalla schermata e non dall'utente, e una riga «da decidere» segnata da un bordo dell'accento invece di un fondo chiaro |
| Segno per stima e misura | LIVE | Accanto ai numeri che poggiano su qualcosa: *misurato* dove il dato sta nelle righe, *stima* dove c'è di mezzo un valore dichiarato, con il dettaglio a portata di puntatore |
| Soglia dei gruppi numerosi | LIVE | Da quante persone il modulo pubblico smette di far compilare e dice di chiamare: **impostazione del locale**, non più una costante a dodici. Sopra la soglia il cliente legge il numero di telefono, non un errore |
| Avviso «stasera si sta a tavola più del solito» | LIVE | Le cene già chiuse stasera contro la mediana misurata del locale. Serve un «solito» (dieci cene misurate), almeno tre cene chiuse stasera e una conseguenza vera — chi arriva o chi aspetta: un servizio lento con la sala mezza vuota non è un problema |
| Prenotazione al telefono | PROGETTATO | `docs/PROGETTO-VOCE.md`: tre strade in ordine di costo, le regole che valgono per tutte, cinque decisioni aperte. Nessuna riga di codice — la prima cosa da fare è contare quante chiamate si perdono, e per quello serve un numero di telefono |
| Coda: priorità, quote, storia | LIVE | Tre livelli di priorità: un messaggio a un ospite (10) passa davanti a un'automazione (50) e a una campagna (100), anche se la campagna era in coda da prima. Una **quota per fornitore** (venti invii per giro, un giro al minuto) tiene i limiti di Brevo e impedisce che una spedizione occupi tutta la coda. I lavori conclusi si tengono due settimane; quelli **non riusciti non si cancellano mai** |
| Le cinque domande operative all'agente | LIVE | «Chi rischia di non presentarsi», «quali tavoli stanno andando lunghi», «chi non torna più», «quali piatti rendono meno», «qual è il giorno peggiore». Sono strumenti **deterministici** sui dati che esistono già, non chiamate a un modello: la stessa domanda dà sempre la stessa risposta, e dove la misura non basta la risposta dice cosa manca invece di stimare |
| Password Wi-Fi cifrata a riposo | LIVE | AES-256-GCM con chiave da `CHIAVE_CIFRATURA`: nel database non c'è il testo leggibile. Senza chiave il portale funziona comunque e la schermata dichiara che la password è in chiaro — non si finge una protezione che non c'è |
| Doppioni degli ospiti | LIVE | Due schede con la stessa email o lo stesso telefono si propongono in una pagina a parte; l'unione la decide una persona (solo Manager) e **non c'è niente di automatico**. La scheda che resta prende prenotazioni, conti, punti, consensi, messaggi, sondaggi, code e coupon; note e allergie si uniscono; visite, assenze e saldo punti si **ricalcolano dalle righe**. Una revoca di consenso più recente vince su un consenso più vecchio. Una scheda anonimizzata non si unisce: sarebbe disfare una cancellazione |
| «Com'è andata»: la sintesi di Analytics | LIVE | Cinque righe in cima alla pagina, con i **problemi per primi** e la base di ogni numero come suggerimento. Niente aggettivi al posto delle cifre («499 coperti, il 15% in più del periodo prima», non «i coperti crescono»), niente righe per le misure che il locale non ha ancora, e «nessuno scostamento rilevante» quando davvero non c'è niente da dire |
| Avvisi in quattro parti | LIVE | Ogni avviso del centro controllo dice **problema, motivo, impatto e azione**: il motivo è il fatto misurato, l'impatto è cosa cambia se nessuno interviene, con i numeri che ci sono. Dieci regole deterministiche, fra cui «il tavolo sta per liberarsi» e «il tavolo è oltre la durata» — e nessun avviso viene mostrato se non ha una conseguenza |
| «Cosa sapere di questo ospite» | LIVE | Fino a quattro righe in ordine di urgenza — allergia, occasione, nota riservata del personale, preferenze, chi è (prima volta / n-esima visita / affezionato), assenze — con la fonte in ogni riga come suggerimento. Identiche in Servizio, in Sala e sulla prenotazione. Se non c'è niente da sapere non si scrive niente |
| Durata contestuale nel motore | LIVE | Quanto dura una cena si **misura** per gruppo (1-2, 3-4, 5-6, 7+), fascia (pranzo/cena) e tipo di giorno (settimana/fine settimana), sulle cene chiuse degli ultimi 90 giorni. Serve a vendere i tavoli giusti: con un numero unico si regalano ritardi la sera e si buttano coperti a pranzo. Sotto dieci cene misurate in un contesto si allarga il contesto, e in ultima istanza si usa la durata predefinita dicendolo. Una durata scelta a mano non viene mai corretta |
| Sul tavolo: conto, liberazione, prossimo | LIVE | Il conto aperto con totale e numero di righe («conto aperto, nulla battuto» quando non è stato battuto niente), **quando si libera** contato da quando si sono seduti e con la durata misurata nel locale quando ce ne sono almeno dieci cene chiuse, e chi arriva dopo su quel tavolo con l'avviso «non fa in tempo». La fonte della previsione è dichiarata una volta per schermata |
| Assegnazione tavolo a prenotazione | LIVE | Gestione collisioni con lock e 409 |
| Tavoli (anagrafica) | LIVE | |
| Camerieri | LIVE | Profili, ricerca, raggruppamento per ruolo |
| Contratti staff + promemoria scadenza | LIVE | Cron protetto, email, notifiche in-app |
| Assegnazioni cameriere ↔ tavolo | LIVE | |
| Modalità Servizio / reception | LIVE | ADESSO / PROSSIMI / ATTESA su una schermata, aggiornata da sola ogni 30 secondi. Tre colonne su tablet, tre schede su telefono. Azioni in un tocco: arrivato, accomoda, no-show, libera tavolo, cambia tavolo, chiama, apri scheda |
| Waitlist | LIVE | Coda in ordine di arrivo, offerta con scadenza, conversione in prenotazione seduta, suggerimento dei tavoli compatibili. Il messaggio all'ospite è ancora a voce: l'invio automatico dell'offerta arriva con i canali SMS/WhatsApp |

## Ospiti e crescita

| Modulo | Stato | Note |
|---|---|---|
| Ospiti (anagrafica) | LIVE | Scheda, note, preferenze inserite a mano |
| Guest Intelligence | LIVE | Visite, prima/ultima, frequenza, coperti medi, anticipo di prenotazione, tasso disdette e assenze, giorno/fascia/sala/tavolo preferiti, occasioni — **tutto calcolato dalle prenotazioni**. Undici etichette automatiche, ognuna con il motivo |
| Storia dell'ospite (timeline) | LIVE | Prenotazioni, visite, assenze, disdette, attese, messaggi. Ordini, pagamenti e recensioni compariranno quando esisteranno |

| Marketing / campagne email | LIVE | Funziona via Brevo. **Le prenotazioni portate da una campagna sono un numero vero**: il link si porta dietro la campagna, la prenotazione la ricorda, il merito vale 30 giorni e il valore in euro è la stima sullo scontrino medio. Prima c'era un contatore che nessuno scriveva, mostrato come zero su ogni campagna. I segmenti filtrano su dati veri e usano le stesse etichette della scheda ospite. L'invio passa dalla coda: il clic risponde subito, i contatti si preparano a lotti di venticinque, la pagina mostra l'avanzamento contato sui contatti veri e lo stato dice «in invio» finché lo è |
| QR code | LIVE | |
| Automazioni | LIVE | A ognuna si può allegare un **omaggio**: ogni persona riceve un codice suo, intestato a lei e valido una volta. Quattro automazioni, non un costruttore di regole: compleanno, chi non torna da un po', invito a tornare dopo la prima volta, gift card ferma (denaro già incassato, cena mai servita). Nascono spente, e prima di accenderle si vede **quante persone toccherebbero oggi** con nomi e motivo. Cinque difese contro l'invio di massa: finestra stretta (accenderle non fa partire un diluvio), una volta per periodo per persona, silenzio di 3 giorni da qualunque nostro messaggio, tetto di 50 al giorno, consenso obbligatorio |
| Recensioni e NPS | LIVE | Il giorno dopo la visita: una domanda sola (0-10). Promotori → link alla recensione pubblica; detrattori → commento privato **e notifica immediata al locale**. Pannello con NPS, distribuzione, andamento a quattro settimane e commenti recenti |
| Coupon | LIVE | Codice leggibile al telefono, sconto in percentuale o in euro o omaggio, tetti d'uso totali e per cliente, validità, pausa e archivio. Più **spesa minima** e **giorni in cui vale** («da 40 € in su», «solo il martedì»): senza la prima uno sconto del 20% si applica anche a un caffè, senza la seconda un coupon nato per riempire il martedì viene speso di sabato. La spesa minima si giudica solo con un conto davanti. Si usano al tavolo, con il motivo scritto quando un codice non vale; l'utilizzo si annulla e il coupon torna disponibile |
| Loyalty / gift card | SCHEMA ONLY | |

## Nota sui numeri in euro

Tavolo **non sa** quanto spende un cliente: non ci sono ordini né incassi
collegati. Fino a settembre 2026 la Panoramica mostrava «Incassi stimati»
calcolati sulla media di `Guest.totalSpend`, un campo che nessuna parte del
codice aggiornava — valori del seed presentati come dato (e sbagliati di un
fattore dieci).

Adesso: il locale **dichiara** la spesa media per coperto in Impostazioni, e la
stima è detta stima. Senza quel valore, la casella resta vuota e dice cosa
manca. Il valore reale arriverà con ordini o pagamenti.

### Tre difetti trovati allineando la demo **in produzione**

Il seed girava da mesi solo in sviluppo, dove i dati nascono e muoiono nella
stessa ora. In produzione, su una vetrina viva da settembre, sono emersi tre
difetti che in locale non si potevano vedere.

**Il riallineamento delle date era ancorato all'estremo.** Prendeva
`max(startsAt)` e lo portava a «oggi + quattordici». Ha funzionato finché la
demo era solo il seed; poi sono comparse tre prenotazioni isolate mesi avanti
— prese a mano durante una dimostrazione — e quelle tre hanno deciso lo
spostamento di tutte le altre millecentoquarantuno. Il grosso della vetrina è
rimasto a maggio, la Panoramica diceva «nessuna prenotazione per oggi», e il
riallineamento **sembrava fatto**. Adesso l'ancora è la mediana: per spostarla
servirebbe che metà delle righe fosse fuori posto, e a quel punto non è più un
caso isolato.

**Spostare le date non spostava gli stati.** Con uno scarto di quattro mesi,
331 cene già chiuse sono finite nel futuro portandosi dietro il loro stato: la
demo mostrava prenotazioni «completate» per giorni non ancora arrivati e
quattro «no-show» per la sera stessa alle 21:45. Un no-show per una cena che
non è ancora avvenuta è una cosa che il prodotto non può produrre: se la
vetrina la mostra, sta mentendo su come funziona. E la prima versione della
correzione era **dentro** la funzione dello spostamento, dove non girava —
quando le date sono già a posto quella funzione esce subito. Una regola di
coerenza non va appesa al ramo che l'ha creata: va verificata ogni volta.

**Aurora Bistrot non aveva un solo tavolo.** Il ramo «demo già installata» non
creava sale né tavoli, e Aurora è il locale che si apre per primo: ogni
prenotazione diceva «Tavolo da assegnare» e la pianta della sala era una
stanza vuota. Creati i diciassette tavoli, 142 prenotazioni hanno ricevuto il
loro — il più piccolo che basta, senza sovrapposizioni, usando `overlaps` del
motore di disponibilità invece di una seconda formula. Due restano senza, e
restano perché sono tavolate da sette e il tavolo più grande è da sei:
«da assegnare» è la verità, e unire due tavoli è un gesto che si fa a mano.

**I conti non seguivano le loro cene.** Il riallineamento spostava le
prenotazioni e lasciava i conti dov'erano: in produzione 708 conti chiusi ad
aprile-luglio per cene chiuse ad agosto-settembre. Analytics diceva «nessun
conto chiuso nel periodo» **con settecento conti nel database**, il costo del
cibo era vuoto, e la schermata che dovrebbe convincere un ristoratore mostrava
un prodotto che non misura niente. Lo stesso valeva in sviluppo — 482 conti
fuori posto — e non si era mai notato, perché quel database si ricrea spesso.

Corretto alla fonte (lo spostamento muove anche conti, voti, coda e invii), ma
la parte che vale di più è l'invariante: `ogniContoAllOraDellaSuaCena` non
applica un delta ricalcolato a mano, usa il **collegamento**. Un conto
appartiene a una cena, quindi la sua ora è quella della cena, sempre. Scritta
così ripara qualunque scostamento, anche uno futuro di cui non conosciamo
ancora la causa.

### Due formule per la stessa domanda, trovate riempiendo la demo

**«Quanto sono pieno oggi?»** aveva due risposte che si contraddicevano sulla
stessa giornata. La Panoramica prendeva la capienza di **un turno solo** —
quello in corso, o il prossimo — e ci divideva i coperti di **tutta** la
giornata: con turni da 60 (pranzo) e 90 (cena), 75 coperti facevano 125%, e un
`Math.min(100, …)` trasformava l'errore in un tranquillo «100% pieno». La
previsione, per lo stesso giorno, sommava i turni e diceva 44%. Il tetto a
cento è la ragione per cui l'errore è vissuto a lungo: 125% si nota, 100% no.

Adesso la capienza del giorno è la somma dei turni attivi, in un posto solo
(`server/capienza-giorno.ts`), e la percentuale non ha più tetto — oltre il
cento c'è un'informazione vera, perché il locale può accettare prenotazioni
oltre la capienza. Dove non ci sono turni configurati la percentuale **non si
mostra**: prima si divideva per 90, la capienza di un ristorante che non è
questo.

**«Quanto ha speso questo ospite?»** si leggeva da `Guest.totalSpend`, colonna
che nessuna parte del prodotto scrive. Ora è la somma dei suoi conti chiusi,
calcolata dalle righe in `server/spesa-ospiti.ts`, usata sia dall'elenco ospiti
sia dalla spesa media in Analytics — che prima, su un locale vero, mostrava
«0,00 €» con accanto una freccia di tendenza: il modo più efficace di far
sembrare un dato mancante un dato brutto. Chi non ha conti chiusi legge «non
ancora», che non è «zero».

Lo stesso vizio era rimasto nel **seed della demo**: scriveva un `totalVisits`
casuale, ne ricavava il livello fedeltà, e poi creava un numero diverso di
prenotazioni. Nell'elenco ospiti si leggeva «Ambassador» accanto a «1 visita»:
la demo si contraddiceva in una riga. Dal 9 settembre visite, assenze, ultima
visita e livello si ricalcolano dalle prenotazioni vere
(`allineaContatoriOspiti`), anche sulle demo già installate. `totalSpend` resta
non scritto di proposito: senza conti chiusi collegati, una cifra lì sarebbe
inventata — e per la stessa ragione la colonna «Spesa totale» del CRM ora dice
**«non misurata»** invece di mostrare `0,00 €`, che sembrerebbe una misura.

## Analisi

| Modulo | Stato | Note |
|---|---|---|
| Analytics | LIVE | Descrittivo: coperti, completamento, no-show, cancellazioni, fonti |
| Insight / alert | LIVE | Motore a regole |
| Team: invito, ruolo, rimozione | LIVE | Il manager crea un **link da consegnare a mano** (l'email di Tavolo è spenta: un invito che dipende da una chiave che non c'è non esiste), vale sette giorni e **una volta sola**. Chi ha già un accesso non se ne fa un secondo: gli si aggiunge il locale. Due difese contro il chiudersi fuori: **su di sé non si agisce** e **l'ultimo manager non si tocca** — sul server, non nell'interfaccia |
| Centro notifiche | LIVE | Otto categorie scritte davvero (erano quattro): prenotazione dal sito che aspetta una decisione, disdetta entro 48 ore, contatto **nuovo** dal Wi-Fi, gift card usata, voto basso, automazione fallita, contratti in scadenza. Le altre restano mute per scelta: il centro controllo le dice meglio, o la funzione non esiste |
| Menu engineering | LIVE | Popolarità × margine sui due dati che c'erano già: stelle, cavalli, enigmi, cani, ognuno con la frase che dice cosa farne. Si classificano solo i piatti col costo dichiarato e venduti almeno 3 volte, e sotto 4 piatti o 20 vendite **non si classifica niente**: «non lo so» è meglio di un'etichetta da «cane» data su due coperti |
| Recensioni pubbliche | LIVE | Fino a quattro posti dove mandare chi risponde 9 o 10 (Google, TripAdvisor, TheFork…). Chi dà un voto più basso non li vede mai. Il passaggio è contato: in Analytics, «quanti promotori sono andati a scrivere, su quanti». Non contiamo le recensioni scritte — quello lo sa solo la piattaforma, e la pagina lo dice |
| Occupazione e margine | LIVE | Occupazione media per giorno della settimana, sulle sole settimane in cui il locale ha davvero registrato. Costo del cibo e margine per piatto sui conti chiusi, con la copertura dichiarata. RevPASH (ricavo per posto per ora) non c'è ancora: ha senso su una storia di incassi veri più lunga di qualche serata |
| Costo delle assenze | LIVE | In Analytics: coperti persi, **quanto valevano** e in che giorni succede. Il valore di un coperto è misurato sui conti chiusi del periodo quando ci sono, altrimenti è lo scontrino medio dichiarato — e allora c'è scritto che è una stima; senza nessuno dei due il valore non si mostra. Le percentuali per giorno compaiono solo sopra le 10 prenotazioni, e «il giorno peggiore» si nomina solo se sta davvero sopra la media. Più i clienti mancati più di una volta, con il collegamento alla scheda |
| Centro controllo servizio | LIVE | Otto regole deterministiche: picco di arrivi, collisione sul tavolo, arrivi senza tavolo, rischio no-show (con lo storico del cliente), tavolo grande mezzo vuoto mentre una tavolata aspetta, tavolo libero per chi è in coda, **posto liberato da una disdetta** offerto a chi in lista lo aspettava (verificando che sia ancora libero), turno oltre la capienza. Ognuna con il posto dove andare a sistemarla |
| Previsione coperti | LIVE | Sette giorni avanti col modello degli alberghi, con la frase che spiega ogni numero e le assenze attese sottratte. Dove la storia non basta non si prevede. La previsione **dei ricavi** resta fuori: sarebbe i coperti previsti per lo scontrino medio, cioè una stima moltiplicata per una stima |

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
| Sala e servizio che si aggiornano da soli | LIVE | 5 secondi invece di 30, chiedendo «è cambiato qualcosa?» invece di riscaricare tutto. Verificato dal vivo: 2 s dal cambio alla schermata |
| Pannello di contesto invece di pagine | LIVE | Il dettaglio di una riga si apre accanto alla lista: laterale da `md`, foglio dal basso su telefono. Le rotte restano per i link condivisi |
| Avvisi con «annulla» | LIVE | La protezione sta **dopo** l'errore, non prima di ogni gesto giusto. La conferma resta solo per ciò che non si annulla |
| Riconoscimento dell'ospite al telefono | LIVE | Digitando il numero compaiono visite, VIP, allergie, assenze — le tre cose che cambiano la risposta a «avete un tavolo sabato?» |
| Tavolo consigliato nella lista d'attesa | LIVE | Il più piccolo che basta, e a una persona sola. Una verifica per riga, non una per tavolo |
| Nessuno scorrimento di pagina | LIVE | 28 rotte × 4 risoluzioni misurate a zero. Ricetta e regole in `DESIGN.md` §7 |
| Notifiche in-app | LIVE | Filtrate per ruolo |
| Messaggi in uscita | LIVE (email) | Un solo punto d'uscita, registrato su `MessageLog`; niente doppi invii. La risposta del fornitore viene verificata: un rifiuto non risulta più «inviato» |
| Previsione coperti e occupazione | LIVE | Sette giorni avanti, con il ragionamento accanto a ogni numero: si confronta ogni giorno con gli stessi giorni della settimana e si guarda quanto era già prenotato alla stessa distanza dal servizio. Assenze attese sottratte. Dove la storia non basta **non si prevede**, invece di mostrare uno zero. Più l'occupazione media per giorno della settimana, «dove hai margine» |
| Freno sulle migrazioni | LIVE | Il database delle anteprime è quello di produzione: un'anteprima applica solo migrazioni che aggiungono, mai una che porta via dati |
| Coda dei lavori | LIVE | `BackgroundJob` su Postgres, smaltita ogni minuto. Presa in carico atomica (due cron sovrapposti non fanno partire due volte lo stesso invio), lavori a lotti che cedono il turno, nuovi tentativi con attese crescenti, ripresa dei lavori interrotti, errori definitivi visibili in Impostazioni con «Riprova» |
| Navigazione mobile | LIVE | Barra in basso con «+» per i gesti rapidi; nessuno scorrimento orizzontale |
| Agente AI | BETA | 8 strumenti, guardia permessi, quota mensile. Richiede `OPENAI_API_KEY`. Non proattivo |
| Liste lunghe | LIVE | Ospiti a pagine da 50 con il totale scritto («da 1 a 50 di 312») e le etichette lette tutte, non su un campione. Le prenotazioni di una giornata si leggono **per intero**: il tetto fisso di 200 senza totale è stato tolto, perché su una giornata il limite lo mette la capienza del locale. Chi leggerà un intervallo ampio dovrà passare un limite e mostrare il totale |
| Schermata d'errore | LIVE | Un'eccezione non mostra più la pagina grezza di Next: resta la navigazione, c'è «Riprova» e una via d'uscita. Fuori dall'applicazione il messaggio dice che nessuna prenotazione è stata registrata |
| Costo del cibo | LIVE | In Analytics, sul periodo scelto: materie prime, quello che resta, e **su quanta parte dell'incasso conosciamo il costo**. Le percentuali valgono sulla parte coperta e non si estendono al resto. Elenco dei piatti dal margine più alto al più basso, più quelli di cui manca il costo (che è la lista di cose da completare) |
| Conto del tavolo | LIVE | Si apre dalla scheda della prenotazione in Servizio: si cerca un piatto e si tocca. Prezzo **fotografato** al momento dell'ordine, totale sempre ricalcolato dalle righe, quantità con più e meno, fuori carta a mano, annullamento. Gift card e punti fedeltà si applicano qui e compaiono sotto il totale come «da incassare», senza entrare fra le righe. Chiuso il conto, quel totale è un **incasso** e compare in Panoramica al posto della stima, con scritto quanta parte era già pagata con una gift card |
| Menu | LIVE | Categorie e piatti con prezzo, descrizione, disponibilità e ordine; allergeni da elenco chiuso (i quattordici obbligatori) e regimi alimentari. Il costo materie prime è facoltativo e dove c'è mostra il **margine vero** — prezzo e costo li dichiara il locale. Menu pubblico su `/m/<locale>` per il QR sul tavolo: solo categorie attive e piatti disponibili, nessun costo |
| Raccolta punti | LIVE | Punti guadagnati **sui conti chiusi**, due regole dichiarate dal locale, e un **traguardo** facoltativo («mancano 40 punti per una bottiglia della casa»): uno sconto lineare è troppo piccolo per essere notato, un traguardo si insegue. Vale solo con soglia e nome insieme, e sparisce se la raccolta si spegne |
| Gift card | LIVE | Si emettono in Marketing: serve solo l'importo, il codice è leggibile al telefono. Si scalano dal conto al tavolo anche in più volte, e il resto rimane sulla carta. Non si scala più del residuo e l'errore dice quanto c'è; annullare un utilizzo rimette i soldi sulla carta con un movimento di segno opposto. Il totale ancora da spendere è mostrato come **debito** verso i clienti, non come incasso |
| Portale Wi-Fi | LIVE | Pagina pubblica su `/wifi/<locale>`: chi si collega lascia nome e un contatto, accetta l'informativa e riceve **il nome della rete e la password**. Tavolo non apre la rete — quello lo fa il router del locale — e lo scambio è dichiarato invece che finto. Consenso marketing come spunta separata e non preselezionata; un rifiuto qui non disiscrive chi si era iscritto altrove. Con lo sconto automatico attivo, ogni persona riceve un codice **suo**, valido una volta. Se il locale non ha messo rete e password il portale non esiste: un modulo che chiede l'email senza dare niente in cambio fa scrivere indirizzi finti |
| Contatti dal Wi-Fi | LIVE | In Marketing: contatti raccolti, quanti hanno **poi prenotato** (il numero che dice se serve a qualcosa), quanti hanno dato il consenso, e sconti usati su emessi. Elenco a pagine con il totale scritto, con il collegamento alla scheda del cliente |
| Riconoscimento del cliente | LIVE | Prenotazioni dal sito e contatti dal Wi-Fi cercano la persona che c'è già, per email o telefono, prima di creare una scheda nuova. Il confronto è esatto (email senza maiuscole, telefono senza spazi e trattini) e non somiglia sui nomi: fondere due schede sbagliate mostrerebbe a qualcuno le note riservate di un altro. Su un cliente riconosciuto si riempiono solo i campi vuoti |
| Esportazione dei dati su richiesta | LIVE | Dalla scheda del cliente, solo manager: un file JSON con tutto quello che il locale conserva su quella persona, dagli stessi sette posti della cancellazione. Comprese **le note scritte dal personale**: sono dati su di lei, e il fatto che siano scomodi da mostrare non li rende di qualcun altro. Importi in euro, nessun identificativo interno, niente cache |
| Cancellazione dei dati su richiesta | LIVE | Dalla scheda del cliente, solo manager, con il motivo scritto. Svuota i dati personali nei **sette** posti dove stanno (scheda, note delle prenotazioni, contatti Wi-Fi con IP, destinatari dei messaggi, IP dei consensi, commenti dei sondaggi, nome sui conti) e **non tocca i conti**: coperti, incassi, righe dei conti, punti e voti restano. La riga dell'ospite non si cancella — porterebbe via le prenotazioni, quindi l'incasso. Prima di confermare mostra due elenchi: cosa sparisce e cosa resta |
| Scontrino medio | LIVE | Modificabile in Impostazioni. Era già scritto e importato nella pagina, ma la pagina non lo mostrava: un campo che nessuno poteva raggiungere |
| Test | PARTIAL | 574 verifiche: permessi, isolamento, fuso, limiti, registro, disponibilità, waitlist, walk-in, forzatura, promemoria, link firmati, fotografia del servizio stati vivi della sala, regole del centro controllo, profilo ospite, sondaggi, coda dei lavori, invio campagne, automazioni, freno sulle migrazioni, previsione coperti, attribuzione delle campagne, tavolate, esperienze, coupon, omaggi automatici, paginazione, menu, conto del tavolo, costo del cibo, raccolta punti, gift card, numerazione dei conti, portale Wi-Fi, riconoscimento del cliente motivo obbligatorio sulle forzature cancellazione ed esportazione dei dati su richiesta, stato delle campagne programmate, vista settimana costo delle assenze, condizioni dei coupon e traguardo della fedeltà. Nessun end-to-end sul browser automatizzato (le verifiche dal vivo si fanno a mano, con gli screenshot in `docs/audit-2026-09/`) |
| Multi-brand / catene | PLANNED | `Organization` esiste, gestione no |
| API pubbliche / webhook in uscita / SSO | PLANNED | |

## Canali di messaggio

| Canale | Stato | Note |
|---|---|---|
| Email | LIVE | Resend. Senza chiave i messaggi non partono e chi chiama lo sa. Con una chiave non valida l'invio risulta non riuscito, non riuscito a metà |
| SMS | PLANNED | Il posto è pronto in `PROVIDERS`; manca il fornitore. Nessuna interfaccia lo offre |
| WhatsApp | PLANNED | Come sopra |

## Non implementato (solo tabelle)

POS · Connettori · Centralino e voce · Wi-Fi captive portal · Preordini · Biglietti esperienze · Chat ospiti · Eventi privati e gruppi.

Le **esperienze** ora si creano, si modificano e si pubblicano; **vendere i biglietti** no — serve Stripe, come le caparre. Nel frattempo c'è il campo con il link a dove li vende il locale, e la pagina dice che da qui non si vendono.

**Segnalazioni** (`/reports`) è stata rimossa: era una pagina vuota raggiungibile dal menu del profilo, che prometteva un canale di assistenza inesistente.
