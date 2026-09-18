# Tavolo Voice — il risponditore e la deviazione

**Audit prima del codice.** 18 settembre 2026. Secondo giro: il primo
(`TAVOLO-VOICE-ARCHITECTURE.md`, fasi 1–11, PR #135–#145) ha costruito il
telefono **dentro** Tavolo. Questo parte da un fatto nuovo — come lavora
davvero un ristorante che paga il concorrente — e dice cosa cambia.

Repository: `BlackFoxMedia2026/foodtech-app`, cartella
`/Users/lucamoncalvo/tavolo-app`. Il centralino: `/Users/lucamoncalvo/blackfox-voice`.

---

## 1. Il fatto nuovo

Dal cliente vero (Nomad, Torino) e dal prospetto di CoverManager:

- il locale ha **un cellulare**, non un fisso. I clienti chiamano quel numero e
  lo conoscono da anni;
- la chiamata **squilla normalmente** sul cellulare. Risponde una persona;
- **dopo quattro squilli senza risposta** entra il risponditore, che completa la
  prenotazione con la voce guidata;
- il risponditore entra **anche quando il cellulare è occupato** — cioè mentre
  il titolare è già al telefono con un altro cliente. Nelle sue parole: «il
  centralino entra anche quando io sono già in chiamata»;
- si attiva **chiamando il proprio operatore telefonico**, che imposta la
  deviazione e il numero di squilli. Non lo fa il software;
- se il risponditore non ce la fa, **rimanda la chiamata al locale**;
- di chi si è interrotto a metà, Cover consegna **un report** da scaricare; il
  messaggio di recupero è un extra a pagamento (0,15 €/SMS).

Prezzi dichiarati, al mese + IVA, chiamate illimitate: **129 € Host** (una
lingua, prenota/annulla, rimando al locale, **senza** cross-selling) e
**159 € Smart** (multilingua, scelta della zona, cross-selling, deviazione per
ordini e modifiche). Nomad paga lo Smart.

**Cosa ci dice questo prospetto.** Il concorrente vende una cosa sola, e non è
un centralino: *il telefono non squilla a vuoto*. Tutto il resto — zone,
lingue, IVR, cross-selling — sono le righe del listino, non la promessa.

---

## 2. Quello che Tavolo ha già, e si riusa

Verificato nel codice, non dedotto dalla superficie.

| Pezzo | Dove | Stato |
|---|---|---|
| Chiamata, stati, esiti, chi ha risposto | `prisma/schema.prisma` → `PhoneCall` + 4 enum | vivo, scritto e letto |
| Idempotenza degli eventi | unico su `(venueId, externalId)` | vivo |
| Numeri e mappatura | `VoiceNumber` | tabella pronta, **nessuna riga** |
| Configurazione per locale | `VoiceConfiguration`: `modalita`, `secondiDiSquillo`, `quandoAperto/Chiuso/Occupato/NonRisponde`, `numeroInoltro` | **colonne pronte, non scritte** |
| Coda «da richiamare» | `VoiceCallback` + unico parziale | vivo |
| Informazioni rilevate, da approvare | `VoiceCRMInsight` | vivo |
| Base di conoscenza | `VoiceKnowledgeItem` | vivo |
| Astrazione del fornitore + capacità | `src/server/voice/provider.ts`, `src/lib/voice-capacita.ts` | vivo |
| Riconoscimento del chiamante | ultime 9 cifre, indice | vivo |
| Disponibilità | `src/server/availability.ts`, canali `pubblico`/`interno` | vivo |
| Prenotazione | `createBooking` + `idempotencyKey` + `source = VOICE` | vivo |
| Strumenti di scrittura per l'AI | `src/server/ai/tools/telefono.ts` (`prenota`, `metti_in_attesa`, `crea_richiamata`) con permesso per esecutore | vivo |
| Tempo reale | sonda a 5 s, `versioneServizio` | vivo |
| Risponditore a tasti | `blackfox-voice/apps/voice-core/src/calls/risponditore.ts` + `prenotazioni.ts` | **vivo**: due domande, DTMF, prenotazione `PENDING` |
| Trunk di operatore in Asterisk | `infra/asterisk/etc/extensions.conf` → `bfv-from-trunk` | contesto pronto |

**Non c'è niente da ricostruire nel modello dati.** Le colonne
dell'instradamento esistono dalla fase 1 e sono rimaste non scritte di
proposito: quelle decisioni vivevano dentro Asterisk. Adesso hanno un motivo
per essere scritte.

---

## 3. Il bivio che cambia il piano

Questo è il rilievo che conta, e non era nel primo audit.

**Black Fox Voice oggi entra nella linea del cliente con una scatoletta**
(gateway FXO, Yeastar TA410 attaccato alla linea del locale). Con la
scatoletta:

- la chiamata entra in Asterisk **prima** che qualcuno risponda;
- Tavolo vede **tutte** le chiamate, comprese quelle che il personale prende;
- il riquadro «sta chiamando Mario Rossi» funziona per davvero;
- **niente deviazione, niente operatore, niente numero nuovo.**

Ma **a una SIM non si attacca nessuna scatoletta.** Nomad ha un cellulare, e
la maggior parte dei locali piccoli ha un cellulare. Per loro l'unica strada è
quella del concorrente:

```
CLIENTE → numero del locale (SIM) → squilla il cellulare
         ↓ nessuno risponde dopo N squilli, oppure occupato
         ↓ deviazione impostata dall'operatore
    NUMERO TAVOLO (DID) → Asterisk → risponditore → prenotazione
```

Quindi **due porte d'ingresso, un solo risponditore dietro**:

| | Fisso con scatoletta | Cellulare con deviazione |
|---|---|---|
| Serve un numero nostro | no | **sì, un DID per locale** |
| Serve l'operatore del cliente | no | **sì, imposta lui la deviazione** |
| Tavolo vede le chiamate risposte dal personale | **sì** | no |
| Riquadro del chiamante prima della risposta | **sì** | no |
| Squilli prima del ripiego | li decide Tavolo | li decide l'operatore |
| Come stiamo verso Cover | **meglio** | pari |

La riga che conta è la terza. Nel modello a deviazione, **quello che non ci
viene deviato non esiste** — per noi come per Cover (§52 del brief: le
analitiche dicono solo le chiamate che il sistema ha visto, e non si inventa
il resto). Con la scatoletta invece Tavolo può dire *quante chiamate arrivano
in totale* e quante il personale non ce la fa a prendere: è un numero che il
concorrente non può mostrare, ed è l'argomento di vendita più forte che
abbiamo.

**Decisione: si costruiscono entrambe, e la scatoletta resta la strada
consigliata quando il locale ha un fisso.** La deviazione non è un ripiego
tecnico: è il modo di entrare in un locale senza toccargli niente.

---

## 4. Il cambio di rotta rispetto a due giorni fa

Va detto in chiaro perché contraddice una cosa già costruita e già chiesta.

Il 16 settembre la richiesta era: «io devo poter rispondere al gestionale».
Da lì: il telefono nel browser (`telefono-browser.tsx`, WebRTC, permesso del
microfono, PR #146–#152).

Il §7 di questo brief dice l'opposto: il personale **non deve** indossare
cuffie né aprire Tavolo per rispondere alle chiamate normali.

Non sono in conflitto se si mettono in ordine:

1. **il telefono del locale continua a funzionare com'è** — è la promessa;
2. **rispondere da Tavolo è un'opzione**, per chi ha una postazione e la vuole
   (e per Nomad, che l'ha chiesta);
3. **il risponditore è il ripiego**, e non chiede niente a nessuno.

Niente da cancellare. Cambia il **primo passo del collega-telefono**: oggi la
procedura porta a «rispondi dentro Tavolo», domani chiede prima *come entrano
le chiamate* (scatoletta o deviazione) e mostra solo i passi di quella strada.

---

## 5. I buchi veri, in ordine di quanto pesano

### A. Non abbiamo una macchina che **parla e capisce**

`risponditore.ts` dice frasi **registrate** (`sound:bfv/chiedi-persone`) e legge
**i tasti**. Funziona, è affidabile, e non è una conversazione: è l'IVR del
piano Host. Il §9 del brief («supera il modello IVR»), i §97–102 (una domanda
alla volta, date e ore naturali, riepilogo) e il §99 (interruzione) richiedono
tre pezzi che **non esistono da nessuna parte**:

- **STT** in streaming, italiano, bassa latenza;
- **TTS** in streaming, una voce che non suoni da robot;
- un **motore di conversazione** che tenga lo stato (data, ora, persone, nome)
  e lo corregga quando il cliente cambia idea a metà frase.

`capacita.ai` è `false` su `blackfox` per questo, ed è giusto che lo resti
finché la cosa non funziona davvero.

### B. Non abbiamo un numero a cui deviare

`VoiceNumber` è vuota. Per il modello a deviazione servono **numeri italiani
veri** da un fornitore SIP, uno per locale (o uno con selezione, ma un numero
per locale è più semplice da spiegare e da fatturare). Questo è un acquisto,
non una riga di codice.

### C. Non possiamo mandare un SMS

`src/server/messaging/send.ts`: `SMS.available()` restituisce **`false`
scritto a mano**, e `WHATSAPP` pure. L'email dipende da Resend, che **in
produzione non è configurato** (in produzione c'è Brevo, usato per le
campagne).

È il buco più grave, perché il recupero della chiamata interrotta (§27–29) è
**il nostro vantaggio più grande** su Cover, che di quelle chiamate consegna un
report da scaricare. E un link di recupero si manda per SMS: chi ha telefonato
ci ha lasciato un numero, non un indirizzo email.

### D. Il link di recupero non precompila niente

`/Users/lucamoncalvo/tavolo-app/src/app/book/page.tsx` accetta `venue`,
`embed`, `c`. Non c'è nessun token di recupero e nessun modo di aprire il
modulo con sabato, quattro persone e le 21 già dentro (§29). Da costruire
intero, e **senza PII in chiaro nell'indirizzo**: token corto, a scadenza,
che sta in tabella.

### E. Manca la procedura guidata della deviazione

§4 del brief. E il vincolo è chiaro: **non si inventano i codici GSM**. Vanno
verificati operatore per operatore con una SIM in mano, e si mostra solo quello
che è stato provato. Finché un operatore non è verificato, la schermata dice
«chiama il tuo operatore e chiedi la deviazione su *non risposta* e su
*occupato* verso questo numero» — che è esattamente quello che Laura ha detto
a voce.

### F. Mancano i numeri del recupero

Le analitiche di oggi (`src/server/voice/numeri.ts`) contano chiamate, perse,
ore. Mancano l'imbuto (§55), **il passo in cui la gente riattacca** (§56) e il
tasso di recupero (§57). Il drop-off è la cosa che Cover non ha e che ci fa
migliorare il dialogo invece di indovinarlo.

### G. Il resto del listino

Domande personalizzabili (§42–43), scelta della zona come **preferenza** e non
come promessa (§15), multilingua (§40–41), cross-selling in conversazione
(§13–14: il motore c'è, la conversazione no).

---

## 6. Schema: il delta

Poco, e additivo.

```
VoiceNumber            (esiste) → si popola; `did` diventa la chiave d'ingresso
VoiceConfiguration     (esiste) → si scrivono le colonne dell'instradamento
                                  + ingresso: FXO_GATEWAY | CALL_FORWARD
                                  + operatore del cliente (per le istruzioni)
                                  + verificaDeviazioneIl (quando il test è passato)

PhoneCall              (esiste) → + passoRaggiunto (dove si è interrotta)
                                  + linguaRilevata

VoiceRecovery          NUOVA    → il recupero di una chiamata interrotta:
                                  venueId, phoneCallId, numero, token (hash),
                                  scadeIl, dati raccolti (data/ora/persone),
                                  statoInvio, bookingId quando si converte

VoiceCustomQuestion    NUOVA    → §42: label, tipo, obbligatoria, condizione,
                                  ordine, campoPrenotazione, attiva
```

Niente `VoiceCall`: `PhoneCall` è viva e il guadagno sarebbe un nome. Niente
secondo motore di disponibilità, secondo CRM, seconda coda, secondo tempo
reale — le quattro regole del primo audit restano.

---

## 7. Instradamento

Le quattro situazioni sono già colonne. Quello che cambia è **chi le esegue**:

| Situazione | Fisso con scatoletta | Cellulare con deviazione |
|---|---|---|
| Aperto, qualcuno libero | squilla alle persone | squilla il cellulare |
| Nessuno risponde | Asterisk dopo `secondiDiSquillo` | l'operatore dopo N squilli |
| Occupato | Asterisk lo sa | l'operatore devia |
| Chiuso | orari del locale | l'operatore devia sempre |

**Protezione dai cicli** (§25), obbligatoria: se il risponditore rimanda la
chiamata al locale e il locale è occupato, l'operatore la devia di nuovo a
noi. Un contatore per chiamata, e al secondo giro non si rimanda più: si offre
la richiamata.

---

## 8. Architettura del risponditore

```
RETE TELEFONICA
   ↓  (scatoletta FXO  |  DID + deviazione)
ASTERISK  — bfv-from-gateway | bfv-from-trunk → Stasis
   ↓
VOICE-CORE (blackfox-voice)  — sessione, audio, barge-in
   ↓  STT ↔ LLM ↔ TTS
MOTORE DI CONVERSAZIONE      — stato della prenotazione, una domanda alla volta
   ↓  HTTP con il token del locale
TAVOLO — /api/v1/telefonia/*  → strumenti autorizzati
   ↓
availability · createBooking · waitlist · VoiceCallback · Guest
```

Le tre regole della fase 9 non si toccano, e valgono anche qui:

1. **non si dice «confermato» prima che lo strumento sia riuscito**;
2. la disponibilità si **ricontrolla al momento della scrittura**, e quello che
   è cambiato in mezzo si **dice**;
3. quello che non si sa, non si inventa: «faccio verificare dal personale».

E una quarta, che nasce dal telefono: **l'LLM non tocca il database.** Propone
una chiamata a uno strumento, il server decide. Vale già per `prenota`.

---

## 9. Rischi

| Rischio | Perché fa male | Come si tiene |
|---|---|---|
| La deviazione la imposta l'operatore | se il cliente non la imposta, Tavolo non riceve niente e sembra rotto | il passo 6 è un **test vero**: «chiama il tuo numero e lascialo squillare». Finché non arriva l'evento, la procedura non è finita |
| Codici GSM inventati | istruzioni sbagliate = cliente che smanetta sulla SIM e perde le chiamate **vere** | si mostra solo quello che abbiamo provato con una SIM di quell'operatore |
| Latenza | due secondi di silenzio al telefono e la gente riattacca | si misura (risposta, STT, TTS, strumento) e si tiene sotto controllo prima di vendere |
| Doppia prenotazione | due chiamate insieme sull'ultimo tavolo | già risolto: ricontrollo + `idempotencyKey` |
| Ciclo di rimandi | occupato → noi → rimando → occupato → noi | contatore per chiamata |
| Registrazioni | conseguenze legali serie | restano **spente**; il consenso non si raccoglie per una registrazione che non avviene |
| Prenotazione finta da un orario letto male | gente che si presenta per un tavolo che non c'è | la regola del risponditore attuale, da tenere: **davanti a un dato ambiguo si richiede** |
| L'AI che rassicura su un'allergia | il danno peggiore possibile | §39: si segnala nella prenotazione, non si rassicura |

---

## 10. Piano, e cosa blocca cosa

| Fase | Cosa | Dipende da |
|---|---|---|
| **12** | ✅ **fatta** — ingresso, procedura guidata con il test vero, protezione dai cicli | niente |
| **13** | Recupero: `VoiceRecovery`, token, modulo precompilato, attribuzione `VOICE_RECOVERY` | **un canale SMS** |
| **14** | Numeri del recupero: imbuto, passo d'abbandono, tasso di recupero | fase 13 |
| **15** | Voce: STT + TTS + motore di conversazione in `voice-core`, `capacita.ai = true` | fornitore STT/TTS |
| **16** | Conversazione completa: cross-selling parlato, modifica, cancellazione, zona come preferenza, domande personalizzate | fase 15 |
| **17** | Multilingua e lingua ricordata sull'ospite | fase 15 |
| **18** | Trascrizione, riassunto, registrazione | fornitore + privacy |

**Si può fare subito, senza comprare niente:** fase 12 intera, e la fase 14
per le metriche che non dipendono dal recupero.

**Richiede un fornitore di voce (STT/TTS):** fasi 15–18. È l'unica cosa che ci
separa dal listino Smart di Cover.

**Richiede numeri:** un DID per locale, solo per i clienti con cellulare.

**Richiede credenziali:** un canale SMS (oggi `available()` è `false` scritto a
mano). Senza, il recupero automatico non esiste e restiamo al report di Cover.

**Dipende dall'operatore del cliente:** l'attivazione della deviazione, il
numero di squilli, il comportamento su occupato e su irraggiungibile.

**Non è controllabile da Tavolo, e non si finge che lo sia:** cosa succede
prima che la chiamata ci venga deviata. Nel modello a cellulare, le chiamate
che il personale prende non le vediamo e non le contiamo.

---

## 11. La promessa, in una riga

Il ristoratore non deve pensare «ho installato un centralino». Deve pensare:
**non perdo più una prenotazione perché non riesco a rispondere al telefono.**

Cover si ferma un passo prima: se la chiamata si interrompe a metà, ti dà un
report. Noi possiamo mandare il link con tutto già scritto dentro — e quello,
il giorno che c'è un SMS, è il prodotto.

---

## 12. Fase 12, fatta

Il 18 settembre 2026. Cosa c'è adesso:

- **la prima domanda della procedura è «come ti arrivano le telefonate?»**
  (`src/components/settings/collega-telefono.tsx`), e la risposta decide i
  passi: con la scatoletta cinque, con la deviazione sei — quello in più è
  l'operatore da chiamare. Il numero mostrato è la **posizione** fra i passi
  che ci sono, non una chiave scritta a mano, perché un elenco 1-2-3-4-6-7
  manda a cercare il cinque;
- **il numero a cui far deviare** si copia dalla schermata quando gliene
  abbiamo assegnato uno (`VoiceNumber`), e quando non c'è lo **dice**: niente
  segnaposto, perché un segnaposto qui finisce detto all'operatore;
- **cosa chiedere all'operatore**, due richieste e non una: la deviazione su
  non risposta *e* quella su occupato — la seconda porta le telefonate che
  arrivano mentre si è già al telefono con un cliente, che in un ristorante
  alle otto di sera sono metà di quelle perse;
- **i codici da comporre sulla SIM non ci sono** e non ci saranno finché non
  li avremo provati con una SIM di quell'operatore
  (`src/lib/operatori-telefonici.ts`, `provato: false` per tutti, con scritto
  come si accende un operatore). Un codice sbagliato non fa perdere le nostre
  telefonate: fa perdere le sue. Una prova di unità diventa rossa il giorno
  che qualcuno scrive dei passi senza averli provati;
- **la prova è una telefonata vera**, e per la deviazione deve essere arrivata
  **dopo** la richiesta all'operatore (`provata` in
  `src/server/voice/ingresso.ts`): una telefonata di prima non dimostra
  niente, era arrivata da un'altra strada. E salvare due volte la stessa cosa
  **non** spegne la spunta, altrimenti si va a richiamare l'operatore per un
  problema che non esiste;
- **la protezione dai cicli** (`src/server/voice/rimando.ts` +
  `POST /api/v1/telefonia/rimando`): la difesa sta **dentro l'`UPDATE`** e non
  in un controllo prima della scrittura, perché due eventi che arrivano
  insieme passerebbero entrambi un `if`. Una chiamata si rimanda al locale una
  volta sola; dopo, il risponditore offre la richiamata invece di mandare la
  persona in un altro giro;
- **la scheda del telefono in Impostazioni dice quale strada è in uso**, in
  cima al collegamento: chi legge «Ultima chiamata: mai» accanto a «Cellulare,
  con deviazione» sa dove guardare, invece di cercare il guasto in Tavolo.

Verificato: `tsc`, `lint`, **1757** prove di unità (18 nuove in
`tests/voice-ingresso.test.ts`), `build`, **31/31** end-to-end — compresa la
prova che il passo dell'operatore **compare e sparisce** con la strada scelta.

Quello che la fase 12 **non** fa, e va detto: il centralino non legge ancora
`quandoOccupato`/`quandoNonRisponde` da queste colonne — quelle decisioni
vivono dentro Asterisk, e per questo la schermata non le offre. E il numero a
cui deviare va **comprato e assegnato**: finché `VoiceNumber` è vuota, la
procedura lo dice e si fermerà lì.
