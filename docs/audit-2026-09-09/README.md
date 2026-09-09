# Tavolo — ogni funzione, fotografata e descritta

**Pacchetto per un'analisi esterna.** 9 settembre 2026, fotografato sulla demo
pubblica in produzione (`foodtech-app.vercel.app`, locale «Aurora Bistrot») con
dati coerenti: 1141 prenotazioni su cinque mesi, 708 conti chiusi, 64 risposte
ai sondaggi, dodici persone in lista d'attesa, diciassette tavoli assegnati.

## Come leggere questo pacchetto

- `foto/` — 59 schermate (JPEG 1440px, 12 MB). Le originali a piena risoluzione si rifanno con `scripts/audit-visivo.mjs`
- `scripts/audit-visivo.mjs` — la campagna, per rifarla quando serve
- `rapporto.json` — la misura macchina di ogni schermata
- questo file — cosa fa ogni funzione, **cosa guardare** e **cosa non fa**

## Esito tecnico della campagna

| Misura | Esito |
|---|---|
| Schermate acquisite | 59 (46 area operativa, 13 pubbliche) |
| Errori in console | **0** |
| Stati HTTP diversi da 200 | **0** |
| Scorrimento orizzontale | **0 su 59** |
| Pagine dell'area operativa che scorrono | **0 su 46** |

L'ultima riga è una scelta di progetto recente, non un caso: in sala nessuno
scorre, quindi **la pagina non scorre mai e scorrono i suoi elenchi**. La
ricetta sta in `DESIGN.md` §7.

## Cosa vale la pena guardare con occhio critico

Tre cose che questo prodotto fa in modo deliberato e discutibile, e su cui
un'analisi esterna è utile:

1. **Non estrapola.** Dove il campione è troppo piccolo, una schermata dice
   «non abbastanza dati» invece di mostrare una stima. Costa numeri vuoti in
   demo, e la scelta è consapevole.
2. **I contatori non esistono: si contano le righe.** Nessun valore
   precalcolato di cui fidarsi — visite, incassi, punti, durate si ricavano
   dalle righe a ogni lettura. È più lento e non può mentire.
3. **Non c'è un editor di regole.** Le automazioni sono un catalogo chiuso di
   tre, non un costruttore. Meno potere, meno modi di farsi male.

---

# 1. Il servizio — dove si lavora mentre il locale è aperto

## `01-scrivania/01-panoramica.png` · Panoramica
La giornata in una schermata, senza scorrere. In alto una frase sola —
prenotazioni, coperti, quanto è pieno, l'ora del picco — poi le prenotazioni di
oggi che scorrono nel loro riquadro, e a destra soldi, assenze e andamento
settimanale.

**Da guardare:** l'incasso è **misurato** se ci sono conti chiusi, e dichiarato
«stimato» se si appoggia allo scontrino medio. Sono due parole diverse per due
cose diverse, e la differenza è visibile nel riquadro.

**Cosa non fa:** non mostra un incasso se il locale non ha né conti chiusi né
uno scontrino medio dichiarato: dice cosa manca.

## `02-servizio.png` · Servizio
La schermata del turno: chi arriva, chi è a tavola, chi aspetta. Ogni scheda
porta **il gesto giusto adesso** (è arrivato / accomoda / chiudi), non un menù
di tutte le azioni possibili.

**Da guardare:** il blocco «DA TENERE D'OCCHIO». Sono dieci regole che
producono **problema → motivo → impatto → azione**, con l'impatto quantificato
sui dati che ci sono. Regola generale: *un avviso senza impatto non si mostra*
— un tavolo oltre la durata che nessuno aspetta non è un problema.

## `03-sala-viva.png` · Sala viva
Sette stati per tavolo, tutti **derivati dai fatti** (chi è arrivato, chi si è
seduto, quando), nessuno impostato a mano. Le previsioni di liberazione usano
la durata misurata in quel locale quando ci sono abbastanza cene chiuse, e lo
dicono: «1 ora e 40, su 303 cene chiuse».

**Da guardare:** la frase sopra la mappa cambia se le cene misurate non
bastano, e in quel caso il prodotto usa la durata *prevista* e lo scrive.

## `04-prenotazioni-giorno.png` / `05-prenotazioni-da-confermare.png`
L'elenco del giorno con i filtri, e i coperti totali. Il secondo mostra il
filtro «da confermare».

## `06-nuova-prenotazione.png` · Presa a mano
Il modulo che usa chi risponde al telefono. La disponibilità la calcola il
server con 65 regole verificate; la durata è **proposta** in base a gruppo,
fascia e tipo di giorno, con la frase che dice su cosa poggia — e una durata
scritta a mano resta quella.

## `07-scheda-prenotazione.png`
Tutto di una prenotazione, con **«cosa sapere di questo ospite»**: allergia,
occasione, note del personale, assenze precedenti — al massimo quattro righe,
in ordine di urgenza, con la fonte su ogni riga.

## `08-piantina-sala.png` · Piantina
Sale e tavoli posizionabili. Il salvataggio è per sala, non per tavolo.

## `09-lista-attesa.png` · Lista d'attesa
Posizione, attesa stimata, e le offerte con scadenza. Si aggiorna da sola: la
coda la muovono anche gli altri — chi accomoda dalla Sala, chi conferma dal
Servizio, il lavoro in coda che fa scadere un'offerta.

**Da guardare:** «12 persone in coda · attesa media 41 minuti · 2 oltre la
stima». *Persone* e *gruppi* sono contati separatamente, perché «2 in attesa»
accanto a «9 persone» si leggeva come una contraddizione.

---

# 2. Gli ospiti

## `10-crm-ospiti.png` · CRM
Elenco a pagine con **il totale scritto** («Da 1 a 50 di 137»): un tetto
invisibile su una lista è una bugia. Su telefono le righe diventano schede,
perché una tabella a sei colonne su 390px ne mostra due.

**Da guardare:** la colonna «Spesa totale» dice **«non ancora»** per chi non ha
conti chiusi. Non «0,00 €»: uno zero somiglia a una misura.

## `11-scheda-ospite.png` · Scheda ospite
Profilo **calcolato dalle prenotazioni**, non da contatori: visite, assenze,
ultima visita, preferenze ricorrenti, tavolo e sala preferiti. Più i punti
fedeltà, lo storico visite, i movimenti, e i due pulsanti che contano per il
GDPR: **esporta i dati** e **cancella**.

## `12-ospiti-doppioni.png` · Doppioni
Le coppie con la stessa email o telefono si propongono; **nessuna unione è
automatica** e la può fare solo un manager. Niente si perde: note e allergie si
uniscono, i contatori si ricalcolano, e una revoca di consenso più recente
vince su un consenso più vecchio.

---

# 3. Analisi — quattro domande, non un cruscotto

Le quattro viste stanno **nell'indirizzo** (`?vista=`), quindi un numero si
condivide con un link e il tasto Indietro funziona.

## `13-analisi-comè-andata.png`
Cinque righe in cima, **con i problemi per primi**, e ogni riga dice su cosa è
misurata. Le misure che il locale non ha non compaiono, invece di diventare
righe «dato non disponibile».

## `14-analisi-cibo-e-carta.png`
Costo del cibo e **menu engineering** (Stelle / Cavalli / Cani).

**Da guardare:** «Queste percentuali valgono sui 4.188 € di cui conosciamo il
costo, non su tutto l'incasso. Non le estendiamo al resto: sarebbe una
moltiplicazione, non una misura.» È il principio del prodotto in una frase.

## `15-analisi-servizio.png`
Quanto costano le assenze — in coperti persi e in euro, **misurati sui conti
chiusi** e non stimati — la rotazione dei tavoli e la lista d'attesa misurata.

## `16-analisi-domanda-e-ospiti.png`
Previsione dei coperti per sette giorni **con il ragionamento accanto a ogni
numero**, NPS col ponte alle recensioni, fonti delle prenotazioni.

**Da guardare:** quando la spiegazione è la stessa per tutti i giorni si dice
**una volta sola** in cima; nelle righe resta solo ciò che le distingue.

## `17-analisi-30-giorni.png`
Lo stesso periodo su trenta giorni: il confronto col periodo precedente e le
soglie sotto cui un numero non si mostra.

---

# 4. La carta

## `18-carta-e-piatti.png` · Carta
Categorie e piatti, allergeni da **elenco chiuso** (non testo libero), costo e
margine per piatto, ricerca e filtri oltre i dodici piatti. Su telefono le
azioni per piatto stanno in un solo «⋯», e c'è **«segna come finito»**, che è
il gesto più frequente durante il servizio.

---

# 5. Marketing e crescita

## `19-marketing.png` · Indice
Le cinque sezioni con i numeri veri, non solo i titoli.

## `20-automazioni.png` · Automazioni
**Tre messaggi, non un editor di regole.** E cinque difese contro l'invio di
massa, scritte nella schermata: guarda solo chi ha *appena* superato la soglia,
una volta per periodo per persona, silenzio se le abbiamo già scritto negli
ultimi giorni, un tetto giornaliero, e il consenso sempre.

**Cosa non fa:** non manda niente finché non c'è la chiave del fornitore email
— e la schermata lo dice invece di fallire in silenzio.

## `21-coupon.png` · Coupon
Codici che si usano **al tavolo**, dalla scheda della prenotazione. Un coupon
archiviato non si usa più ma resta negli utilizzi già fatti.

## `22-gift-card.png` · Gift card
**Da guardare:** «I 307 € ancora da spendere non sono un incasso: sono cene già
pagate e non ancora servite.» Una gift card è un **debito**, e il prodotto la
tiene fuori dagli incassi.

## `23-codici-qr.png` · Codici QR
Per il menu, il portale Wi-Fi, la prenotazione.

## `24-wifi-contatti.png` · Wi-Fi
Contatti raccolti dal portale.

**Da guardare:** «Il numero che dice se questa cosa serve è *poi venuti a
mangiare*: un indirizzo email raccolto non è un cliente, ed è un dato di cui
rispondi tu.»

## `25-campagne.png` / `26-campagna-risultati.png` / `27-campagna-nuova.png`
Campagne email con esito e **attribuzione**: quante prenotazioni sono arrivate
da quel link, entro una finestra dichiarata. Una prenotazione senza quel link
non finisce sul conto di nessuna campagna. La creazione è una procedura guidata
a passi.

## `28-esperienze.png` · Esperienze
Cene a tema con capienza e prezzo.

**Cosa non fa:** i biglietti non si vendono da Tavolo, e la pagina lo dice.

---

# 6. Il locale

## `29-pagamenti.png` · Pagamenti
**La schermata più onesta del prodotto:** non c'è nessuna integrazione
d'incasso, quindi non c'è nessun pagamento. Il progetto — livello agnostico e
modello delle policy — è scritto in `docs/PROGETTO-PAGAMENTI.md` e aspetta sei
decisioni.

## `30-camerieri.png` · Camerieri
Squadra, ruoli, capacità e assegnazioni di sala. Il sommelier non diventa
responsabile di tavolo perché serviva un nome.

## `31`–`34-impostazioni-*.png` · Impostazioni, quattro parti
Il locale · Prenotazioni · Ospiti · Sistema. Erano tredici schede.

**Da guardare in `34-sistema`:** «I tuoi dispositivi» — chiude tutte le
sessioni aperte col proprio account, su ogni dispositivo. Aggiunto oggi: prima
una sessione era un token firmato e non si poteva richiamare indietro.

## `35-brand.png` · Brand
Logo, colori, contatti pubblici.

## `36-portale-wifi.png` · Portale Wi-Fi
La password del Wi-Fi è cifrata nel database (AES-256-GCM). **Senza la chiave
resta in chiaro con l'etichetta, e la schermata lo dice** invece di far finta.

---

# 7. Quello che vede il cliente

Cartelle `03-pubbliche/` (scrivania) e `04-pubbliche-telefono/`. Le pagine
pubbliche **scorrono**, di proposito: chi le legge non sta lavorando.

| File | Cosa mostra |
|---|---|
| `01-vetrina` | La pagina di ingresso del prodotto |
| `02-accesso` | L'accesso. Limite di dieci tentativi ogni dieci minuti |
| `03-prenota` / `04-prenota-slug` | Il modulo pubblico. Prima la disponibilità, poi i dati personali. Accetta l'identificativo **o lo slug** |
| `05-menu-dal-qr` | Il menu che si apre dal QR sul tavolo: nessuna intestazione, nessun accesso, categorie appiccicate in cima. Allergeni **scritti per esteso**, mai sigle |
| `06-portale-wifi` | La password in cambio di un contatto, col consenso separato |
| `07-sondaggio` | Una domanda sola, un tocco. Chi è contento riceve il link alla recensione pubblica; chi non lo è scrive in privato |
| `08-link-scaduto` | Un link di gestione non valido: dice cosa fare invece di mostrare un errore tecnico |

---

# 8. Cosa questo pacchetto non contiene

Detto per non farlo cercare:

- **L'agente AI** (la sfera in alto a destra): risponde a domande sui dati
  reali con strumenti verificati. Non fotografato perché è una conversazione,
  non una schermata.
- **I conti al tavolo**: si aprono solo su un tavolo **seduto**, e la campagna
  è girata a mezzogiorno con la sala ancora vuota. Ci sono 708 conti chiusi
  nello storico, visibili in Analisi.
- **Accettazione di un invito** e **gestione della prenotazione dal link**:
  richiedono token firmati o in sospeso. Coperti dai flussi end-to-end 05 e 01.
- **Onboarding**: si vede solo al primo accesso di un locale nuovo.

# 9. Per un'analisi più profonda

| Documento | Cosa contiene |
|---|---|
| `docs/PRODUCT_STATUS.md` | Stato di ogni modulo: LIVE, parziale, o solo tabelle |
| `docs/TAVOLO-ROS-AUDIT-2026-09.md` | Audit contro un master prompt in 92 sezioni, con roadmap P0→P4 |
| `docs/TAVOLO-UX-UI-VISUAL-GAP-AUDIT-2026-09.md` | Audit UX/UI e i difetti visivi trovati |
| `docs/SECURITY.md` | Permessi, isolamento fra locali, sessioni, cifratura |
| `docs/ARCHITECTURE.md` | Come è fatto |
| `DESIGN.md` | Il design system, e §7 la regola del non-scorrimento |
| `docs/PROGETTO-PAGAMENTI.md` · `docs/PROGETTO-VOCE.md` | Due progetti scritti prima del codice |

**Numeri del codice:** 868 test unitari, 9 flussi end-to-end, 23 migrazioni
versionate, un freno che impedisce alle anteprime di applicare migrazioni
distruttive.
