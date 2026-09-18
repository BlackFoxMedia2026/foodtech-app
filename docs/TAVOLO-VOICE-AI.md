# Tavolo Voice — l'intelligenza artificiale, e cosa non c'è

Scritto il 18 settembre 2026, con la fase 10.

Questo documento dice tre cose: **cosa fa oggi** l'AI dentro Voice, **cosa
richiede un fornitore** che oggi non esiste, e **quali regole** valgono per
tutto quello che verrà aggiunto.

---

## 1. Cosa c'è, e funziona

### L'assistente del gestionale

Esisteva prima di Voice (`src/server/ai/`): intenti riconosciuti con regole
deterministiche, quindici strumenti di lettura, e un ripiego su un modello
esterno per tutto il resto. Voice gli ha aggiunto **quattro strumenti**:

| Strumento | Cosa fa | Permesso |
|---|---|---|
| `prenota` | anteprima di una prenotazione da confermare | `manage_bookings` |
| `metti_in_attesa` | anteprima di una riga in lista d'attesa | `manage_bookings` |
| `crea_richiamata` | anteprima di una richiamata in coda | `use_phone` |
| `cosa_rispondo` | legge le risposte scritte dal locale | `use_phone` |

### Le informazioni che emergono in chiamata

`VoiceCRMInsight`: «mia moglie è celiaca», «il tavolo in fondo», «chiamo per
mio padre, 88 anni». Le tre frasi che cambiano una cena, dette al telefono a
chi risponde — e che non arrivavano **mai** nella scheda del cliente, perché
per scriverle bisognava uscire dalla chiamata, cercare la scheda, aprire il
campo giusto.

Si scrivono in due tocchi dallo storico del telefono e diventano una
**proposta**. Nella scheda entrano solo dopo un secondo gesto, e quel gesto
chiede `manage_bookings` — la stessa capacità con cui si modifica una scheda a
mano. Proporre basta `use_phone`.

| Tipo | Dove finisce, approvato |
|---|---|
| allergia | fra le allergie: si legge in sala, su ogni cena |
| preferenza | fra le preferenze (`preferences.note`) |
| nota | nelle note interne |

Si **accoda**, non si sostituisce: approvare «lattosio» non fa sparire
«arachidi», e la stessa frase due volte non si scrive due volte.

È la regola del brief resa struttura: *niente si scrive nel profilo di un
ospite senza approvazione umana*. Vale oggi — un nome frainteso, una nota sulla
scheda sbagliata — e varrà di più il giorno in cui le proporrà un risponditore
che ha *sentito* «celiaca» in una frase in cui c'era «celiaco mio cognato».

### Le risposte pronte (base di conoscenza)

`VoiceKnowledgeItem`: le dieci domande di ogni sera — cani, parcheggio,
glutine, orari di Pasqua — con la risposta che il locale ha deciso e **le
parole con cui la domanda arriva**.

Si scrivono in Impostazioni → Telefono → Cosa rispondere. Si leggono in due
posti, ed è il motivo per cui questa tabella serve **già oggi**:

1. dalla pagina Telefono, mentre si parla: un campo di ricerca sotto le cose
   da fare;
2. dall'assistente: «cosa rispondo per il parcheggio?».

Quando esisterà un fornitore che sa far parlare una voce, sarà questa la base
di conoscenza che leggerà. Quello che il locale scrive adesso non si riscrive.

---

## 2. Cosa richiede un fornitore (REQUIRES PROVIDER)

**La registrazione e la trascrizione.** `capacita.registrazione` e
`capacita.trascrizione` sono `false`: il fornitore non consegna nessun file
audio e nessun testo. Quindi `PhoneCallRecording` e `PhoneCallTranscript`
restano **vuote**, e non è stata costruita nessuna schermata per ascoltare o
rileggere niente — né un interruttore «registra le chiamate» che non
registrerebbe.

Le colonne del consenso e della conservazione in `VoiceConfiguration`
(`registrazioniAttive`, `registrazioniConsenso`, i giorni di conservazione)
sono scritte per quel giorno e **nessuna schermata le tocca**: un consenso alla
registrazione raccolto per una registrazione che non avviene è la peggiore
delle promesse — e sarebbe anche il pezzo di questo prodotto con le
conseguenze legali più serie.

Quello che **esiste già** e non ha bisogno di audio è il pezzo che conta: le
informazioni che emergono in chiamata, scritte da chi risponde e approvate a
mano (qui sopra). Il giorno in cui arriveranno un audio e una trascrizione, la
strada per portarle nella scheda di un cliente sarà la stessa — una proposta
che qualcuno guarda.

**Il risponditore che parla.** `capacita.ai` è `false` per Black Fox Voice, e
non c'è nessun altro fornitore configurato. Significa che non esiste modo di:

- far rispondere una voce automatica a una chiamata entrante;
- farle leggere le risposte pronte;
- farle prendere una prenotazione parlando con il cliente;
- passare la chiamata a una persona a metà conversazione
  (`transfer_to_human`), perché non c'è nemmeno il trasferimento.

**Cosa NON è stato costruito, di conseguenza.** Nessuna schermata di
configurazione del risponditore, nessun interruttore «AI attiva», nessuna
tendina di instradamento. `VoiceConfiguration` ha le colonne per tutto questo
dalla fase 1 — `modalita`, `quandoAperto`, `quandoChiuso`, `quandoOccupato`,
`quandoNonRisponde`, `numeroInoltro` — e **nessuna schermata le scrive**: sono
decisioni che oggi vivono dentro Asterisk, nel centralino, e un comando in
Tavolo che non arriva a destinazione è peggio della sua assenza.

Il posto dove questo è scritto per il ristoratore è la riga «Cosa non fa ancora
questa linea», in Impostazioni → Telefono e nella pagina delle risposte: una
frase, non un interruttore spento.

**Il giorno in cui un fornitore saprà farlo**, serviranno: un `VoiceProvider`
con `ai: true`, una rotta che riceve gli eventi della conversazione, e le
schermate di `VoiceConfiguration`. Gli strumenti di scrittura ci sono già e non
cambiano — cambia chi li chiama.

---

## 3. Le regole, e dove sono nel codice

### Le tre degli strumenti che scrivono

1. **Non si dice «confermato» prima che la scrittura sia riuscita.**
   `tools/telefono.ts` costruisce un'anteprima e **non può scrivere**: il
   database non è raggiungibile da lì. La frase al passato esce da
   `action-executors.ts`, dopo. Il tempo del verbo lo prova un test:
   l'anteprima dice «sto per», e non contiene «fatto» né «confermato».
2. **La validazione si rifà al momento della scrittura.** L'esecutore
   ricontrolla la disponibilità e **dice quello che è cambiato** fra
   l'anteprima e la conferma («nel frattempo: nel servizio Cena restano 0
   coperti»). Non rifiuta: chi ha confermato sta parlando con una persona.
3. **Se un dato non c'è, non si inventa.** Nessun valore per difetto su
   quando, quante persone, a nome di chi: si chiede, con un esempio. Lo stesso
   vale in lettura — `cosa_rispondo` su una domanda non scritta dice «glielo
   faccio verificare», non immagina una risposta.

### Quelle che valgono per qualunque aggiunta

- **il permesso sta sull'esecutore**, non solo sullo strumento: la rotta che
  esegue un'azione confermata è una rotta di scrittura, e controlla la capacità
  della schermata corrispondente;
- **la chiave dell'idempotenza nasce con l'anteprima**: una anteprima, una
  scrittura, anche con tre tocchi sul pulsante;
- **niente scritture nel profilo di un ospite senza approvazione umana**
  (`VoiceCRMInsight` nasce `PENDING`, fase 11);
- **il quotidiano sul modello esterno resta quello che è**
  (`usage-service.ts`): gli strumenti interni non lo consumano, e un ripiego
  che costa non parte se non c'è un fornitore configurato.

---

## 4. Come si prova senza una linea telefonica

`POST /api/dev/voice/simula` (solo fuori produzione, e il controllo sta nel
codice) scrive una chiamata vera che percorre la strada di una del centralino.
Per gli strumenti di scrittura non serve: si chiamano dai test con un contesto
d'agente, e le tre regole sono verificate in `tests/agente-scrittura.test.ts`.
