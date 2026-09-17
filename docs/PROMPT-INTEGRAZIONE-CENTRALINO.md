# Integrare il centralino telefonico in Tavolo

> Prompt da incollare all'inizio di una sessione di lavoro su `tavolo-app`.
> Descrive un sistema **già costruito e in esercizio**, non un'idea da valutare.

---

## Cosa esiste già, fuori da Tavolo

**Black Fox Voice** è un centralino telefonico cloud in esercizio su
`sip.ilmiocentralino.it` (Asterisk 22 + un programma in TypeScript che decide
cosa fare delle chiamate). Riceve telefonate vere, le fa squillare in un
browser, tiene lo storico e raccoglie prenotazioni con un risponditore.

**Il modello di servizio è uno solo, e va tenuto presente perché semplifica
tutto:** il cliente non installa niente. Gli si assegna un **numero VoIP** e lui
imposta sul proprio **cellulare** la deviazione di chiamata verso quel numero
(`**21*<numero>#` sempre, oppure `**61*<numero>#` solo se non risponde). Da quel
momento chi chiama il ristorante entra nel centralino.

Niente apparati in sede, niente linee fisse, niente installatori. Un numero e un
codice da digitare.

**È un servizio multi-cliente, e ogni cliente è diverso.** Un numero VoIP per
locale, il cellulare del titolare, il numero dove girare le chiamate quando non
risponde nessuno, gli orari in cui il risponditore deve partire: cambia tutto, da
un ristorante all'altro. Il centralino è già costruito così (multi-tenant, ogni
dato legato al suo cliente) e Tavolo deve esserlo allo stesso modo — vedi il
punto 4, che è quello dove è più facile sbagliare.

### Cosa il centralino sa fare oggi

- riceve la chiamata e **conosce il numero di chi chiama** (arriva dal trunk
  dell'operatore, non da una linea analogica: qui il numero c'è sempre, salvo
  che il chiamante lo nasconda);
- la fa squillare a tutti gli operatori collegati (telefono nel browser);
- se nessuno può rispondere, **inoltra a un numero di sicurezza** (il cellulare
  del titolare) e, se non risponde nemmeno quello, fa partire un
  **risponditore che raccoglie la prenotazione**: chiede quante persone e a che
  ora, conferma a voce, e registra;
- tiene storico, analisi (chiamate perse e perché, fasce orarie, qualità) e una
  rubrica interna.

### Il pezzo che riguarda Tavolo

Il centralino ha **una sua rubrica interna** e **un suo elenco di prenotazioni**.
Sono duplicati poveri di quello che Tavolo fa molto meglio: `Guest` sa quante
volte è venuto un cliente, cosa non può mangiare, quante volte non si è
presentato; `Booking` sa i turni, i tavoli, la capienza reale della sala.

**L'integrazione serve a togliere il duplicato, non ad aggiungere una funzione.**

---

## Cosa costruire, in ordine

### 1. Il cliente riconosciuto mentre il telefono squilla

È la funzione che vale più di tutte le altre messe insieme, ed è quella che nessun
concorrente fa bene: quando il telefono squilla, chi risponde deve già sapere chi
sta chiamando.

**Serve** una rotta su Tavolo, autenticata con `ApiToken` (esiste già, con
`scopes`), che dato un numero in E.164 e un `venueId` restituisca l'ospite:

```
GET /api/v1/telefonia/ospite?phone=%2B393331234567
→ { guest: { id, firstName, lastName, loyaltyTier, totalVisits, noShowCount,
             lastVisitAt, allergies, preferences, tags, blocked },
    prossimaPrenotazione: { id, startsAt, partySize, status, tableName } | null,
    ultimaVisita: { at, partySize } | null }
```

Tre cose da non sbagliare:

- **Il confronto sui numeri.** `Guest.phone` è testo libero e conterrà
  `333 123 4567`, `+39 333 1234567`, `00393331234567`. Confrontare stringhe non
  funziona. Normalizzare in E.164 alla scrittura **e** confrontare sulle ultime
  9 cifre alla lettura — è l'unica parte che nessun operatore riscrive.
- **Un numero può essere di più ospiti** (la famiglia, il centralino di
  un'azienda). Restituire il più recente per `lastVisitAt` e dire che ce ne sono
  altri, invece di sceglierne uno in silenzio.
- **`blocked`, `noShowCount` e `allergies` sono il motivo per cui questa
  chiamata esiste.** Chi risponde deve vederli prima di dire «certo, venite».

### 2. Le prenotazioni del risponditore diventano `Booking`

Oggi il risponditore scrive in una tabella sua. Deve invece creare un `Booking`
in Tavolo con `source` telefonico e `status` da confermare.

**Serve** una rotta che accetti una prenotazione grezza:

```
POST /api/v1/telefonia/prenotazione
  { phone, partySize, requestedAt, callId, rawDigits }
→ { bookingId, guestId, stato }
```

E qui il lavoro vero non è la rotta, è **cosa fare quando la richiesta non sta
in piedi**:

- l'orario richiesto cade fuori da ogni `Shift`;
- non c'è un tavolo per quel numero di persone a quell'ora;
- il locale è chiuso quel giorno;
- l'ospite è `blocked`.

In nessuno di questi casi si butta via la richiesta: si crea comunque la
prenotazione **da confermare**, con scritto perché non è automatica. Un cliente
che ha telefonato è un cliente, anche quando chiede l'impossibile — e il
ristoratore deve poterlo richiamare.

Se invece l'orario è valido e c'è posto, la prenotazione può nascere confermata:
è la differenza fra un risponditore che aiuta e uno che crea lavoro.

### 3. Il pannello «chiamata in arrivo» dentro Tavolo

Il centralino ha già un canale eventi in tempo reale. Tavolo deve mostrare, in
sala e sulle prenotazioni, una striscia con: chi chiama, la sua storia in tre
righe, e un pulsante per aprire la scheda ospite o creare una prenotazione al
volo.

Da rispettare: **la sala è di Filippo** (`/floor` non si tocca senza accordo).
La striscia va nel guscio condiviso, non dentro la sala.

### 4. La configurazione telefonica del singolo locale

**Questo è il punto da non sbagliare: non esiste una configurazione del
centralino. Ne esiste una per ogni cliente.** Ogni locale ha il suo numero VoIP,
il suo cellulare deviato, il suo numero di sicurezza, i suoi orari. Niente di
tutto questo va scritto nel codice o in un file di configurazione del server: sta
nel database, legato al `Venue`, e si modifica dall'interfaccia senza toccare il
centralino.

I numeri che girano oggi nelle prove — `011 4410418` e `+39 346 061 2422` — sono
di Luca. Non sono valori predefiniti, non sono esempi da copiare, e non devono
comparire in nessuna parte del codice.

Su ogni `Venue` servono, tutti facoltativi finché il servizio non è attivo:

| Cosa | Perché
|---|---
| **Numero VoIP assegnato** | il numero che diamo noi al cliente; è la chiave che lega questo locale a un cliente del centralino. Unico: due locali non possono avere lo stesso.
| **Cellulare del ristoratore** | quello che ha impostato la deviazione. Serve per due cose: mostrargli le istruzioni giuste, e **non trattarlo come un ospite** quando chiama dal suo numero.
| **Numero di sicurezza** | dove inoltrare se nessuno risponde al gestionale. Spesso è un secondo cellulare, o il fisso della cucina.
| **Risponditore acceso / spento** | e dopo quanti secondi di squillo parte.
| **Orari in cui rispondere** | fuori orario la chiamata può andare diretta al risponditore invece di squillare a vuoto.
| **Stato della deviazione** | non attivata / attivata / verificata.

Tre regole che valgono per ogni cliente e che il codice deve far rispettare:

- **Il numero di sicurezza non può essere il cellulare deviato.** Se lo fosse,
  inoltrargli la chiamata significherebbe rimandarla al centralino: un anello che
  gira finché non finiscono i canali. Va rifiutato al salvataggio, con una frase
  che spiega perché — non un errore generico.
- **Il numero VoIP appartiene a un locale solo.** Vincolo di unicità vero sul
  database, non un controllo nell'interfaccia: se due locali condividono il
  numero, le chiamate di uno finiscono nello storico dell'altro.
- **Il cellulare del ristoratore non diventa mai un `Guest`.** Chiama decine di
  volte e si porterebbe dietro statistiche false.

**L'attivazione, vista dal ristoratore**, è la parte che dobbiamo rendere facile,
perché è l'unica cosa che gli chiediamo di fare:

1. gli assegniamo il numero VoIP e lo scriviamo nella sua scheda;
2. l'interfaccia gli mostra **il codice esatto da digitare sul suo telefono**,
   già compilato con il suo numero: `**21*<numero VoIP>#` per deviare sempre,
   `**61*<numero VoIP>#` per deviare solo quando non risponde, `##21#` per
   togliere. Il codice si copia con un tocco.
3. **una chiamata di prova che verifica davvero che la deviazione funzioni.** Qui
   non si può dare niente per scontato: se digita il codice sbagliato, il telefono
   non dà errore — dice «servizio attivato» lo stesso e la deviazione non c'è.
   Finché la prova non è passata, lo stato resta «non verificata» e il locale
   va segnalato come non operativo.

Piccola cosa che farà perdere tempo se non è scritta: **le istruzioni cambiano da
operatore a operatore.** Iliad, Ho, Fastweb e i virtuali non si comportano tutti
allo stesso modo sui codici di deviazione condizionata, e su alcuni la deviazione
va attivata dall'area clienti invece che dalla tastiera. Il testo delle istruzioni
dev'essere modificabile, non compilato dentro il componente.

---

## Come parlano i due sistemi

**Tavolo espone, il centralino consuma.** Non il contrario: Tavolo sta su
Vercel, il centralino su un server con Asterisk, e le chiamate arrivano lì.

- autenticazione con `ApiToken` di Tavolo (già presente), scope dedicato
  `telefonia:read` / `telefonia:write`;
- **un token per locale**, non uno per tutto il centralino: se il token di un
  ristorante finisce dove non deve, si porta dietro solo i suoi dati;
- ogni rotta è **per `venueId`**: il token lo porta con sé, e non si accettano
  richieste che nominano un altro locale;
- **come il centralino sa di quale cliente si tratta:** dal numero VoIP su cui è
  arrivata la chiamata, non dal numero di chi chiama. Quel numero identifica il
  locale, il locale ha il suo token, e con quello si interroga Tavolo. Se il
  numero non è associato a nessun locale la chiamata deve comunque funzionare —
  squilla e basta, senza i dati dell'ospite;
- il centralino chiama Tavolo **con un tetto di tempo di 800 ms** e prosegue
  senza i dati se non arrivano: una telefonata non può aspettare un gestionale.
  Questa regola esiste già nel centralino e va rispettata anche qui — la rotta
  dev'essere veloce, con gli indici giusti su `phone`.

---

## Trappole già pagate, da non ripagare

- **Verificare che il dato esista prima di cercare dove si perde.** Un'ora persa
  a inseguire il numero del chiamante dentro l'apparato, quando la linea non lo
  consegnava affatto.
- **Un elenco che ignora la rubrica sembra una rubrica rotta.** Nel centralino
  il nome del contatto compariva in una schermata su tre. Se Tavolo mostra
  l'ospite in un posto e il numero nudo in un altro, l'integrazione sembrerà non
  funzionare.
- **Le chiamate passate contano.** Collegare un ospite a un numero deve
  attribuirgli anche le telefonate già ricevute, altrimenti lo storico resta
  pieno di numeri e sembra che il collegamento non abbia funzionato.
- **L'anello.** Se il numero di sicurezza ha la deviazione attiva verso il
  centralino, inoltrargli una chiamata significa richiamare se stessi: ogni giro
  costa due canali. Vale anche per qualunque automazione di Tavolo che faccia
  partire telefonate.
- **Niente numeri finti nelle prove.** Un numero di prova che finisce in `Guest`
  si porta dietro prenotazioni e statistiche false.

---

## Cosa NON fare

- Non spostare Asterisk o il centralino dentro Tavolo: sono due servizi, e il
  telefono deve funzionare anche quando il gestionale è in manutenzione.
- Non duplicare `Guest` nel centralino: la rubrica interna va **svuotata** a
  integrazione fatta, non tenuta in sincronia.
- **Non scrivere nessun numero di telefono nel codice.** Né il VoIP, né il
  cellulare, né il numero di sicurezza: stanno tutti sulla scheda del locale. Un
  numero in una costante è un cliente che riceve le chiamate di un altro.
- Non toccare `/floor`.
- Non promettere al ristoratore che il centralino risponde «con l'intelligenza
  artificiale»: oggi il risponditore funziona a tasti. I concorrenti
  (CoverManager) usano una voce che parla, ed è un divario noto — non va coperto
  a parole.

---

## Ordine di lavoro consigliato

1. Rotta di riconoscimento ospite dal numero (la 1), con i test sui formati.
2. Pannello chiamata in arrivo che la usa (la 3).
3. Prenotazione telefonica → `Booking` (la 2), con la gestione dei casi che non
   stanno in piedi.
4. Numero del locale su `Venue` e istruzioni per il ristoratore (la 4).

La 1 e la 2 hanno valore da sole. La 3 senza la 1 non ha niente da mostrare.
