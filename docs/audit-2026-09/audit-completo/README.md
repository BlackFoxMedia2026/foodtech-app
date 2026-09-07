# Audit visivo completo — 8 settembre 2026

Ogni pagina e ogni funzione di Tavolo, fotografate sulla demo (`Aurora Bistrot`) con dati coerenti: menu popolato, un conto chiuso in giornata, punti accreditati, gift card emesse, portale Wi-Fi attivo con un contatto raccolto, un sondaggio con risposta.

**Esito tecnico della campagna (rifatta l'8 settembre, dopo i due audit):** 25 pagine su 25 con esito 200, **zero errori in console**; 7 pagine su telefono con **zero scorrimento orizzontale**; 6 pagine pubbliche verificate dal telefono. Dettaglio macchina in `rapporto-pagine.json`.

Le foto dei conti al tavolo (`funzioni/02`, `04`, `05`) sono quelle del 7 settembre: si aprono solo con un tavolo seduto, e la campagna dell'8 è girata alle due di notte. Il conto non è cambiato da allora.

L'analisi che accompagna questi screenshot è in [`docs/ANALISI-STATO-2026-09-07.md`](../../ANALISI-STATO-2026-09-07.md) — nato il 7, aggiornato l'8 con la sezione «cosa è cambiato nella notte».

---

## `pagine/` — l'applicazione, da scrivania (1400×1000, pagina intera)

| File | Cosa mostra |
|---|---|
| `01-panoramica.png` | La giornata in un colpo d'occhio: coperti, incasso (vero quando ci sono conti chiusi), occupazione, assenze attese |
| `02-servizio.png` | Servizio: chi arriva, chi è a tavola, il gesto giusto su ogni scheda, il centro controllo |
| `03-sala-live.png` | Sala viva: sette stati per tavolo, derivati dai fatti |
| `04-prenotazioni.png` | Elenco del giorno, filtri, coperti totali |
| `05-prenotazioni-settimana.png` | La settimana sui libri: sette giorni, coperti, da confermare, quanto è pieno |
| `06-nuova-prenotazione.png` | Presa a mano, con disponibilità calcolata dal server |
| `07-piantina.png` | Sale e tavoli, posizionabili |
| `08-attesa.png` | Lista d'attesa con posizione, stima e offerte |
| `09-ospiti.png` | CRM a pagine, con il totale scritto |
| `10-scheda-ospite.png` | Profilo calcolato dalle prenotazioni, punti fedeltà, esporta e cancella dati |
| `11-analytics.png` | Costo del cibo, **menu engineering**, costo delle assenze, **lista d'attesa misurata**, previsione coperti, NPS con il **ponte alle recensioni**, debito gift card |
| `12-menu.png` | Categorie e piatti, allergeni da elenco chiuso, costo e margine, **ricerca e filtri** oltre i dodici piatti |
| `13-marketing.png` | Le cinque sezioni: campagne, automazioni, coupon, gift card, Wi-Fi, QR |
| `14-campagne.png` | Campagne con esito e attribuzione; «Consegnata al fornitore» sulle programmate scadute |
| `15-automazioni.png` | Quattro automazioni, non un costruttore di regole; nascono spente |
| `16-coupon.png` | Coupon con stato leggibile: se non vale, c'è scritto perché |
| `17-gift-card.png` | Gift card, e il residuo chiamato col suo nome: un debito verso i clienti |
| `18-wifi-contatti.png` | Contatti dal Wi-Fi e il numero che conta: quanti hanno poi prenotato |
| `19-qr.png` | QR code (stato vuoto onesto) |
| `20-esperienze.png` | Esperienze pubblicate; i biglietti non si vendono da Tavolo e la pagina lo dice |
| `21-camerieri.png` | Personale, ruoli, contratti e scadenze |
| `22-pagamenti.png` | Pagamenti registrati: caparre, ticket, rimborsi — e la riga che dice che i conti al tavolo non passano da qui |
| `23-impostazioni.png` | Scontrino medio, raccolta punti, **finestra di prenotazione**, **recensioni pubbliche**, portale Wi-Fi, coda dei lavori, turni |
| `24-impostazioni-brand.png` | Logo, colori, dati pubblici del locale |
| `25-impostazioni-wifi.png` | Rete, password, testi e sconto automatico del portale |

## `mobile/` — le pagine operative sul telefono (390×844)

`01-panoramica` · `02-servizio` · `03-sala` · `04-prenotazioni` · `05-ospiti` · `06-menu` · `07-analytics`

Sono le sette schermate che si aprono davvero in servizio con una mano occupata. Verificato per ognuna: **nessuno scorrimento orizzontale** (0 px di overflow), che è un principio del progetto e non un dettaglio.

## `funzioni/` — le finestre dove si compie il gesto

| File | Cosa mostra |
|---|---|
| `01-nuova-prenotazione-form.png` | Il modulo completo di presa prenotazione |
| `02-conto-al-tavolo.png` | Il conto con una riga battuta, totale ricalcolato dalle righe |
| `03-conto-ricerca-piatto.png` | Il gesto vero: si scrive una parola e si tocca il piatto; i piatti finiti si vedono spenti, non nascosti |
| `04-conto-gift-card.png` | Gift card sul conto: cerca il codice, propone quello che serve per chiudere, lascia il resto sulla carta |
| `05-conto-punti.png` | Punti fedeltà sul conto, col saldo del cliente e quanto valgono |
| `06-usa-coupon.png` | Coupon al tavolo, con il motivo scritto quando un codice non vale |
| `07-selettore-tavoli.png` | Tavoli liberi **all'ora della prenotazione**; il motivo è obbligatorio se i posti non bastano |
| `08-menu-nuovo-piatto.png` | Nuovo piatto: allergeni da elenco chiuso, regimi, costo materie prime facoltativo |
| `08-menu-editor.png` | L'editor del menu con riordino e disponibilità |
| `09-nuova-gift-card.png` | Emissione: serve solo l'importo, il codice lo genera Tavolo leggibile al telefono |
| `10-nuovo-coupon.png` | Creazione coupon: tipo, valore, tetti, validità |
| `11-automazioni.png` | Le automazioni con quante persone toccherebbero, **prima** di accenderle |
| `12-cancella-dati.png` | I due elenchi: cosa sparisce e cosa resta. Il secondo serve più del primo |
| `13-modifica-ospite.png` | Scheda cliente in modifica, allergie e note riservate comprese |
| `14-nuova-campagna.png` | Nuova campagna con segmento e anteprima |
| `15-aggiungi-in-attesa.png` | Aggiungere una persona alla lista d'attesa |

## `pubbliche/` — quello che vede il cliente (dal telefono)

| File | Cosa mostra |
|---|---|
| `01-prenota-widget.png` | Il widget di prenotazione, incorporabile in qualsiasi sito |
| `02-menu-pubblico.png` | Il menu dal QR sul tavolo: allergeni scritti per esteso, nessun costo, niente piatti finiti |
| `03-portale-wifi.png` | Il portale: tre campi, lo scambio dichiarato, consenso marketing separato e non preselezionato |
| `04-sondaggio.png` | «Com'è andata?»: un tocco e hai finito |
| `05-accesso.png` | L'accesso dello staff |
| `06-wifi-non-configurato.png` | Un locale senza rete configurata: la pagina **non esiste** (404), invece di raccogliere email senza dare niente in cambio |


---

## `../dopo-ux/` — quello che è cambiato nella notte fra il 7 e l'8 settembre

Le due campagne di audit (prodotto e interfaccia) hanno prodotto trentaquattro
correzioni e funzioni nuove. Queste sono le foto di ognuna, scattate mentre
veniva fatta.

| File | Cosa mostra |
|---|---|
| `01`–`10` | Le prime correzioni dall'UX audit: centro controllo che non si autoaffoga, servizio sul telefono, briefing in Panoramica, widget che chiede prima il tavolo e poi i dati |
| `11`–`13` | Coupon con spesa minima e giorni validi; il traguardo nella raccolta punti |
| `14-automazione-giftcard.png` | La quarta automazione: la gift card ferma, con «oggi scriverebbe a 1 persona» e il motivo |
| `15-disdetta-servizio.png` | L'ottava regola del centro controllo: il posto liberato da una disdetta, offerto a chi in lista lo aspettava |
| `16`–`19` | Il ponte verso le recensioni: dove mandare chi è contento, il sondaggio, e «1 promotore è andato a scrivere, su 2» |
| `20`–`21` | Ricerca e filtri nel menu, e le frecce che spariscono mentre si filtra |
| `22`–`23` | Le portate in cima al menu pubblico, dal telefono |
| `24-mappa-sala.png`, `24-mappa-piantina.png` | Sulla mappa un due posti non è più grande come un dieci posti |
| `25`–`26` | Gli scheletri di caricamento, con la forma vera della pagina |
| `27-menu-engineering.png` | Stelle, cavalli, enigmi e cani — e il metro con cui sono stati decisi |
| `28`–`29` | La finestra di prenotazione, e cosa legge il cliente fuori dalla finestra |
| `30-widget-gruppo-grande.png` | Oltre dodici persone: il telefono al posto del modulo |
| `31`–`32` | «E allora quando?»: i primi giorni con posto, e cosa succede toccandone uno |
| `33-assenze-raccontate.png` | «2 su 12 · l'ultima il 5 settembre»: i fatti, non un punteggio |
| `34-coda-misurata.png` | La lista d'attesa misurata: coperti recuperati, non impressioni |
| `35-debito-giftcard.png` | Il debito delle gift card fra i numeri d'insieme |
