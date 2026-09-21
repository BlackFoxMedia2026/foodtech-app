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
| `StaffRequest` | ferie e cambi turno chiesti dal dipendente | piccolo, e il personale c'è già tutto |
| `MenuScan` | quante volte è stata letta la carta dal QR | **piccolissimo**: una riga in `/m/[slug]` |
| `CostEntry` | food cost variabile / magazzino | grande, ed è il pezzo che nessun concorrente ha (vedi l'audit) |
| `WifiSession` | chi si è collegato al Wi-Fi | vuota **di proposito**, documentato in `ARCHITECTURE.md` |

**Raccomandazione:** tenerle tutte, e aggiungere a ognuna una riga nello schema
del tipo `/// NON IMPLEMENTATA (21 set 2026): vedi docs/TABELLE-SENZA-CODICE.md`.
Costa niente e toglie l'ambiguità: chi legge lo schema sa cosa può usare.

Due di queste sono lavoro di poche ore e restituiscono un numero vero:
`MenuScan` (quante volte si legge la carta) e `StaffRequest` (le richieste di
ferie). Se le vuoi, sono le prime da fare.

---

## Le tre «lette e mai scritte»: le più pericolose

Non sono tabelle vuote qualunque: **qualcuno le legge**, e quindi producono
numeri.

| | Cosa succede oggi |
|---|---|
| `Ticket` | `src/server/experiences.ts` calcola `ticketsSold` includendo `tickets`: la risposta è **sempre 0**. La sezione Esperienze è fuori dalla navigazione, quindi non si vede — ma appena la si rimette in menu, mostra uno zero che sembra un dato |
| `Review` | `src/server/reviews.ts` lo dichiara: «resta una tabella senza codice». Nessun import da Google/TripAdvisor. Il ponte `ReviewLink` invece funziona e conta i clic |
| `WifiSession` | vuota di proposito e documentata |

**Raccomandazione:** prima di rimettere Esperienze in navigazione, o si vendono
i biglietti o si toglie il contatore. Un contatore che mostra sempre zero è la
cosa peggiore di tutte: non è una funzione mancante, è un dato falso.

---

## Cosa serve da te

1. **La lista da cancellare.** Io propongo i sette «resti». Dimmi sì e preparo
   la migrazione — con dentro il controllo che si ferma se trova righe, come ho
   fatto per l'indice dei punti.
2. **Il conteggio in produzione**, o l'autorizzazione a leggerlo: senza,
   cancellare è un atto di fede.
3. **Se vuoi i due lavori piccoli** (`MenuScan`, `StaffRequest`): sono ore, non
   giorni.
