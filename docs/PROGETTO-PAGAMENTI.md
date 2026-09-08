# I pagamenti — progetto, prima del codice

**Data:** 8 settembre 2026 · **Stato:** progetto, nulla implementato
**Cantiere:** P0-8 dell'audit `TAVOLO-ROS-AUDIT-2026-09.md`

Questo documento esiste perché i pagamenti sono la parte che tocca il denaro di
qualcun altro, e scriverne il codice prima di averne deciso la forma è il modo
di ritrovarsi con una caparra trattenuta a chi non doveva.

Non contiene implementazione. Contiene: cosa c'è già, cosa non c'è, la forma
del livello che serve, le regole che non si negoziano, e **le sei decisioni che
non sono mie**.

---

## 1. Dov'è oggi il denaro in Tavolo

Va detto con precisione, perché è meno di quanto sembra dallo schema.

**Esiste ed è vero:**

- il **conto al tavolo**: righe con il prezzo fotografato all'ordine, totale
  calcolato dalle righe, chiusura;
- i **modi di pagare** già collegati al conto: gift card (uso parziale, residuo
  come debito), punti fedeltà (valore fotografato al riscatto), coupon. Sono
  trattati come *pagamenti*, non come righe, quindi non falsano il costo del
  cibo;
- l'**incasso della giornata** e il costo del cibo con la sua copertura;
- il **debito delle gift card** fra i numeri d'insieme.

**Esiste nello schema e nessuno lo scrive:**

- `Payment` (con `kind`: DEPOSIT, PREAUTH, TICKET, REFUND, PACKAGE e `status`:
  PENDING, SUCCEEDED, FAILED, REFUNDED) — **zero righe create in tutto il
  prodotto**: `db.payment` compare solo in lettura, nella pagina Pagamenti;
- `Booking.depositCents` e `Booking.depositStatus` (NONE, HELD, CAPTURED,
  REFUNDED, FAILED): il campo si mostra in sala («caparra 40 €») e nessun
  flusso lo valorizza;
- `Payment.stripePaymentId`, `fxAmountBaseCents`, `fxRateToBase`: colonne
  pensate per un fornitore e per il cambio valuta, mai usate;
- `Ticket`: tabella senza codice.

**Non esiste per niente:** incassare online. Né caparra, né garanzia sulla
carta, né prepagato, né biglietti, né gift card vendute dal sito, né rimborsi.

Quindi la pagina Pagamenti oggi è un elenco di qualcosa che nessuno scrive — e
lo dichiara a schermo, che è l'unica cosa onesta da fare finché è così.

---

## 2. Perché conta più di ogni altra cosa che manca

Tre ragioni, in ordine di peso.

1. **È la difesa numero uno dai no-show**, e Tavolo è l'unico che sa *quanto*
   costano in euro misurati: il costo delle assenze c'è già in Analytics. Una
   caparra chiesta **solo dove serve** — sabato sera, gruppo grande, cliente
   con due assenze alle spalle — è più efficace e meno ostile di una caparra
   per tutti. CoverManager dichiara *«fino all'80% di no-show in meno»* con i
   depositi `[COMPETITOR SOURCE]`.
2. **Chiude il ciclo commerciale su cose già costruite**: le gift card si
   emettono e si usano ma non si *vendono* online; le esperienze si pubblicano
   ma i biglietti non si comprano.
3. **È la riga che manca nella trattativa** con un locale che ha già usato un
   gestionale: senza depositi, Tavolo è un prodotto migliore che non può
   sostituire quello vecchio.

---

## 3. Le sette regole che non si negoziano

Vengono dal modo in cui questo progetto tratta i numeri, e con il denaro
valgono il doppio.

1. **I dati della carta non passano da Tavolo.** Mai, in nessun caso, nemmeno
   in transito. Il modulo di pagamento è quello del fornitore (elementi
   ospitati o pagina esterna): noi teniamo un identificativo e uno stato. Se un
   giorno qualcuno chiedesse di «salvare la carta per comodità», la risposta è
   che quella comodità la offre il fornitore con un token, non un nostro
   campo.
2. **Un pagamento è un fatto, e i fatti si aggiungono.** Un rimborso non
   modifica la riga dell'incasso: **crea una riga negativa**. È la stessa
   scelta già fatta per gift card e punti, e per la stessa ragione: il
   consuntivo di ieri non deve cambiare stanotte.
3. **La verità è nelle righe, lo stato è una copia.** `Booking.depositStatus`
   resta, ma come copia aggiornata nella stessa transazione delle righe
   `Payment` — mai come fonte.
4. **Niente si addebita da solo.** Trattenere una caparra a chi non si è
   presentato è una decisione di una persona, con un pulsante e un motivo
   scritto: un addebito automatico è il modo più rapido di trasformare un
   cliente in una recensione da una stella. Il software prepara, l'umano
   conferma. Vale anche per i rimborsi.
5. **Ogni tentativo è idempotente.** Un cliente che tocca «paga» due volte
   sulla rete del ristorante deve pagare una volta. Chiave di idempotenza
   generata dal client e verificata da noi, e mai due `Payment` per lo stesso
   tentativo.
6. **Il cliente sa prima cosa succede.** Prima di confermare deve leggere in
   italiano: quanto, quando, se è un blocco o un addebito, cosa succede se
   disdice e entro quando. Se questa frase non si può scrivere chiara, la
   policy è sbagliata.
7. **Se il fornitore non risponde, non si perde una prenotazione.** Un errore
   di pagamento non deve cancellare una richiesta di tavolo: la prenotazione
   resta *in attesa di garanzia*, con la sua scadenza, e il locale la vede.

---

## 4. La forma del livello

Un'interfaccia sola, nessun nome di fornitore fuori dal suo adattatore.

```ts
// src/server/payments/provider.ts
export type PaymentProvider = {
  readonly nome: string;

  /** Prepara un incasso o un blocco. Non tocca soldi: crea l'intenzione. */
  creaIntento(input: {
    venueId: string;
    importoCents: number;
    valuta: string;
    scopo: "caparra" | "garanzia" | "prepagato" | "biglietto" | "gift_card";
    /** La nostra chiave: due chiamate con la stessa chiave sono una. */
    chiaveIdempotenza: string;
    riferimento: { bookingId?: string; giftCardId?: string; experienceId?: string };
  }): Promise<{ intentoId: string; segretoCliente: string; stato: StatoPagamento }>;

  /** Trasforma un blocco in un incasso, in tutto o in parte. */
  incassa(intentoId: string, importoCents?: number): Promise<{ stato: StatoPagamento }>;

  /** Libera un blocco senza incassare. */
  libera(intentoId: string): Promise<{ stato: StatoPagamento }>;

  /** Restituisce, in tutto o in parte. Crea una riga nuova, non ne cambia una. */
  rimborsa(intentoId: string, importoCents?: number): Promise<{ rimborsoId: string }>;

  /** Verifica che una notifica arrivi davvero dal fornitore. */
  verificaNotifica(corpo: string, firma: string): Promise<EventoPagamento | null>;
};
```

`StatoPagamento` è nostro e ha cinque valori, che sono già quelli dello schema:
`in_attesa` · `bloccato` · `incassato` · `rimborsato` · `fallito`. La mappatura
dagli stati del fornitore vive **solo** nell'adattatore: è il punto in cui i
fornitori si somigliano meno, e lasciarla uscire da lì significa riscrivere
tutto al secondo fornitore.

**Cosa NON entra nell'interfaccia:** abbonamenti, pagamenti ricorrenti,
marketplace, split fra più conti. Non servono a un ristorante che incassa una
caparra, e ogni metodo in più è un metodo da implementare due volte.

### Dove si innesta

- `src/server/payments/` — livello e adattatori (`stripe-adapter.ts` per primo,
  come dice il §12).
- `src/server/bookings.ts` — la creazione di una prenotazione consulta la
  **policy** e, se serve una garanzia, nasce `PENDING_PAYMENT` invece di
  `PENDING`/`CONFIRMED`.
- `src/app/api/public/payments/*` — le rotte che il widget chiama, con limite
  di frequenza nel middleware come gli altri endpoint pubblici.
- `src/server/jobs/` — le notifiche del fornitore diventano **lavori in coda**:
  la coda su Postgres esiste già, con ritentativi e recupero degli appesi.
- `src/components/bookings/public-booking-form.tsx` — un passo in più, dopo
  l'orario e prima della conferma.

---

## 5. Le policy: chi paga, quanto, e quando

Cinque forme, che coprono quello che i ristoranti chiedono davvero:

| Forma | Cosa vede il cliente | Quando ha senso |
|---|---|---|
| **nessuna garanzia** | niente | il caso normale, e resta il valore per difetto |
| **carta a garanzia** | «serve una carta, non addebitiamo nulla adesso» | sabato sera, gruppi medi |
| **caparra fissa** | «20 € ora, scalati dal conto» | eventi, sale private |
| **caparra per persona** | «10 € a persona, scalati dal conto» | gruppi grandi |
| **prepagato** | «paghi ora l'intero menu» | degustazioni, capodanno |

E si applicano **per condizione**, non a tutti: giorno della settimana, turno,
numero di persone, esperienza o evento, e — questa è la parte che nessun
concorrente fa bene — **storia del cliente**.

Su quest'ultimo punto il §13 chiede una caparra *suggerita e spiegata*, e la
regola è la stessa dell'affidabilità raccontata: mai un punteggio, sempre i
fatti.

> **Consigliata una caparra di 15 € a persona.**
> Perché: il sabato sera qui il 19% non si presenta · gruppo di 8 · questo
> cliente ha 2 assenze su 11, l'ultima il 4 agosto.
> [Chiedila] [Lascia senza garanzia]

Il locale decide, non il software. E la frase è la stessa che il cliente
leggerà: se non regge scritta, non regge.

---

## 6. Cosa cambia per chi usa Tavolo

**Per il cliente che prenota:** un passo in più, dopo aver scelto l'orario e
prima di lasciare i dati — così chi non vuole dare la carta se ne accorge
prima di aver compilato tutto. La conferma dice cosa è stato bloccato o
addebitato, e quando si libera.

**Per chi è in sala:** la scheda della prenotazione dice se la garanzia c'è,
quanta e in che stato. Sul conto, la caparra compare fra i modi di pagare
(dove già ci sono gift card e punti) e si scala dal totale.

**Per chi gestisce:** la pagina Pagamenti diventa vera — incassi, blocchi,
rimborsi, e la riconciliazione col fornitore. E il no-show acquisisce
un'azione: *«Trattieni la caparra»*, con motivo obbligatorio e registro, mai
automatica.

---

## 7. Le sei decisioni che non sono mie

Senza queste non comincio a scrivere codice.

1. **Il fornitore.** Il §12 dice «preferibilmente Stripe»: è la scelta che
   farei anche io (documentazione, elementi ospitati, blocchi e rilasci senza
   acrobazie). Serve un account e le chiavi. **Nota:** finché non me ne parli
   tu, di questo non ti chiedo più niente — resta scritto qui.
2. **Chi può rimborsare.** Il §48 chiede un permesso `payments.refund`
   separato. Oggi l'abilità più vicina è `manage_venue` (manager). Propongo:
   rimborsare = manager; *chiedere* una caparra = anche reception.
3. **La policy per difetto di un locale nuovo.** Propongo **nessuna
   garanzia**: un locale che apre Tavolo non deve iniziare chiedendo la carta
   ai suoi clienti senza averlo deciso.
4. **Il no-show si addebita?** Propongo: **mai automaticamente**, e con una
   finestra (per esempio 24 ore) oltre la quale il pulsante scompare — una
   caparra trattenuta tre settimane dopo è una contestazione garantita.
5. **La fiscalità.** Un prepagato non è una caparra: in Italia può richiedere
   un documento fiscale al momento dell'incasso. Tavolo **non è un
   registratore di cassa** e non deve diventarlo, ma va deciso se il prepagato
   si offre subito o dopo, e con quale avvertenza al locale. Questa è la
   domanda su cui sentirei un commercialista prima di me.
6. **Le valute.** Lo schema ha tre colonne per il cambio (`fxAmountBaseCents`,
   `fxBaseCurrency`, `fxRateToBase`) e nessun locale che le usi. Propongo di
   **non implementarle** e di dichiararle candidate alla rimozione: un
   ristorante incassa nella valuta in cui vive.

---

## 8. Come lo farei, in quest'ordine

Ogni passo è utile da solo e non rompe quello prima.

1. **Il livello e l'adattatore, senza interfaccia** — provider, stati, righe
   `Payment` scritte davvero, notifiche in coda, idempotenza. Con i test:
   qui si verifica *che i soldi tornino*, e si verifica prima di mostrare un
   pulsante a qualcuno. **M**
2. **La caparra sul widget**, una policy sola (caparra fissa) e la
   prenotazione che resta in attesa di garanzia. **M**
3. **La caparra sul conto** e la pagina Pagamenti vera. **S**
4. **Le altre policy** (per persona, garanzia sulla carta, prepagato) e le
   condizioni. **M**
5. **Trattieni la caparra** sul no-show, con motivo e registro. **S**
6. **Gift card vendute online** — riusa tutto il livello. **S**
7. **Biglietti delle esperienze**. **M**
8. **La caparra suggerita e spiegata** (§13). **M**

Il primo passo non ha nulla di visibile, e va fatto per intero prima del
secondo: è la differenza fra un pagamento che si può spiegare a un cliente
arrabbiato e uno di cui non sappiamo dire cosa è successo.
