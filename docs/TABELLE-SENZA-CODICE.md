# Le tabelle senza codice — dati per decidere

Al 21 settembre 2026. L'audit ne ha trovate venti; contandoci anche le tre
«lette e mai scritte» sono **ventitré**. Questo documento non decide: mette
davanti i numeri e, per ognuna, **cosa costa tenerla** e **cosa costa
cancellarla**, con una raccomandazione.

## Perché la decisione non è mia

Cancellare una tabella è una migrazione **distruttiva**: se in produzione c'è
una riga, quella riga non torna. E non posso guardare il database di
produzione. Tre delle ventitré, poi, non sono resti: sono funzioni promesse a
un cliente (connettori, cassa, preordine) e cancellarle è una scelta di
prodotto, non una pulizia.

## Cosa costa tenerle

Non spazio: sono vuote. Costa **leggibilità**. Lo schema è il documento che
chiunque apre per capire cosa fa il prodotto: 100 modelli di cui 23 non
esistono nel codice vuol dire che **una riga su quattro promette una cosa che
non c'è**. Ogni volta che qualcuno cerca «come funziona il preordine» trova la
tabella, la relazione, l'enum, e nessuna funzione — e ci perde mezz'ora.

## Il metodo che propongo

Tre categorie, non due:

| | Cosa significa | Cosa si fa |
|---|---|---|
| **Resto** | Sostituita da qualcosa che funziona, o mai partita | Si cancella, quando sai che è vuota in produzione |
| **Promessa** | Funzione vera che non abbiamo ancora fatto | **Si tiene**, con una riga nello schema che dice «non ancora implementata» e il rimando a questo documento |
| **Da rinviare** | Deciderla adesso costa più che tenerla | Si tiene e si riguarda al prossimo audit |

---

## Resti: cancellabili senza perdere niente

Sostituite da qualcosa che oggi funziona. Per queste la cancellazione è pulizia,
non una scelta di prodotto.

| Tabella | Sostituita da | Note |
|---|---|---|
| `CallLog` | `PhoneCall` | prima generazione della telefonia |
| `MissedCall` | `PhoneCall` + `VoiceCallback` | lo schema stesso ammette: «voleva essere questo e non è mai stata collegata a niente» |
| `VoiceBookingDraft` | `VoiceRecovery` | il recupero della chiamata interrotta fa questo, e funziona |
| `StaffShift` | `WorkShift` | la prima versione dei turni; porta `hourlyCents`, e il costo del lavoro non esiste da nessuna parte |
| `FloorDecor` | `RoomLayout.elements` (JSON) | **tutti** i 14 valori di `DecorKind` mai usati |
| `MessageTemplate` | i testi nel codice (`automations/catalogue.ts`, `campaign-templates.ts`) | insieme all'enum `TemplateCategory` |
| `ExchangeRate` | niente: il multivaluta non è mai partito | con `Organization.baseCurrency` e i tre campi `Payment.fx*` |

**Raccomandazione:** cancellarle, in una migrazione sola, **dopo** aver
verificato che siano vuote in produzione. La verifica è una riga di SQL per
tabella e la posso preparare io; il conteggio lo devi guardare tu, o darmi
l'accesso.

---

## Promesse: da tenere, dichiarandole

Funzioni vere che il prodotto non ha ancora. Tenerle va bene — ma lo schema
deve **dire** che non sono implementate, altrimenti continuano a sembrare
funzioni esistenti.

| Tabella | La funzione che promette | Quanto manca |
|---|---|---|
| `Connector`, `ConnectorEvent` | prenotazioni in ingresso da Google Reserve, Booking.com, OpenTable | molto: un adattatore per canale, e un accordo commerciale per ognuno |
| `POSConnector`, `POSEvent` | integrazione con la cassa | molto, e dipende da quale cassa usano i clienti |
| `BookingPreorder`, `BookingPreorderItem` | il cliente scegli i piatti quando prenota | medio: la carta e le prenotazioni ci sono già |
| `PhoneCallRecording`, `PhoneCallTranscript` | registrazione e trascrizione delle chiamate | medio lato Tavolo, **grande** lato centralino (consenso, conservazione, spazio) |
| `ChatSession`, `ChatMessage` | prenotare chiacchierando, con la bozza salvata | medio; oggi lo fa la voce al telefono, che è la stessa idea su un altro canale |
| `Ticket` | vendere i biglietti delle esperienze | medio, e serve l'incasso (Stripe) |
| `Review` | importare le recensioni da Google e TripAdvisor | medio: serve una chiave API di Google |
| ~~`StaffRequest`~~ | ferie e cambi turno | **fatta il 21 settembre**: `/staff/richieste`, si chiedono e si decidono |
| ~~`MenuScan`~~ | quante volte si legge la carta | **fatta il 21 settembre**, la metà onesta: si conta, **non** si raccolgono contatti |
| `CostEntry` | food cost variabile / magazzino | grande, ed è il pezzo che nessun concorrente ha (vedi l'audit) |
| `WifiSession` | chi si è collegato al Wi-Fi | vuota **di proposito**, documentato in `ARCHITECTURE.md` |

**Raccomandazione:** tenerle tutte, e aggiungere a ognuna una riga nello schema
del tipo `/// NON IMPLEMENTATA (21 set 2026): vedi docs/TABELLE-SENZA-CODICE.md`.
Costa niente e toglie l'ambiguità: chi legge lo schema sa cosa può usare.

**Fatte il 21 settembre**, le due che erano lavoro di ore: `MenuScan` (quante
volte si legge la carta, senza raccogliere nessun contatto — i campi `email`,
`phone` e `consentMarketing` restano vuoti di proposito, perché raccogliere
contatti è un'altra funzione con dentro il consenso) e `StaffRequest` (ferie e
permessi, da chiedere e da decidere, in `/staff/richieste`).

---

## Le tre «lette e mai scritte»: le più pericolose

Non sono tabelle vuote qualunque: **qualcuno le legge**, e quindi producono
numeri.

| | Cosa succede oggi |
|---|---|
| `Ticket` | `src/server/experiences.ts` calcola `ticketsSold` includendo `tickets`: la risposta è **sempre 0**. La schermata però non mostra lo zero (`ticketsSold > 0 &&`), quindi oggi non c'è nessun dato falso davanti a nessuno: c'è un contatore che non può mai accendersi, e una lettura in più a ogni elenco. Appena si vendono i biglietti funziona da sé; se si decide di non venderli, si toglie |
| `Review` | `src/server/reviews.ts` lo dichiara: «resta una tabella senza codice». Nessun import da Google/TripAdvisor. Il ponte `ReviewLink` invece funziona e conta i clic |
| `WifiSession` | vuota di proposito e documentata |

**Raccomandazione:** prima di rimettere Esperienze in navigazione, o si vendono
i biglietti o si toglie il contatore. Un contatore che mostra sempre zero è la
cosa peggiore di tutte: non è una funzione mancante, è un dato falso.

---

## I campi mai letti di `VoiceConfiguration`

Non sono tabelle: sono **colonne** dentro una tabella viva, e per questo sono
più insidiose. Quattordici delle ventotto colonne di `VoiceConfiguration` non
le legge nessuno, e non si possono collegare in silenzio: quasi tutte hanno un
valore per difetto che **nessuno ha scelto**, e leggerlo cambierebbe il
comportamento di locali che quella schermata non l'hanno mai vista.

| Campi | Perché non sono collegati |
|---|---|
| `quandoAperto`, `quandoChiuso`, `quandoOccupato`, `quandoNonRisponde` | Due delle quattro situazioni **non le sappiamo distinguere**: con la deviazione, «occupato» e «non risponde» arrivano identiche, perché è l'operatore telefonico a mandarci la chiamata e non dice perché. E l'unica azione diversa dalla voce che qualcuno sceglierebbe — inoltrare a un numero — richiede che il centralino apra una gamba in uscita: `/api/v1/telefonia/rimando` esiste in Tavolo e **nessuno la chiama**. Quattro tendine, oggi, sarebbero una regola che vive solo nell'interfaccia |
| `secondiDiSquillo` | Come `squilliChiesti`: su una deviazione gli squilli li imposta l'operatore. Informativo |
| `recuperoPerseAttivo`, `recuperoPerseCanale`, `recuperoPerseTesto` | Manca **il canale**, non la voglia: SMS e WhatsApp non ci sono su questa installazione, e `apriRecupero` lo dichiara (`SENZA_CANALE`) invece di dirsi mandato |
| `recuperoPerseMinuti` | La grazia esiste ed è uguale per tutti (`GRAZIA_MINUTI`, dieci minuti). Il valore per difetto qui è cinque: leggerlo dimezzerebbe l'attesa a chiunque, senza che nessuno l'abbia chiesto |
| `recuperoCreaRichiamata` | **Superato.** «Da fare» e la coda delle richiamate sono due liste diverse di proposito — la prima è ciò di cui nessuno ha deciso, la seconda sono impegni presi. Riempire la seconda da sola le fonde, e una coda che si riempie per conto suo si smette di guardare |
| `registrazioniAttive`, `registrazioniConsenso`, `registrazioniGiorni` | La registrazione non esiste né qui né nel centralino, e serve spazio, un avviso a chi chiama e una scadenza che cancelli davvero: è una funzione, non un campo |
| `aiLingua` | **Superato** dal 21 settembre: la voce risponde nella lingua di chi chiama. Una lingua fissata qui farebbe rispondere in italiano a un turista |

**Raccomandazione:** nessuno di questi si collega «tanto per»; ognuno è
annotato nello schema con il motivo. I due che valgono un lavoro vero, in
ordine: **l'inoltro nel centralino** (sblocca le quattro situazioni, e serve
una telefonata vera per provarlo) e **il canale dei messaggi** (sblocca il
recupero delle perse, e serve un fornitore SMS o WhatsApp).

---

## Cosa serve da te

1. **La lista da cancellare.** Io propongo i sette «resti». Dimmi sì e preparo
   la migrazione — con dentro il controllo che si ferma se trova righe, come ho
   fatto per l'indice dei punti.
2. **Il conteggio in produzione**, o l'autorizzazione a leggerlo: senza,
   cancellare è un atto di fede.
3. ~~I due lavori piccoli~~: fatti il 21 settembre.
