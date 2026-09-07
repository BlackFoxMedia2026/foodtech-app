# TAVOLO — UX/UI + Visual Gap Audit

**Data:** 7-8 settembre 2026 · **Base:** prodotto attuale, 54 screenshot dell'audit visivo, codice dell'interfaccia · **Vincolo del brief:** audit, non ridisegno

## Fonti

`[SCREENSHOT]` osservazione diretta delle immagini · `[CODE]` letto nel codice · `[MEASURED]` misurato con strumenti · `[PREVIOUS AUDIT]` audit precedenti · `[INFERENCE]` mia deduzione · `NON VERIFICATO` non ho potuto confermare

## Scala di giudizio

**A** visivamente debole · **B** corretta ma generica · **C** visivamente coerente · **D** UX solida · **E** UX molto efficace · **F** best-in-class

---

# Executive Summary

Tavolo **sembra** un software hospitality di fascia alta. Verde bosco, crema, terracotta, un serif editoriale nei titoli: l'identità è distintiva e non somiglia a nessun pannello enterprise. Questa parte è vinta.

Ma alla seconda domanda del brief — *può essere usato durante un servizio affollato, velocemente e senza frizioni?* — la risposta oggi è **no, non ancora**, e per tre ragioni che ho potuto verificare, non intuire.

**Primo: il centro controllo si autoaffoga.** La schermata Servizio, che è la cosa migliore del prodotto, alle 22:00 mostra nove cartelli identici che dicono «in ritardo di 577 minuti», «472 minuti», «457 minuti» `[SCREENSHOT]`. Una prenotazione delle 12:15 letta a cena non è in ritardo: è un'assenza che nessuno ha chiuso. L'unico avviso davvero azionabile — «Picco alle 22:00» — è sepolto fra gli altri, con lo stesso peso visivo. Quando tutto è un allarme, niente lo è.

**Secondo: sul telefono il primo contenuto utile è sotto la piega.** Su uno schermo da 390×844, intestazione, titolo, selettore e sei riquadri di numeri occupano circa 780 pixel: «Da tenere d'occhio» comincia dopo `[SCREENSHOT][MEASURED]`. In servizio, con una mano occupata, si scorre due schermate per arrivare a cosa fare.

**Terzo: la Panoramica mostra gli stessi numeri due volte.** Coperti e Occupazione compaiono in cima nei riquadri grandi e di nuovo più sotto nella card «KPI principali» — due componenti diversi, due linguaggi visivi diversi, gli stessi dati `[SCREENSHOT][CODE]`.

E un quarto, sul lato cliente: **il widget di prenotazione chiede nome, cognome, email e telefono prima di dire se c'è posto**, e mostra la data in formato `mm/dd/yyyy` a un cliente italiano `[SCREENSHOT]`.

Il design system, guardato nel codice, **è uno stile condiviso più che un sistema**: 57 file costruiscono le card a mano contro 39 che usano il componente, e convivono due famiglie di riquadri-numero con due vocabolari diversi `[CODE][MEASURED]`.

**Il verdetto in una riga:** Tavolo è **C+ visivamente coerente e premium**, **C operativamente** — bello e non ancora abbastanza veloce. La distanza dal livello D-E non si copre con una nuova palette: si copre togliendo, ordinando per urgenza, e portando l'azione sopra la piega.

---

# Current Visual Identity

Verde bosco profondo come fondo (`#13332C`, `--background: 160 46% 11%`), crema (`#F2E7D0`), terracotta e caramello (`#AF6648`, `#AF7944`), una famiglia di marroni dichiarati «esatti, non reinterpretati» con un commento nel tema che racconta una deriva precedente verso l'oro e il pesca, verde salvia per il positivo, sabbia e gilt come scale accessorie `[CODE]`.

Tipografia: un serif nei titoli (`--font-display`), un sans nell'interfaccia, un mono per i numeri `[CODE]`. Navigazione a pillola in alto, angoli arrotondati, ombre trattenute, animazioni brevi (fade 220ms, slide 240ms) `[CODE]`.

**Giudizio: C+ tendente a D.** È un'identità **riconoscibile in due secondi** e non somiglia a un template. Il rischio non è che sia brutta: è che sia **più editoriale che operativa** — un'estetica da rivista di cucina applicata a uno strumento che deve funzionare alle 21:30 di sabato.

---

# Brand Evaluation

| Dimensione | Voto | Motivo |
|---|---|---|
| Brand appeal | **8** | Distintiva, calda, adulta. Nessun competitor consultato usa questo registro — NON VERIFICATO il loro aspetto attuale |
| Operational usability | **5** | Il fondo scuro + testo crema è riposante ma abbassa il contrasto dei testi secondari; molti stati si distinguono solo leggendo |
| Visual distinctiveness | **9** | Non confondibile |
| Trust | **7** | Il tono adulto aiuta; la pagina pubblica lo tradisce (font diverso) |
| Hospitality feeling | **9** | È l'aspetto meglio riuscito |
| Sophistication | **8** | — |
| Warmth | **9** | — |
| Legibility | **6** | Il serif nei numeri grandi è bello e **rallenta la lettura rapida** dei KPI `[INFERENCE]` |

**È troppo editoriale?** Nelle pagine di gestione no, sta bene. Nelle due schermate di servizio (Servizio, Sala) **sì**: lì servono contrasto e gerarchia, non eleganza.

---

# Information Architecture

Navigazione desktop: `Panoramica · Servizio · Prenotazioni · Sala · Attesa · Ospiti · Altro` `[SCREENSHOT]`.
Navigazione mobile: `Oggi · Ora · [+] · Sala · Attesa · Altro` `[SCREENSHOT]`.

**Difetto verificato: le due navigazioni non si chiamano allo stesso modo.** «Panoramica» su desktop è «Oggi» su mobile; «Servizio» è «Ora». Sono le stesse destinazioni con due vocabolari: chi impara su un dispositivo riparte da capo sull'altro `[SCREENSHOT]`.

**Secondo difetto: «Sala» e «Servizio» si sovrappongono.** In Servizio esiste un selettore `Elenco | Sala` che porta alla sala viva; ed esiste una voce di menu «Sala» che porta alla piantina di configurazione. Due «Sala» che sono cose diverse: una operativa, una di configurazione `[SCREENSHOT]`. A un nuovo utente non è deducibile.

**Terzo: «Altro» nasconde troppo.** Dietro ci sono Analytics, Menu, Marketing, Campagne, Automazioni, Coupon, Gift card, Wi-Fi, QR, Esperienze, Camerieri, Pagamenti, Impostazioni — cioè **tutto il lato commerciale del prodotto** `[CODE]`. Il ristoratore che compra Tavolo per il marketing lo trova sotto «Altro».

**Proposta (da valutare, non da eseguire ora)** `[INFERENCE]`: due famiglie dichiarate invece di una lista piatta —
**Servizio** (Oggi, Ora, Prenotazioni, Sala, Attesa) · **Clienti** (Ospiti, Marketing, Fedeltà) · **Locale** (Menu, Personale, Analytics, Impostazioni). E un solo vocabolario fra desktop e mobile.

---

# Navigation

| Voce | Frequenza d'uso | Nome chiaro? | Nota |
|---|---|---|---|
| Panoramica / Oggi | alta a inizio giornata | 🟡 due nomi | |
| Servizio / Ora | **altissima** durante il servizio | 🟡 due nomi | dovrebbe essere la prima |
| Prenotazioni | alta | 🟢 | |
| Sala | media | 🔴 ambigua | collide con la vista Sala dentro Servizio |
| Attesa | media | 🟢 | |
| Ospiti | media | 🟢 | |
| Altro | — | 🔴 | contiene 13 destinazioni |

L'ordine attuale mette per prima la Panoramica, che si guarda una volta al giorno, e per seconda Servizio, che si guarda cento volte `[INFERENCE]`.

---

# Management vs Service Mode

Oggi la distinzione **esiste concettualmente e non visivamente**: Servizio e Sala hanno lo stesso peso grafico, la stessa densità e la stessa navigazione di Impostazioni o Marketing.

**Serve una vera modalità servizio?**

*A favore:* durante il servizio servono meno cose, più grandi, ordinate per urgenza; il telefono è il dispositivo, non lo schermo; l'errore costa un tavolo. *Contro:* una seconda modalità è una seconda interfaccia da mantenere, e Tavolo ha già dimostrato che il rischio del progetto è costruire più di quanto si usi.

`[INFERENCE]` **Raccomandazione: non una modalità separata, ma una regola di densità.** Le due schermate di servizio adottano una densità e una gerarchia proprie (meno numeri, avvisi ordinati per urgenza, azioni a portata di pollice); il resto del prodotto resta com'è. Costo molto minore, beneficio quasi identico.

---

# Dashboard (Panoramica)

**Giudizio: B — corretta ma generica, e con una duplicazione.**

Cosa c'è `[SCREENSHOT]`: saluto «Buona giornata, Anna» con la data · quattro riquadri colorati (Prenotazioni 13, Coperti 57, Occupazione 63%, Andamento +16%) · timeline delle prenotazioni di oggi · Azioni rapide (4) · Alert e promemoria (4 voci) · card «KPI principali» con Coperti, Incasso, Occupazione, No show.

**Difetti verificati**

1. **Gli stessi numeri due volte.** Coperti e Occupazione stanno nei riquadri in alto **e** nella card KPI più sotto — due componenti distinti (`today-summary.tsx` e `kpi-grid.tsx`) con due linguaggi visivi diversi `[CODE][SCREENSHOT]`. Chi legge si chiede se siano due cose diverse.
2. **Colore decorativo, non semantico.** I quattro riquadri in alto usano quattro fondi diversi (crema, sabbia, terracotta, verde) senza che il colore significhi qualcosa: il terracotta su «Occupazione» non vuol dire allarme, e il verde su «Andamento» non vuol dire buono `[SCREENSHOT]`.
3. **Un avviso a zero è rumore.** «0 Tavoli da confermare» occupa lo stesso spazio di «2 Allergia segnalata» `[SCREENSHOT]`.
4. **La timeline è passiva**: undici righe con «In ritardo» in rosso, senza priorità né azione `[SCREENSHOT]`.

**Il modello TODAY / NOW / NEXT / ATTENTION proposto dal brief regge** `[INFERENCE]`: *oggi* (i due o tre numeri che contano), *adesso* (chi sta arrivando), *dopo* (il picco), *attenzione* (le tre cose da fare). Sostituirebbe quattro blocchi con quattro domande.

---

# Service

**Giudizio: C — la funzione è E, la presentazione la riporta a C.**

`[SCREENSHOT]` Sei riquadri (in sala, tavoli, in arrivo, in ritardo, in attesa, walk-in), poi «Da tenere d'occhio» con nove cartelli.

**Il difetto più grave dell'intero audit.** Alle 22:00 i cartelli sono: *«Marco Greco in ritardo di 577 minuti»*, *«Davide Conti in ritardo di 472 minuti»*, *«Matteo Bianchi in ritardo di 457 minuti»*, *«Tommaso Russo 157»*, *«Matteo Ricci 142»*, *«Matteo Galli 142»*, *«Beatrice Moretti 97»*, *«Davide Conti 37»*. Otto cartelli identici per forma, colore e testo, che dicono la stessa cosa con un numero diverso.

Tre cose non vanno, e sono tutte correggibili:

- **«577 minuti» non è un ritardo.** Superata la durata di un servizio, quella prenotazione è un'assenza da chiudere, non un ritardo da rincorrere. È lo stesso difetto dell'attesa media da 538 minuti già corretto nella lista d'attesa.
- **I minuti oltre l'ora non si leggono.** Nessuno converte 457 in «sette ore e mezza» a colpo d'occhio.
- **Nessuna gerarchia.** «Picco alle 22:00» — l'unico avviso che riguarda i prossimi venti minuti — ha lo stesso identico peso visivo di una prenotazione di pranzo mai arrivata `[SCREENSHOT]`.

**In tre secondi capisco cosa richiede attenzione? No.** Ed è un peccato, perché il motore sotto è giusto: ogni avviso ha già il suo rimedio e il suo link.

**Cosa serve** `[INFERENCE]`: severità su tre livelli (urgente / da fare / informativo), ordinamento per urgenza reale, raggruppamento degli avvisi della stessa specie («8 prenotazioni non arrivate — chiudile o telefona»), e un tetto oltre il quale un ritardo diventa un'assenza.

---

# Floor (Sala live)

**Giudizio: B/C.**

`[SCREENSHOT]` Chip di riepilogo in alto (Al conto 2, In arrivo 2, Prenotato 2, Libero 11) — questi funzionano bene. Sotto, la pianta con 17 tavoli.

**Difetti verificati**

1. **Libero e Prenotato si somigliano troppo.** Entrambi sono rettangoli verde scuro con bordo tenue; li distingue solo la parola scritta in piccolo `[SCREENSHOT]`. Alla domanda del brief — *lo stato è riconoscibile senza leggere?* — la risposta è no per la coppia più frequente.
2. **La dimensione del tavolo non dice niente.** Un tavolo da 2 e uno da 6 hanno lo stesso ingombro; il numero di posti è scritto in caratteri piccoli `[SCREENSHOT]`. È l'informazione più usata quando si cerca dove mettere un gruppo, ed è codificata solo a parole.
3. **Molto vuoto.** Sui 1400 px la pianta occupa meno di metà dell'area utile e l'occhio deve viaggiare `[SCREENSHOT]`.
4. **`+397'` e `+412'`** — di nuovo i minuti oltre l'ora `[SCREENSHOT]`.

Cosa funziona: i chip di riepilogo, il nome dell'ospite sul tavolo, l'orario e i coperti.

---

# Bookings

**Giudizio: C, con una ridondanza confermata.**

Il brief chiedeva se «stato + menu a tendina + Apri» siano ridondanti. **Lo sono** `[SCREENSHOT]`: ogni riga mostra una pillola «Confermata», poi una tendina che ripete la parola «Confermata», poi il link «Apri». Due elementi dicono la stessa cosa e occupano insieme circa un quarto della larghezza della tabella.

Altri rilievi:

- La tendina è un controllo pesante ripetuto tredici volte: molto rumore per un'azione che si usa raramente `[INFERENCE]`.
- **La data appare in formato `09/07/2026`** accanto a «lunedì 07 settembre» `[SCREENSHOT]`. Per un italiano il primo si legge «9 luglio». È il formato nativo del campo data, che segue la lingua del browser: va forzato o sostituito.
- Nessuna ricerca, nessun ordinamento per colonna.
- Buono: nome con telefono sotto, chip della fonte, tavolo, densità di riga.

---

# Booking Form

`[SCREENSHOT]` Modulo unico, verticale, tutti i campi visibili.

`[INFERENCE]` Per una prenotazione telefonica standard servono: nome, telefono, data, ora, persone. Il modulo mostra anche cognome, email, occasione, note, tavolo, fonte — campi giusti da avere, sbagliati da mostrare tutti insieme mentre qualcuno parla al telefono. La progressive disclosure (i cinque campi essenziali, poi «aggiungi dettagli») farebbe scendere il tempo di presa in modo netto.

---

# Public Booking Widget

**Giudizio: B — e come funnel è il punto più migliorabile del prodotto.**

`[SCREENSHOT]` L'ordine dei campi è: **nome · cognome · email · telefono · data · persone · orario · occasione · note · [Prenota ora]**.

**Difetto principale: chiediamo i dati personali prima di dire se c'è posto.** Il campo Orario resta inerte con scritto «Scegli prima una data», quindi il cliente compila quattro campi personali senza sapere se il tavolo esiste. La sequenza attesa in questa categoria è **data → persone → orario → dati**.

**Secondo difetto: `mm/dd/yyyy`.** Su una pagina italiana `[SCREENSHOT]`. Non è un dettaglio estetico: è il campo che decide la prenotazione, e chi scrive 07/09 intendendo il 7 settembre può prenotare il 9 luglio.

**Terzo: il widget è fuori brand.** Titolo in un sans geometrico, mentre tutta l'applicazione usa il serif; nessun logo del ristorante `[SCREENSHOT]`. Era già segnalato nell'audit precedente `[PREVIOUS AUDIT]` e non è stato ancora affrontato.

Cosa funziona: una sola colonna, campi grandi, CTA chiara, contatti del locale in fondo, nessuno scorrimento orizzontale `[MEASURED]`.

---

# Waitlist

**Giudizio: C/D.** `[SCREENSHOT]` Testa con persone in coda, attesa media e «oltre la stima»; tre riquadri (in attesa, avvisati, confermati); righe con nome, persone, telefono, tempo trascorso, note.

Lo staff capisce chi chiamare per primo? **Solo leggendo**: l'ordine è di arrivo, non di priorità, e non c'è un segno visivo per «questo tavolo è compatibile adesso». Il centro controllo lo sa già dire («B1 è libero per Gruppo Bianchi») ma quell'informazione **non compare nella pagina Attesa** `[SCREENSHOT]`.

---

# CRM & Guest Profile

`[SCREENSHOT]` La lista ospiti è densa e leggibile, con ricerca e pagine. La scheda mostra intestazione con iniziali, etichette, contatti, punti, cronologia, storico visite, movimenti.

**Domanda del brief: qual è l'informazione dei primi cinque secondi?** `[INFERENCE]` Per un ristoratore è: *questa persona è importante? viene spesso? ha allergie? mi sta antipatica per qualche motivo?* Oggi allergie ed etichette ci sono ma **hanno lo stesso peso di tutto il resto**; il profilo calcolato (frequenza, affidabilità) sta più in basso, in un pannello. La scheda è ricca e piatta.

Manca, e conta: la **spesa** in evidenza (c'è, ma stimata e in basso) e un riassunto in una riga in cima.

---

# Analytics

**Giudizio: D — è la pagina meglio scritta del prodotto.** `[SCREENSHOT]`

Gli stati «misurato / stimato / non disponibile» sono dichiarati con parole esplicite: *«Questa cifra usa lo scontrino medio che hai dichiarato: è una stima»*, *«queste percentuali valgono sui 91,00 € di cui conosciamo il costo»*, *«Dove ci sono meno di 10 prenotazioni la percentuale non si mostra»*.

Difetti: **pagina lunghissima** con tre pannelli densi in fila e nessuna navigazione interna; nessuna gerarchia fra «la cosa importante» e «il dettaglio». E la distinzione misurato/stimato è affidata **al testo**, mai a un segno visivo: un piccolo indicatore la renderebbe leggibile senza leggere `[INFERENCE]`.

---

# Marketing / Automations / Loyalty / Gift / Coupon / Wi-Fi

**Marketing hub: B.** Cinque card grandi con descrizione e nessun numero `[SCREENSHOT]`. La pagina non dice quante campagne sono attive, quanti contatti sono stati raccolti, quanti punti sono in circolazione: sembra un indice, non un cruscotto. Con i dati già disponibili diventerebbe operativa senza aggiungere nulla al database `[INFERENCE]`.

**Campagne: C.** L'elenco mostra INVIATE, APERTE, PRENOTAZIONI — la gerarchia giusta ci sarebbe già, ma i tre numeri hanno lo stesso peso, e «prenotazioni generate» (l'unico che vale) non domina `[SCREENSHOT]`.

**Automazioni: D.** Le tre schede spiegano cosa fanno e quante persone toccherebbero prima di accendere: è il pezzo di interfaccia che comunica meglio la filosofia del prodotto `[SCREENSHOT]`.

**Gift card: D.** «Ancora da spendere / Vendute / Usate» più la riga che chiama il residuo un debito verso i clienti. Sul microcopy: *«debito verso clienti»* è tecnico ma **giusto**, e va tenuto — un ristoratore capisce benissimo la differenza fra incasso e debito `[INFERENCE]`.

**Coupon: C/D.** Stato leggibile con il motivo quando non vale.

**Wi-Fi: D.** Backoffice con il numero onesto («poi venuti a mangiare») e portale pubblico semplice, con lo scambio dichiarato in una riga e il consenso separato. È la pagina pubblica meglio riuscita `[SCREENSHOT]`.

---

# Menu (backoffice e pubblico)

**Backoffice: C.** Categorie e piatti con riordino a frecce. Con oltre cento piatti mancano ricerca, filtri, azioni multiple e categorie richiudibili: oggi si scorre `[SCREENSHOT][INFERENCE]`.

**Menu pubblico: C/D.** Leggibile, allergeni scritti per esteso («Contiene: Uova, Senape, Glutine»), niente costi, niente piatti finiti `[SCREENSHOT]`. Ma **è il backoffice trasformato in pagina**: nessuna navigazione fra categorie, nessuna immagine, nessuna identità del ristorante oltre al nome. Per un menu che si apre da un QR al tavolo, la navigazione per categorie è la funzione mancante più evidente.

---

# Bill (conto al tavolo)

**Giudizio: D/E — è la finestra progettata meglio.** `[SCREENSHOT]`

Ricerca e tocco, piatti finiti mostrati spenti invece che nascosti, quantità con più e meno da 36 px, totale sempre visibile, «Incassa 38,00 €» che dice la cifra sul pulsante. Si usa con una mano.

Da verificare: nessuna conferma sulla chiusura del conto (giusto: è reversibile? **no**, e allora una conferma leggera servirebbe) `[INFERENCE]`; e la ricerca non ha il fuoco automatico all'apertura, che è un tocco in più su ogni piatto battuto.

---

# Mobile

Sette schermate operative, tutte senza scorrimento orizzontale `[MEASURED]`. Ma il punteggio non è la somma di quel controllo.

| Schermata | Voto | Problema principale | Gesto più frequente | Frizione | Miglioramento |
|---|---|---|---|---|---|
| Panoramica | **6** | Tre schermate di scorrimento per arrivare alla timeline | leggere | numeri duplicati | togliere la card KPI doppia |
| **Servizio** | **4** | **Il primo avviso è sotto la piega** (~780 px di intestazione e riquadri) | leggere il primo avviso | sei riquadri prima del contenuto | due riquadri su mobile, avvisi subito |
| Sala | **6** | Pianta pensata per lo schermo largo | trovare un tavolo libero | tavoli piccoli, stati simili | elenco per stato su mobile |
| Prenotazioni | **5** | Tabella a sei colonne su 390 px | cercare una prenotazione | tendina di stato per riga | righe a scheda, azione contestuale |
| Ospiti | **7** | — | cercare una persona | — | — |
| Menu | **7** | — | segnare finito | — | azione rapida sulla riga |
| Analytics | **6** | Pagina molto lunga | leggere un numero | tre pannelli densi in fila | indice interno |

**Media mobile: 5,9.** Il difetto è sistematico, non di una schermata: **su mobile viene mostrato tutto quello che c'è su desktop, nello stesso ordine**.

---

# Tablet

`[INFERENCE]` Non c'è un trattamento dedicato: fra 768 e 1024 px il layout è «desktop più piccolo». Per un tablet fissato all'ingresso — il posto naturale per Tavolo — la modalità giusta sarebbe la sala viva a tutto schermo con i controlli sui bordi. Da valutare dopo le correzioni mobile, non prima.

---

# Forms · Tables · Search & Filters

**Forms: C.** Etichette in maiuscoletto, campi ampi, messaggi di errore in italiano che dicono **quale** campo manca (corretto in una sessione precedente). Mancano raggruppamenti e divulgazione progressiva nei moduli lunghi.

**Tables: C.** Una sola densità, nessun ordinamento, nessuna intestazione fissa allo scorrimento, azioni ripetute su ogni riga.

**Search: C.** La ricerca dei piatti nel conto è ottima (immediata, senza invio); quella degli ospiti passa dall'URL; nelle prenotazioni non c'è. Tre comportamenti diversi per lo stesso gesto.

**Filters: C.** Nelle prenotazioni sono pillole in alto (bene), altrove sono assenti.

---

# Empty States · Error States · Feedback

**Empty states: D.** Sono la parte scritta meglio: dicono *cosa comparirà* e *cosa fare per farlo comparire* — «Il costo del cibo si calcola sui conti chiusi. Apri un conto dalla scheda della prenotazione…» `[SCREENSHOT]`. Erano già indicati come modello nell'audit precedente `[PREVIOUS AUDIT]`, e lo restano.

**Error states: D.** Schermata d'errore con navigazione intatta e «Riprova»; il portale Wi-Fi non configurato **non esiste** invece di essere un modulo vuoto; i messaggi dicono il campo mancante.

**Feedback: C.** I pulsanti dicono «Salvo…», «Un istante…»; manca un ritorno visivo coerente dopo il salvataggio (a volte una riga verde, a volte niente), e la coda dei lavori è visibile solo in Impostazioni.

---

# Modals / Drawers / Pages

`[CODE]` Esistono `dialog` e `sheet`; nella pratica **quasi tutto è una finestra modale**: conto, coupon, selettore tavoli, nuovo piatto, gift card, cancellazione dati, modifica ospite.

La regola proposta dal brief — azione rapida → modale, dettaglio → pannello laterale, flusso complesso → pagina — **oggi non è seguita**: la scheda ospite è una pagina (giusto), il conto è una modale (giusto), ma la modifica dell'ospite è una modale con dodici campi (dovrebbe essere pannello o pagina) `[SCREENSHOT]`.

---

# Status System

`[CODE]` Il componente `Badge` ha otto toni (neutral, gold, pearl, success, warning, danger, info, carbon); i toni realmente usati sono sei, con questa distribuzione: neutral 9, gold 6, warning 3, success 2, danger 2 `[MEASURED]`.

In parallelo esiste **un secondo sistema**: `StatCard` con toni propri (`accent`, `cream`, `sage`, `brown-medium`, `brown-dark`, `brown-light`) `[CODE]`. Due vocabolari di colore per due componenti che stanno **nella stessa schermata**.

E gli stati delle prenotazioni usano una terza forma (pillola con puntino), quelli dei tavoli una quarta (riempimento del riquadro) `[SCREENSHOT]`.

**Modello proposto** `[INFERENCE]`: cinque significati e basta — *neutro, in corso, fatto, attenzione, problema* — più uno riservato al riconoscimento del cliente (VIP). Tutto il resto è decorazione.

---

# Typography · Color · Spacing · Cards · Icons

**Typography: C/D.** Il serif nei titoli è la firma del prodotto e va tenuto. Nei **numeri grandi dei KPI** è discutibile: le cifre di un serif con grazie sono più lente da leggere di un sans tabellare, e quei numeri si leggono di sfuggita `[INFERENCE]`.

**Color: C.** Il tema dichiara 66 valori fra colori e scale `[MEASURED]`. Molti sono scale complete (carbon 9 gradini, sand 9) usate in minima parte. Manca una **mappa semantica**: oggi «terracotta» significa a volta accento, a volta contenitore, a volta allarme.

**Spacing: C.** Il problema non è troppo spazio in assoluto, è **spazio uguale ovunque**: la Panoramica e Impostazioni respirano allo stesso modo di Servizio, che dovrebbe essere denso.

**Cards: C.** Verificato: **57 file costruiscono card a mano** (`rounded-md border border-border`) contro **39 che usano il componente `Card`**, più 12 che usano la classe `.surface` `[MEASURED]`. È il sintomo più chiaro del fatto che il design system è uno stile condiviso, non un sistema.

**Icons: D.** Una sola libreria (lucide), tratto uniforme, quasi sempre accompagnate da testo.

---

# Microcopy

È il punto più alto del prodotto e va difeso: *«Nessun conto chiuso nel periodo»*, *«sarebbe una moltiplicazione, non una misura»*, *«se non sono più qui, chiudi le righe»*, *«non è una lista nera: è a loro che conviene telefonare»*.

Verifica delle espressioni segnalate dal brief:

| Espressione | Giudizio |
|---|---|
| «Consegnata al fornitore» | ✅ corretta e onesta; da provare con un ristoratore vero |
| «debito verso clienti» | ✅ tecnica ma giusta: è la differenza fra incasso e impegno |
| «assegna comunque» | ✅ chiara |
| «stima» | ✅ è la parola che tiene in piedi la fiducia |
| «coperti», «occupazione», «assenze» | ✅ vocabolario del mestiere |
| **«in ritardo di 577 minuti»** | 🔴 **sbagliata**: unità inadatta e concetto inadatto |
| «Buona giornata, Anna» | 🟡 gradevole, occupa lo spazio migliore della pagina |

---

# Notifications · Accessibility · Performance perception

**Notifiche: C.** C'è la campanella; gli avvisi di servizio vivono solo dentro la pagina Servizio. Un avviso urgente **non raggiunge chi sta guardando un'altra schermata** `[INFERENCE]`.

**Accessibilità: C/D.** A favore: `prefers-reduced-motion` e `forced-colors` rispettati `[PREVIOUS AUDIT]`, etichette sui pulsanti icona, errori di modulo testuali. Da verificare: contrasto dei testi secondari sul fondo verde (sospetto sotto 4,5:1 per `text-tertiary-foreground`) `[INFERENCE]`, e **stati distinti dal solo colore** nella sala.

**Percezione di velocità: C.** Nessuno scheletro di caricamento: le pagine appaiono in blocco. Con dati veri le rilevazioni davano 3-5 secondi in sviluppo `[MEASURED]`; in produzione meno, ma l'assenza di scheletri fa sembrare l'app più lenta di quanto sia.

---

# Customer-facing UX

Quattro pagine pubbliche `[SCREENSHOT]`: widget, menu, portale Wi-Fi, sondaggio.

Il sondaggio è il migliore («Com'è andata? Un tocco, e hai finito»), il portale Wi-Fi il più onesto, il menu il più anonimo, il widget il più problematico (vedi sopra).

**Fino a che punto il brand Tavolo deve sparire?** `[INFERENCE]` Completamente, tranne una riga di attribuzione in fondo. Queste pagine le apre il cliente del ristorante, non il cliente di Tavolo: devono sembrare del locale. Oggi il logo del ristorante compare solo se caricato, e la tipografia è quella di Tavolo.

---

# Competitor Visual Benchmark

**NON VERIFICATO.** Non ho potuto osservare le interfacce di CoverManager, SevenRooms, OpenTable, TheFork Manager e Pienissimo: richiedono un account. Le pagine pubbliche mostrano materiale di marketing, non l'applicazione.

Quello che ho potuto ricavare dalle fonti ufficiali riguarda le funzioni, non l'aspetto, ed è nel documento precedente. **Un confronto visivo serio richiede accesso a demo reali** ed è la lacuna di questo audit: la segnalo invece di riempirla con impressioni.

---

# Design System Audit

| Elemento | Stato | Nota |
|---|---|---|
| Colore | 🟡 **DUPLICATO** | 66 valori, due vocabolari di tono (Badge e StatCard), nessuna mappa semantica |
| Tipografia | 🟢 CONSISTENT | tre famiglie, ruoli chiari |
| Raggio | 🟢 CONSISTENT | scala derivata da una variabile |
| Ombra | 🟡 MISSING | quasi assente: la profondità è affidata al bordo |
| Spaziatura | 🟡 CONFLICT | nessuna scala di densità; stesso respiro in gestione e in servizio |
| Input | 🟢 CONSISTENT | un componente, usato ovunque |
| Bottoni | 🟢 CONSISTENT | varianti chiare (accent, outline, ghost, destructive) |
| **Card** | 🔴 **DUPLICATO** | 57 a mano contro 39 con il componente |
| Badge | 🟡 DUPLICATO | due sistemi di tono |
| Stati | 🔴 CONFLICT | quattro rappresentazioni diverse per «stato» |
| Tabelle | 🟡 MISSING | nessun componente: ogni tabella è scritta a mano |
| Modali | 🟢 CONSISTENT | un componente |
| Navigazione | 🟡 CONFLICT | due vocabolari desktop/mobile |
| Tooltip | 🟢 CONSISTENT | — |

---

# Component Inventory

19 componenti di base `[CODE]`: avatar, badge, button, card, copy-button, dialog, dropdown-menu, empty-state, input, label, popover, select, separator, sheet, skeleton, stepper, switch, textarea, tooltip. Ordinati e senza doppioni.

Sopra di essi, 142 componenti di dominio `[MEASURED]`. Duplicazioni da consolidare `[INFERENCE]`:

1. **Due sistemi di riquadro-numero**: `overview/stat-card.tsx` e `overview/kpi-grid.tsx` — stessa funzione, due API, due palette, e nella stessa pagina.
2. **Card a mano** in 57 file.
3. **Tabelle a mano** in ogni pagina che ne ha una.
4. **Quattro rappresentazioni di stato** (pillola, tendina, riempimento, testo colorato).
5. `skeleton.tsx` esiste **e non è quasi usato**: c'è il pezzo per la percezione di velocità e non è montato.

---

# UX Debt Register

| # | Problema | Schermata | Gravità | Frequenza | Impatto | Sforzo | Priorità |
|---|---|---|---|---|---|---|---|
| 1 | Avvisi «in ritardo di 577 minuti» che sommergono quelli utili | Servizio | alta | ogni servizio | alto | **S** | **P0** |
| 2 | Nessuna gerarchia di urgenza fra gli avvisi | Servizio | alta | ogni servizio | alto | **M** | **P0** |
| 3 | Primo contenuto utile sotto la piega | Servizio mobile | alta | ogni servizio | alto | **S** | **P0** |
| 4 | Stessi KPI due volte | Panoramica | media | ogni giorno | medio | **S** | **P0** |
| 5 | Widget: dati personali prima della disponibilità | Widget | alta | ogni prenotazione online | **alto (conversione)** | **M** | **P0** |
| 6 | Data in formato americano | Widget, Prenotazioni | alta | sempre | alto | **S** | **P0** |
| 7 | Libero e Prenotato indistinguibili senza leggere | Sala | media | ogni servizio | medio | **S** | **P1** |
| 8 | Dimensione del tavolo non codificata | Sala | media | ogni servizio | medio | **M** | **P1** |
| 9 | Stato + tendina + Apri ridondanti | Prenotazioni | media | alta | medio | **S** | **P1** |
| 10 | Due vocabolari di navigazione | tutte | media | continua | medio | **S** | **P1** |
| 11 | «Altro» contiene 13 destinazioni | tutte | media | continua | medio | **M** | **P1** |
| 12 | Marketing hub senza numeri | Marketing | bassa | settimanale | medio | **S** | **P1** |
| 13 | Modulo di prenotazione tutto in una volta | Nuova prenotazione | media | alta | medio | **M** | **P1** |
| 14 | Avviso a zero mostrato | Panoramica | bassa | ogni giorno | basso | **S** | **P2** |
| 15 | Menu pubblico senza navigazione categorie | Menu pubblico | media | ogni cliente | medio | **M** | **P2** |
| 16 | Nessuno scheletro di caricamento | tutte | bassa | continua | basso | **M** | **P2** |
| 17 | Tabelle senza ordinamento né intestazione fissa | Prenotazioni, Ospiti | bassa | media | basso | **M** | **P2** |
| 18 | Menu backoffice senza ricerca | Menu | media | con 100+ piatti | medio | **M** | **P2** |
| 19 | Modifica ospite: 12 campi in una modale | Scheda ospite | bassa | media | basso | **S** | **P3** |
| 20 | Avvisi urgenti confinati in Servizio | tutte | media | ogni servizio | medio | **L** | **P3** |

---

# Visual Debt Register

| # | Problema | Gravità | Sforzo |
|---|---|---|---|
| 1 | 57 card costruite a mano contro 39 col componente | alta | **L** |
| 2 | Due sistemi di tono colore (Badge / StatCard) | alta | **M** |
| 3 | Colore decorativo e non semantico nei riquadri della Panoramica | media | **S** |
| 4 | Quattro rappresentazioni diverse di «stato» | media | **M** |
| 5 | Serif nei numeri dei KPI | media | **S** |
| 6 | Nessuna scala di densità | media | **M** |
| 7 | Widget pubblico fuori brand rispetto all'app | media | **S** |
| 8 | `skeleton.tsx` esiste e non è usato | bassa | **S** |
| 9 | Tavoli con dimensione uguale a prescindere dai posti | media | **M** |
| 10 | Nessuna scala di ombre: profondità affidata solo al bordo | bassa | **M** |

---

# Top 5 Redesign Screens

| # | Schermata | Perché | Impatto atteso |
|---|---|---|---|
| **1** | **Servizio** | È la schermata più usata e oggi la più rumorosa: nove avvisi identici, nessuna gerarchia, l'unico urgente sepolto | Il prodotto smette di essere «bello» e diventa utile alle 21:30 |
| **2** | **Servizio su telefono** | Il primo avviso è sotto la piega dopo ~780 px di intestazione e numeri | Il telefono diventa lo strumento del servizio |
| **3** | **Widget pubblico** | Chiede i dati prima della disponibilità, data in formato americano, fuori brand | È l'unica schermata che influenza direttamente il fatturato |
| **4** | **Panoramica** | Numeri duplicati, colore decorativo, timeline passiva | Da vetrina a punto di partenza della giornata |
| **5** | **Sala viva** | Stati indistinguibili senza leggere, tavoli tutti uguali, molto vuoto | Si lavora a colpo d'occhio |

---

# UX Scorecard

| Area | Voto | Perché | Riferimento | Cosa vale +1 |
|---|---|---|---|---|
| Information architecture | **5** | «Altro» con 13 voci, due «Sala» | — | Tre famiglie dichiarate |
| Navigation | **5** | Due vocabolari desktop/mobile | — | Un solo vocabolario |
| Dashboard | **5** | Numeri duplicati, colore decorativo | — | Togliere la duplicazione |
| **Service** | **4** | Nove avvisi identici, nessuna urgenza | il suo stesso motore | Severità e raggruppamento |
| Floor | **6** | Chip ottimi, stati indistinguibili | — | Libero≠Prenotato senza leggere |
| Booking (interno) | **6** | Tabella chiara, azioni ridondanti | — | Togliere la tendina di stato |
| Booking widget | **5** | Dati prima della disponibilità | standard della categoria | Invertire l'ordine |
| Waitlist | **6** | Ordine di arrivo, non di priorità | — | Compatibilità del tavolo in pagina |
| CRM | **6** | Ricca e piatta | — | Un riassunto in cima |
| Analytics | **8** | La meglio scritta | sé stessa | Un segno visivo per stima/misura |
| Marketing | **5** | Indice senza numeri | — | Metriche nelle card |
| Forms | **6** | Errori ottimi, moduli lunghi | — | Divulgazione progressiva |
| Tables | **5** | Una densità, nessun ordinamento | — | Un componente tabella |
| **Mobile** | **5** | Desktop rimpicciolito | — | Ordine dei contenuti per servizio |
| Customer-facing | **6** | Sondaggio e Wi-Fi buoni, widget no | — | Widget in brand del locale |
| Accessibility | **6** | Movimento e etichette a posto | WCAG AA | Contrasto verificato, stati non solo colore |
| Visual identity | **8** | Distintiva e calda | — | Meno editoriale in servizio |
| Consistency | **5** | Due sistemi di card e di tono | — | Consolidamento |
| Operational speed | **4** | Troppo da leggere prima di agire | — | Meno elementi, più gerarchia |
| Perceived quality | **7** | Sembra costoso | — | Scheletri e transizioni |

**Media: 5,65.** Identità 8, Analytics 8 — e Servizio 4, velocità operativa 4.

---

# Personas

| Persona | Lavori principali | Schermate | Dolore maggiore | Requisito UX |
|---|---|---|---|---|
| **Titolare** | capire se il locale guadagna | Panoramica, Analytics | numeri duplicati e sparsi | una schermata che risponda in dieci secondi |
| **Direttore** | riempire i giorni deboli, tenere il personale | Prenotazioni, Marketing, Camerieri | il marketing è sotto «Altro» | portare il commerciale in superficie |
| **Hostess** | accogliere, assegnare, gestire l'attesa | Servizio, Sala, Attesa | avvisi rumorosi, sala poco leggibile | urgenza e colpo d'occhio |
| **Cameriere** | battere il conto, usare coupon e punti | Conto, Servizio | telefono: contenuto sotto la piega | pollice, non lettura |
| **Marketing** | campagne e ritorno | Campagne, Automazioni | ROI non domina | prenotazioni generate in evidenza |
| **Cliente** | prenotare, leggere il menu, collegarsi | Widget, Menu, Wi-Fi | dati chiesti prima della disponibilità | disponibilità prima, dati dopo |

---

# Service Scenario · Booking Scenario · Customer Scenario

**Scenario A — sabato 20:30, 40 coperti in arrivo, 3 ritardi, 2 walk-in, 4 in attesa, un tavolo da liberare, il telefono che squilla.**
`[INFERENCE]` Percorso odierno: Servizio (leggere nove cartelli per trovare i tre veri) → toccare l'avviso → scheda → accomoda → tornare → Attesa per l'offerta → Sala per il tavolo che si libera → Nuova prenotazione per il telefono. **Stimati 12-18 tocchi e 5 cambi di schermata**, con il costo cognitivo concentrato nel primo passo: **distinguere i tre avvisi veri dagli otto vecchi**. Rischio d'errore: medio-alto, e sta tutto lì.

**Scenario B — «vorrei prenotare domani alle 21 per 4».**
`[INFERENCE]` Modulo unico con tutti i campi: nome, cognome, email, telefono, data, ora, persone, occasione, note. Servono 5 campi, se ne vedono 9. **Stimati 20-30 secondi**, contro i 10 possibili con i cinque campi essenziali e il resto richiudibile.

**Scenario C — il cliente da smartphone.**
Apre il link → widget (dati prima della disponibilità, data americana) → conferma → menu dal QR (leggibile, senza navigazione) → Wi-Fi (ottimo) → sondaggio (ottimo). **La continuità visiva si rompe sul widget**, che ha un'altra tipografia rispetto a tutto il resto.

---

# UX Principles

Sette, derivati da quello che l'audit ha trovato — non da un elenco generico.

1. **Prima l'urgenza, poi l'informazione.** Se una schermata mostra dieci cose, deve dire quale delle dieci riguarda i prossimi venti minuti.
2. **Un colpo d'occhio, non una lettura.** Ogni stato operativo deve distinguersi senza leggere la parola che lo nomina.
3. **Il tempo si racconta in ore, non in minuti.** E oltre un servizio, un ritardo diventa un'assenza.
4. **Un numero, un posto.** Nessun dato compare due volte nella stessa schermata.
5. **Il colore significa qualcosa o non c'è.** Nessun fondo colorato per decorazione.
6. **Su telefono l'ordine cambia.** Non è il desktop più stretto: è lo stesso contenuto in ordine di urgenza.
7. **Le pagine del cliente sono del ristorante.** Il nostro marchio sparisce; resta il suo.

---

# Design Direction

**A — Hospitality Editorial** (l'attuale). Serif, ampio respiro, colore caldo. *Pro:* distintiva, premium, calda. *Contro:* rallenta il servizio; il serif nei numeri costa leggibilità.

**B — Operating System.** Densità alta, sans ovunque, colore solo semantico. *Pro:* velocissima. *Contro:* butta via l'unica cosa che rende Tavolo riconoscibile.

**C — Premium Control Room** *(raccomandata)*. **L'identità editoriale resta dove si legge — Panoramica, Analytics, Marketing, Impostazioni, pagine pubbliche — e cede il passo a una densità operativa dove si lavora: Servizio, Sala, Attesa, Conto.** Là: sans anche nei numeri, contrasto più alto, stati leggibili senza parole, colore solo semantico, gerarchia per urgenza.

*Perché C:* è l'unica che risolve la contraddizione trovata dall'audit — un prodotto bello che rallenta chi lavora — **senza buttare via il vantaggio** (l'identità è l'unica cosa che i competitor non possono copiare in un trimestre). Ed è anche la meno costosa: tocca quattro schermate, non trenta.

---

# Redesign Roadmap

**P0 — prima di tutto** (settimane, non mesi)
Avvisi del servizio con severità, raggruppamento e soglia oltre la quale un ritardo è un'assenza · tempi in ore · Servizio su telefono con il contenuto utile sopra la piega · KPI duplicati rimossi dalla Panoramica · data in formato italiano ovunque · widget: disponibilità prima dei dati personali.

**P1** — Libero≠Prenotato a colpo d'occhio e dimensione del tavolo per posti · tendina di stato ridondante rimossa · un solo vocabolario di navigazione · «Altro» diviso in famiglie · numeri nelle card del Marketing · modulo prenotazione a due livelli.

**P2** — Menu pubblico con navigazione per categorie · ricerca e filtri nel menu backoffice · scheletri di caricamento · componente tabella unico · segno visivo per stima/misura.

**P3** — Consolidamento delle 57 card a mano · scala di densità · modalità tablet · avvisi fuori dalla schermata Servizio.

---

# Final Recommendation

**Non ridisegnare Tavolo. Togliere rumore dalle quattro schermate dove si lavora.**

L'audit ha trovato un prodotto che *sembra* di fascia alta e che *si comporta* come uno strumento non ancora ottimizzato per il servizio. Le due cose non si correggono con la stessa medicina: la prima è già a posto, la seconda si corregge **sottraendo**.

Le sei cose che valgono più di ogni altra, in ordine:

1. Un ritardo di nove ore non è un ritardo. Soglia, raggruppamento, ore invece di minuti.
2. Severità sugli avvisi: tre livelli, ordinati per quanto manca.
3. Su telefono, in Servizio, il primo avviso sopra la piega.
4. Gli stessi numeri una volta sola.
5. Il widget: prima la disponibilità, poi i dati. E la data all'italiana.
6. In sala: libero e prenotato distinguibili senza leggere.

Nessuna di queste tocca la palette, la tipografia o la struttura della navigazione. Tutte e sei si possono fare senza rischiare l'identità — che è, oggi, la cosa migliore che Tavolo ha.
