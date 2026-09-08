# Il telefono che squilla — progetto, non implementazione

> Il §60 del master prompt chiede **il progetto** della prenotazione al
> telefono, non il codice. Questo documento è quello: nessuna riga è stata
> scritta, e alla fine ci sono le decisioni che restano a te.

---

## 1. Perché

In un ristorante italiano il telefono è ancora il primo canale. Non è
nostalgia: è che al telefono si prenota **chiedendo**, e chi chiede vuole
sentirsi rispondere. «Avete un tavolo per sei sabato sera?» è una domanda che
un modulo web non gestisce bene, perché la risposta vera è quasi sempre
«sabato no, venerdì sì, oppure sabato alle 21:30».

Il problema di oggi non è che manchi la voce: è che **il telefono squilla
mentre si serve**. Alle 20:40 chi accoglie ha tre persone davanti al leggio, e
il telefono che suona è la quarta. Chi chiama riattacca, e nessuno saprà mai
quante prenotazioni si sono perse così.

Questo è il punto da tenere fermo in tutto il resto del documento: **il valore
non è automatizzare la telefonata, è non perdere la chiamata**.

## 2. Cosa esiste già nel database (e non ha una riga di codice)

Tre modelli, previsti mesi fa e mai usati. Sono la traccia di come era stata
pensata la cosa, e vale la pena leggerla prima di riprogettarla:

| Modello | Cosa terrebbe |
|---|---|
| `CallLog` | la chiamata: numero, direzione, stato, durata, registrazione, trascrizione, intento riconosciuto |
| `VoiceBookingDraft` | la **bozza** di prenotazione capita dalla telefonata: nome, telefono, coperti, data e ora *come stringhe*, note, stato, e il collegamento alla prenotazione vera se qualcuno la conferma |
| `MissedCall` | chi ha chiamato senza risposta, con quanti tentativi e se gli è stato richiamato |

Due cose in questo schema sono già giuste, e vanno conservate:

- **la bozza è separata dalla prenotazione.** Una telefonata capita non è una
  prenotazione: è una proposta che una persona conferma. `VoiceBookingDraft`
  ha uno stato e un `bookingId` che si riempie **solo** quando qualcuno
  accetta;
- **data e ora sono stringhe.** «sabato prossimo verso le nove» non è un
  istante, ed è giusto che resti quello che è stato detto finché una persona
  non lo trasforma in un orario. Un parser che indovina «sabato» e sbaglia la
  settimana produce una prenotazione fantasma in un servizio pieno.

`MissedCall` invece è la parte che oggi vale di più, ed è la più semplice.

## 3. Le tre strade, in ordine di quanto costano

### Strada A — «la chiamata persa non si perde» (senza nessuna voce)

Nessun riconoscimento vocale, nessuna intelligenza. Il numero del locale è
deviato su un numero nostro quando è occupato o non risponde; noi registriamo
la chiamata persa e **mandiamo un SMS**:

> Ciao, siamo l'Aurora Bistrot. Ci hai chiamato e non abbiamo potuto
> risponderti: se vuoi prenotare, qui puoi farlo in trenta secondi →
> aurorabistrot.it/prenota

Chi risponde a quel messaggio prenota da solo, e il locale ha guadagnato un
coperto che aveva già perso.

**Cosa serve**: un numero e un fornitore di telefonia (Twilio, Vonage,
Messagebird) più un canale SMS. **Cosa non serve**: nessun modello vocale,
nessuna trascrizione, nessuna decisione difficile.

**Perché è la prima**: è l'unica delle tre che non può dare una risposta
sbagliata a un cliente. Al massimo manda un messaggio a chi non lo voleva.

### Strada B — «la segretaria che scrive» (voce → bozza, decide una persona)

La chiamata non risposta finisce su una segreteria nostra. Chi chiama parla;
noi trascriviamo, capiamo i quattro dati che contano (nome, coperti, giorno,
ora) e creiamo una **bozza** in Tavolo. In Servizio compare una riga:

> 📞 **Marta Serra**, 4 persone, «sabato verso le nove» — ascolta · crea la
> prenotazione · scarta

Nessuna prenotazione nasce da sola. La persona in sala legge quattro campi in
tre secondi, apre il selettore degli orari e conferma — o richiama, se la
frase era ambigua.

**Cosa serve**: telefonia + trascrizione (Whisper o equivalente) + un modello
per estrarre i quattro campi. **Cosa non serve**: parlare, rispondere, decidere.

**Perché è la seconda e non la prima**: introduce un'interpretazione. Ma
l'interpretazione finisce in una **bozza**, non in agenda, e questo è ciò che
la rende accettabile: se il modello capisce «quattro» invece di «quattordici»,
lo vede una persona prima che diventi un tavolo.

### Strada C — «l'agente che risponde» (conversazione vera)

Una voce sintetica risponde, chiede i dati, **interroga il motore di
disponibilità in diretta** e conferma la prenotazione durante la telefonata.

Tecnicamente è alla nostra portata: la disponibilità è già un'unica fonte di
verità server-side con 65 regole verificate, e sa già rispondere «sabato no,
venerdì sì». La difficoltà non è il motore, è la conversazione: interruzioni,
dialetto, rumore di fondo, il bambino che urla, «aspetta che chiedo a mia
moglie».

**Cosa serve**: un fornitore di voce in tempo reale, un progetto di dialogo
scritto per intero, e un collaudo lungo con persone vere.

**Perché è la terza**: è l'unica in cui il prodotto **parla a nome del
ristorante**. Un errore qui non è un dato sbagliato in una tabella: è un
cliente a cui è stato promesso un tavolo che non c'è, e un ristoratore che
scopre il problema quando quella persona si presenta.

## 4. Le regole che valgono in tutte tre

Sono le stesse che tengono in piedi il resto di Tavolo, applicate qui.

**Niente prenotazioni nate da sole.** Nella strada A e B nessuna riga entra in
agenda senza una persona. Nella C, se ci si arriverà, la conferma passa
comunque dal motore di disponibilità reale — mai da una promessa del modello.

**Il dubbio si dichiara, non si arrotonda.** Se dalla telefonata non è chiaro
se ha detto «sabato» o «sabato prossimo», la bozza dice `preferredDate:
"sabato (da confermare)"` e non sceglie. Il prodotto ha già questa abitudine
in dieci posti: dove non misura, dice cosa manca.

**Si dice a chi chiama che sta parlando con un programma**, nella strada B e C,
prima di qualunque altra cosa. Non è solo una regola: è quello che chi chiama
capirebbe comunque dopo due frasi, e scoprirlo dopo fa sentire ingannati.

**La registrazione ha un consenso e una scadenza.** Registrare una telefonata
è un dato personale a tutti gli effetti: va detto all'inizio, va tenuto per il
tempo necessario a trascriverlo e controllarlo (giorni, non mesi), e va
cancellato. La trascrizione segue la stessa strada della cancellazione dati
che esiste già (`anonimizzaOspite`).

**Il numero di chi chiama è un dato dell'ospite, non un identificativo
magico.** Riconoscere «questo numero è di Marta Serra» è utile e va fatto con
la funzione che già esiste (`trovaOspite`, per email o telefono normalizzato).
Ma un numero condiviso — un ufficio, una casa — non è una persona: il
riconoscimento **propone**, non assegna.

**Chi non risponde non viene punito.** `MissedCall.attempts` esiste, e la
tentazione di usarlo per un punteggio va evitata: tre chiamate perse dallo
stesso numero sono probabilmente una persona che vuole un tavolo, non un
disturbatore.

## 5. Come lo consiglierei di fare

Nell'ordine, e fermandosi dove i numeri dicono di fermarsi.

1. **La strada A, e solo quella, per un mese.** Con una misura sola: quante
   chiamate perse ci sono state, e quante hanno prenotato dopo l'SMS. Se in un
   mese sono zero, la voce non serve a questo locale e le strade B e C non si
   fanno. Se sono venti, il resto ha un valore in euro invece che in
   entusiasmo.
2. **La strada B, se il numero della A la giustifica.** È dieci volte più
   semplice della C e copre lo stesso bisogno reale: non perdere la chiamata.
3. **La strada C solo con una richiesta esplicita di un ristoratore che l'ha
   provata**, e con un collaudo su persone vere prima di accenderla per
   qualcuno che non l'ha chiesta.

Questo ordine è anche la ragione per cui non ho scritto codice: la prima cosa
da fare non è programmare, è **contare quante chiamate si perdono** — e per
quello serve un numero di telefono, che è una decisione tua.

## 6. Cosa resta a te

1. **Si fa?** La strada A ha un costo mensile per numero e per SMS, e non è
   grande, ma è ricorrente.
2. **Che fornitore di telefonia**, e per quale mercato. Un numero italiano con
   deviazione è la parte più noiosa e più lenta di tutto il progetto.
3. **Il numero è del locale o nostro?** Deviare il numero del ristorante è più
   naturale per il cliente; darne uno nuovo è più semplice per noi e sbagliato
   per il ristoratore, che ha il suo numero sui tovaglioli da dieci anni.
4. **La registrazione delle telefonate si fa?** In Italia va detto e va tenuto
   per poco. È una scelta di prodotto, non una configurazione: cambia il testo
   della prima frase che chi chiama sente.
5. **Fin dove si vuole andare.** Se la risposta è «la A e basta», si toglie
   `VoiceBookingDraft` dallo schema invece di lasciarlo lì come promessa: una
   tabella senza codice è una funzione che sembra esistere.

---

*Scritto l'8 settembre 2026, senza una riga di codice: il §60 chiede il
progetto, e un progetto scritto dopo l'implementazione non è un progetto.*
