# TAVOLO — UX/UI Master Redesign V2

**Operational Hospitality OS · progetto di riprogettazione dell'esperienza**

> Documento di progetto, scritto **prima** dell'implementazione (§121). Non è un
> restyling: la palette, la tipografia e l'atmosfera restano quelle. È un lavoro
> di architettura dell'informazione, interazione, densità e flussi operativi.

**Data:** 9 settembre 2026 · **Base:** `main` a `40e44e3` · 868 test, 9 flussi
end-to-end, 39 rotte, 23 migrazioni.

---

## Su cosa si basa questo audit, e cosa non ho potuto guardare

Perché chi legge sappia quanto pesare ogni affermazione.

**Ho letto:** l'intero albero delle rotte, i componenti dell'area operativa, i
modelli Prisma, la matrice dei permessi, la definizione della navigazione, il
motore di disponibilità, il motore di stato della sala, le regole degli avvisi,
i dizionari di stato, la configurazione dei breakpoint, l'inventario dei
componenti di base.

**Ho misurato, sulla produzione, 59 schermate:** stato HTTP, errori in console,
scorrimento verticale e orizzontale, e il testo estratto da ogni pagina —
`docs/audit-2026-09-09/rapporto.json`.

**Non ho potuto rileggere le immagini.** L'ambiente in cui lavoro ha smesso di
accettare la lettura di immagini a metà giornata. Ho visto con i miei occhi, e
in questa stessa sessione, sette schermate: Panoramica (scrivania e telefono),
Analisi, Impostazioni, Sala viva, CRM ospiti (scrivania e telefono). Le altre
52 le conosco dal testo che rendono, dalle misure e dal codice che le genera.

**Conseguenza pratica, dichiarata:** i giudizi su gerarchia, densità, numero di
click, informazione mancante o fuori posto sono fondati sul codice e sui
contenuti, e sono affidabili. I giudizi puramente estetici — equilibrio di una
composizione, peso percepito di un bordo — su 52 schermate su 59 non li ho
espressi. Dove serviva l'occhio l'ho scritto e ho lasciato la decisione a una
revisione visiva.

---

# 1. Executive Summary

Tavolo non ha un problema di aspetto. Ha un problema di **collocazione**: molta
dell'intelligenza che serve durante il servizio esiste già, funziona, ed è
sepolta uno o due click sotto il punto in cui servirebbe.

Cinque affermazioni, ognuna verificata nel codice.

**1. La voce di navigazione «Sala» porta all'editor, non alla sala viva.**
`/floor` è la pagina in cui si aggiungono, si rinominano, si spostano e si
cancellano i tavoli. La sala **viva** — sette stati per tavolo, chi è seduto, il
conto aperto, fra quanto si libera — sta a `/service/room`, dentro Servizio.
Sul telefono la barra in basso ha «Sala» al terzo posto: alle 21:15 di sabato,
il gesto più naturale del mondo porta a un editor di piantine. È il difetto più
grave che ho trovato, e non è un'opinione: è una destinazione sbagliata.

**2. Lo stesso oggetto ha due vocabolari di stato.** La sala viva ha **sette**
stati (`CONTO, OCCUPATO, IN_ARRIVO, PULIZIA, PRENOTATO, LIBERO, BLOCCATO`,
ordinati per urgenza). L'editor ne ha **quattro** (`LIBERO, PRENOTATO,
OCCUPATO, NON_DISPONIBILE`). Un tavolo «al conto» in una schermata è
«occupato» nell'altra. Chi impara il prodotto su una vista non riconosce
l'altra.

**3. L'intelligenza è un click troppo in basso.** Il motore che trova i tavoli
compatibili con chi aspetta (`findFreeTables`, condiviso fra lista d'attesa e
walk-in) esiste ed è buono. Ma la riga della lista d'attesa **non dice quale
tavolo**: bisogna premere «Accomoda» e aprire una finestra per scoprirlo. In
Servizio l'avviso lo dice («T9 è libero per Famiglia Bertoldi»); nella schermata
che si chiama Attesa, no.

**4. Manca il riconoscimento dell'ospite mentre si scrive.** Il modulo di nuova
prenotazione non cerca nel CRM mentre si digita telefono o email, quindi chi
risponde al telefono chiede nome, cognome ed email a un cliente che il locale
conosce — e soprattutto **non vede** che è un VIP, che è allergico ai
crostacei, che due volte non si è presentato. Sono le tre cose che cambiano la
risposta a «avete un tavolo sabato?», e oggi si scoprono aprendo la scheda,
cioè quasi mai.

> **Correzione, 9 settembre.** La prima versione di questa riga diceva che ogni
> prenotazione telefonica è «un potenziale doppione». **È falso**, e l'ho
> verificato implementando: `createBooking` passa da `trovaOCreaOspite` e
> riusa la scheda esistente cercandola per email o telefono normalizzato. Il
> server si difende già. Il valore del riconoscimento è la velocità e il
> contesto, non l'integrità dei dati — che è un'altra cosa e funziona.

**5. Un solo modo di aprire le cose.** `Dialog` è importato in 29 file, `Sheet`
in 2, un `Drawer` non esiste. Quindi ogni dettaglio è una **pagina** (con un
«torna indietro» che perde il contesto) e ogni azione è una **finestra
modale**. Le regole del §61 non sono nemmeno esprimibili con l'inventario
attuale.

**E una cosa che va detta prima di toccare qualsiasi cosa.** Tavolo ha già una
qualità che i concorrenti non hanno e che questo redesign deve proteggere come
la prima priorità: **non inventa numeri**. Dove il campione è troppo piccolo
dice «non abbastanza dati»; dove il valore è una stima lo scrive; dove nessuno
scrive un campo dice «non ancora» invece di «0,00 €»; e le percentuali del food
cost dichiarano su quale parte dell'incasso sono misurate. Non è una scelta
grafica: è la ragione per cui un ristoratore può fidarsi di una schermata. Ogni
proposta qui dentro è compatibile con questa regola, o non c'è.

**Punteggio complessivo attuale: 6,4/10. Target realistico: 8,6/10.** Il
dettaglio per pagina è nella sezione 4-bis.

---

# 2. Current UX Score

Non un voto unico: sei dimensioni, perché i problemi non sono distribuiti in
modo uniforme.

| Dimensione | Oggi | Target | Perché questo voto |
|---|---:|---:|---|
| **Fiducia nei dati** | 9,5 | 9,5 | Il vantaggio competitivo. Non si tocca, si estende |
| **Non-scorrimento / densità** | 8,5 | 9,0 | 46 pagine operative su 46 stanno in una schermata (misurato). Restano densità troppo uniformi |
| **Coerenza del linguaggio** | 6,0 | 9,0 | Un nome per funzione su tutti i device (buono); due vocabolari di stato per i tavoli (grave) |
| **Architettura dell'informazione** | 5,5 | 9,0 | «Sala» porta all'editor. Il dettaglio è una pagina. L'intelligenza è sepolta |
| **Velocità operativa (click)** | 5,5 | 8,5 | Nessun undo, quasi nessun optimistic, azioni di riga assenti nelle liste |
| **Tablet** | 3,0 → **6,5** | 8,0 | Rivisto dopo la misura: il layout tiene (zero scorrimenti a 1024), i bersagli di tocco erano il difetto vero e sono corretti. Restano le viste affiancate |
| **Complessivo** | **6,4** | **8,6** | |

**Come ho pesato:** fiducia nei dati e non-scorrimento contano doppio, perché
sono le due cose che il prodotto ha già scelto di essere. Il tablet conta
doppio anche lui, perché in reception è il device più probabile e oggi è
scoperto.

---

# 3. Core UX Problems

I dieci problemi, in ordine di quanto costano durante un servizio.

## P-01 · «Sala» porta all'editor · **P0** — **RITIRATO il 9 settembre**

**Questa constatazione era sbagliata, e la modifica è stata annullata su
indicazione di Luca.**

Avevo scritto che la voce «Sala» portava all'editor delle piantine e che la
sala vera fosse `/service/room`, e avevo spostato la voce lì. `/floor` **non è
un editor**: è la sala del locale — i tavoli in pianta, i posti, chi copre
quale tavolo, il turno, la data, «17 di 17 tavoli assegnati» — e l'editor è una
cosa che si apre da lì, quando serve.

Il risultato della modifica era il contrario di un miglioramento: «Sala»
apriva una vista a riquadri che dice meno e assomiglia poco al locale, mentre
la sala vera finiva sotto «Altro» col nome «Piantina».

Rimesso tutto come stava: «Sala» → `/floor`, nessuna seconda voce, e anche
«vai in sala» dell'agente apre la stessa cosa che apre il menu. La sala viva
resta dove era anche prima: dentro Servizio, con la sua linguetta.

**Cosa insegna, oltre al caso.** È lo stesso difetto delle cinque cose che
avevo già sbagliato in questo audit (sezione 51): **ho dedotto cosa fa una
schermata dal suo indirizzo e dal nome dei suoi componenti**, invece di
aprirla. `/floor` + `room-builder-*` mi ha fatto scrivere «editor». Bastava
guardarla.

## P-02 · Due vocabolari di stato per i tavoli · **P0**
Sette stati contro quattro, nomi diversi per la stessa condizione. Vedi §34.

## P-03 · Il tavolo consigliato non si vede nella lista d'attesa · **P0**
Il motore c'è. La riga non lo mostra. Un click e una finestra fra «vedo chi
aspetta» e «so dove metterlo».

## P-04 · Nessun riconoscimento ospite in prenotazione · **P0**
Il contesto — VIP, allergia, assenze precedenti — non arriva a chi sta
scrivendo la prenotazione, e si chiedono dati che il locale ha già. **Non** è
un problema di doppioni: quelli il server li evita da sé (vedi la correzione
nel §1).

## P-05 · Il contesto ospite non è nella lista prenotazioni · **P1**
`cosaSapere` — allergia, occasione, note, assenze, livello, al massimo quattro
righe in ordine di urgenza — esiste ed è usato nella scheda prenotazione, in
Servizio e in Sala. **Non** nella lista del giorno, che è la schermata di
preparazione. Chi prepara il servizio deve aprire una prenotazione per volta
per sapere chi ha un'allergia.

## P-06 · Nessuna azione di riga nelle liste · **P1**
Da una riga della lista prenotazioni non si segna un arrivo, non si assegna un
tavolo, non si segna un'assenza. Si apre la pagina, si agisce, si torna
indietro. Su nove prenotazioni sono ventisette navigazioni.

## P-07 · Nessun undo, nessun toast · **P1**
Zero file usano un sistema di notifiche temporanee. Quindi ogni azione
recuperabile è o silenziosa o protetta da una conferma. Il §67 non è
implementabile senza costruire prima il componente.

## P-08 · Il tablet non è progettato · **P1**
`sm:` 122 usi, `md:` 77, `lg:` 59, `xl:` **12**. La fascia 768–1279 è servita da
quello che capita. Nessuna vista affiancata.

## P-09 · Dettagli come pagine · **P2**
Scheda prenotazione, scheda ospite, dettaglio campagna: pagine intere con un
ritorno che perde la posizione nella lista.

## P-11 · Due tabelle per «chi copre questo tavolo» · **P0** *(trovato in Fase 5)*
`StaffAssignment` (una riga per tavolo, con la capacità — la scrive la
piantina) e `WaiterAssignment` (una riga per cameriere, con un elenco di tavoli
— la scrive «Assegna servizio» da Camerieri). **Due fonti di verità per lo
stesso fatto, e non si guardano.** Un manager assegna Alfredo a T1–T7 da
Camerieri, qualcun altro assegna Giulia a T1 dalla sala, e nessuna delle due
schermate vede il lavoro dell'altra.

Il sintomo visibile l'ho trovato sulla demo: **settantasei tavoli assegnati
dalla sala, e la pagina Camerieri non ne mostrava nessuno.** Non era «un elenco
amministrativo poco utile», come avevo scritto: era una pagina che leggeva la
tabella sbagliata.

**Mitigato in Fase 5** — la fascia «il turno di oggi» legge entrambe, perché dal
punto di vista di chi lavora sono entrambe assegnazioni vere fatte dentro il
prodotto. **Non risolto:** serve decidere quale modello resta e migrare
l'altro. Non è UX, è una decisione sul modello dei dati, e va fatta con gli
occhi aperti perché tocca una funzione che qualcuno potrebbe già usare.

## P-10 · Densità uniforme · **P2**
Gli stessi padding in Servizio e in Impostazioni. `text-xs` 488 usi, `text-sm`
454: la scala è in pratica binaria, e la gerarchia si regge sul peso e sul
colore più che sulla dimensione.

---

# 4. Navigation Audit

## CURRENT NAVIGATION MAP

Fonte: `src/components/shell/nav-items.ts`.

**Barra principale (scrivania, 6 voci)**

| Voce | Destinazione | Cos'è davvero | Frequenza | Modo |
|---|---|---|---|---|
| Panoramica | `/overview` | La giornata in una schermata | alta, 1-2 volte al giorno | Preparazione |
| Servizio | `/service` | Il centro del turno | altissima, continua | Servizio |
| Prenotazioni | `/bookings` | Elenco del giorno + settimana | alta | Preparazione |
| **Sala** | **`/floor`** | **L'editor della piantina** | **bassa (configurazione)** | **Gestione** |
| Attesa | `/waitlist` | La coda | alta durante i picchi | Servizio |
| Ospiti | `/guests` | CRM | media | Gestione |

**«Altro» (7 voci, tre gruppi)** — Il locale: Camerieri, Menu, Esperienze ·
Crescita: Marketing, Analytics · Sistema: Pagamenti, Impostazioni.

**Barra in basso (telefono, 4 voci + «+» + «Altro»)**
Panoramica · Servizio · **Sala (`/floor`)** · Attesa

**Il difetto, in una frase:** la barra dà a un editor di configurazione — usato
una volta, quando si apre il locale — uno dei sei posti sulla scrivania e uno
dei quattro sul telefono. E non dà nessun posto alla sala **viva**, che serve
tutta la sera.

**Cosa invece è già giusto e va difeso:** un nome per funzione su tutti gli
schermi. Il codice porta la cicatrice della lezione: la Panoramica si chiamava
«Oggi» sul telefono e «Panoramica» sulla scrivania, il Servizio «Ora» — due
vocabolari per lo stesso prodotto. La regola attuale (`shortLabel` solo per
abbreviare la *stessa* parola) è corretta e questo redesign la rispetta.

## PROPOSED NAVIGATION MAP

**Barra principale (scrivania, 6 voci)**

| Voce | Destinazione | Frequenza | Device | Motivazione |
|---|---|---|---|---|
| Oggi | `/overview` | alta | tutti | Resta prima: è la domanda della mattina |
| Servizio | `/service` | altissima | tutti | Resta seconda: è la schermata madre del turno |
| Prenotazioni | `/bookings` | alta | tutti | Resta |
| **Sala** | **`/service/room`** | **altissima** | **tutti** | **Cambia destinazione: la sala viva.** È la risposta a «dove lo metto» |
| Attesa | `/waitlist` | alta | tutti | Resta |
| Ospiti | `/guests` | media | tutti | Resta |

**L'editor della piantina** si sposta in `Impostazioni → Il locale → Sala`
(`/settings?parte=locale`, con la piantina come sua pagina). È configurazione:
si fa una volta, si ritocca quando si cambia l'arredamento, e non ha niente da
fare in una barra pensata per il servizio. La rotta `/floor` resta viva e
reindirizza, così i link esistenti non si rompono.

**Barra in basso (telefono, 4 voci + «+»)**

| Posizione | Voce | Perché |
|---|---|---|
| 1 | Oggi | La domanda della mattina |
| 2 | Servizio | Il turno |
| 3 | **«+»** | L'azione, al centro, sotto il pollice |
| 4 | **Prenotazioni** | **Entra al posto di «Attesa»** |
| 5 | Sala (viva) | Sostituisce l'editor |

**La decisione che il §58 chiede, motivata.** La domanda è: fra Prenotazioni e
Attesa, chi merita il quarto posto? Tre argomenti per Prenotazioni:

1. **Frequenza per tutti i ruoli, non solo nei picchi.** `RECEPTION` e `WAITER`
   hanno entrambi `manage_bookings` e nient'altro (matrice in
   `lib/abilities.ts`): le prenotazioni sono l'unica cosa che possono fare
   entrambi. La lista d'attesa serve molto, ma solo quando il locale è pieno —
   e quando è pieno si vive in Servizio, che è già al secondo posto.
2. **La coda è già in Servizio.** La schermata Servizio ha tre zone e la terza
   è «Attesa», con i gruppi e le azioni. Chi è in servizio non passa da
   `/waitlist`: ce l'ha davanti.
3. **Le prenotazioni no.** Non esiste una vista della lista del giorno dentro
   Servizio, ed è la schermata che si apre venti volte al giorno per rispondere
   al telefono.

Quindi: Attesa esce dalla barra in basso — non dal prodotto — e resta sotto
«Altro» e dentro Servizio.

**«Altro», invariato nella sostanza**, con due movimenti: entra **Sala
(piantina)** nel gruppo «Il locale», ed entra **Attesa** in cima come prima
voce, sopra i gruppi, perché è l'unica delle voci secondarie che serve durante
il servizio.

---

# 4-bis. Audit pagina per pagina

Il formato del §4. Trentacinque pagine, nessuna esclusa. I punteggi sono su
dieci; «pressione operativa» è quanto conta la velocità *mentre il locale
lavora*.

## Riepilogo dei punteggi

| Pagina | Rotta | Utente | Freq. | Pressione | UX | Gerarchia | Velocità | Mobile | Target |
|---|---|---|---|---|---:|---:|---:|---:|---:|
| Panoramica | `/overview` | manager | alta | media | 8 | 8 | 7 | 8 | 9 |
| Servizio | `/service` | host, cameriere | altissima | **alta** | 7 | 7 | 6 | 7 | 9,5 |
| Sala viva | `/service/room` | host, cameriere | altissima | **alta** | 7 | 7 | 5 | 6 | 9,5 |
| Prenotazioni giorno | `/bookings` | host, reception | alta | **alta** | 6 | 5 | 4 | 6 | 9 |
| Prenotazioni settimana | `/bookings` (vista) | manager | media | bassa | 7 | 7 | 6 | 6 | 8 |
| Nuova prenotazione | `/bookings/new` | reception | alta | **alta** | 7 | 8 | 6 | 7 | 9,5 |
| Scheda prenotazione | `/bookings/[id]` | host | alta | media | 6 | 7 | 4 | 6 | 9 |
| Piantina (editor) | `/floor` | manager | **bassa** | bassa | 6 | 5 | 6 | 4 | 8 |
| Lista d'attesa | `/waitlist` | host | alta | **alta** | 6 | 6 | 5 | 7 | 9,5 |
| CRM ospiti | `/guests` | manager, marketing | media | bassa | 8 | 8 | 7 | 8 | 9 |
| Scheda ospite | `/guests/[id]` | manager | media | bassa | 7 | 6 | 6 | 7 | 8,5 |
| Doppioni | `/guests/doppioni` | manager | bassa | bassa | 8 | 8 | 8 | 7 | 8,5 |
| Analisi · com'è andata | `/insights?vista=andamento` | manager | media | bassa | 8,5 | 9 | 7 | 7 | 9 |
| Analisi · cibo e carta | `?vista=carta` | manager | media | bassa | 8,5 | 8 | 7 | 6 | 9 |
| Analisi · servizio | `?vista=servizio` | manager | media | bassa | 8 | 8 | 7 | 6 | 9 |
| Analisi · domanda | `?vista=domanda` | manager | media | bassa | 8 | 8 | 6 | 6 | 9 |
| Carta | `/menu` | manager | media | bassa | 6 | 6 | 5 | 6 | 8,5 |
| Marketing (hub) | `/marketing` | marketing | bassa | bassa | 6 | 5 | 6 | 7 | 8,5 |
| Automazioni | `/marketing/automations` | marketing | bassa | bassa | 8 | 8 | 7 | 7 | 8,5 |
| Coupon | `/marketing/coupons` | marketing | bassa | bassa | 6 | 6 | 6 | 6 | 8 |
| Gift card | `/marketing/gift-cards` | manager | bassa | bassa | 7 | 8 | 6 | 7 | 8,5 |
| QR | `/marketing/qr-codes` | manager | bassa | bassa | 7 | 7 | 8 | 7 | 8 |
| Wi-Fi contatti | `/marketing/wifi` | marketing | bassa | bassa | 7 | 8 | 6 | 7 | 8,5 |
| Campagne | `/campaigns` | marketing | bassa | bassa | 7 | 7 | 6 | 6 | 8,5 |
| Campagna · risultati | `/campaigns/[id]` | marketing | bassa | bassa | 7 | 7 | 7 | 6 | 8,5 |
| Campagna · procedura | `/campaigns/new` | marketing | bassa | bassa | 8 | 8 | 7 | 6 | 9 |
| Esperienze | `/experiences` | manager | bassa | bassa | 5 | 5 | 6 | 6 | 8 |
| Pagamenti | `/payments` | manager | bassa | bassa | 8 | 8 | — | 7 | 8 |
| Camerieri | `/waiters` | manager | media | media | 5 | 5 | 5 | 6 | 9 |
| Impostazioni × 4 | `/settings?parte=` | manager | bassa | bassa | 7 | 7 | 6 | 7 | 8,5 |
| Brand | `/settings/brand` | manager | bassa | bassa | **8,5** | 8 | 8 | 8 | 8,5 |
| Portale Wi-Fi (conf.) | `/settings/wifi` | manager | bassa | bassa | 7 | 7 | 6 | 6 | 8 |
| Vetrina | `/` | pubblico | — | — | 7 | 7 | — | 7 | 8 |
| Accesso | `/sign-in` | staff | — | — | 6 | 7 | 8 | 8 | 8,5 |
| Prenota (pubblico) | `/book` | **cliente** | — | — | **8,5** | 9 | 8 | 8 | 9,5 |
| Menu pubblico | `/m/[slug]` | **cliente** | — | — | 8 | 8 | — | 8 | 9 |
| Portale Wi-Fi | `/wifi/[slug]` | **cliente** | — | — | **8,5** | 8 | 8 | 8 | 9 |
| Sondaggio | `/s/[token]` | **cliente** | — | — | 9 | 9 | 9 | 9 | 9 |

«Velocità» su Pagamenti è `—` perché la pagina dichiara di non avere funzioni:
non c'è un compito da cronometrare.

## Le schede, una per pagina

### Panoramica · `/overview`
**Funzione:** rispondere a «cosa devo sapere oggi». **Utente:** manager, la
mattina. **Scorrimento evitabile:** no, già eliminato.
**Problemi:** il riquadro «Soldi e assenze» mette accanto un incasso e un
conteggio di assenze, che sono risposte a due domande diverse; l'area in basso a
sinistra resta vuota quando le prenotazioni del giorno sono poche, e su schermi
molto larghi il vuoto è ampio.
**Informazioni inutili:** nessuna. **Mancanti:** i rischi della giornata —
grandi tavolate senza tavolo, clienti con assenze precedenti fra chi arriva
oggi. Il dato esiste (`cosaSapere`, `noShowCount`), non è mostrato qui.
**Azioni nascoste:** nessuna: le tre scorciatoie sono in vista.
**Proposta:** tre fasce — *briefing* (invariato), *rischi di oggi* (nuovo, e
compare solo se ce n'è: se non ci sono rischi la fascia non esiste, non dice
«nessun rischio»), *la giornata* (timeline + andamento). Il vuoto si riempie da
sé quando la fascia dei rischi ha qualcosa da dire, e nei giorni tranquilli il
vuoto **è** l'informazione.
**Target:** 9.

### Servizio · `/service`
**Funzione:** «cosa devo fare adesso». La schermata più importante del prodotto.
**Pressione: alta.**
**Cosa è già giusto e non si tocca:** i dieci avvisi con *problema → motivo →
impatto → azione*, e la regola «un avviso senza impatto non si mostra» (un
tavolo oltre la durata che nessuno aspetta non è un problema). Le tre zone
adesso/prossimi/attesa. Il gesto giusto su ogni scheda invece di un menù di
tutte le azioni.
**Problemi:** i sei numeri in cima hanno tutti lo stesso peso, quindi nessuno ha
il peso giusto — «12 in attesa» e «1 walk-in oggi» sono tipograficamente pari.
Gli avvisi non hanno livelli: sono un elenco, ordinato per rilevanza interna ma
senza una gerarchia visibile. Le tre zone su scrivania sono selezionate da
schede, quindi si vede una zona per volta anche a 1440px, dove ci starebbero
tutte.
**Mancanti:** un livello di severità dichiarato (§11). Il tempo residuo su chi è
seduto è nella sala viva ma non nella colonna «adesso».
**Proposta:** i sei numeri diventano una riga sola, compatta, con **due**
promossi a peso maggiore in base al contesto (in attesa e in ritardo, se ci
sono; altrimenti in sala e prossimi). Gli avvisi prendono quattro livelli
(§11) con un segno visivo, non un colore nuovo. Su scrivania le tre zone
diventano tre colonne affiancate; su telefono restano schede.
**Target:** 9,5.

### Sala viva · `/service/room`
**Funzione:** «dove posso mettere questa persona». **Pressione: alta.**
**Cosa è già giusto:** sette stati derivati dai fatti, ordinati per urgenza; la
previsione di liberazione che usa la durata **misurata in quel locale** e
dichiara su quante cene («1 ora e 40, su 303 cene chiuse»); il conto aperto col
numero di righe, perché «conto a zero righe» e «conto da 40 €» dicono cose
diverse su quando quel tavolo si libera.
**Problemi:** non è raggiungibile dalla navigazione (P-01). Su telefono la mappa
spaziale non ha senso e diventa un elenco: è la scelta giusta, ma l'elenco perde
la relazione fra tavoli vicini. Toccare un tavolo apre una selezione, non un
pannello con le azioni.
**Mancanti:** un pannello di dettaglio del tavolo (§23) con conto, ospite,
prossima prenotazione e azioni. Oggi le azioni sono altrove.
**Proposta:** diventa la destinazione della voce «Sala». Tocco su tavolo →
pannello laterale su scrivania e tablet, foglio dal basso su telefono, con
stato, ospite, durata, prossima prenotazione, allergie, conto e le azioni
(accomoda, sposta, unisci, apri/chiudi conto, libera). Nessuna nuova pagina.
**Target:** 9,5.

### Prenotazioni · giorno · `/bookings`

**Tre difetti trovati il 9 settembre guardando lo scatto di
`?status=pending`** — e nessuna misura ne segnalava uno:

1. **Il vuoto dava la colpa alla data.** «Nessuna prenotazione per questa
   data» con tredici prenotazioni in giornata e zero in sospeso: chi legge
   cambia giorno per cercare una cosa che è lì. Adesso dice cosa è vuoto —
   «Nessuna prenotazione in sospeso per questa data — la giornata ne ha 13» —
   con il collegamento per tornare a tutte.
2. **Il conteggio in testa era vero del filtro e falso della giornata:** «0
   prenotazioni · 0 coperti». Adesso dichiara la base: «0 in sospeso su 13».
   È la stessa regola dei numeri che dicono su cosa sono misurati, applicata a
   un filtro.
3. **Tre modi di dire «questa è scelta» nella stessa schermata:** crema per
   «Tutte» e «Confermate», **arancione** (`bg-amber-600`, un giallo preso fuori
   dalla tavolozza) per «In sospeso», e un quarto colore per la vista scelta
   accanto. L'arancione su un filtro sembrava un allarme, non una selezione.
   Adesso il crema è l'unico modo, come nella linguetta del Servizio e nelle
   viste di Analytics; il numero delle sospese resta in evidenza, perché
   quello è un'informazione e l'informazione non è la selezione.

**I riquadri d'avvertimento, fatti subito dopo.** Erano sedici i punti con un
colore fuori tavolozza, e la risposta non era una questione di gusto: la
`DESIGN.md` l'aveva già data. «**La Regola dell'Accento Unico**: il terracotta è
l'unico accento cromatico del sistema… le uniche eccezioni sono il sage per il
positivo e il rosso per il distruttivo». E del terracotta dice: «stato attivo,
badge, **ciò che avvisa**».

Quindi i sette riquadri e testi d'avvertimento su fondo giallo chiaro
(`bg-amber-50`) sono diventati riquadri con l'accento del tema, e i due
riquadri distruttivi su rosa chiaro usano il rosso del sistema. Il trattamento
giusto **esisteva già** nel prodotto — è quello degli avvisi del Servizio e del
riquadro della rotazione: quei sedici punti semplicemente non lo chiamavano.

Nella stessa passata: la pillola «2 allergie» della Panoramica era rosa mentre
la stessa allergia, in Servizio e in Sala, è color accento. Un segnale che
cambia colore da una schermata all'altra è due segnali.

**Cosa resta, e perché non l'ho toccato.** Tre toni di `Badge`
(`warning`/`danger`/`info`) sono ancora fuori tavolozza, e con loro i sette
stati di una prenotazione: collassarli sui quattro colori del documento vuol
dire **ridisegnare il sistema di stato** (§34) tenendoli distinguibili anche
per chi non separa il rosso dal verde — è una decisione, non una sostituzione.
E i venti `text-rose-600` degli errori: il rosso del sistema (#C32222) su verde
molto scuro ha meno contrasto del rosa attuale, quindi cambiarlo **peggiora la
leggibilità di un messaggio d'errore** se non si tocca anche il token. Le due
cose vanno guardate insieme, con l'occhio di Luca.
**Funzione:** «chi deve venire e quando». **Pressione: alta** — è la schermata
aperta quando squilla il telefono.
**Problemi:** la riga dice ora, ospite, coperti, tavolo, stato — e **non** dice
il segnale che conta: VIP, allergia, occasione, assenze precedenti. Quel dato
esiste (`cosaSapere`) e viene mostrato in tre altre schermate. Nessuna azione di
riga: per segnare un arrivo si apre la pagina e si torna. Su telefono due
colonne sono già nascoste (tavolo e fonte), scelta corretta.
**Mancanti:** la riga di segnale; le azioni di riga; il totale dei coperti per
turno accanto al filtro.
**Proposta:** riga a due livelli — prima riga i fatti, seconda riga il segnale
solo quando c'è (una riga senza segnali resta a un livello, così la lista non
raddoppia di altezza per niente). Azioni: su scrivania un menù sulla riga; su
telefono tocco lungo o freccia → foglio dal basso con le sette azioni.
**Target:** 9.

### Nuova prenotazione · `/bookings/new`
**Cosa è già giusto — e il §15 chiede una cosa già fatta:** il modulo mostra
solo gli essenziali (nome, cognome, telefono, data, persone, orario) e nasconde
email, tavolo, durata, fonte, occasione e note dentro «Altri dettagli». Ed è un
`<details>` nativo, non uno stato React: funziona senza JavaScript, con la
tastiera, e resta aperto fra una prenotazione e l'altra. La durata è
**proposta** con la frase che dice su cosa poggia, e se la si scrive a mano
resta quella.
**Problema vero:** manca il riconoscimento dell'ospite (P-04). Nessuna ricerca
mentre si digita telefono, email o nome.
**Proposta:** sotto il campo telefono, dopo sei cifre, una riga che compare solo
se c'è una corrispondenza: «Sofia Bianchi · 7 visite · VIP · ultima 6 giorni fa
· allergia glutine — [Usa questo ospite]». Se non c'è, non compare niente: non
si scrive «nessun cliente trovato» mentre qualcuno sta ancora digitando.
**Target:** 9,5. Il collo di bottiglia dei venti secondi (§83) non è il numero
di campi: è che l'operatore deve chiedere dati che il locale ha già.

### Scheda prenotazione · `/bookings/[id]`

**Due difetti trovati il 9 settembre guardando gli scatti dell'audit** (46
schermate, e le misure non ne segnalavano nessuna: sono difetti che si vedono
solo con l'occhio):

1. **`REGULAR` in maiuscolo, e in oro.** La scheda mostrava
   `<Badge tone="gold">{loyaltyTier}</Badge>`: il valore grezzo della colonna,
   nel colore del VIP. Un cliente normale sembrava un cliente da trattare col
   guanto bianco. `LoyaltyPill` aveva già deciso mesi prima che NEW e REGULAR
   **non si mostrano** — sono deduzioni, e le deduzioni le fa il profilo dalle
   prenotazioni vere — ma questa pagina non lo chiamava.
2. **Il riferimento troncato a dieci caratteri.** Il cliente lo riceve
   **intero**, nella pagina di conferma e nell'email; in sala se ne vedevano
   dieci su venticinque. Quando telefonava leggendo la sua referenza, chi
   rispondeva confrontava due stringhe diverse. Adesso è intero, copiabile, e
   sotto c'è scritto che è quello che il cliente ha ricevuto.

**E la conseguenza operativa:** la ricerca globale adesso trova una
prenotazione **dal riferimento**, in qualunque data — la finestra di una
settimana indietro e un mese avanti serve a non annegare nei nomi comuni, non a
nascondere una prenotazione che qualcuno sta nominando per identificativo.
Bastano sei caratteri, perché nessuno detta venticinque caratteri senza
sbagliare, e la riga dice «trovata per riferimento» così chi ha cercato una
stringa capisce perché quella riga è lì.
**Problemi:** è una pagina, e ci si arriva da una lista: aprire e tornare perde
la posizione. Contiene poco.
**Proposta:** pannello laterale su scrivania e tablet, foglio dal basso su
telefono. La rotta resta per i link diretti e le condivisioni.
**Target:** 9.

### Piantina · `/floor`
**Il problema è che è due cose insieme:** un editor (aggiungi, rinomina,
elimina, trascina, unisci) e una vista del giorno con stati e assegnazioni di
personale. Da qui i quattro stati contro i sette della sala viva (P-02).
**Proposta:** resta **solo** editor, e si sposta sotto Impostazioni → Il locale.
La vista del giorno con gli stati va nella sala viva, che già la fa meglio. Le
assegnazioni di personale diventano un livello sovrapposto sulla sala viva
(§50), dove servono durante il servizio.
**Target:** 8 come editor — un editor non deve essere veloce, deve essere
preciso.

### Lista d'attesa · `/waitlist`
**Cosa è già giusto:** persone e gruppi contati separatamente («12 persone in
coda · 2 gruppi in attesa»), perché «2 in attesa» accanto a «9 persone» si
leggeva come una contraddizione. Il tempo oltre la stima, dichiarato. E si
aggiorna da sola (aggiunto oggi): la coda la muovono anche gli altri.
**Problema:** il tavolo consigliato non c'è nella riga (P-03).
**Proposta:** la riga porta il suggerimento — «T9 libero · 4 posti» — e
«Accomoda» diventa un'azione diretta quando c'è un solo candidato, con il
foglio di scelta solo quando ce ne sono più di uno o quando serve una
combinazione. Il §26 chiede che il sistema suggerisca e la decisione resti al
personale: è già così nel motore, va solo detto prima.
**Target:** 9,5.

### CRM ospiti · `/guests`
**Cosa è già giusto:** il totale scritto («Da 1 a 50 di 137») invece di un tetto
invisibile; su telefono le righe diventano schede invece di una tabella a sei
colonne che ne mostra due; «non ancora» al posto di «0,00 €» dove non abbiamo
misurato.
**Problemi:** la ricerca non trova per numero di telefono parziale in modo
evidente; nessuna azione di riga (chiama, apri prenotazione, aggiungi tag).
**Mancanti:** ~~la distinzione visiva fra tag scritti a mano e tag calcolati
(§29)~~ — **fatta il 9 settembre**, vedi la sezione 15.
**Proposta:** tre linguaggi visivi separati — **segnali** (allergia, compleanno,
assenze: la cosa che cambia il servizio), **tag manuali** (VIP, giornalista),
**tag calcolati** (abituale, inattivo, preferisce il pranzo). Oggi hanno la
stessa forma, quindi «VIP» deciso da una persona e «abituale» dedotto da una
formula si leggono uguali — e sono due cose molto diverse quando si tratta di
fidarsene.
**Target:** 9.

### Scheda ospite · `/guests/[id]`
**Cosa è già giusto:** tutto calcolato dalle prenotazioni, non da contatori; i
due pulsanti GDPR (esporta, cancella) presenti e riservati al manager.
**Problemi:** è un elenco di riquadri, non un ritratto. Non risponde a «chi è
questa persona **per il ristorante**» (§28): risponde a «quali dati abbiamo».
**Proposta:** riorganizzare intorno alle sette domande del §28 — identità,
relazione, preferenze, valore, affidabilità, storia, marketing — con la
relazione e l'affidabilità in cima, perché sono quelle che cambiano come lo si
accoglie. E una fascia **contesto di servizio** in alto, con le sole cinque cose
che servono al leggio: VIP, visite, ultima visita, allergie, assenze.
**Target:** 8,5.

### Doppioni · `/guests/doppioni`
**Già buona:** nessuna unione automatica, solo il manager, niente si perde, una
revoca di consenso più recente vince su un consenso più vecchio.
**Nota di sistema, corretta:** avevo scritto che questa pagina esiste per
ripulire un problema creato dal modulo di prenotazione. Sbagliato: il server
riusa già la scheda esistente. I doppioni che questa pagina trova nascono
altrove — la stessa persona che prenota una volta col telefono di casa e una
col cellulare, o una volta con l'email del lavoro. Sono doppioni **veri**, che
nessun riconoscimento automatico può evitare senza rischiare di unire due
persone diverse. La pagina serve, e serve così: proponendo, non decidendo.
**Target:** 8,5.

### Analisi · quattro viste
**Cosa è già giusto, e vale più di qualunque proposta:** i quattro livelli di
verità — misurato, stimato, parziale, non disponibile — applicati con
disciplina. Le percentuali del food cost che dichiarano su quale parte
dell'incasso valgono. Le assenze valorizzate **sui conti chiusi** e non
stimate. La sintesi con i problemi per primi e la fonte su ogni riga. Le viste
nell'indirizzo, quindi condivisibili. La spiegazione comune della previsione
detta una volta invece di sette.
**Problemi:** ogni sezione dice *cosa è successo* e *su cosa è misurato*, ma
raramente *cosa posso fare* (§32). Su telefono le schede sono alte: si scorre
molto dentro la regione.
**Proposta:** ogni riquadro guadagna una terza riga, **l'azione**, solo quando
esiste ed è concreta: «18 prenotazioni future sono di clienti con assenze
precedenti → guarda». Niente consigli generici: se non c'è un'azione che porta
a una schermata con quelle righe dentro, la riga non si scrive. Su telefono:
riquadri riassuntivi compatti che si aprono.
**Target:** 9.

### Carta · `/menu`
**Cosa è già giusto:** allergeni da elenco chiuso, non testo libero; «segna come
finito» raggiungibile durante il servizio; ricerca e filtri oltre i dodici
piatti; costo e margine per piatto.
**Problemi:** ogni categoria è una scheda grande e ogni piatto una riga alta con
la descrizione completa — che in una lista amministrativa non serve. Su telefono
occupa molto per piatto.
**Proposta:** intestazione di categoria compatta (nome · quanti piatti ·
interruttore · ordine) e righe a una riga: nome, prezzo, food cost, margine,
stato, allergeni in forma breve, azioni. La descrizione si vede nell'editor.
**Target:** 8,5.

### Marketing (hub) · `/marketing`
**Problema:** è un indice di funzioni. Chi ci arriva sa già cosa vuole cliccare,
oppure non sa cosa può ottenere.
**Proposta (§38):** la prima domanda diventa «cosa vuoi ottenere» con sei
intenti — riempire un giorno debole, far tornare gli inattivi, premiare i
migliori, promuovere un evento, recuperare una recensione, creare una campagna —
e ciascuno porta alla funzione giusta **con il segmento già scelto**. Gli
strumenti restano sotto, con i loro numeri. Vincolo: un intento si mostra solo
se il dato per calcolarlo c'è; «riempire un giorno debole» richiede giorni
misurati a sufficienza, altrimenti non compare.
**Target:** 8,5.

**Fatto il 9 settembre.** Cinque intenti, e nessuno compare senza il suo
numero:

| Intento | Compare se | Dove porta |
|---|---|---|
| **Riempire il ‹giorno›** | un giorno misurato almeno `GIORNI_MINIMI` volte e almeno 10 punti di occupazione sotto la media **degli altri** | il modulo del coupon, già limitato a quel giorno |
| **Far tornare chi non viene più** | almeno 3 persone «inattive» con email **e** consenso | la campagna con `?segmento=inattivi` |
| **Premiare i clienti abituali** | almeno 3 «abituali» scrivibili | la campagna con `?segmento=abituali` |
| **Riempire ‹la serata›** | un'esperienza pubblicata e non passata | la campagna col titolo già scritto |
| **Scrivere a mano a chi voglio** | sempre | la procedura, che dice quante persone sono prima di inviare |

Sono cinque e non sei: **«recuperare una recensione» non è stato costruito**,
perché non esiste un segmento «clienti contenti». Il sondaggio sa chi ha dato
9 o 10, i collegamenti alle recensioni sanno quanti clic hanno raccolto, ma le
due cose non si incontrano su una persona: un intento che promette «scrivi a
chi ti ha dato 10» richiederebbe un dato che non abbiamo. È esattamente il
vincolo del §38 applicato a se stesso.

Nessun dato nuovo per gli altri quattro: la debolezza di un giorno la calcola
già la previsione, i segmenti li calcolano già le campagne, e il segmento
viaggia nell'indirizzo come faceva già Analytics.

**Provato sui dati veri, e i cancelli hanno funzionato:** sulla demo compaiono
tre intenti su cinque. «Riempire un giorno» non c'è perché la settimana è
piatta — dal 27% al 38%, e il più vuoto sta solo 3 punti sotto la media — e
«far tornare gli inattivi» non c'è perché di inattivi non ce n'è nessuno. Su un
locale appena aperto rimane il solo «scrivere a mano», che è la verità.

**Due dettagli venuti fuori costruendolo.** La media di confronto è quella
**degli altri** giorni, non di tutta la settimana: includendo il giorno debole,
il giorno debole abbassa la propria asta. E il modulo del coupon adesso si apre
dall'indirizzo (`?nuovo=1&giorno=2`), con la stessa disciplina delle viste di
Analytics e delle parti delle Impostazioni — un numero inventato nell'indirizzo
non seleziona niente.

**Un difetto trovato guardando:** con il martedì già selezionato, la frase
sotto i giorni continuava a dire «nessuno selezionato: vale tutti i giorni»,
cioè il contrario di quello che si vedeva. Adesso dice quali giorni vale.

### Automazioni · `/marketing/automations`
**Cosa è già giusto, e il §41 lo conferma:** tre ricette, non un costruttore di
flussi. E le cinque difese contro l'invio di massa scritte nella schermata.
**Proposta:** ricette in più (compleanno, prima visita, seconda visita, NPS
basso, lead Wi-Fi non convertito), **come ricette** — ognuna con la sua soglia,
il suo silenzio, il suo tetto. Nessun editor.
**Vincolo:** ogni ricetta nuova deve dichiarare quante persone toccherebbe
adesso, prima di poter essere accesa.
**Target:** 8,5.

### Coupon · `/marketing/coupons`
**Problema:** schede grandi per informazioni brevi.
**Proposta:** righe compatte (nome, tipo, valore, validità, utilizzi su limite,
stato) con azioni rapide (pausa, duplica, archivia).
**Target:** 8.

**Fatto il 9 settembre.** Righe. Nove coupon in schede facevano **2.192 px** di
scorrimento interno per dire nove volte le stesse sei cose, con ogni scheda
alta 450 px di cui metà vuota: adesso **951 px**, e a schermo se ne vedono
undici invece di sei. Le condizioni — minimo di conto, giorni, scadenza,
riservato a — stanno nella riga sotto, in grigio: sono il motivo per cui un
coupon *non* vale oggi, quindi non possono sparire, ma non sono la cosa che si
cerca arrivando qui.

Da `md` la riga è una **griglia** e non un flex che va a capo: con le colonne
libere «15% di sconto» cadeva a un'ascissa diversa su ogni riga, e undici righe
disallineate si leggono una per una invece che per colonna. E «Massimo 1 volta
per cliente» è diventato «1 per cliente»: ripetuto undici volte, era
arredamento.

### Gift card · `/marketing/gift-cards`
**Cosa è già giusto, e va reso più forte:** «i 307 € ancora da spendere non sono
un incasso: sono cene già pagate e non ancora servite». È un debito, e il
prodotto lo tiene fuori dagli incassi.
**Proposta (§43):** tre valori con pesi diversi — vendute, utilizzate, **da
onorare** — e «da onorare» tipograficamente il più forte, perché è l'unico che
è un impegno.
**Target:** 8,5.

**Fatto il 9 settembre.** «Ancora da spendere» prende due colonne e un corpo
da `text-4xl`; «vendute in tutto» e «già usate» restano numeri normali, in
grigio. Erano tre riquadri identici: la stessa forma per un debito e per due
consuntivi. Sotto il numero grande c'è scritto cos'è — «cene già pagate, non
ancora servite» — così l'informazione non dipende dal fatto che uno legga la
nota in fondo alla pagina.

### Wi-Fi contatti · `/marketing/wifi`
**Già giusto:** «il numero che dice se questa cosa serve è *poi venuti a
mangiare*: un indirizzo email raccolto non è un cliente, ed è un dato di cui
rispondi tu».
**Proposta:** aggiungere le due conversioni che mancano — quanti hanno usato il
coupon, quanti sono diventati ospiti con una prenotazione — perché completano la
catena che quella frase promette.
**Target:** 8,5.

### Campagne · `/campaigns`, `/campaigns/[id]`, `/campaigns/new`
**Già giusto:** l'attribuzione con la finestra dichiarata, e una prenotazione
senza quel link che non finisce sul conto di nessuna campagna. La procedura a
passi.
**Proposta (§39, §40):** a ogni passo il numero di destinatari, i consensi e la
previsione di invii; nei risultati anche coperti e incasso attribuiti, sempre
distinguendo misurato da stimato.
**Target:** 8,5–9.

### Esperienze · `/experiences`
**Problemi:** schede con molto spazio vuoto per poche informazioni.
**Mancanti:** capienza contro prenotati in una forma leggibile a colpo d'occhio.
**Proposta:** riga per esperienza — data, titolo, prezzo, capienza, prenotati,
stato — e la scheda solo per l'evento in corso o il prossimo.
**Onestà da conservare:** i biglietti non si vendono da Tavolo, e la pagina lo
dice. Non va aggiunto un «venduti» che nessuno può calcolare.
**Target:** 8.

**Fatto il 9 settembre.** Una scheda sola, per la serata in corso o la prima
che arriva; tutto il resto sono righe. Due esperienze occupavano due riquadri
da 900 px di cui 600 vuoti — la griglia allungava le schede fino all'altezza
della più alta — e per sapere quale fosse la prossima si leggevano le date una
per una.

**Una cosa che il documento non aveva visto:** l'elenco arriva ordinato per
data **crescente**, giusto per un archivio e sbagliato per un programma. La
prima cosa che si leggeva era la serata più vecchia. Adesso: la prossima in
cima, poi «in programma», e le passate in fondo dalla più recente.

Il «venduti» resta condizionato a un numero maggiore di zero, come prima: non
è stato aggiunto niente che nessuno può calcolare.

**Nota di metodo:** la divisione fra passato e futuro la decide **il server** e
non il browser (`adesso` arriva come proprietà). Calcolandola nei due posti,
il confine può cadere in due punti diversi fra il render del server e quello
del client, e React lo segnala come disallineamento di idratazione.

### Pagamenti · `/payments`
**La schermata più onesta del prodotto:** non c'è integrazione d'incasso, quindi
non c'è nessun pagamento, e lo dice.
**Proposta:** progettare l'esperienza futura (§48) senza costruire pulsanti che
non fanno niente. La distinzione che il §48 chiede di conservare — conti del
ristorante ≠ pagamenti raccolti da Tavolo — è già nel modello dati.
**Target:** 8 (come progetto dichiarato, non come funzione).

### Camerieri · `/waiters`
**Problema:** è un elenco amministrativo. Durante il servizio serve un'altra
cosa: chi lavora, con quale ruolo, su quale zona, quanti tavoli.
**Proposta (§49, §50):** due viste. *Squadra* (configurazione: persone, ruoli,
capacità, contratti) e *Turno di oggi* (chi c'è, zona, tavoli, con il livello
sovrapposto sulla sala viva). La seconda è quella che si apre durante il
servizio.
**Target:** 9 — è il salto più grande fra i punteggi, perché oggi la pagina non
serve al servizio e potrebbe.

> **Fase 5, fatto — e la diagnosi era incompleta.** La fascia «il turno di
> oggi» adesso c'è: per servizio, chi c'è, ruolo, zona con gli intervalli dei
> tavoli («Tavoli B1–B3, T1–T2, T4, T6, T8, T11, T13 · 10 tavoli»), e compare
> solo se qualcuno è assegnato.
>
> Ma implementandola ho trovato la causa vera del problema, ed era peggiore:
> **la pagina leggeva la tabella sbagliata** (vedi P-11). Sulla demo c'erano
> settantasei tavoli assegnati e questa pagina ne mostrava zero. Avevo
> attribuito a una scelta di progetto — «è un elenco amministrativo» — quello
> che era un difetto di lettura dei dati.
>
> Resta da fare il livello sovrapposto sulla piantina (§50), che ha senso solo
> dopo che si sarà deciso quale delle due tabelle è la verità.

### Impostazioni · quattro parti
**Già giusto:** quattro parti invece di tredici schede, nell'indirizzo.
**Problema:** dentro una parte si scorre molto, e ogni blocco è una scheda:
«scheda dentro scheda» (§77).
**Proposta:** dentro ogni parte, blocchi con intestazione e contenuto che si
apre, con i valori correnti leggibili **da chiuso** — così si vede la
configurazione senza aprire nulla, e si apre solo per cambiare.
**Target:** 8,5.

**Fatto il 9 settembre.** Un componente solo (`ui/blocco.tsx`), applicato a
tredici blocchi. Misurato prima e dopo, a 1440×900:

| Parte | Scorrimento interno prima | Dopo |
|---|---|---|
| Il locale | 345 px | 0 |
| Prenotazioni | 225 px | 0 |
| Ospiti | 466 px | 0 |
| Sistema | 0 | 0 |

Adesso «Ospiti» dice tutta la sua configurazione in quattro righe — *45 € a
persona · attivo su «Aurora-Ospiti» · Google · restituisci il 5%* — dove prima
per gli stessi quattro dati servivano quattro schede aperte e mezzo schermo di
scorrimento. Anche su telefono (390×844) e tablet (834×1112) le parti stanno
in una schermata.

Tre decisioni che sono venute dal costruirlo:

1. **Le due colonne sono sparite.** Servivano quando ogni blocco era una
   scheda alta: affiancarne due riempiva la pagina. Con i blocchi chiusi il
   Team aperto è alto quattro righe e «Locali del gruppo» una, e la griglia
   lasciava quattrocento pixel di vuoto accanto a una riga sola.
2. **Un blocco nasce aperto solo se il contenuto *è* l'informazione.** Il
   Team, perché chi ha accesso al locale è un elenco che si guarda, non una
   soglia da controllare una volta; e «Invii in corso» quando c'è qualcosa che
   non è riuscito, perché un invio fallito nascosto dietro un'intestazione è
   la cosa che si scopre tardi.
3. **Il valore da chiuso lo dichiara lo stato del componente, non i dati del
   server:** appena salvato lo scontrino medio, l'intestazione chiusa dice già
   48 € senza aspettare il giro di `router.refresh()`. Verificato dalla sonda.

**Un difetto trovato solo premendo** (nessuna lettura del codice lo avrebbe
dato): dentro un `<summary>` non va niente su cui si possa premere, perché il
browser gira ogni clic sul summary. Il pulsante «Invita» messo
nell'intestazione del blocco Team **chiudeva il blocco** invece di aprire il
modulo d'invito. E `.tocco-comodo` su quella riga — la classe che allarga i
bersagli con uno pseudo-elemento sovrapposto — intercettava i clic di tutto
quello che conteneva. Il comando è passato dentro il corpo, e la classe è
sparita da lì: quella riga è già alta 44 px.

### Brand · `/settings/brand`
**Proposta (§56):** l'anteprima mostra le quattro superfici pubbliche vere —
modulo di prenotazione, menu, portale Wi-Fi, sondaggio — col brand applicato,
invece di un riquadro generico.
**Target:** 8,5.

### Le pagine pubbliche
**Prenota · `/book`** — Cosa è già giusto, e il §98 chiede una cosa in parte
fatta: la disponibilità viene **prima** dei dati personali (data, persone,
orario, poi «I tuoi dati»). Manca il resto del §99: quando un giorno è pieno si
mostra una griglia spenta invece delle prime tre disponibilità vere. E il §100:
sopra la soglia dei gruppi grandi il modulo manda a telefonare — la soglia
esiste (`largePartyFrom`), il messaggio va reso una proposta e non un rifiuto.
**Target: 9,5**, ed è la pagina con il salto di valore più alto perché è l'unica
usata da chi non è pagato per usarla.

**Menu pubblico · `/m/[slug]`** — Già buono: nessuna intestazione gestionale,
categorie appiccicate in cima, allergeni per esteso e mai sigle. Oggi corretto
un difetto grave: gli allergeni salvati con codici vecchi rendevano «Contiene:
, ,». **Target 9.**

**Portale Wi-Fi · `/wifi/[slug]`** — Il §45 chiede meno testo, e ha ragione.
Da conservare: l'onestà sul fatto che non è un captive portal.
**Sondaggio · `/s/[token]`** — Una domanda, un tocco. **Non toccare: 9 su 9.**
È la cosa più riuscita del prodotto e la prova che la direzione funziona.
**Accesso · `/sign-in`** — Il §104 chiede di non mostrare credenziali demo in
produzione: **va verificato e, se ci sono, separate.**

---

# 4-ter. Una scoperta fatta durante l'audit, fuori tema e più urgente del tema

Verificando il §104 ho trovato questo, in `src/app/(auth)/sign-in/page.tsx`:

```tsx
defaultValue="owner@tavolo.demo"
defaultValue="tavolo2026"
// e più sotto, in chiaro nella pagina:
Accesso demo: owner@tavolo.demo · tavolo2026
```

**Senza nessun controllo di ambiente.** Non è dietro un `NODE_ENV`, non è dietro
un flag, non dipende dal locale. Conseguenze, in ordine di gravità:

1. **Un ristorante che compra Tavolo vedrebbe la propria pagina di accesso
   precompilata con le credenziali della demo di qualcun altro.** Il codice non
   ha modo di distinguere l'installazione dimostrativa da quella di un cliente.
2. **Chiunque apra l'indirizzo pubblico entra nella demo con un click** e può
   scrivere: creare prenotazioni, modificare la carta, cancellare ospiti.
3. **E questo spiega un'anomalia che ho trovato stamattina.** Riallineando le
   date della demo in produzione avevo trovato tre prenotazioni isolate mesi
   avanti, che avevano fatto sbagliare il calcolo dello spostamento. Le avevo
   attribuite a «qualcuno che ha fatto una dimostrazione». La spiegazione più
   probabile è un'altra: **visitatori qualsiasi che entrano e provano il
   prodotto.** Il difetto dei dati e questo difetto dell'accesso sono la stessa
   cosa vista da due lati.

**Proposta:** la demo resta accessibile — è un'ottima cosa per chi valuta — ma
in modo dichiarato e separato. Un pulsante «Entra nella demo» distinto dal
modulo di accesso, il precompilamento solo quando l'installazione è dichiarata
dimostrativa, e la demo in sola lettura oppure con i dati riallineati ogni
notte. Le credenziali stampate in chiaro spariscono dalla pagina di accesso di
un'installazione vera.

**Priorità: P0.** Non è UX, ma l'ho trovato qui e non lo tengo per me.

---

# 5. Proposed Information Architecture

Tre livelli, e il criterio di appartenenza è una domanda sola: **serve mentre il
servizio è aperto?**

**Livello 1 — il servizio** (barra principale, sempre a un tocco)
Oggi · Servizio · Prenotazioni · **Sala viva** · Attesa · Ospiti

**Livello 2 — il lavoro del giorno dopo** («Altro», tre gruppi)
Il locale: Camerieri, Carta, Esperienze, **Piantina** ·
Crescita: Marketing, Analisi · Sistema: Pagamenti, Impostazioni

**Livello 3 — il contesto** (non è una pagina: si apre dove serve)
Scheda ospite, scheda prenotazione, pannello tavolo, riga di attesa. Sono
**pannelli e fogli**, non destinazioni. Il §62 chiede di domandarsi ogni volta
«poteva essere un pannello?»: per questi quattro la risposta è sì.

**Cosa cambia di posto, in tutto:** la sala viva sale al livello 1 (da
sottopagina di Servizio), la piantina scende al livello 2 (da livello 1),
quattro dettagli scendono al livello 3 (da pagine). Nient'altro si muove, e
nessuna funzione scompare (§118).

---

# 6. Operational Workflow Map

I quattro modi del §3, e quali schermate servono ciascuno.

| Modo | Quando | Schermate | La domanda |
|---|---|---|---|
| **Preparazione** | mattina, primo pomeriggio | Oggi, Prenotazioni (giorno e settimana), Sala viva, Camerieri (turno) | «cosa mi aspetta» |
| **Servizio** | locale aperto | Servizio, Sala viva, Attesa, Prenotazioni | «cosa faccio adesso» |
| **Post servizio** | chiusura | Oggi (chiusura), Analisi | «com'è andata» |
| **Gestione** | giorni di chiusura | Ospiti, Marketing, Carta, Impostazioni, Piantina | «come voglio far funzionare il locale» |

**Cosa ne segue, concretamente:** la densità e la lunghezza dei testi seguono il
modo, non la pagina (§76, §79). In Servizio le frasi sono brevissime perché
nessuno legge; in Analisi una spiegazione di due righe è un vantaggio perché
qualcuno sta decidendo.

**Una lacuna che questa mappa rende visibile:** il modo Preparazione non ha una
schermata sua. Chi apre il locale alle 17 usa Prenotazioni, che è pensata per
rispondere al telefono. Vedi la proposta della fascia «rischi di oggi» in
Panoramica: è il modo Preparazione che chiede uno spazio.

---

# 7. Desktop Strategy (≥1280)

**Principio:** a 1440px c'è spazio per **due cose insieme**, e oggi quasi
nessuna pagina lo usa. Le tre zone di Servizio sono schede; il dettaglio è una
pagina; la sala viva occupa tutta la larghezza per una mappa che ne userebbe due
terzi.

**Regole di larghezza (§80)**

| Tipo di pagina | Larghezza | Perché |
|---|---|---|
| Servizio, Sala viva, Prenotazioni, Analisi | piena | sono griglie: più spazio = più righe |
| Ospiti (lista) | piena | tabella |
| Scheda ospite | larga, non piena (max ~1100px) | si legge, non si scorre |
| Moduli (nuova prenotazione) | media (max ~640px) | una colonna si compila meglio |
| Impostazioni | larga | blocchi affiancabili |
| Accesso, sondaggio | ristretta e centrata | un compito solo |

**Il pannello laterale** entra da destra, occupa 420–480px, e **non copre** la
lista: la lista si restringe. Così si passa da una riga all'altra senza
chiudere, che è il gesto della preparazione (nove prenotazioni da controllare).

---

# 8. Tablet Strategy (768–1279)

> **Rivisto il 9 settembre, dopo aver misurato.** Il giudizio iniziale — «non
> esiste una strategia tablet», 3/10 — veniva dal conteggio dei breakpoint
> (`xl:` usato 12 volte), che è prova debole. Misurando un iPad a 1024×1366 il
> quadro è diverso, e in due direzioni opposte.
>
> **Meglio del previsto sul layout:** *nessuna* pagina scorre a 1024×1366, e
> Servizio a quella larghezza mostra già due colonne (`md:grid-cols-2`), che è
> esattamente la risposta che questo documento proponeva. La coppia
> «prenotazioni + sala» esiste già come selettore Elenco/Mappa/Settimana.
>
> **Peggio del previsto sul tocco:** dieci pagine su dodici avevano controlli
> sotto i 36 px, e non erano decorazioni — erano «Arrivato», «No-show»,
> «Accomoda», «Avvisa». Quattordici su Servizio, trenta su Prenotazioni. I
> gesti del servizio, sul dispositivo più probabile al leggio, con un dito
> invece di un mouse.
>
> **Quindi la priorità del tablet cambia:** prima i bersagli di tocco (fatto,
> vedi sotto), poi le viste affiancate — che valgono ancora, ma valgono meno di
> un pulsante che si prende al primo colpo.

## Cosa è stato fatto (Fase 4)

`size="sm"` è passato da 32 a 36 pixel. Trentasei e non quarantaquattro di
proposito: in una lista di prenotazioni ogni pixel di altezza è una riga in
meno, e la densità operativa serve. I quarantaquattro si prendono **senza
allargare il pulsante**, con `.tocco-comodo`: un riquadro invisibile di quattro
pixel sopra e sotto estende l'area sensibile.

Solo in verticale, e la ragione è concreta: questi pulsanti stanno in fila
orizzontale, e estendendo anche di lato due bersagli adiacenti si
sovrapporrebbero — il tocco finirebbe sul vicino, che è **peggio** di un
bersaglio piccolo.

**Esito: da dieci pagine con problemi a una**, misurato a 1024×1366, 390×844 e
1440×900. Servizio, Sala, Attesa, Prenotazioni, Ospiti, Carta, Analisi,
Impostazioni, Camerieri, Marketing: pulite a tutte e tre le misure.

## Due falsi positivi della sonda, e cosa insegnano

Misurare male produce difetti che non esistono, e correggerli peggiora il
prodotto. Due casi, entrambi trovati verificando prima di intervenire:

**Gli interruttori della carta.** Segnalati come bersagli da 24 px. In realtà
ogni interruttore sta dentro una `label` collegata alta 44: il bersaglio vero è
l'etichetta, ed era già giusto. Corretta la sonda, non il codice.

**I tavoli sulla piantina.** Diciassette «difetti» a 390 px. Ma un tavolo su una
mappa non è un pulsante: è un **oggetto spaziale**, e la sua dimensione è la
geometria della sala. Un tavolo da due posti non può essere alto 44 px perché
la sala non è disegnata a misura di dito — si tocca dopo aver ingrandito, e lo
zoom c'è. Ora portano `data-oggetto-mappa`, che è un marcatore utile a chiunque
misuri.

**E uno che resta, dichiarato:** «Crea la tua sala» è un collegamento **dentro
una frase** («Nessuna piantina caricata. Crea la tua sala»). WCAG 2.5.8 esenta
esplicitamente il testo in linea dalla regola sulla dimensione del bersaglio, e
ingrandirlo spezzerebbe la riga. Resta com'è, e resta scritto qui perché la
prossima sonda non lo segnali come una dimenticanza.

## Le viste affiancate, che restano da fare

| Compito | Sinistra | Destra | Stato |
|---|---|---|---|
| Accogliere | Prenotazioni del giorno | Sala viva | esiste come **selettore**, non affiancate |
| Gestire la coda | Attesa | Sala viva | **da fare** — è la coppia che manca |
| Rispondere al telefono | Nuova prenotazione | Disponibilità | esiste dentro il modulo |

**Perché la sala viva sta a destra:** è la superficie su cui si agisce, e la
mano destra su un tablet appoggiato è quella che tocca.

**Preparato in questa fase:** la sonda del tempo reale è ora **una per pagina**
e non una per componente. Due viste affiancate che chiedono «è cambiato
qualcosa?» facevano due richieste ogni cinque secondi per una risposta
identica; adesso una sola interrogazione si distribuisce a chi si è iscritto.
Affiancare due viste costa quanto tenerne una — che è il prerequisito perché
affiancarle sia una buona idea.

**Tre viste affiancate, una per compito**

| Compito | Sinistra | Destra |
|---|---|---|
| Accogliere | Prenotazioni del giorno | Sala viva |
| Gestire la coda | Attesa | Sala viva |
| Rispondere al telefono | Nuova prenotazione | Disponibilità del giorno |

**Perché la sala viva sta a destra in due su tre:** è la superficie su cui si
agisce, e la mano destra su un tablet appoggiato è quella che tocca.

**Regola dura:** il tablet non è una scrivania ristretta e non è un telefono
allargato. Dove la vista affiancata non ha senso — Analisi, Impostazioni,
Carta — il tablet segue la scrivania a colonna unica. Dove ha senso, la vista
affiancata è **il** layout, non una variante.

**Bersagli di tocco:** su tablet valgono le regole del telefono (44px minimi,
niente controlli che appaiono al passaggio del mouse), perché è un dispositivo
touch anche se è largo. Questo oggi non è garantito: i controlli di riga della
carta compaiono da `md` in su come fila di pulsanti, e `md` include il tablet.

---

# 9. Mobile Strategy (<768)

**Cosa è già giusto:** la barra in basso; le liste che diventano schede; il «+»
centrale; un nome per funzione uguale alla scrivania; e da oggi nessuna pagina
che scorre.

**Cosa cambia:**

1. **La barra in basso** prende Prenotazioni al posto di Attesa, e «Sala» punta
   alla sala viva (§4).
2. **Il «+» diventa contestuale** (§7 del prompt, sezione 20 qui sotto).
3. **I dettagli diventano fogli dal basso**, non pagine: si chiudono con un
   gesto verso il basso e non perdono la lista dietro.
4. **La tipografia scende di un passo** nelle schermate operative. Oggi il
   saluto in Panoramica è `text-xl` su telefono; le intestazioni di pagina
   `text-3xl`. Su 390px un titolo da 30px costa due righe di prenotazioni.
5. **Le azioni stanno sotto il pollice**: il foglio dal basso mette le azioni
   principali in fondo, non in cima.

---

# 10. Panoramica Redesign

**Problema attuale:** risponde bene a «com'è oggi» e non a «cosa può andare
storto oggi». E su schermi larghi ha un vuoto in basso a sinistra.

**Esperienza bersaglio:** un briefing del mattino che si legge in dieci secondi
e finisce con una cosa da fare.

| | Oggi | Proposta |
|---|---|---|
| Fascia 1 | Briefing: prenotazioni, coperti, pieno, picco, VIP, allergie | **Invariato.** Funziona |
| Fascia 2 | — | **Rischi di oggi**, e solo se ce ne sono: tavolate senza tavolo, clienti con assenze precedenti, prenotazioni da confermare in scadenza |
| Fascia 3 | Timeline + scorciatoie + KPI + andamento | Timeline a sinistra, a destra scorciatoie e andamento. I KPI restano due, non quattro |

**Cosa non fare:** non trasformarla in Analisi (§8 del prompt). La sintesi
significativa è **una**: l'andamento settimanale dei coperti. Il resto è a un
tocco.

**Regola sulla fascia dei rischi:** se non ci sono rischi, la fascia **non
esiste** — non dice «nessun rischio». Una schermata che ogni mattina dice
«tutto bene» insegna a non leggerla, e il giorno in cui dice qualcos'altro non
viene letta neanche quella volta.

**Click:** oggi 0 per leggere il briefing, 2 per scoprire un rischio (aprire
Prenotazioni, filtrare). Bersaglio: 0 per vederlo, 1 per agire.

---

# 11. Service Redesign — la priorità massima

## Priority engine (§11 del prompt)

Quattro livelli, con un nome che dice cosa fare e non quanto è grave.

| Livello | Significato | Esempio | Segno visivo |
|---|---|---|---|
| **ADESSO** | qualcuno sta aspettando una decisione | tavolo libero compatibile con chi è in coda | barra piena a sinistra + azione in evidenza |
| **FRA POCO** | diventerà «adesso» se non si fa niente | T4 si libera in 8 minuti, alle 21 c'è una prenotazione da 6 | barra sottile |
| **GUARDA** | un fatto che cambia il servizio | Rossi in ritardo di 18 minuti | punto |
| **SAPERE** | contesto utile, nessuna azione | un VIP arriva fra 12 minuti | nessun segno, testo più tenue |

**Perché non CRITICAL/ACTION/WATCH/INFO:** perché un host non ordina per
gravità, ordina per **quando**. «Critico» non dice se devo alzarmi ora.

**Vincolo che eredita dalla regola esistente e che va tenuto:** un avviso senza
impatto non si mostra. Il livello non è un modo per mostrarne di più: è un modo
per ordinare quelli che già superano quella soglia.

### Com'è stato costruito (9 settembre)

I quattro livelli **si derivano**, non si aggiungono: `urgenza` — «fra quanti
minuti questo avviso conta, zero = adesso» — c'era già su ogni avviso, e serviva
a ordinare dentro la gravità. Zero è ADESSO, entro un quarto d'ora è FRA POCO,
oltre è GUARDA, un'informazione è SAPERE. Undici regole su dodici non hanno
dovuto dichiarare niente.

La derivazione ha però fatto emergere **due cose che il documento non sapeva**.

**Uno: `urgenza` diceva una bugia sui ritardi.** La regola dei no-show ci
scriveva *il ritardo* — quaranta minuti di ritardo diventavano «conta fra
quaranta minuti» — perché finché il campo serviva solo a ordinare dentro la
stessa gravità l'effetto voluto (i ritardi più recenti per primi, quelli su cui
la telefonata funziona ancora) usciva giusto per caso. Da quando il campo
decide anche **quanto grande** si mostra un avviso, la bugia si vedeva: un
ritardo di mezz'ora finiva fra le cose da guardare fra mezz'ora. Adesso i
ritardi scrivono zero, che è la verità, e l'ordine dal più recente al più
vecchio se lo tiene l'ordinamento stabile.

**Due: il tempo non basta a decidere il livello, e questo documento aveva
ragione a mettere i ritardi in GUARDA.** Con la sola derivazione temporale i
ritardi diventavano ADESSO, ed è formalmente vero — la telefonata si fa ora —
ma provandolo sui dati veri si vedeva l'errore in un secondo: quattro ritardi
diventavano quattro cartelli grandi identici, e il tavolo libero con una
famiglia in piedi finiva sotto. ADESSO è lo spazio delle **decisioni** — dove
metto queste persone — e in una serata le decisioni sono una e i ritardi
quattro. Quindi una regola può dichiarare il proprio `livello` e scavalcare la
derivazione: oggi lo fa **una sola**, quella dei ritardi, con il motivo scritto
accanto.

**I segni visivi sono quelli della tabella:** barra piena a sinistra e azione
come bersaglio per ADESSO, barra sottile per FRA POCO, riga compatta con il
punto per GUARDA, riga compatta e testo tenue senza grassetto per SAPERE.
Nessuna etichetta «ADESSO» scritta a parole: in una schermata dove il titolo
dice già «in ritardo di 40 minuti» sarebbe la terza volta che si parla di tempo.

**Misurato:** `/service` a 1440×900 e a 390×844, scorrimento pagina zero e
scorrimento orizzontale zero; 915 test unitari verdi, di cui cinque nuovi sulla
derivazione e due sull'ordine fra un'occasione che scade adesso e un problema
fra mezz'ora.

## Le tre zone (§12 del prompt)

| Device | Comportamento |
|---|---|
| Scrivania ≥1280 | tre colonne affiancate: Adesso · Prossimi · Attesa |
| Tablet | due colonne: Adesso · (Prossimi/Attesa a schede) |
| Telefono | tre schede, come oggi |

**Il numero in cima:** una riga sola, compatta, e **due** valori promossi in
base al contesto — in attesa e in ritardo quando ci sono, altrimenti in sala e
prossimi. Sei numeri con lo stesso peso non sono una gerarchia.

**Click:** segnare un arrivo resta 1. Accomodare dalla coda passa da 3 (apri
attesa → accomoda → scegli tavolo) a **1** quando il candidato è uno solo.

---

# 12. Reservations Redesign

**Il cambiamento che conta:** la riga porta il segnale. `cosaSapere` esiste, dà
al massimo quattro righe in ordine di urgenza, con la fonte su ognuna, ed è già
usato in tre schermate. Portarlo nella lista del giorno è il singolo intervento
con il miglior rapporto fra valore e lavoro di tutto il documento.

**Prima**
```
14:45   Sofia Galli    5p   B1   Confermata
```
**Dopo**
```
14:45   Sofia Galli    5p   B1   Confermata
        VIP · allergia crostacei
```
La seconda riga compare **solo se c'è qualcosa**: una prenotazione senza
segnali resta a una riga.

**Azioni di riga (§14 del prompt):** apri, modifica, assegna tavolo, conferma,
arrivato, seduto, assenza, annulla, contatta. Su scrivania un menù sulla riga;
su telefono un foglio dal basso.

**Click:** segnare nove arrivi passa da 27 navigazioni a 9 tocchi.

---

# 13. Floor Redesign

**La separazione (§20 del prompt):**

| | Piantina (editor) | Sala viva |
|---|---|---|
| Dove | Impostazioni → Il locale | Barra principale, voce «Sala» |
| Scopo | com'è fatta la sala | com'è la sala adesso |
| Frequenza | una volta, poi ritocchi | tutta la sera |
| Stati | nessuno: è una mappa vuota | i sette |
| Gesti | trascina, ridimensiona, unisci, elimina | tocca → pannello → agisci |

**Condividono:** forme, nomi, modello spaziale, dizionario di stato. Sono la
stessa sala, in due momenti.

**Il dizionario unico (risolve P-02):** i sette stati della sala viva diventano
i sette del prodotto. L'editor non mostra stati: mostra la sala vuota, che è
quello che si sta configurando.

**Pannello tavolo (§23 del prompt):** tocco → pannello con stato, ospite,
persone, da quanto è seduto, prossima prenotazione, note, allergie, conto,
fedeltà; azioni: accomoda, sposta, unisci, apri conto, chiudi conto, libera.
**Mai una nuova pagina.**

**Trascinamento (§24 del prompt):** proposto come P2, non P0 — su un tablet in
piedi è un gesto meno affidabile di un tocco, e la stessa cosa si fa con
«sposta» dal pannello. Quando si farà, il conflitto si **spiega**: «T10 ha una
prenotazione fra 48 minuti», non un rifiuto muto.

---

# 14. Waitlist Redesign

**Il tavolo consigliato entra nella riga.**

```
1 · Famiglia Bertoldi          4 persone · attesa 29 min · oltre la stima
    Un seggiolone
    → T9 libero, 4 posti                    [Accomoda]  [Avvisa]
```

Quando i candidati sono più di uno, «Accomoda» apre la scelta come oggi. Quando
è uno, accomoda. Quando serve unire due tavoli, lo dice.

**Intelligenza (§26 del prompt):** il motore già pesa dimensione del gruppo,
posti, sala preferita e orario desiderato. Da aggiungere: **tempo di attesa** e
**promessa data**, perché un gruppo a cui è stato detto «venti minuti» ed è a
trentacinque ha una precedenza che la dimensione non cattura. La decisione resta
al personale: il sistema ordina, non esegue.

### Fatto il 9 settembre

La precedenza non è più l'ordine di arrivo. Tre criteri, in quest'ordine:

1. **la sala che ha chiesto** — non è un favore, è il motivo per cui l'ha
   chiesta;
2. **di quanto abbiamo sforato la promessa**, a scaglioni di cinque minuti;
3. **l'ordine di arrivo**, che resta l'ultima parola a parità di tutto.

Il numero che conta è `ritardoSullaPromessa` = attesa − stima, **non** l'attesa:
a chi ha sentito «quaranta minuti» e ne ha aspettati quarantacinque non è stato
promesso niente di falso; a chi ha sentito «venti» e ne ha aspettati
trentacinque, sì. E in sala è il secondo che si alza e va via.

**Tre dettagli che tengono la regola onesta.**

*Gli scaglioni.* Un minuto di differenza non deve riordinare la coda a ogni
aggiornamento automatico della pagina: sei minuti oltre e sette minuti oltre
sono lo stesso scaglione, e fra loro decide l'arrivo.

*Nessuna stima, nessuna promessa.* `expectedWaitMin` ha un valore di comodo
(venti minuti). Trattarlo come una promessa vera metterebbe davanti proprio
chi non ha mai sentito un numero, quindi con stima a zero il ritardo è zero.

*La lista resta in ordine di arrivo.* Una coda è una coda, e il numero accanto
al nome è la posizione. Quando la precedenza **non** coincide con l'arrivo, la
riga lo dice: «Tocca a lei», e nella riga sotto c'è il perché — «16 minuti
oltre la stima». Senza quel cartellino la decisione del motore sarebbe
invisibile e chi è in sala continuerebbe a offrire il tavolo al numero 1; con
il cartellino anche sul primo della fila, sarebbe rumore.

La stessa precedenza governa **quale tavolo va a chi**: un tavolo si propone a
una persona sola, e a distribuirli si passa in ordine di precedenza invece che
di posizione.

**Verificato premendo:** con due gruppi in coda — uno arrivato prima, promessa
40, in attesa da 46; l'altro arrivato dopo, promessa 20, in attesa da 36 — il
cartellino compare **solo** sul secondo, e il primo tavolo libero va a lui.
Sette test nuovi (`tests/precedenza-attesa.test.ts`) fissano il sorpasso, il
non-sorpasso dentro la stima, la soglia dello scaglione, la stima assente e il
caso con un tavolo solo.

**Click:** accomodare passa da 3 a 1 (candidato unico) o 2 (scelta).

---

# 15. CRM Redesign

## Guest 360 (§28 del prompt)

Sette blocchi, in quest'ordine — e l'ordine è la proposta:

1. **Contesto di servizio** (nuovo, in cima): VIP, visite, ultima visita,
   allergie, assenze. Le cinque cose che servono al leggio, e le sole cinque che
   compaiono quando la scheda si apre come pannello da un'altra schermata.
2. **Identità**: nome, contatti, compleanno, lingua.
3. **Relazione**: quante volte, da quanto, con che ritmo, ultima visita.
4. **Affidabilità**: assenze, cancellazioni tardive, **quando** sono avvenute —
   due assenze di due anni fa non sono due assenze di un mese.
5. **Preferenze**: tavolo, sala, orario, occasioni ricorrenti.
6. **Valore**: spesa dai conti chiusi, punti, gift card.
7. **Storia** e **Marketing**: cronologia e consensi.

**Non è un elenco di riquadri:** la scheda deve rispondere a «chi è questa
persona per il ristorante», e le prime quattro sezioni rispondono a quella
domanda. Le ultime tre rispondono a «cosa ho di lei», che è un'altra.

### Fatto il 9 settembre (primo giro)

**La fascia del leggio, in cima.** Cinque cose, sempre le stesse: quanto è di
casa, quante volte è venuta, quando l'ultima volta, cosa non può mangiare,
quante volte non si è presentata — e l'ultima assenza **con la data**, perché
due assenze di due anni fa non sono due assenze di un mese. Nessun dato nuovo:
erano già tutti sulla pagina, sparsi in tre riquadri. Si mostra solo quello che
c'è: una persona nuova senza allergie e senza assenze non vede una fascia
vuota, non vede la fascia.

**Relazione e affidabilità sono un blocco solo.** Erano due schede —
«Relazione» e «Come prenota» — che rispondevano alla stessa domanda da due
posti. E due delle otto caselle sono uscite: visite e ultima visita le dice la
fascia, e ripetere un numero a cento pixel di distanza non lo rende più vero.

**Il valore è passato a sinistra.** Punti, gift card e movimenti rispondono
tutti alla stessa domanda — quanto vale questa persona — e stavano in due
colonne diverse; intanto la colonna di sinistra finiva con quattrocento pixel
di vuoto sotto «Contatti» mentre l'altra scorreva. I movimenti sono un blocco
**chiuso** che da chiuso dice quanti sono: si guardano quando si cerca un
pagamento, non ogni volta che si apre una scheda.

**E gli otto suggerimenti di tag** («+ VIP», «+ Vegetariano»…) occupavano una
riga intera in cima a ogni scheda per un gesto che si fa una volta ogni tanto:
adesso compaiono quando il campo prende il fuoco.

Resta da fare il resto del §28: preferenze e storia hanno ancora la forma di
riquadri in fila.

## Tre linguaggi visivi per tre cose diverse (§29 del prompt)

| Tipo | Esempi | Come si legge | Perché diverso |
|---|---|---|---|
| **Segnale** | allergia, compleanno, assenze ripetute | forma forte, sempre primo | cambia il servizio adesso |
| **Tag manuale** | VIP, giornalista, amico dello chef | pillola piena | l'ha deciso una persona: è un'opinione del locale |
| **Tag calcolato** | abituale, inattivo, preferisce il pranzo | pillola con bordo, senza pieno | l'ha dedotto una formula: si può sbagliare |

Oggi hanno tutti la stessa forma. Distinguerli non è decorazione: è dire a chi
legge **quanto fidarsi**. È la stessa disciplina di misurato/stimato applicata
alle etichette.

### Fatto il 9 settembre

Un componente (`ui/etichetta.tsx`) con i tre linguaggi, e la differenza è di
**forma** prima che di colore — si distingue con le luci basse e da chi non
separa il rosso dal verde:

- **segnale**: quadrato, tinto, con l'icona. Non è una pillola, quindi si vede
  prima di qualsiasi pillola;
- **manuale**: pillola **piena**;
- **calcolata**: pillola col solo **bordo**, testo tenue. Pesa meno perché vale
  meno, e il perché resta nel suggerimento.

Applicato in cinque punti: la lista ospiti (dove i tag erano testo separato da
punti, indistinguibile dal resto della riga), la scheda ospite, l'editor dei
tag, il profilo calcolato e la striscia di riconoscimento in nuova
prenotazione.

**La cosa che si è scoperta applicandolo:** il linguaggio non è una proprietà
di *dove* si mostra un'etichetta, è una proprietà **dell'etichetta**. Quindi
`GuestTag` non ha più `tone` (`neutral | good | warning`) ma `linguaggio`, e
ogni regola dichiara il suo: il livello VIP è `manuale` — lo mette una persona,
e il suo stesso «perché» diceva già «assegnato dal locale» — le abitudini sono
`calcolata`, allergie, assenze ripetute e compleanno vicino sono `segnale`.
`tone` diceva quanto una cosa fosse *bella*, non quanto fosse *affidabile*:
«Inattivo» e «Allergie» erano entrambi `warning`, cioè lo stesso colore per una
deduzione nostra e per un fatto che può mandare qualcuno all'ospedale.

E i segnali ora sono **primi** perché il motore li ordina: prima erano
nell'ordine in cui le regole stanno scritte nel file, che non è un ordine —
«Allergie» finiva ultima, dopo «Abitué del martedì».

**Un difetto misurato guardando:** `bg-current/15` per la pillola piena non si
vede su verde scuro. Nella lista ospiti «fedele» sembrava testo normale. Il
pieno adesso è un token del tema (`bg-secondary`), non una trasparenza del
colore del testo.

## CRM nel contesto (§30 del prompt) — il punto più importante di questa sezione

Il contesto ospite deve comparire in cinque posti: prenotazione, Servizio, sala
viva, attesa, campagne. Stato attuale, verificato:

| Dove | Contesto ospite | Nota |
|---|---|---|
| Scheda prenotazione | ✅ `cosaSapere` | completo |
| Servizio | ✅ | completo |
| Sala viva | ✅ | completo |
| **Lista prenotazioni** | ❌ | **il buco più costoso** (§12) |
| **Riga di attesa** | ⚠️ parziale | allergie sì, resto no |
| **Nuova prenotazione** | ❌ | nessun riconoscimento (P-04) |

Tre buchi su sei, e sono i tre momenti in cui si **decide** invece di
consultare.

---

# 16. Analytics Redesign

**Da conservare senza discussione:** i quattro livelli di verità, le soglie
minime di campione, le percentuali che dichiarano su cosa sono calcolate, la
sintesi coi problemi per primi, le viste nell'indirizzo.

**Da aggiungere: la terza riga.** Ogni riquadro ha *cosa è successo* e *su cosa
è misurato*. Manca *cosa posso fare*.

```
No-show 13%
43 coperti persi · 1.020 € — misurato sui 40 conti chiusi del periodo
→ 18 prenotazioni future sono di clienti con assenze precedenti   [Guarda]
```

**Regola dura:** l'azione si scrive solo se porta a una schermata **con quelle
righe dentro**. «Considera di introdurre una caparra» non è un'azione: è un
consiglio, e i consigli generici insegnano a saltare la riga.

### Fatto il 9 settembre

**La terza riga sulle assenze, con le righe dentro il quadro.** «35 prenotazioni
dei prossimi giorni sono di clienti mancati almeno 2 volte · 164 coperti
impegnati nei prossimi 14 giorni», e sotto le cinque più imminenti, ognuna col
suo giorno, i suoi coperti e le sue assenze, ognuna che apre la sua
prenotazione. Le righe sono **nel quadro** perché così la regola dura si
rispetta senza inventare una schermata: la destinazione di ogni riga è la
prenotazione stessa, e quella pagina dice già «non si è presentato» (verificato
premendo).

Guarda **avanti**, e lo dichiara: le assenze si contano sul periodo scelto, le
prenotazioni a rischio sono quelle dei prossimi quattordici giorni. Due numeri
con due basi diverse nello stesso riquadro vanno dichiarati, ed è scritto nella
riga.

**La soglia è la cosa più importante di questa funzione.** Con una sola assenza
l'elenco veniva di **95 prenotazioni su 384**: «telefona a novantacinque
persone» non lo fa nessuno, e la riga si impara a saltarla. Con due — una volta
si manca per mille motivi, due volte è un'abitudine — sono 35, che è un lavoro.
È anche la stessa soglia con cui questo quadro chiama già qualcuno «chi
ripete».

**E un consiglio che era diventato falso.** Il quadro della rotazione diceva
«alzare la durata prevista costa qualche coperto e toglie la coda
all'ingresso»: un invito a girare **una manopola che non esiste più**. Da
quando `durataConsigliata` misura la durata per gruppo, fascia e tipo di
giorno, una prenotazione nuova senza durata scritta a mano prende già quella
misurata, e il motore calcola con la stessa. Quello scarto non è una
manopola: è la distanza fra quanto è durato e quanto era **scritto** su quelle
prenotazioni, e si chiude da sé. Adesso lo dice. È la regola dura applicata a
una riga che c'era già: dove non c'è niente da fare, «non c'è niente da fare, e
perché» è un'informazione; un consiglio che non porta da nessuna parte insegna
a saltare la riga.

**Previsione (§34 del prompt):** già buona. Da aggiungere una **confidenza**
dichiarata — quante giornate confrontabili sostengono quel numero — perché oggi
la spiegazione dice il metodo ma non la solidità.

**Fatto il 9 settembre.** Ogni riga della previsione dice su quante giornate
confrontabili è misurata — «Su 5 domeniche confrontabili» — e non solo quando
la storia è poca. Prima la solidità si diceva soltanto nel caso brutto, quindi
chi leggeva un numero senza avvertenze non sapeva se stava guardando sei
giornate o due.

**Un difetto grammaticale trovato scrivendola:** la frase del caso brutto
diceva «Solo 2 **sabato** confrontabili». Il nome del giorno veniva infilato in
una frase al plurale senza cambiarlo. Quattro giorni su sette in italiano sono
invariabili (lunedì, martedì, mercoledì, giovedì, venerdì) e due no: non c'è
una regola, c'è un elenco, e adesso c'è.

**Telefono (§33):** riquadri riassuntivi che si aprono. La sintesi resta
sempre aperta: è quella che si legge in piedi.

---

# 16-bis. Ricerca globale (§64) — fatta il 9 settembre

«Trovare un ospite» era l'unico dei sette compiti del §123 senza una strada:
bisognava andare in Ospiti e cercare da lì. Con una prenotazione al telefono in
corso, sono tre gesti e una schermata di contesto perso.

Adesso c'è un pulsante accanto all'agente e **⌘K / Ctrl+K** da qualunque
schermata. Non è una tavolozza dei comandi — quella resta in P3 — perché non
lancia azioni: trova **cose**, un ospite o una prenotazione.

**Perché un pulsante e non un campo nella barra.** A 1440 px la barra in alto
porta già sei voci più «Altro» più tre comandi a destra: un campo lì dentro
l'avrebbe fatta tornare a scorrere in orizzontale, che è il difetto da cui
questa navigazione è nata. Un pulsante costa quaranta pixel e apre una finestra
che su telefono e su scrivania è la stessa.

**Il difetto vero che ha risolto, ed era nell'audit:** «la ricerca non trova per
numero di telefono parziale in modo evidente». In archivio i numeri stanno come
li ha scritti chi li ha scritti — «+39 335 8842910» — e la ricerca del CRM
faceva `phone contains`: cercare «3358842» non trovava niente per colpa degli
spazi, e cercare «33» restituiva mezzo archivio. Cioè **rumore sulle domande
corte e silenzio su quelle giuste**. Adesso il numero si confronta a cifre
(`regexp_replace` in una query grezza, perché la funzione va applicata alla
colonna) e solo da quattro cifre in su.

**Cosa cerca, scritto in fondo alla finestra:** ospiti e prenotazioni delle
prossime settimane — una settimana indietro e un mese avanti, perché chi cerca
«Bianchi» sta rispondendo al telefono adesso, e lo storico completo è nella
scheda a un clic dal risultato. Una ricerca che non dichiara il suo perimetro fa
concludere «non c'è» a chi cerca un piatto o un coupon.

**Tre cose che si notano solo usandola.** Le risposte in ritardo di una domanda
precedente si scartano confrontando la domanda che torna con quella scritta
adesso (senza, chi digita in fretta vede lampeggiare i risultati di «Ro» sopra
quelli di «Rossi»). La scorciatoia non scatta mentre si scrive in un campo. E
`bg-current/10` per la riga scelta **non si vedeva** su verde scuro: la riga che
Invio apre deve stare addosso all'occhio.

**Misurato:** ⌘K apre, le frecce e Invio arrivano alla scheda, «3682288» trova
il numero scritto con gli spazi, Escape chiude, e a 390×844 la finestra è la
stessa senza scorrimento. Dodici test nuovi, fra cui i tre casi del telefono e
i due dei confini fra locali.

---

# 16-ter. La scala tipografica applicata (§23) — primo giro il 9 settembre

**Misurato prima:** la scala per ruoli esisteva da giorni e non la usava
nessuno. 501 `text-xs`, 467 `text-sm`, e **46** usi in tutto delle sette classi
di ruolo. Una scala che nessuno chiama non è una scala: è un file di stile.

Il difetto concreto, contato: **lo stesso ruolo scritto in tre modi**. L'etichetta
piccola in maiuscoletto — quella di «OGGI, IN BREVE», «IN SALA · coperti»,
«LISTA D'ATTESA» — compariva 43 volte con `tracking-widest` (0,1em), 40 con
`tracking-wide` (0,025em) e 14 con `tracking-wider` (0,05em).

**E la classe che doveva essere la regola era la quarta variante.**
`DESIGN.md` dice «Label (500, 0.75rem, tracking **0.05em**, spesso
maiuscolo)», cioè `tracking-wider`; `.t-etichetta` era scritta con
`tracking-wide`. Il primo lavoro è stato allineare la classe al documento, non
il contrario.

**Cosa è cambiato:** 82 richiami dell'etichetta e 81 della nota
(`text-xs text-tertiary-foreground`) diventano `t-etichetta` e `t-nota`, in 80
file. La nota è un alias esatto — nessun cambiamento visivo, solo il nome del
ruolo al posto di due utility. L'etichetta invece si sposta tutta sul valore
del documento: 43 punti si stringono e 40 si allargano, e adesso la stessa cosa
si legge uguale in tutto il prodotto.

**Cosa resta, e perché non l'ho toccato.** Quindici punti usano una misura
**sotto** la scala (`text-[10px]`, `text-[11px]`): undici sono nel costruttore
della sala — fuori perimetro — e quattro sono micro-etichette in righe strette,
dove portarle a 12 px vorrebbe dire rifare la riga. La scelta onesta è o un
ruolo dichiarato in più o un cambio di misura, e nessuna delle due è una
sostituzione: è una decisione di design.

**Verificato:** sette schermate a 1440×900, 834×1112 e 390×844 — scorrimento
pagina e orizzontale zero su tutte, nessuna etichetta che va a capo. 969 test e
9 percorsi e2e verdi.

---

# 17. Menu Redesign

**Backoffice, scrivania:** intestazione di categoria compatta (nome · numero di
piatti · interruttore · sposta) e una riga per piatto: nome, prezzo, food cost,
margine, stato, allergeni brevi, azioni. La descrizione vive nell'editor: in una
lista amministrativa non serve.

**Backoffice, telefono:** nome, prezzo, margine, e un tocco per l'editor. Niente
descrizioni.

**Menu pubblico:** principio opposto — massima leggibilità, minima interfaccia.
Già buono. Da aggiungere la ricerca **solo** oltre una certa lunghezza, perché
su un menu di venti piatti una casella di ricerca è rumore.

---

# 18-23. Marketing, Automazioni, Coupon, Gift card, Wi-Fi, Esperienze

Le proposte sono nelle schede di pagina (sezione 4-bis). Qui i tre principi che
le tengono insieme.

**Uno.** Il marketing hub parte dagli **intenti**, non dagli strumenti — ma un
intento compare solo se il dato per calcolarlo esiste. «Riempire un giorno
debole» richiede giornate misurate a sufficienza: senza, non si mostra.

**Due.** Le automazioni restano **ricette**, non un costruttore. Se ne possono
aggiungere; ognuna dichiara quante persone toccherebbe *adesso* prima di poter
essere accesa.

**Tre.** Dove c'è un debito — gift card da onorare — è la voce
tipograficamente più forte delle tre. Un debito che si legge come un incasso è
il difetto contabile più caro che un gestionale può avere.

---

# 24. Payments UX

Progetto, non implementazione (§119: niente pulsanti senza dietro). La
distinzione da conservare, già nel modello dati: **i conti del ristorante** (che
Tavolo registra) non sono **i pagamenti raccolti da Tavolo** (caparre, garanzie,
biglietti). Mescolarli renderebbe impossibile rispondere a «quanto ho
incassato» e a «quanto devo restituire».

L'esperienza futura vive in due posti: la **policy** in Impostazioni →
Prenotazioni (quando si chiede una caparra, quanto, a chi), e il **fatto** nella
scheda della prenotazione. Non serve una schermata «Pagamenti» come indice: la
schermata attuale, che dichiara di non avere funzioni, è più utile di un
cruscotto vuoto.

---

# 25. Staff Redesign

Due viste, e la seconda oggi non esiste.

**Squadra** (configurazione): persone, ruoli, capacità, contratti. È l'attuale.

**Turno di oggi** (nuova): chi lavora, ruolo, zona, quanti tavoli.
```
Alfredo    Cameriere    T1–T7      6 tavoli
Giulia     Sommelier    tutta sala
Marco      Runner       —
```
E come **livello sovrapposto sulla sala viva** (§50), perché la domanda «di chi
è questo tavolo» nasce guardando la sala, non un elenco.

Il dato esiste: `listStaffAssignmentsForService` è già usato dalla piantina. Va
portato dove serve.

---

# 26. Settings Redesign

Le quattro parti restano (§51: mantienile salvo motivi forti — non ne ho
trovati). Cambia il dentro: **blocchi che mostrano il valore corrente da
chiusi**.

```
▸ Finestra di prenotazione        fino a 60 giorni · preavviso 2 ore
▸ Oltre la capienza               non ammesso
▸ Gruppi grandi                   da 13 persone si telefona
```
Così la configurazione si **legge** senza aprire niente, e si apre solo per
cambiare. Oggi bisogna scorrere moduli aperti per sapere com'è impostato il
locale.

**Distribuzione (§52–55):** la sala (piantina) entra in «Il locale»; le sessioni
e la sicurezza in «Sistema», dove c'è già «I tuoi dispositivi».

---

# 27-30. Le esperienze pubbliche

> **Rivisto in Fase 6, e la revisione è severa con me.** Di quattro cose che
> avevo elencato come da fare sulle pagine pubbliche, **tre erano già
> costruite** — e bene. Il §98, il §99, il §100 e il §45 sono implementati.
>
> **Perché ho sbagliato:** ho letto il testo che le pagine *rendono* nel loro
> stato iniziale (data vuota → «Scegli prima una data»), la pagina
> `book/page.tsx` e il modulo, ma non i componenti che fanno il lavoro —
> `slot-picker.tsx` e `public-booking-form.tsx`. Ho **dedotto l'assenza da una
> lettura di superficie**. È il terzo errore dello stesso tipo in questo
> documento, e li ho corretti tutti dove stavano: i doppioni in prenotazione
> (§1), la pagina Camerieri (§25), e queste.
>
> **La lezione, per il prossimo audit:** una funzione che compare solo in uno
> stato particolare — quando la giornata è piena, quando il gruppo supera una
> soglia — non si vede nello stato iniziale di una schermata. Il testo estratto
> e le misure non la trovano. Va cercata nel codice del componente, o
> provocando lo stato.

## Prenota (§98–101) — la pagina più finita del prodotto, non la più incompleta

**Già fatto, verificato nel codice:**

1. **La disponibilità prima dei dati personali** (§98). Data, persone, orario,
   e solo dopo «I tuoi dati».
2. **Quando è pieno, propone** (§99). «Per 4 persone non c'è posto in questa
   data» e sotto le prime disponibilità vere, da `prossimiGiorniLiberi` — che
   carica il contesto **una volta sola** per tutto l'intervallo invece di fare
   ventun letture. E la richiesta parte **solo** se la giornata è piena: «chi
   trova posto al primo colpo non paga il conto di una ricerca che non gli
   serve».
3. **I gruppi grandi vanno al telefono** (§100). Sopra la soglia del locale il
   modulo non chiede niente: «Per più di 12 persone parliamone. Un tavolo così
   si prepara: due tavoli uniti, a volte un menu concordato. Chiamaci e lo
   organizziamo insieme — è più veloce di questo modulo», col numero come
   collegamento da 44 px. Il commento nel codice dice la cosa giusta: «la
   strada giusta si dice subito — ed è un numero di telefono, non un errore».

**Resta aperto solo il §101** (telefono prima dell'email su mobile), e resta
aperto di proposito: oggi l'email è obbligatoria perché la conferma scritta è
l'unico canale che il prodotto ha. Con l'email facoltativa la conferma
diventerebbe un SMS che nessuno manda. **Da non toccare finché non c'è un
canale.**

**Punteggio rivisto: da 7 a 8,5.** Il target 9,5 resta, e la distanza è il
§101 più una rifinitura visiva che non ho potuto giudicare senza vedere le
immagini.

## Menu pubblico
Già buono. Non aggiungere niente di gestionale.

## Portale Wi-Fi (§45) — anche questo già fatto
Il flusso è già quello che il §45 chiede: una riga di introduzione («Lascia un
contatto e ricevi subito la password della rete»), nome, un contatto, privacy,
marketing **facoltativo** con detto perché — «senza la spunta ti colleghi
comunque». E lo sconto **non è nel modulo**: compare nella schermata dopo, come
un regalo per la prossima volta, che è esattamente il posto in cui il §45 lo
voleva.

**Punteggio rivisto: da 7 a 8,5.**

## Brand (§56) — fatto

Era un'anteprima sola e generica: un'intestazione, un rettangolo grigio, un
pulsante. Diceva «il colore va sul pulsante», che è vero e non serve a
decidere.

Adesso sono **quattro**, una per superficie che un cliente incontra davvero —
prenotazione, menu, portale Wi-Fi, sondaggio — con i testi veri di ciascuna e i
valori del locale. Perché la domanda di chi sta scegliendo un colore non è
«dove va», è: **come starà accanto a un prezzo, a una password da copiare, a
una scala da zero a dieci?** Un colore che funziona su un pulsante d'azione può
essere illeggibile su un prezzo in testo piccolo su fondo chiaro — e adesso lo
si vede prima di salvare.

Una per volta, non impilate: quattro anteprime avrebbero allungato Impostazioni
di seicento pixel per una cosa che si guarda mentre si sceglie un colore.

**Sono anteprime, e il testo lo dichiara:** riproducono la struttura delle
pagine pubbliche, non sono le pagine vere. Renderizzarle per davvero
richiederebbe la carta, i turni e la rete dentro un modulo che si sta ancora
compilando, e mostrerebbe una pagina vuota invece di un'anteprima. Un'anteprima
presa per la pagina vera è una promessa che qualcuno verrà a riscuotere.

**Punteggio: da 6 a 8,5.**

## Sondaggio (§46)
**Non toccare.** Una domanda, un tocco, 0–8 in privato e 9–10 con la
possibilità della recensione pubblica, senza ricatti. È la cosa più riuscita
del prodotto.

## Branding pubblico (§103)
Le cinque superfici pubbliche usano il brand del ristorante; Tavolo resta quasi
invisibile, con un «Powered by Tavolo» discreto. Da verificare che valga già su
tutte e cinque.

---

# 31. Design System

**Inventario attuale** (`src/components/ui/`, 21 file): avatar, badge,
base-del-numero, button, card, copy-button, dialog, dropdown-menu, empty-state,
input, label, popover, select, separator, sheet, skeleton, stepper, switch,
table, textarea, tooltip.

**Cosa manca, e sono le cose che questo redesign richiede:**

| Componente | Perché serve | Priorità |
|---|---|---|
| **Drawer** (pannello laterale) | scheda prenotazione, ospite, tavolo su scrivania e tablet | **P0** |
| **Toast** con annulla | §67: nessun sistema esiste oggi | **P0** |
| **RigaAzioni** (menù di riga) | liste prenotazioni, coupon, ospiti | **P1** |
| **Segnale** (tre linguaggi tag) | §29 | P1 |
| **BloccoApribile** | impostazioni che mostrano il valore da chiuse | P1 |
| **VistaAffiancata** | tablet | P1 |

**Duplicazioni da unificare:** `Sheet` esiste ma è usato in 2 file mentre
`Dialog` in 29 — quindi molte cose che sono fogli sono modali. Da rivedere caso
per caso: un'azione concentrata resta modale, un dettaglio diventa pannello o
foglio.

**Densità (§76):** tre livelli, e vanno legati al **modo operativo**, non alla
pagina.

| Livello | Dove | Padding di riferimento |
|---|---|---|
| `operativa` | Servizio, Sala, Prenotazioni, Attesa | 8–10px |
| `standard` | Analisi, Ospiti, Carta, Marketing | 12–14px |
| `comoda` | Impostazioni, moduli, pubbliche | 16–20px |

Le classi `.riquadro.denso` e `.riquadro.comodo` esistono già: manca il terzo
livello e l'applicazione sistematica.

**Tipografia (§75):** la scala oggi è in pratica binaria — `text-xs` 488 usi,
`text-sm` 454, tutto il resto sotto 50. Otto ruoli dichiarati:

| Ruolo | Uso | Serif? |
|---|---|---|
| Display | numeri grandi, saluto | sì |
| Titolo pagina | intestazioni | sì |
| Titolo sezione | dentro la pagina | no |
| Titolo scheda | riquadri | no |
| Corpo | testo | no |
| Meta | ora, coperti, tavolo | no, tabellare |
| Etichetta | maiuscoletto | no |
| Nota | spiegazioni | no |

**Il serif solo dove aggiunge personalità**, non su ogni testo importante: nelle
schermate di servizio il serif rallenta la lettura di un dato numerico.

---

# 32-38. Regole di interazione

## 33. Pagina / Pannello / Modale / Foglio / Popover

| Contenitore | Quando | Esempi | Device |
|---|---|---|---|
| **Pagina** | compito lungo, o destinazione condivisibile | Analisi, Impostazioni, procedura campagna, carta | tutti |
| **Pannello laterale** | dettaglio di una riga, restando nella lista | prenotazione, ospite, tavolo, attesa | scrivania, tablet |
| **Foglio dal basso** | le stesse cose, e le azioni | idem + azioni di riga | telefono |
| **Modale** | un'azione concentrata che richiede attenzione | nuovo coupon, emetti gift card, conferma distruttiva | tutti |
| **Popover** | scelta breve | menù di riga, filtro | scrivania, tablet |

**Regola di verifica (§62):** ogni volta che si apre una pagina e si torna
indietro, chiedersi se poteva essere un pannello. Se la risposta è sì e la rotta
serve per la condivisione, si fa entrambe: la rotta esiste e rende una pagina,
la lista apre un pannello.

## 34. Status system

**Prenotazione** — l'enum è già unico e coerente: `PENDING, CONFIRMED, ARRIVED,
SEATED, COMPLETED, NO_SHOW, CANCELLED`. Va garantito che la resa sia una sola
(oggi `StatusBadge` è condiviso: buono).

**Tavolo — qui c'è il lavoro (P-02).** Un dizionario, sette stati, quelli della
sala viva:

| Stato | Significato | Da cosa è derivato |
|---|---|---|
| `LIBERO` | nessuno adesso, nessuno in arrivo a breve | assenza di fatti |
| `PRENOTATO` | c'è una prenotazione più tardi | prenotazione futura |
| `IN_ARRIVO` | prenotazione imminente (o in ritardo) | minuti all'orario |
| `OCCUPATO` | qualcuno è seduto | `seatedAt` |
| `CONTO` | seduto con un conto aperto e righe battute | ordine aperto |
| `PULIZIA` | appena liberato | `closedAt` recente |
| `BLOCCATO` | fuori servizio | blocco dichiarato |

**Il ritardo non è uno stato**, è una proprietà di `IN_ARRIVO`: un tavolo il cui
ospite è in ritardo è ancora in arrivo, e trattarlo come stato a sé
raddoppierebbe i casi senza aggiungere informazione. Questa è una divergenza
consapevole dal §95.

**L'editor non mostra stati.** Sta configurando una sala vuota.

## 35-37. Errori, vuoti, caricamento

**Errori (§71):** tre parti — cosa è successo, cosa **non** è stato perso, cosa
fare. «Non siamo riusciti ad assegnare B1 perché nel frattempo è stato occupato.
La prenotazione è intatta. Scegli un altro tavolo.» La seconda parte è quella
che manca più spesso e quella che tranquillizza.

**Vuoti (§70):** dire se il vuoto è una buona notizia. «Nessuno in ritardo» non
«Nessun dato». E dove il vuoto dipende da una configurazione mancante, dire
quale: il prodotto lo fa già bene in diversi punti (scontrino medio, chiave
email, turni non configurati).

**Caricamento (§69):** scheletri che riflettono il layout vero, e **solo sul
componente che si aggiorna**. Oggi alcune pagine mostrano uno scheletro intero
per un aggiornamento parziale.

### Fatto il 9 settembre — e la constatazione era mezza sbagliata

**Misurando** (richieste del router rallentate a otto secondi, e la schermata
guardata **durante** l'attesa) è venuto fuori che un aggiornamento parziale non
mostra nessuno scheletro: cambiando vista in Analytics o parte in Impostazioni,
Next tiene la pagina precedente in piedi finché i dati nuovi non arrivano,
perché il pezzo di navigazione è lo stesso e cambia solo l'indirizzo.

Il difetto vero era **l'opposto**: non lo diceva. Otto secondi di numeri vecchi
sotto una vista già cliccata, senza sapere se il tocco fosse arrivato. Adesso
la pillola chiesta porta una rotella per tutta la durata della transizione —
e resta un `<a href>`, quindi il tasto centrale, Ctrl+clic e il caso senza
JavaScript funzionano come prima. Quando il router ha già in cache la vista
(prefetch), il cambio è istantaneo e non compare nessuna rotella: il segno c'è
solo quando serve.

**Il difetto che c'era davvero**, sull'ingresso: la schermata d'attesa era
fatta di soli rettangoli grigi, **titolo compreso**. Entrando in Analytics
sparivano il nome della pagina, il periodo scelto e le quattro viste; entrando
in Impostazioni, l'indice delle quattro parti. Niente di tutto questo dipende
dai dati. Adesso quelle parti sono **gli stessi componenti** che si vedranno un
istante dopo, e i rettangoli restano solo dove arriveranno i numeri — con la
forma che avranno: quattro riquadri in fila per «Com'è andata», righe basse per
i blocchi delle Impostazioni, perché uno scheletro che non somiglia al
contenuto fa saltare la pagina appena i dati arrivano.

**Un confine che ha morso per la terza volta.** Per rendere le pillole anche
nella schermata d'attesa, i nomi delle viste sono passati in un modulo
condiviso — e la prima versione li esportava dal componente `"use client"`.
Da un modulo client il server **non può leggere un valore esportato**: quello
che attraversa il confine sono riferimenti a componenti. Risultato: Analytics
si rompeva con «An error occurred in the Server Components render». Costanti e
funzioni pure condivise fra server e client stanno in `lib` — vale per i
livelli degli avvisi, per i tipi della ricerca, e ora per le viste e le parti.

## 38. Tempo reale (§65, §66)

**Cosa esiste da oggi:** ogni cinque secondi si chiede «è cambiato qualcosa?» e
si ricarica solo se la risposta cambia. Su Vercel non ci sono WebSocket, e una
connessione aperta per tablet costerebbe più lavoro sul database di quanto ne
risparmi.

**Cosa manca:** l'**attribuzione**. Il §65 chiede «T10 è stato assegnato da
Anna», e oggi il cambiamento appare senza dire chi. Il dato c'è: il registro
delle azioni ha attore, entità e ora. Da portare in una riga discreta, non in un
avviso invasivo.

### Fatto il 9 settembre

Nell'intestazione del Servizio: **«Anna ha assegnato un tavolo a Marta Bianchi
(T10)»**, e un tocco apre gli altri tre con l'ora. Nessuna colonna nuova: il
registro delle azioni aveva già attore, entità e ora — serviva leggerlo.

Quattro decisioni, e tre sono su **cosa non dire**:

1. **le proprie azioni non si raccontano.** Chi ha assegnato quel tavolo l'ha
    visto succedere: la riga serve a sapere cosa ha fatto *l'altro*. Il
    servizio passa l'utente e la lettura lo esclude;
2. **una riga per soggetto.** Tre tocchi sulla stessa prenotazione in un minuto
    — arrivato, seduto, tavolo — sono tre righe di registro e **un** cambiamento
    da leggere: si tiene la più recente;
3. **solo le azioni del servizio in corso.** Un menu modificato o un coupon
    creato non riguardano chi è in sala adesso. L'elenco è chiuso e sta nel
    codice: aggiungere un'azione è una decisione, non un effetto collaterale;
4. **il nome di battesimo.** In sala le persone si chiamano «Anna», non
    «anna@ristorante.it» — e se il nome non c'è si usa la parte prima della
    chiocciola, che è la cosa più vicina a un nome che abbiamo.

**Cosa ha preso il posto di cosa.** La riga sostituisce «aggiornato alle
21:14», che diceva che il programma funziona e non cosa è successo. L'ora resta
nel suggerimento, e quando non è cambiato niente torna la frase di prima.

**Un dettaglio che si vede solo provandolo:** il registro conserva un
identificativo e non dice di che cosa. Per «ha chiuso il conto di Marta» il
salto è doppio — l'identificativo è quello del conto, l'ospite sta sulla
prenotazione a cui è attaccato — e senza quel passaggio la frase diventava «ha
chiuso un conto». E quando il soggetto non c'è più (prenotazione cancellata
dopo il cambiamento) ogni azione ha la sua frase senza soggetto, invece di una
frase con un buco dentro.

**Optimistic (§66):** presente in due punti. Va esteso ai cinque gesti veloci —
arrivato, seduto, libera, avvisa, assegna — con ritorno indietro in caso di
errore. Prerequisito: il componente Toast, che oggi non esiste.

---

# 39. Accessibility

Verifiche fatte oggi, e cosa resta.

| Punto | Stato | Nota |
|---|---|---|
| Nessuno scorrimento orizzontale | ✅ misurato | 0 su 59 schermate |
| Bersagli di tocco ≥44px | ⚠️ parziale | le scorciatoie della Panoramica hanno `min-h-[44px]`; le azioni di riga della carta compaiono da `md` come fila di pulsanti, e `md` include il tablet touch |
| Indici come collegamenti, non stato | ✅ | viste di Analisi e parti di Impostazioni sono link: funzionano senza JavaScript e con la tastiera |
| Nome accessibile con il verbo | ✅ | corretto oggi: «Walk-in» visibile, «Accomoda walk-in» a voce |
| Stato anche non a colore | ⚠️ | la sala viva distingue con bordo e tratteggio, non solo colore; da verificare sui sette stati |
| Contrasto | **misurato due volte il 9 settembre** | la prima misura era generosa: vedi sotto |
| Etichette per lettori di schermo | ⚠️ parziale | presenti sulle azioni di riga del team, da estendere |

### Il contrasto, misurato due volte (9 settembre)

**La prima misura era sbagliata, e in una direzione precisa: troppo
generosa.** L'avevo calcolata sul *token* `--card`, una tinta piatta. Ma
nessuna superficie di questo prodotto è una tinta piatta: le schede e la
pagina hanno un gradiente e sopra una **velatura bianca al 5-7%**, che schiara
il fondo e quindi **abbassa** il contrasto di ogni testo chiaro. Rimisurando
sull'angolo più chiaro del fondo reso, ogni numero scende di circa il 15%:

| Colore | sul token (prima) | sul fondo reso (vero) |
|---|---:|---:|
| oro (`gilt`) | 5,11 ✅ | **4,34 ❌** |
| accento (terracotta) | 3,32 | **2,79** |
| `destructive-soft` a 72% | 4,70 ✅ | **4,07 ❌** |
| testo tenue | 6,02 | 5,12 |
| crema | 9,94 | 8,45 |

Conseguenza: **l'oro non era la risposta.** Spostare gli avvertimenti sull'oro
li aveva portati a 4,34 — ancora sotto soglia — e in più li aveva portati
*fuori* dalla famiglia terracotta. E il rosso leggibile appena introdotto era
anch'esso sotto soglia.

La vera causa era un'altra, e stava in un nome:

> `accent` = `hsl(30 44% 48%)` = **rgb(176, 122, 69)**
> `accent-strong` = `#AF7944` = **rgb(175, 121, 68)**

**Erano lo stesso colore.** Il token che promette «l'accento forte, quello che
si legge» non era più forte di niente. Per questo *ogni* testo terracotta del
prodotto era sotto soglia: non esisteva una terracotta leggibile da usare, solo
un nome che diceva di esserlo.

Il rimedio non è spostarsi sull'oro, è **mantenere la promessa del token**:
`accent-strong` diventa `#E2B383` — la stessa terracotta, alzata di luminosità
finché fa **5,44 : 1** sul fondo peggiore e **4,76 : 1** anche sopra una tinta
accento al 15%. Con quello a posto, i 100 testi terracotta del prodotto si
leggono e restano terracotta.

Rapporti sul fondo reso, dopo:

| Colore | Rapporto | Ruolo |
|---|---:|---|
| crema | 8,45 : 1 | ✅ testo pieno |
| `sage-strong` **nuovo** #B6C695 | 5,68 : 1 | ✅ il positivo che si legge |
| `accent-strong` **nuovo** #E2B383 | 5,44 : 1 | ✅ l'accento che si legge |
| testo tenue | 5,12 : 1 | ✅ |
| `destructive-soft` a **76%** | 4,68 : 1 | ✅ l'errore che si legge |
| oro (`gilt`) | 4,34 : 1 | ⚠️ non per il testo piccolo |
| sage | 3,56 : 1 | ⚠️ solo per riempire |
| accento (terracotta) | 2,79 : 1 | ⚠️ solo per riempire e bordare |

Rapporti WCAG della prima misura, sul *token* di una scheda (`--card`),
conservati per memoria:

| Colore | Rapporto | Verdetto |
|---|---:|---|
| testo pieno (crema) | 9,94 : 1 | ✅ |
| testo tenue (`muted-foreground`) | 6,02 : 1 | ✅ |
| **oro del tema** (`gilt`) | **5,11 : 1** | ✅ anche per il testo piccolo |
| note (`tertiary`) | 4,45 : 1 | ✅ al limite |
| sage | 4,19 : 1 | ⚠️ sotto 4,5 |
| `amber-600` (il giallo fuori tavolozza) | 3,83 : 1 | ⚠️ |
| **accento** (terracotta) | **3,32 : 1** | ⚠️ |
| `accent-strong` | 3,28 : 1 | ⚠️ |
| `rose-600` (gli errori, prima) | 2,60 : 1 | ❌ |
| **`destructive`** (il rosso del sistema) | **2,08 : 1** | ❌ il peggiore |

**Tre conseguenze, e una è una smentita di quello che avevo scritto tre ore
prima.**

1. **Un messaggio d'errore era la cosa meno leggibile della schermata** (2,60),
   e passare al rosso del sistema — che sembrava la scelta ortodossa —
   l'avrebbe **peggiorata** (2,08). Il documento di design non aveva un rosso
   *da leggere*: ne ha uno *da riempire*, con il bianco sopra. Aggiunto
   `--destructive-soft` (0 70% 72% → 4,7 : 1), che è lo stesso rosso schiarito
   fino a diventare leggibile: sedici messaggi d'errore ci sono passati.
2. **L'accento non è un colore da testo piccolo su questo fondo.** Nella
   passata precedente avevo spostato gli avvertimenti da `amber-600` (3,83) a
   `text-accent` (3,32): *peggio*. La tavolozza aveva già la risposta —
   l'**oro** (`gilt`, 5,11) — che è della stessa famiglia e si legge.
3. **Su una tinta va il crema, non il colore della tinta.** Testo accento su
   tinta accento al 15% fa 2,85 : 1; crema sulla stessa tinta fa 8,52 : 1. È
   il motivo per cui i riquadri d'avvertimento rifatti (accento tenue + testo
   crema) sono corretti, mentre un numero «accento su accento» non lo era.

### Le pillole di stato: scelta la «strada B» (10 settembre)

Gli avevo preparato tre varianti affiancate, con il contrasto misurato di
ciascuna pillola. Luca ha scelto la **B — ogni tono è una tinta del tema con
il testo crema sopra**, contro la C che consigliavo io.

E la B come l'avevo disegnata aveva un difetto mio: per «Confermata» ci avevo
messo un **azzurro**, cioè esattamente il colore fuori tavolozza che la B
doveva togliere. Rifatta con soli colori del tema, e applicata ai **toni del
componente** invece che alla sola mappa delle prenotazioni — così esce dalla
tavolozza estranea anche nei pagamenti, nelle campagne e nei contratti.

Sette toni, tre famiglie a intensità diverse più il quieto, il peggiore a
**4,71 : 1**: la tabella sta in `DESIGN.md`, «La Regola della Pillola in
Tinta».

**Due cose trovate strada facendo:**

1. **Sei velature su otto non esistevano.** `bg-cream/6`, `bg-accent/22`,
   `bg-destructive/24`… Tailwind genera solo i passi della sua scala (5, 10,
   15, 20…): le altre classi non vengono emesse, il fondo resta trasparente e
   **non c'è alcun errore**. Le ho scoperte solo cercandole nel CSS costruito,
   una per una.
2. **«Cancellata» era sotto soglia da sempre** (4,33 : 1) e nessuna sonda
   l'aveva mai vista, perché nelle schermate misurate non c'erano prenotazioni
   cancellate. Il fondo di quel tono è una velatura *del colore del testo*:
   più è spessa, meno contrasto resta, e quanto ne resta dipende da ciò che
   eredita. Ora il colore è dichiarato e la sonda ha un **banco** che rende
   tutti i toni a mano, dati o non dati.

**Perché la misura precedente diceva che andavano bene:** i loro fondi
chiari con testo scuro fanno 4,84–5,72 : 1, cioè **passano**. Trasformarle in
tinte del tema con il colore come testo le porterebbe a 2,07–3,36 — un
peggioramento. Se si vuole toglierle dalla tavolozza esterna, la strada
misurata è «tinta del tema + testo crema» (7,98–9,90), che però cambia
completamente il peso visivo dei sette stati: quella è la decisione di design
che resta aperta.

**Regola:** non sacrificare la leggibilità per l'estetica. Il caso concreto già
incontrato: su telefono la parola dello stato prendeva un terzo della riga e il
nome dell'ospite finiva a undici caratteri. La soluzione non è stata rimpicciolire
il testo, è stata togliere la parola e tenere il pallino — **con lo stato
comunque letto a voce**.

---

# 40. Click Reduction

Misurato sul codice attuale, contando le aperture di pagina e i tocchi.

| Compito | Oggi | Bersaglio | Come |
|---|---:|---:|---|
| Nuova prenotazione telefonica | 1 apertura + 6 campi | 1 + 3 campi | riconoscimento: nome, cognome ed email arrivano dal CRM |
| Segna arrivato (da Servizio) | 1 | 1 | già ottimo |
| Segna arrivato (da Prenotazioni) | 3 (apri, agisci, torna) | **1** | azione di riga |
| Accomoda dalla coda | 3 | **1** se un candidato, 2 se scelta | tavolo consigliato nella riga |
| Apri contesto ospite | 2 (apri prenotazione, leggi) | **0** | segnale nella riga della lista |
| Assegna un tavolo | 3 | **2** | azione di riga → scelta |
| Sposta un ospite di tavolo | 4 | **2** | pannello tavolo → sposta |
| Segna un'assenza | 3 | **2** | azione di riga |
| Nuovo walk-in | 2 | 2 | già buono («+» → foglio) |
| Sapere di chi è un tavolo | 3 (vai in Camerieri, cerca) | **1** | livello sul piano sala |

**Il totale che conta:** preparare un servizio da nove prenotazioni — controllare
segnali e assegnare i tavoli mancanti — passa da circa **40 navigazioni** a
circa **12 tocchi**.

---

# 41. Time-to-task

Bersagli del §83, con la mia stima di fattibilità.

| Compito | Bersaglio | Fattibile? | Collo di bottiglia vero |
|---|---|---|---|
| Prenotazione telefonica | <20 s | sì, **dopo** il riconoscimento ospite (fatto) | non è il numero di campi: è chiedere dati che il locale ha già |
| Walk-in | <10 s | sì, quasi già | scelta del tavolo |
| Check-in prenotazione | <3 s | sì, da Servizio; **no** oggi da Prenotazioni | mancano le azioni di riga |
| Assegnazione tavolo | <5 s | sì con azione di riga | oggi tre pagine |
| Accomodare dalla coda | <5 s | sì col suggerimento nella riga | oggi finestra di scelta |
| Trovare un ospite | <5 s | sì | ~~manca la ricerca globale (§64)~~ **fatta il 9 settembre**: ⌘K da qualunque schermata |

**Nota di metodo:** questi numeri vanno **misurati**, non stimati. Il §123
chiede test su compiti reali: la sezione 48 dice come.

---

# 42. Competitor Benchmark

Analisi di workflow, non di interfaccia (§90: non copiare).

**CoverManager** — forte su prenotazioni multicanale, gruppi, sala, no-show,
pagamenti. Il suo vantaggio è la **completezza del canale**: arriva da ogni
parte e finisce in un unico libro. Cosa imparare: la velocità del check-in dalla
lista, e le azioni di riga che Tavolo non ha.

**Pienissimo** — forte su CRM, marketing, Wi-Fi, fedeltà, automazioni, e sul
flusso del ristorante italiano. Il suo vantaggio è **far tornare la gente**.
Cosa imparare: il marketing che parte da un obiettivo e non da uno strumento
(§38).

**Dove Tavolo è già davanti a entrambi:** la disciplina sul dato. Nessuno dei
due dichiara su quale campione una percentuale è calcolata, nessuno dei due
scrive «non abbastanza dati» al posto di un numero. È un vantaggio piccolo per
chi compra e grande per chi usa: dopo tre mesi si sa quali numeri guardare.

**Dove Tavolo è indietro:** velocità operativa nelle liste, e il tablet.

---

# 43. Tavolo Differentiation

> CoverManager gestisce prenotazioni. Pienissimo aiuta a riempire il locale.
> **Tavolo coordina il ritmo del locale.**

Il vantaggio da costruire è **service intelligence**: Tavolo sa chi arriva, chi
aspetta, chi è seduto, quando si libera un tavolo, chi è VIP, chi è in ritardo,
quanto vale un cliente, quanto è durato il servizio, quanto ha reso il tavolo —
e **mette queste cose insieme**.

Ne sa già mettere insieme due: «T9 è libero per Famiglia Bertoldi — 4 posti
vuoti con qualcuno in piedi». Quello è il prodotto. Tutto questo documento
serve a far succedere quella frase più spesso, e a farla vedere prima.

**La misura del vantaggio, che è anche il criterio del redesign:** quante
decisioni Tavolo prende *al posto* di chi lavora — zero, e va bene — e quante
gliene **prepara**: oggi una, e possono essere sei.

---

# 44. Roadmap P0-P3

## P0 — impattano il servizio adesso

| # | Cosa | Perché ora |
|---|---|---|
| 1 | **Accesso: togliere il precompilamento demo dalle installazioni vere** | §4-ter: non è UX, è un cliente che vedrebbe credenziali altrui |
| 2 | **«Sala» punta alla sala viva; la piantina va in Impostazioni** | il gesto più naturale porta a un editor |
| 3 | **Un dizionario di stato per i tavoli** | sette contro quattro sullo stesso oggetto |
| 4 | **Tavolo consigliato nella riga della lista d'attesa** | il motore c'è, è sepolto |
| 5 | **Riconoscimento ospite in nuova prenotazione** | ogni telefonata è un potenziale doppione |
| 6 | **Segnale ospite nella riga della lista prenotazioni** | migliore rapporto valore/lavoro del documento |
| 7 | **Componenti: Drawer e Toast con annulla** | prerequisito di quasi tutto il resto |

## P1 — grandi miglioramenti operativi

8. Azioni di riga nelle liste (prenotazioni, ospiti, coupon)
9. Pannello tavolo sulla sala viva
10. Quattro livelli di priorità negli avvisi di Servizio
11. Tre zone affiancate su scrivania
12. Vista affiancata su tablet (accoglienza, coda, telefono)
13. Barra in basso: Prenotazioni al posto di Attesa
14. «Turno di oggi» in Camerieri + livello sul piano sala
15. Optimistic sui cinque gesti veloci
16. Tre linguaggi visivi per segnali, tag manuali, tag calcolati
17. Modulo pubblico: proporre le prime disponibilità quando è pieno

## P2 — efficienza e rifinitura

18. Terza riga «azione» in Analisi
19. Carta: righe compatte al posto delle schede
20. Impostazioni: blocchi che mostrano il valore da chiusi
21. Marketing hub per intenti
22. Coupon ed Esperienze in righe
23. Scala tipografica e tre livelli di densità applicati — **primo giro fatto il 9 settembre** (etichette e note: 82 richiami)
24. ~~Attribuzione dei cambiamenti in tempo reale («assegnato da Anna»)~~ — **fatta il 9 settembre**
25. ~~Ricerca globale~~ — **fatta il 9 settembre**
26. ~~Scheletri per componente~~ — **fatto il 9 settembre** (e la constatazione era mezza sbagliata: vedi la sezione 35-37)
27. Guest 360 riorganizzato
28. Anteprime reali in Brand

## P3 — concetti futuri

29. Trascinamento operativo su sala viva
30. Tavolozza dei comandi e scorciatoie da tastiera
31. Ricette di automazione aggiuntive
32. Esperienza dei pagamenti (dopo le sei decisioni)
33. CRM fra locali
34. Coda locale e ritentativo con rete instabile

---

# 45. Impact / Effort Matrix

Impatto e sforzo da 1 a 5; l'ordine è per rapporto, con l'eccezione dichiarata
dal §116 (le cose critiche per il servizio scavalcano).

| Intervento | Imp. | Sforzo | Rapporto | P |
|---|---:|---:|---:|---|
| Accesso: precompilamento demo | 5 | 1 | **5,0** | P0 |
| «Sala» → sala viva | 5 | 1 | **5,0** | P0 |
| Segnale ospite nella lista prenotazioni | 5 | 2 | **2,5** | P0 |
| Tavolo consigliato nella riga di attesa | 5 | 2 | **2,5** | P0 |
| Dizionario di stato unico | 4 | 2 | 2,0 | P0 |
| Barra in basso: Prenotazioni | 3 | 1 | 3,0 | P1 |
| Riconoscimento ospite | 5 | 3 | 1,7 | P0 |
| Azioni di riga | 5 | 3 | 1,7 | P1 |
| Toast con annulla | 4 | 2 | 2,0 | P0 |
| Drawer | 4 | 3 | 1,3 | P0 |
| Pannello tavolo | 5 | 3 | 1,7 | P1 |
| Livelli di priorità avvisi | 4 | 2 | 2,0 | P1 |
| Tre zone affiancate | 4 | 3 | 1,3 | P1 |
| Vista affiancata tablet | 4 | 4 | 1,0 | P1 |
| Turno di oggi + livello sala | 4 | 3 | 1,3 | P1 |
| Terza riga in Analisi | 3 | 3 | 1,0 | P2 |
| Carta in righe | 3 | 2 | 1,5 | P2 |
| Marketing per intenti | 3 | 4 | 0,8 | P2 |
| Ricerca globale | 3 | 3 | 1,0 | P2 |
| Trascinamento | 2 | 5 | 0,4 | P3 |
| Tavolozza comandi | 2 | 3 | 0,7 | P3 |

**Le prime cinque righe si fanno in pochi giorni e spostano il prodotto più di
tutto il resto sommato.** Tre di loro sono cambi di destinazione e di dato
mostrato, non di codice nuovo.

---

# 46. Before / After Maps

## Preparare il servizio (nove prenotazioni)
**Prima:** apri Prenotazioni → apri la prima → leggi segnali → torna → la
seconda → … → 27 navigazioni. Poi per i tavoli mancanti: apri, assegna, torna ×3
= 9 in più. **Circa 40 navigazioni, e i segnali si dimenticano.**
**Dopo:** apri Prenotazioni, **i segnali sono nella lista**, tocca le tre righe
senza tavolo e assegna dal menù. **12 tocchi, zero navigazioni.**

## Accomodare chi aspetta
**Prima:** Servizio dice «T9 è libero per Famiglia Bertoldi» → vai in Attesa →
Accomoda → finestra → scegli T9 → conferma. **5 passi, con l'informazione già
data al primo.**
**Dopo:** dalla riga di attesa (o dall'avviso) → «Accomoda su T9». **1 tocco.**

## Rispondere al telefono per un cliente abituale
**Prima:** «Mi dice nome e cognome? … Il numero? … Ha allergie?» — tutto già in
archivio. **~45 secondi, e forse un doppione.**
**Dopo:** telefono → compare «Sofia Bianchi · 7 visite · VIP · allergia
glutine» → [Usa questo ospite] → data, persone, ora. **<20 secondi, nessun
doppione, e il locale sa già dell'allergia.**

## «Dove metto queste sei persone?»
**Prima:** tocca «Sala» → editor della piantina → capisci che è il posto
sbagliato → Servizio → Sala → guarda.
**Dopo:** tocca «Sala» → la sala viva → tocca un tavolo → il pannello dice se
regge e fino a quando.

---

# 47. Acceptance Criteria

Una schermata è finita quando (§124):

- tutte le funzioni precedenti sono raggiungibili — **nessuna capacità persa**
- nessun dato perso
- scrivania, tablet e telefono funzionano, e il tablet **non** è una scrivania
  ristretta
- caricamento, vuoto ed errore esistono e dicono le tre cose del §71
- tastiera e tocco funzionano; nessun controllo essenziale solo al passaggio del
  mouse
- nessuno scorrimento involontario, in nessuna direzione (**misurato**, non
  guardato)
- test verdi, TypeScript pulito, console pulita
- **i compiti principali sono più veloci**, contati in tocchi

E due criteri aggiuntivi che valgono per questo prodotto:

- **nessun numero nuovo senza la sua fonte.** Se una schermata mostra un valore,
  deve poter dire su cosa è misurato o dichiararsi stima
- **nessun pulsante senza dietro** (§119). Una funzione futura si segna come
  proposta nel documento, non come pulsante spento nell'interfaccia

---

# 48. Testing Plan

**Automatico, a ogni fase**
1. `tsc --noEmit`, `next lint`, 868 test, 9 flussi end-to-end
2. **La sonda di scorrimento** su tutte le rotte × quattro risoluzioni: pretende
   zero. Esiste: `scripts/audit-visivo.mjs`
3. **La campagna visiva** alle tre risoluzioni del §122 (1440×900, 1024×1366,
   390×844) con il rapporto macchina: stato, console, scorrimento

**Operativo, a mano — i sei scenari del prompt**

| Scenario | Cosa si misura | Bersaglio |
|---|---|---|
| A · 21:45, pieno, 2 in ritardo, 3 gruppi in coda, un tavolo si libera | secondi per capire cosa fare | **<5 s** |
| B · telefonata «tavolo per 4 domani alle 21» | secondi e navigazioni | **<20 s, 0 navigazioni fuori** |
| C · walk-in di 2 | secondi | **<10 s** |
| D · famiglia aspetta da 35 min, T8 si libera | tocchi | **1** |
| E · entra un VIP | pagine da aprire per nome, VIP, ultima visita, allergia, tavolo preferito | **0** |
| F · fine serata: coperti, incasso, assenze, attesa, durate, food cost | schermate | **1 + 1** |

**Come misurare senza un laboratorio:** i sei scenari diventano sei script
Playwright che contano i click e il tempo fino a quando l'informazione bersaglio
è nel DOM. Non sostituiscono una persona vera, ma impediscono le regressioni —
ed è più di quanto si misuri oggi.

**Da fare con una persona vera:** lo scenario A. Cinque secondi sono un giudizio
umano, e nessuno script sa dire se un host ha capito.

---

# 49. Final UX Score Target

| Dimensione | Oggi | Dopo P0 | Dopo P1 | Target |
|---|---:|---:|---:|---:|
| Fiducia nei dati | 9,5 | 9,5 | 9,5 | 9,5 |
| Non-scorrimento / densità | 8,5 | 8,5 | 8,8 | 9,0 |
| Coerenza del linguaggio | 6,0 | 8,5 | 9,0 | 9,0 |
| Architettura dell'informazione | 5,5 | 8,0 | 8,8 | 9,0 |
| Velocità operativa | 5,5 | 7,0 | 8,5 | 8,5 |
| Tablet | 3,0 | 3,0 | 7,5 | 8,0 |
| **Complessivo** | **6,4** | **7,7** | **8,5** | **8,6** |

**Il P0 vale 1,3 punti in pochi giorni**, e quasi tutto viene da tre cambi di
destinazione e di informazione mostrata. Il tablet resta a 3,0 dopo il P0
perché non c'è modo di sistemarlo con interventi piccoli: è progetto.

---

# 50. Implementation Plan

Sei fasi (§121), ognuna con la sua verifica e il suo commit. **Non una
rivoluzione in un commit.**

## Fase 0 — la cosa che non aspetta
Il precompilamento demo nell'accesso (§4-ter). Un file, mezz'ora, P0 di
sicurezza.

## Fase 1 — infrastruttura
Drawer · Toast con annulla · scala tipografica · tre livelli di densità ·
dizionario unico degli stati del tavolo · regole pagina/pannello/modale/foglio
scritte in `DESIGN.md`.
**Verifica:** nessun cambiamento visibile all'utente, tutti i test verdi. È la
fase che non si vede e senza la quale le altre non si possono fare.

## Fase 2 — la navigazione e il servizio

> **Nota del 9 settembre:** lo spostamento di «Sala» su `/service/room` di
> questa fase è stato annullato — vedi P-01. La sala del locale è `/floor` e la
> voce «Sala» ci punta di nuovo.
«Sala» → sala viva; piantina in Impostazioni (con reindirizzamento) · barra in
basso · pannello tavolo · segnale ospite nella lista prenotazioni · azioni di
riga · tavolo consigliato nella coda · quattro livelli di priorità · tre zone
affiancate.
**Verifica:** gli scenari A, D, E del §48.

## Fase 3 — prenotazione e ospite
Riconoscimento ospite · pannello prenotazione · Guest 360 · tre linguaggi
visivi dei tag.
**Verifica:** scenari B, C.

## Fase 4 — tablet
Le tre viste affiancate.
**Verifica:** campagna visiva a 1024×1366 su tutte le rotte.

## Fase 5 — lettura e gestione
Terza riga in Analisi · carta in righe · impostazioni con valori da chiusi ·
marketing per intenti · turno di oggi in Camerieri · coupon ed esperienze.
**Verifica:** scenario F.

## Fase 6 — pubbliche
Modulo di prenotazione: proporre quando è pieno; gruppi grandi · portale Wi-Fi
più corto · anteprime reali in Brand.
**Verifica:** campagna sulle pagine pubbliche, telefono compreso.

## Cosa non si tocca, in nessuna fase (§117)

Logica di business · API · schema · test · permessi · registro delle azioni ·
i quattro livelli di verità del dato · il catalogo chiuso delle automazioni ·
la regola «un avviso senza impatto non si mostra» · il sondaggio a una domanda ·
la disciplina «un nome per funzione su tutti gli schermi» · e il fatto che
nessuna funzione esistente venga rimossa per semplificare (§118).

---

---

# 51. Cosa ha detto l'implementazione all'audit

Sezione aggiunta dopo aver costruito le sei fasi, perché un documento di
progetto che non registra dove aveva torto serve una volta sola.

## Le cinque cose che avevo sbagliato, e come

| Avevo scritto | La verità | Perché ho sbagliato |
|---|---|---|
| «Ogni prenotazione telefonica è un potenziale doppione» | Il server riusa già la scheda esistente (`trovaOCreaOspite`) | Ho dedotto il difetto dall'assenza del riconoscimento nell'interfaccia, senza seguire il percorso fino al server |
| «Camerieri è un elenco amministrativo», voto 5 | Leggeva la **tabella sbagliata**: 76 tavoli assegnati, zero mostrati | Ho attribuito a una scelta di progetto quello che era un difetto dei dati |
| «Il modulo pubblico mostra una griglia morta quando è pieno» | Propone già le prime disponibilità, e le chiede solo se serve | Lettura di superficie: il testo reso nello stato iniziale, non il codice del componente |
| «I gruppi grandi compilano un modulo inutile» | Vanno già al telefono, con il numero a 44 px | Idem |
| «Il portale Wi-Fi ha troppo testo» | È già essenziale, e lo sconto è già nella schermata dopo | Idem |
| Tablet 3/10 | Il layout tiene (zero scorrimenti a 1024): il difetto erano i bersagli di tocco | Ho contato i breakpoint invece di misurare |

**Il filo comune di quattro su sei: dedurre l'assenza da una lettura di
superficie.** Una funzione che vive solo in uno stato particolare — la giornata
piena, il gruppo oltre la soglia, la tabella con l'altro nome — non si vede
nello stato iniziale di una schermata, e non compare nel testo estratto né
nelle misure. Va cercata nel codice, o provocando lo stato.

## Le tre cose che ho trovato solo costruendo

Nessuna delle tre era nell'audit, e la prima è più grave di qualsiasi voce che
c'era.

1. **Due tabelle per «chi copre questo tavolo»** (P-11): `StaffAssignment` e
   `WaiterAssignment`, entrambe scritte dal prodotto da schermate diverse, che
   non si guardano. **P0, non risolto**: serve una decisione sul modello.
2. **`/service` non era mai stata convertita al non-scorrimento.** Misurava
   zero solo perché il contenuto ci stava: con un servizio vero sforava di 600
   px su un telefono. *Misurare zero non è la stessa cosa che essere costruito
   per non scorrere.*
3. **Il precompilamento demo nella pagina d'accesso**, senza controllo di
   ambiente (§4-ter). Trovato verificando il §104, ed era la cosa più urgente
   di tutte.

## Il bilancio, senza abbellirlo

Delle sette voci P0 della roadmap, **cinque erano vere** e sono chiuse; due
erano diagnosi sbagliate di problemi che esistevano per un'altra ragione — e
sono chiuse anche quelle, ma non per il motivo che avevo scritto. Sono
comparse tre voci nuove, una delle quali (P-11) più grave di sei delle sette
originali.

**Quello che l'audit ha preso bene:** le destinazioni sbagliate, l'intelligenza
sepolta un click troppo in basso, l'inventario dei contenitori, la densità e la
tipografia. Sono le cose che si vedono leggendo la struttura.

**Quello che l'audit ha preso male:** tutto ciò che dipende da uno stato che non
si vede a riposo. Per quelle cose la lettura non basta, e la prossima volta si
comincia provocando lo stato — una giornata piena, un gruppo di quindici, una
coda di dodici — prima di scrivere che manca qualcosa.

---

## Una nota finale, e poi il lavoro

La cosa che mi ha colpito facendo questo audit non è quanto ci sia da
sistemare: è **quanta intelligenza sia già scritta e non arrivi in superficie**.
Il motore che trova il tavolo per chi aspetta, la funzione che riassume cosa
sapere di un ospite in quattro righe ordinate per urgenza, la durata misurata
per gruppo e fascia oraria, l'attribuzione delle prenotazioni a una campagna
con la finestra dichiarata, i sette stati derivati dai fatti: tutto questo
esiste, ha dei test, e funziona.

Quello che manca non è codice nuovo. È **una destinazione giusta** per la voce
«Sala», **una riga in più** nella lista delle prenotazioni, **un suggerimento
mostrato prima** invece che dopo un click, e **un nome solo** per lo stato di un
tavolo.

Alle 21:15 di sabato non serve un prodotto che sappia più cose. Serve un
prodotto che dica quelle che sa, un secondo prima.
