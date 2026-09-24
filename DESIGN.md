---
name: Tavolo
description: Gestionale ospitalità multi-locale — prenotazioni, sala, CRM, marketing, pagamenti, analytics
colors:
  forest: "#13332C"
  forest-deep: "#0B1511"
  forest-card: "#163C2F"
  forest-raised: "#284D3F"
  cream: "#F2E7D0"
  cream-muted: "#C9B487"
  terracotta: "#AF6648"
  accent-terracotta: "#B07A45"
  surface-brown-dark: "#74432D"
  surface-brown: "#905B38"
  surface-brown-light: "#C29B72"
  clay-ink: "#2F1F11"
  sage: "#8A9F60"
  hairline: "#364F45"
  destructive: "#C32222"
typography:
  display:
    fontFamily: "var(--font-display), Archivo, ui-serif, Georgia"
    fontSize: "clamp(1.875rem, 3vw + 1rem, 3.75rem)"
    fontWeight: 600
    lineHeight: 1.1
    letterSpacing: "-0.02em"
    fontVariation: "font-stretch: 125%"
  body:
    fontFamily: "var(--font-sans), Montserrat, ui-sans-serif, system-ui"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
  label:
    fontFamily: "var(--font-sans), Montserrat, ui-sans-serif, system-ui"
    fontSize: "0.75rem"
    fontWeight: 500
    lineHeight: 1.3
    letterSpacing: "0.05em"
rounded:
  sm: "9.6px"
  md: "11.6px"
  lg: "13.6px"
  xl: "17.6px"
  capsule: "32px"
  full: "9999px"
spacing:
  xs: "8px"
  sm: "12px"
  md: "16px"
  lg: "20px"
  xl: "24px"
components:
  button-primary:
    backgroundColor: "{colors.ember-core}"
    textColor: "#FFFFFF"
    rounded: "{rounded.md}"
    padding: "0 1rem"
    height: "36px"
  button-primary-hover:
    backgroundColor: "{colors.ember-bright}"
  button-outline:
    backgroundColor: "transparent"
    textColor: "{colors.paper}"
    rounded: "{rounded.md}"
    padding: "0 1rem"
    height: "36px"
  badge-gold:
    backgroundColor: "{colors.accent-ember}"
    textColor: "{colors.accent-ember}"
    rounded: "{rounded.full}"
    padding: "2px 10px"
  card:
    backgroundColor: "{colors.surface-card}"
    textColor: "{colors.paper}"
    rounded: "{rounded.xl}"
    padding: "20px"
  nav-pill-active:
    backgroundColor: "{colors.ember-core}"
    textColor: "#FFFFFF"
    rounded: "{rounded.xl}"
    padding: "12px 14px"
---

# Design System: Tavolo

## Due temi: Carta e Sera

> **Da leggere prima di tutto il resto (24 settembre 2026).** Tavolo ha due
> temi. Il **back office** — gestionale, amministrazione, accesso — è in
> **Carta**, chiaro. La **Staff App**, le **pagine degli ospiti** e la
> **vetrina** restano in **Sera**, il verde scuro descritto dalla §1 in poi.
> Le sezioni 1-5 descrivono Sera; questa descrive Carta e il meccanismo che
> tiene insieme i due. I valori qui sono quelli di `src/styles/globals.css`:
> se divergono, vale il codice e questo file va corretto.

### Come funziona

- **`:root` è Sera, ed è il default di proposito.** Carta è il blocco
  `:root:has([data-tema="carta"])`, e lo accende il segnaposto `TemaCarta`
  (`src/components/tema-carta.tsx`) nei layout di `(app)`, `admin`, `(auth)`,
  `reimposta-password` e `invito`. Chi non lo porta resta al buio.
- **Se `:has()` non si risolve** (in sala girano tablet datati) si ricade in
  Sera: una Staff App bianca in una sala a luci basse è il caso peggiore, un
  back office scuro è solo lo stato di prima. Per questo **ogni colore nuovo
  in un componente passa da un token che in Sera vale esattamente la classe
  che sostituisce**: il ricadere al buio deve restare identico al pixel.
- **Sta su `:root` e non sul contenitore** perché dialog, menu e tooltip si
  montano dentro `<body>`, fuori da qualunque contenitore.
- **I colori con un nome proprio** (`cream`, `forest`, `clay-ink`,
  `accent-strong`…) in `tailwind.config.ts` leggono terzine RGB, non
  esadecimali: è ciò che permette a un tema di ridefinirli. I nomi descrivono
  Sera e in Carta mentono (`TODO(rename-colori)` nel config): il rename si fa
  da solo, non insieme a un cambio di valori.
- **I materiali** (`.vetro`, `.pastiglia`, `.tondo-strumento`, `.binario`,
  `.riga-piatta`, `.kpi-vetro`, `.tessera-tavolo`…) hanno le loro regole
  Carta in fondo a `globals.css`, tutte sotto `:root:has([data-tema="carta"])`.
  In Sera quelle regole non esistono; in Carta vincono sulle classi di
  Tailwind per specificità, quindi il componente non deve sapere niente del
  tema.

### Le tre regole che tengono insieme i valori

Non si deducono dai numeri, ed è per questo che stanno scritte.

1. **La profondità sta nella cornice, mai sotto il testo lungo.** Schede,
   barre, pulsanti, pastiglie e tondi hanno il gradiente
   `--panel-top → --panel-bottom`, lo smusso `--shadow-bevel` e il
   sollevamento `--shadow-lift`. Righe di tabella ed elenchi restano **piatti**
   su `--surface-row`, separati da `--border-hairline`: niente zebrato, niente
   bordo colorato a sinistra. Gli unici incavi sono il binario di un selettore,
   la barra della pienezza e l'interruttore spento. Una tessera che porta un
   numero è una **lastra**, mai vetro: il vetro è solo per ciò che galleggia
   sopra il contenuto. E niente trasparenza sul contenuto per dire
   "profondità": sulla carta un testo al 50% si legge come annullato.
2. **Il verde pieno segna ciò che è attivo, non ciò che è cliccabile.**
   `--control-fill` + `--control-ink` vanno su: voce di menu attiva, segmento
   scelto (anche un periodo o una scheda scelti), interruttore acceso, oggi
   nel calendario, pastiglia dell'icona di una tessera, fascia della testata
   delle tabelle, e la cromatura della barra in alto (cerca, notifiche). Non
   vanno su ciò che si limita a essere cliccabile: le frecce della data e le
   azioni rapide sono **pastiglie morbide**, come Oggi, Filtri, Calendario e
   le pillole di stato. Se diventassero verdi sparirebbe la differenza fra
   "attivo" e "disponibile". L'azione primaria è la CTA scura `--cta-fill`,
   non il verde.
3. **Un materiale non prende il tema, un fondo sì.** Un oggetto ha il colore
   come identità: la tessera nera Ambassador e la madreperla (`carbon`), i
   tavoli di legno dell'editor, la tessera fedeltà. Restano uguali nei due
   temi. Un fondo invece esiste per far leggere quello che ci sta sopra, e
   segue sempre il tema: il pavimento della pianta, le aree, i muri, la
   griglia dei turni. Altrimenti ogni segno sopra va ritarato due volte.

E tre regole più piccole, nate lungo la strada:

- **L'oro è solo testo e icone**, mai linea, riempimento o superficie: sulla
  carta perde il fondo. Per un pieno d'oro si usa `--accent-fill` con
  `--text-on-accent` sopra (è il tavolo "al conto").
- **Uno stato è parola + pallino.** La parola resta `--text-primary` in ogni
  stato; il colore sta solo nel pallino (`--badge-dot`, `data-stato`).
- **Su un fondo affollato il terzo livello di testo non esiste**: sulla pianta
  "4p" e "Bloccato" sono informazione, `--text-secondary`. E un reparto non
  fa mai da colore del testo: sala, cucina e riposo non arrivano a 4,5 : 1.

### La palette Carta

| Ruolo | Token | Valore |
|---|---|---|
| Fondo pagina | `--surface-base` / `--background` | `#e9e3d5` |
| Scheda, pannello | `--surface-panel` / `--card` | `#f7f3ea` |
| Riga di elenco, piano di tabella | `--surface-row` / `--card-sunken` | `#fdfbf5` |
| Sollevato (hover, pastiglia) | `--surface-raised` / `--secondary` | `#f0ebdd` |
| Incavo (binario, campo) | `--surface-inset` | `#e3ddcd` |
| Fascia della testata di tabella | `--surface-header` | `#2c5545` |
| Gradiente della pagina | `--base-top` → `--base-bottom` | `#f2ece0` → `#e4ddcd` |
| Gradiente della cornice | `--panel-top` → `--panel-bottom` | `#fffdf8` → `#f2ece0` |
| Testo primario | `--text-primary` / `--foreground` / `ink` | `#1b2a22` |
| Testo secondario | `--text-secondary` / `--muted-foreground` | `#3d4f45` |
| Testo di nota | `--text-meta` / `--tertiary` | `#556659` |
| Attivo | `--control-fill` / `--control-ink` | `#2c5545` / `#f7f3ea` |
| Etichette sulla fascia verde | `--header-ink` | `#e4d3a8` |
| Azione primaria | `--cta-fill` / `--cta-ink` (`--primary`) | `#1d3227` / `#f7f3ea` |
| Fuoco | `--focus-ring` | `#2f5a41` |
| Bordo di un controllo | `--border-control` / `--border-strong` / `--input` | `#847c69` |
| Filo | `--border-hairline` / `--border` | `#d5cdb9` |
| Oro da testo | `--accent` / `accent-strong` | `#7a5a1c` |
| Oro pieno | `--accent-fill` / `--text-on-accent` | `#c9a96a` / `#221a08` |
| Rosso da leggere | `--destructive-soft` | `#a03f24` |
| Stati | `--state-confirmed` · `-pending` · `-seated` · `-alert` | `#1f6b3d` · `#7d5510` · `#1d5c76` · `#9c3b22` |
| Linea di un grafico | `--chart-line` | `#2c5545` |
| Barra della pienezza | `--meter-fill` su `--meter-track` | `#2c5545` su `#ded8c8` |

I contrasti delle coppie di testo stanno tutti sopra 4,5 : 1 e quelli di bordi,
anelli e linee sopra 3 : 1, **misurati sul reso** (vedi "Come si misura il
contrasto qui" nella §2: vale anche per Carta, e un velo sopra un disegno
cambia il fondo quanto un gradiente).

### I token nati strada facendo

Ognuno ha in Sera il valore esatto di ciò che ha sostituito.

- **Inchiostri e superfici per chi scriveva un colore del buio:** `ink`
  (l'inchiostro della superficie), `cta`, `segment`, `nav-pill`,
  `pill-selected`. I **veli** `bg-veil-N` e i **bordi** `border-line-N` sono
  un token per ogni opacità in uso, non un'opacità calcolata: in Carta i veli
  valgono tutti `--edge-light` (`#ffffffcc`) e i bordi `--border-hairline`.
- **Luce, ombra, rigatura:** `--edge-light` / `--edge-light-soft`,
  `--edge-shadow` / `--edge-shadow-soft` (grigio caldo, mai nero),
  `--glow-page`, `--button-brand-shadow`, `--button-accent-shadow`.
- **Calendario dei turni:** `--grid-header` (`#e4ddcd`), `--grid-header-hover`
  (`#e8e1d0`), `--grid-header-today` (`#e0ede1`: oggi si distingue per tinta,
  non per tono), `--grid-body` (`#fdfbf5`), `--grid-body-today` (`#eef4ec`),
  `--mark-now` (`#9c3b22`, la linea dell'ora) e `--mark-selected` (`#2c5545`,
  il giorno scelto), `--oggi-fondo`, `--nuovo-turno`.
- **La pianta:** `--room-floor` (`#ded7c6`, un gradino sotto la pagina),
  `--room-wall` (`#7d7767`), `--room-floor-cucina` (`#e6dfcd`),
  `--room-floor-dehors` (`#dee2d5`), il piano del bancone (`#d7d0bf`), le
  etichette delle aree in `--text-secondary`, e **`--table-outline`**
  (`#2c5545`): un contorno di 1 px su ogni tavolo in ogni stato. Su carta due
  superfici chiare non si separano per riempimento: la forma la porta il
  contorno, il riempimento porta lo stato. Il velo che il Servizio stende
  sulla pianta (`--pianta-velo`) in Carta è trasparente.
- **I sette reparti** (`--turno-*`), nell'ordine sala, cucina, bar, direzione,
  altro, riposo, assenza: `#0d7f63`, `#b07000`, `#1668a8`, `#c03b1f`,
  `#7b4bbd`, `#6f8f00`, `#a83f86`. Validati insieme anche in protanopia: non
  si cambiano né si riordinano senza rivalidare.
- **Stati e tessere:** `--stato-dot-*` / `--stato-testo-*`, `--conto-*`,
  `--kpi-*`, `--integ-dot-*`, `--dot-fatto`, `--dot-riposo`.

Le **due scale tipografiche** non cambiano col tema: `.t-*` per il back office
(§11) e `.sa-*` per la Staff App (in `globals.css`), che serve un'altra
distanza di lettura.

### Come si aggiunge una cosa nuova senza rompere un tema

1. Nel componente niente colori del buio scritti a mano: si usa un token di
   ruolo. Se il ruolo non esiste, si crea il token con **il valore di oggi in
   Sera** e quello giusto in Carta.
2. Si verifica **il ricadere al buio**: il confronto al pixel di HEAD e ramo
   affiancati, togliendo dalla pagina del ramo il segnaposto `data-tema`
   (è quello che succede se `:has()` non si risolve). Deve dare zero.
3. Un cambiamento **voluto** al buio va in un commit suo, e lo dice.

Quattro trappole, tutte già costate un giro:

- `shadow-[var(--x)]` Tailwind lo legge come **colore** dell'ombra e l'ombra
  sparisce: si scrive `shadow-[shadow:var(--x)]`.
- Un'opacità fuori dalla scala di Tailwind (`/12`, `/22`) **non viene
  generata**, senza nessun errore: si scrive `/[0.12]`.
- Nell'SVG le fermate di una sfumatura leggono un token con
  `style={{ stopColor: "var(--x)" }}`, non con l'attributo.
- La riserva fissa per la barra di scorrimento (`scrollbar-gutter: stable`,
  17 px su Windows) accanto a una fascia fissa in cima lascia una striscia
  del colore sbagliato: le tabelle e il calendario la tolgono.

## 1. Overview

> **Nota di allineamento (7 settembre 2026).** Fino a oggi questo documento
> descriveva la palette «ember» — giallo #FFD400 su nero — che l'applicazione
> non usa da settimane. `CLAUDE.md` prescrive di leggere questo file prima di
> toccare l'interfaccia, quindi chi obbediva alle istruzioni scriveva schermate
> del colore sbagliato. Le sezioni 1 e 2 sono state riscritte leggendo i token
> reali in `src/styles/globals.css` e `tailwind.config.ts`. Il giallo
> sopravviveva in due soli posti — il blocco di token `.dark` e il widget
> pubblico di prenotazione — ed è stato rimosso da entrambi.

**Creative North Star: "La sala di sera"**

Tavolo ha il colore di un ristorante a luci basse: un **verde bosco profondo**
(`#0B1511`) come fondo di ogni schermata, testo e superfici chiare in **crema**
(`#F2E7D0`), e un accento **terracotta** (`#AF6648`) sul poco che deve chiedere
attenzione. Non è un tool enterprise freddo e non è nemmeno un tema scuro
generico: è caldo perché il verde è saturo e il crema è avorio, non bianco.

Le superfici con dati restano dense e leggibili — le card crema portano una
texture di carta appena percepibile (`finish-parchment`), i tavoli della sala un
finish madreperlato (`table-pearl`) — mentre la cornice attorno (barra di
navigazione, pill attivo, sfera dell'agente) porta il calore.

**Caratteristiche:**
- Fondo verde bosco pieno, non un grigio neutro: il calore viene dal verde e dal
  crema, non da un accento acceso
- Card in due famiglie: **crema** per i numeri del giorno (KPI, riquadri di
  testa) e **verde più chiaro** per i contenuti operativi
- Un solo accento — terracotta — su stato attivo, badge e ciò che avvisa. Le
  chiamate all'azione principali sono **pillole crema su verde**, non accento
- Tipografia display serif editoriale (Archivo con asse di larghezza) contro un
  sans geometrico per i dati densi

Il sistema respinge due tentazioni: il minimalismo grigio da SaaS B2B, e il
vetro sfocato usato ovunque. La texture è il mezzo con cui una superficie dice
di che materiale è fatta, e va usata sulle superfici — mai sul testo.

## 2. Colors

Tre famiglie e nient'altro: il **verde** dei fondi, il **crema** dei testi e
delle superfici chiare, il **terracotta** degli accenti. Le tinte marroni
(`surface-brown`) sono la scala di raccordo fra crema e terracotta.

### Fondi (verde)
- **Forest Deep** (`#0B1511`, token `--background`): il fondo di ogni schermata.
  Era `#0F2920` fino al 10 settembre 2026: distava troppo poco da Forest Card,
  e sul bordo basso del gradiente delle card lo stacco era di 1,03 : 1.
- **Forest Card** (`#163C2F`, token `--card`): le card di contenuto operativo.
- **Forest Raised** (`#284D3F`, token `--secondary`/`--muted`/`--popover`): il
  livello sopra la card — menu a comparsa, campi, pill inattivi.
- **Forest** (`#13332C`): la tinta nominale del brand, usata dove serve un verde
  fisso e non un token (grafici, illustrazioni).
- **Hairline** (`#364F45`, token `--border`): bordi e divisori. La variante
  `--border-strong` (`#46675B`) per i bordi che devono farsi vedere.

### Testi e superfici chiare (crema)
- **Cream** (`#F2E7D0`, token `--foreground`): il testo su fondo verde e le
  superfici chiare. Non è bianco: è avorio, ed è deliberato.
- **Cream Muted** (`#C9B487`, token `--muted-foreground`): testo secondario.
- **Clay Ink** (`#2F1F11`) e **Clay Ink Soft** (`#4F351B`): il testo **sopra**
  le superfici crema e marroni.

### Accento (terracotta)
- **Terracotta** (`#AF6648`) e **Accent Terracotta** (`#B07A45`, token
  `--accent`): stato attivo, badge, ciò che avvisa. Anche `--ring`, così il
  contorno di messa a fuoco è riconoscibile.
- **Surface Brown** (`#74432D` / `#905B38` / `#C29B72`): la scala di raccordo per
  card marroni e superfici calde. Qualunque variazione tonale sono questi valori
  scalati del ±10-15%, mai una tinta scelta a parte — è così che in passato la
  scala era derivata verso l'oro e poi verso il pesca.
- **Sage** (`#8A9F60`, `#3D5C34`): l'unico verde-altro ammesso, per gli
  andamenti positivi.
- **Destructive** (`#C32222`, token `--destructive`): errori ed eliminazioni.

### Named Rules

**La Regola dell'Accento Unico.** Il terracotta è l'unico accento cromatico del
sistema. Non introdurre una seconda famiglia per un modulo diverso (un blu per
«analytics», un viola per «marketing»): tutta l'enfasi passa da lì, altrimenti
il sistema perde identità. Le uniche eccezioni sono il sage per il positivo e il
rosso per il distruttivo, perché comunicano un significato e non un'identità.

**La Regola della Chiamata Crema.** La chiamata all'azione principale di una
schermata è una **pillola crema** (variant `accent`), non l'accento terracotta.
Il terracotta segnala *dove sei* e *cosa guardare*; il crema segnala *cosa fare*.

**La Regola dell'Accento che Riempie e dell'Accento che si Legge.** Il
terracotta del tema (`accent`) **riempie e borda**: fondi, pillole, tinte,
bordi, con il crema sopra. Non è un colore da testo su verde scuro — misurato
sul fondo reso fa **2,79-4,16 : 1**, sotto la soglia AA e sotto perfino la
soglia 3 : 1 delle icone nell'angolo più chiaro. Il colore da testo è
`accent-strong` (**#E2B383**, 5,44 : 1 sul fondo peggiore e 4,76 : 1 anche
sopra una tinta accento al 15%): stessa terracotta, alzata di luminosità
finché si legge. Lo stesso vale per il positivo — `sage` riempie, `sage-strong`
si legge — e per il distruttivo: `destructive` riempie con il bianco sopra,
`destructive-soft` è quello da leggere. Su fondo **chiaro** vale il contrario:
lì serve `accent-strong-ink` (#74432D), perché la versione chiara sul crema
fa 1,65 : 1.

**Corollario: su una tinta va il crema, non il colore della tinta.** Testo
accento su tinta accento al 15% fa 2,61 : 1; crema sulla stessa tinta fa
7,80 : 1. Una pillola tinta che ripete il proprio colore nel testo è sempre
sotto soglia.

**La Regola della Pillola in Tinta** (decisa il 10 settembre). Ogni tono del
`Badge` è una **tinta del tema con il testo crema sopra**, e nessuno viene da
fuori tavolozza.

| tono | tinta | dice | contrasto |
|---|---|---|---:|
| `warning` | accento 50% | **avvisa** — l'unico che chiama | 5,12 |
| `gold` | accento 10% | c'è, ma non chiede niente | 7,80 |
| `info` | solo contorno | il più silenzioso | 8,54 |
| `success-soft` | sage 20% | sta andando bene, adesso | 6,50 |
| `success` | sage 40% | è andata bene | 4,94 |
| `danger` | destructive 25% | è andata male | 8,53 |
| `neutral` | tenue 5%, testo tenue | spento | 4,71 |

Fuori restano solo `pearl` e `carbon`, i due toni di **materiale**: la
madreperla e la carta nera dei livelli di fedeltà. Dicono di che cosa è fatta
la tessera, non che cosa sta accadendo — per questo possono stare fuori
tavolozza.

Tre avvertenze, e tutte tre sono costate un giro:

1. **Le velature stanno solo sui passi della scala di Tailwind** (5, 10, 15,
   20…). `bg-cream/6` e `bg-accent/22` **non vengono generati**: la classe non
   esiste, il fondo resta trasparente e non c'è alcun errore da nessuna parte —
   né dal compilatore, né dal linter, né dalla build. Si scoprono solo
   cercandole nel CSS costruito.
2. **Il contrasto misura se il testo si legge, non se lo stato si riconosce.**
   La prima versione di questa tabella teneva tutte le tinte fra il 5% e il
   20%: passava ogni soglia, e quattro pillole su sette erano
   *indistinguibili*. I sette toni devono essere sette **pesi** diversi, non
   sette sfumature dello stesso verde. Questo si vede solo guardando.
3. **Un pieno di terracotta non può portare testo.** Crema su accento pieno fa
   2,99 : 1 e l'inchiostro scuro 4,31: è il motivo per cui `warning` è una
   velatura al 50% e non un pieno. Sul verde scuro quella velatura vira
   all'ottone più che al terracotta — è il prezzo, ed è quello che la rende
   l'unica pillola su cui l'occhio cade.

E il fondo non è tutto: **il pallino porta il resto dell'informazione** — pieno
finché la prenotazione è viva, ad anello quando è conclusa
(`.badge-dot-anello`).

**La Regola del Colore che Porta un Numero** (10 settembre). Quando un fondo
**varia** e sopra ci va del testo, il colore del testo non si scrive: si
**deriva** (`lib/colore-leggibile.ts`). Due casi, e sono diversi:

1. **Il fondo lo scegli tu, e il testo lo calcola il prodotto.** Il colore del
   marchio scelto dal ristoratore finisce sul pulsante «Prenota» dei suoi
   clienti: `testoSu(colore)` restituisce crema o inchiostro, quello che si
   legge meglio. E quando **nessuno dei due** arriva a 4,5 : 1, glielo si dice
   mentre sceglie, invece di lasciarlo scoprire ai suoi clienti.
2. **Una scala d'intensità non può essere una velatura.** Una velatura fa
   viaggiare l'intensità sulla **luminosità**, che è esattamente ciò di cui ha
   bisogno anche il numero sopra: alzando l'intensità il numero sparisce. E
   spesso non basta derivarlo, perché una scala che va dal fondo scuro a un
   colore chiaro attraversa una **fascia morta** — su verde scuro, la velatura
   d'oro fra il 40% e il 78% non regge *né* il crema *né* l'inchiostro.
   La scala va fatta **fra due colori entrambi scuri**, così l'intensità
   viaggia sulla tinta e un solo colore di testo basta: la mappa dei coperti va
   dal verde della scheda a una terracotta profonda (`#224639` → `#834821`), il
   crema regge da 8,54 a 5,87 : 1, e la separazione fra il primo e l'ultimo
   gradino è **quasi il doppio** di quella della velatura capata.

**La Regola di Ciò che Non si Taglia** (10 settembre). `truncate` non è un
modo di far stare le cose: è una scelta su **cosa nascondere**, e nasconde
sempre la fine. Tre cose non si tagliano mai, e vanno a capo:

1. **La base di un numero.** «In attesa · persone» tagliato dopo «attesa»
   lasciava un 12 muto accanto a una pillola che diceva «Attesa 3»: due numeri
   veri che sembravano contraddirsi solo perché l'unità era sparita. Sul
   telefono dell'etichetta si vedeva il 64-80%.
2. **Il titolo di un blocco.** È ciò che dice di che cosa si parla: «Portale
   Wi-Fi» si vedeva al 38%.
3. **L'identità di una riga** — il nome dell'ospite, il nome del piatto. Di
   «Camilla Romano» si leggeva «Cam…» (36%), perché accanto c'era un dettaglio
   `shrink-0` che prendeva la larghezza. Su schermo stretto quelle righe si
   **impilano** invece di dividersi lo spazio.

Si può tagliare quello che è ornamento o cortesia — il saluto della panoramica
è `truncate` per scelta, perché due righe di intestazione costano due
prenotazioni visibili in meno. Ma va scritto perché.

Lo misura `scripts/audit-leggibilita.mjs`, che segnala ogni testo con i puntini
e dice **quanta parte se ne vede**: erano 29 su tablet e telefono, ora zero.

**La Regola dell'Accordo** (10 settembre). Una parola che segue un numero
**concorda** con quel numero: «1 confermati · stanno arrivando» non è italiano,
e un prodotto che lo scrive sembra fatto da una macchina. Le etichette dei
contatori erano plurali fissi, e con un solo gruppo in coda si leggeva così.

`lib/accordo.ts` prende una parola sola quando non cambia («coperti», «entro
60 min») o la coppia `[singolare, plurale]` quando cambia. Due convenzioni, e
sono scelte: con **zero** si usa il plurale, come si dice in italiano («0
avvisati»); con un valore **non numerico** — «3/17 tavoli» — resta il plurale,
perché su una frazione la coppia non ha senso.

**La Regola della Freccia e del Colore** (10 settembre). In un confronto fra
periodi ci sono **due fatti**, e vanno mostrati con due segni diversi:

- la **freccia** dice *in che direzione* è andato il numero — viene dal segno
  della variazione, sempre;
- il **colore** dice *se è una buona notizia* — sage se lo è, rosso se non lo è.

Schiacciarli in uno fa mentire la scheda. Le assenze salite dal 9% al 12%
mostravano «▼ 3%», una freccia in giù su un numero salito, perché la freccia
veniva da «è un bene?» — e la fascia di confronto due centimetri sotto, che
usava la logica giusta, scriveva «↑ 3 pt». La stessa pagina si contraddiceva.

Un numero **invariato** non ha né freccia né colore: scrive «invariato». E una
freccia in giù **verde** è corretta: le assenze che scendono sono una buona
notizia che va giù.

**E i decimali si scrivono in italiano:** «1,6 giri per tavolo», non «1.6». Il
punto in italiano separa le migliaia, e su una schermata che scrive «3.904,00 €»
la stonatura si nota (`formatNumber`). Vale per ogni numero non intero mostrato:
coperti medi, giorni d'anticipo, voto medio, dimensione di un file.

**La Regola del Valore Mostrato** (10 settembre). Un numero **arrotondato per
essere letto** non è un ingresso di calcolo. I coperti medi di un ospite sono
5,571 e si mostrano «5,6»: moltiplicare *quel* 5,6 per la spesa media dava
252 € per visita, mentre il totale diceva 1.755 € su 7 visite, cioè 250,71 €.
Chi moltiplica 252 × 7 trova 1.764 e un prodotto che si contraddice. Le stime
derivate si ricavano dal **totale esatto**, non dalla media arrotondata.

**La Regola della Base Minima** (10 settembre). Una percentuale su pochi casi
**dice più di quello che sa**: una prenotazione mancata su una sola fa «100% di
assenze», che è vero e non significa niente. Sotto dieci casi
(`lib/quota.ts`, `MINIMO_PER_QUOTA`) la percentuale non si mostra: si mostra
`—` e **perché** non c'è.

E le due assenze si dicono in modo diverso, perché sono diverse:

- **zero casi** → «Ancora nessuna prenotazione nel periodo». Non è «troppo
  pochi»: non è ancora accaduto niente.
- **pochi casi** → «Servono almeno 10 prenotazioni: su 3 una percentuale
  direbbe più di quello che sa».

Anche il **confronto** col periodo prima sparisce quando una delle due basi
manca: variare da una percentuale inventata a un'altra non è una variazione.

**La Regola dell'Editor che Mostra il Pubblico.** Dove il locale **scrive**
una cosa che il cliente **legge**, l'editor la mostra con le stesse parole e
nello stesso ordine della pagina pubblica. Nella carta l'editor scriveva
«Allergeni: Latte · Vegetariano, Senza glutine» — i due elenchi attaccati sotto
un'unica etichetta, e vegetariano non è un allergene — mentre la pagina del
cliente scriveva già, giustamente, «Vegetariano · Senza glutine — Contiene:
Latte». Su una materia dove la parola sbagliata conta, la forma la decide la
pagina pubblica.

**E un numero in perdita non si scrive come uno che guadagna.** Il margine di
un piatto compariva sempre nello stesso grigio tenue, anche negativo: un piatto
venduto sotto costo aveva l'aspetto di uno che rende. Il costo lo digita una
persona su un tastierino, e quel numero finisce nelle analisi del food cost —
quindi «in perdita 5,00 €» si legge in `destructive-soft`, e il margine si
vede **mentre si scrive**, non dopo aver salvato (`lib/margine.ts`).

**La Regola della Texture sulla Superficie.** `finish-parchment`, `table-pearl` e
il grano (`--noise`) vanno sulle superfici, mai sotto il testo o dentro un campo:
servono a dire di che materiale è fatta una superficie, non a decorare.

**Come si misura il contrasto qui (e perché il token non basta).** Nessuna
superficie di questo sistema è una tinta piatta: le card e la pagina hanno un
gradiente più una **velatura bianca al 5-7%**, e le card crema sono dipinte
con `background-image` (gradiente più texture) senza alcun `background-color`.
Ne seguono due errori opposti, e vanno evitati entrambi.

1. **Misurare sul token** dà numeri **troppo generosi**: la velatura alza la
   luminanza del fondo e abbassa il contrasto di ogni testo chiaro. Sul token
   `--card` piatto l'oro sembrava 5,11 : 1; sull'angolo chiaro del gradiente
   reso è **4,34** — sotto soglia. Il contrasto va calcolato sul fondo
   **composto**, nel suo punto più chiaro: `#17382C` con il 7% di bianco per
   la pagina, `#163C2F` con il 5% per le card.
2. **Leggere il fondo dal DOM** dà **falsi allarmi**: `backgroundColor` è
   trasparente dove c'è un gradiente, e un fondo dipinto da un *fratello* in
   posizione assoluta (la pillola crema della voce di menu attiva) non è un
   antenato. Uno strumento che risale solo gli antenati legge il verde della
   pagina e denuncia 1,2 : 1 dove l'occhio vede 9,9 : 1.

Chi misura in automatico deve quindi **dichiarare come non misurabile** ogni
testo che ha un gradiente o un elemento dipinto dietro, e guardare quelli a
mano, invece di contarli come difetti o di assolverli in blocco.

## 3. Typography

**Display Font:** Archivo (variabile, asse `wdth`, con fallback `ui-serif, Georgia`)
**Body Font:** Montserrat (con fallback `ui-sans-serif, system-ui`)

**Character:** un sans geometrico compatto (Montserrat) per il corpo denso di dati, contrappuntato da un display variabile espanso al 125% di `font-stretch` — non un serif, ma un sans che nei titoli acquisisce una presenza quasi-serif per larghezza e peso.

### Hierarchy
- **Display** (600, `clamp(1.875rem, 3vw + 1rem, 3.75rem)`, line-height 1.1, tracking -0.02em, font-stretch 125%): titoli hero della landing e titoli di card/sezione (classe `.text-display`).
- **Title** (500, 1.125rem, line-height 1.2): intestazioni di card (`CardTitle`).
- **Body** (400, 0.875rem, line-height 1.5): testo corrente, tabelle, form. Contenuto lungo non supera 65–75ch.
- **Label** (500, 0.75rem, tracking 0.05em, spesso maiuscolo): etichette di statistica, eyebrow, badge.

### Named Rules
**La Regola dell'Espansione Unica.** Il `font-stretch: 125%` è riservato alla classe `.text-display` (titoli). Non applicarlo al corpo testo o alle label: l'espansione deve restare un segnale raro di gerarchia, non un'abitudine tipografica diffusa.

## 4. Elevation

> Riscritta il 24 settembre 2026. La versione precedente descriveva il vetro
> smerigliato e il bagliore «ember» della sidebar: nel prodotto non esistono
> più da settimane.

**Sera.** Le schede (`.surface`) sono una sfumatura verticale
`--panel-top → --panel-bottom` con un filo di luce interno
(`--edge-light-soft`), una luce radiale in alto a sinistra (`--edge-light`) e
due ombre, corta e lunga (`--edge-shadow-soft`, `--edge-shadow`). La barra
degli strumenti e le tessere dei numeri sono `.vetro` / `.kpi-vetro`: una
velatura con un bordo in gradiente, per ciò che sta sopra il fondo scuro.

**Carta.** La profondità sta nella cornice, mai sotto il testo lungo: vedi la
prima delle tre regole in «Due temi». Stessi token, valori chiari: lo smusso
`--shadow-bevel` e il sollevamento `--shadow-lift`, in grigio caldo e mai in
nero. `.vetro` e `.kpi-vetro` diventano lastre.

## 5. Components

### Buttons
- **Shape:** angoli morbidi, raggio medio (`rounded-md`); la CTA di una pagina è a pillola.
- **Azione primaria:** variant `accent` (`bg-cta text-cta-ink`): in Sera la pillola crema, in Carta `--cta-fill` scuro. Una sola per schermata.
- **`brand`:** l'azione primaria di un modulo (accedi, recupera, salva). In Sera marrone, in Carta la CTA (`.pulsante-brand`).
- **`default`:** `--primary` / `--primary-foreground`, per azioni secondarie di forte enfasi.
- **`outline` / `ghost` / `subtle`:** azioni terziarie. In Carta le pastiglie morbide aggiungono `.pastiglia`.
- **`gold` (`btn-ember`):** residuo del giallo di prima, da non usare in codice nuovo.
- **Focus:** anello di 2 px in `ring`, che legge `--focus-ring`.

### Badges / Chips
- **Style:** pillola (`rounded-full`), bordo sottile + sfondo tinto al 10% del colore del tono.
- **Toni:** `gold` (ember accent), `pearl` (gradiente bianco-sabbia per badge "premium" su fondo scuro), semantici (`success`/`warning`/`danger`/`info`), `carbon` (chip scuro neutro).

### Cards / Containers
- **Corner Style:** raggio ampio (17.6px, `rounded-xl`).
- **Background:** superficie chiara piena in light mode; vetro scuro semitrasparente (`bg-black/50` + `backdrop-blur-xl`) in dark mode.
- **Shadow Strategy:** vedi Elevation — "Card Rest" in light, "Card Dark" in dark.
- **Border:** 1px, quasi invisibile a riposo (`border-white/10` in dark).
- **Internal Padding:** 20px (`p-5`), header/footer riducono il padding verticale a 12px.

### Inputs / Fields
- **Style:** bordo 1px, sfondo pieno, raggio medio (11.6px), altezza 36px.
- **Focus:** ring 2px nel colore `ring` (coincide con l'accento ember), offset 1px dal fondo.
- **Disabled:** opacità 50%, cursore disabilitato.

### Navigation (Sidebar — signature component)
La sidebar è il componente distintivo del sistema: una capsula di vetro (`.glass-panel-premium`, raggio 32px) con un bagliore radiale ember in alto a sinistra, bordo luminoso interno e uno shadow esterno profondo che la stacca dal fondo mesh. Il logo vive in un `glass-chip` (capsula di vetro più leggera) in cima. Ogni voce di navigazione è un `nav-pill`: a riposo trasparente con testo `#FFFFFF` all'80% di opacità; in hover si illumina con un gradiente bianco sottile e si sposta di 2px verso destra; nello stato attivo diventa un pieno gradiente ember con bordo superiore chiaro e bagliore colorato esterno. In fondo, un divisore a gradiente (`agent-divider`) introduce il badge dell'agente AI, in un cerchio di vetro (`icon-glass-circle`) con bagliore ember.

## 6. Do's and Don'ts

### Do:
- **Do** usare il gradiente ember (`#FFE14D` → `#FFD400` → `#A98804`) come unico linguaggio di accento cromatico in tutto il prodotto.
- **Do** riservare il vetro smerigliato (`backdrop-filter`) alla cornice strutturale — sidebar, chip, badge — non ai contenuti di dati.
- **Do** mantenere le card di dati (tabelle prenotazioni, liste ospiti, righe pagamento) leggibili e dense anche in dark mode: il calore vive nella cornice, non nel contenuto.
- **Do** usare `font-stretch: 125%` solo sulla classe `.text-display`, mai sul corpo testo.
- **Do** rispettare `prefers-reduced-motion` per ogni animazione (mesh blobs, transizioni nav-pill, bagliori).

### Don't:
- **Don't** introdurre una seconda famiglia cromatica per un modulo specifico (niente blu per "analytics", niente verde per "pagamenti"): un solo fuoco.
- **Don't** far diventare il gestionale un "tool enterprise generico" — niente tabelle grigie anonime senza personalità (anti-reference esplicito in PRODUCT.md).
- **Don't** usare bordi laterali colorati (`border-left`/`border-right` oltre 1px) come accento decorativo su card o liste.
- **Don't** applicare `background-clip: text` con gradiente sul testo per enfasi — l'enfasi passa da peso o dimensione, non da gradient text.
- **Don't** coprire di vetro smerigliato ogni superficie: se tutto è vetro, la sidebar smette di essere il punto focale che è oggi.

## 7. Layout: una schermata, nessuno scorrimento di pagina

In un ristorante nessuno scorre. Chi accoglie ha una persona davanti, il
telefono in mano e tre secondi: se l'informazione che cerca è sotto la piega,
per lui non esiste. Da qui la regola che governa tutte le pagine dell'area
operativa: **la pagina non scorre mai; scorrono i suoi elenchi.**

### Le quattro classi

Stanno in `src/styles/globals.css`, dentro `@layer components`, e sono l'unico
vocabolario ammesso per costruire una pagina:

| Classe | Cosa fa |
|---|---|
| `.schermo` | la radice della pagina: colonna alta quanto lo spazio disponibile (`flex h-full min-h-0 flex-col`) |
| `.fissa` | non si comprime e non si allunga: intestazioni, filtri, riepiloghi, paginazione |
| `.fill` | assorbe **tutta** l'altezza che resta (`min-h-0 flex-1`), senza scorrere: per una mappa o un grafico |
| `.fill-scroll` | come `.fill`, ma il suo contenuto scorre al suo interno |

### Le regole che le rendono vere

**Una sola regione elastica per schermata.** Se due fratelli sono `.fill`, si
dividono lo spazio e su un telefono diventano due finestrelle da settanta
pixel: illeggibili entrambe. Quando servono due colonne che scorrono (scheda
ospite, panoramica), sotto il breakpoint scorre **la regione intera** e solo da
`md`/`lg` le colonne diventano indipendenti.

**`min-height: 0` a ogni livello.** È la parte che si dimentica sempre: un
figlio flex ha `min-height: auto`, cioè "non scendo sotto il mio contenuto", e
questo basta a far crescere il genitore oltre lo schermo. Ogni anello della
catena — `main`, la pagina, la card, il `CardContent` — deve poter essere più
basso del suo contenuto perché la regione elastica funzioni.

**Una regione elastica dentro un contenitore che già scorre viene schiacciata.**
Il `main` dell'area operativa non è più lo scroller: tiene
`overflow-y-auto` solo come rete di sicurezza per le pagine non ancora
convertite, e le pagine convertite non lo usano.

**Prima di comprimere, cerca il doppione.** La panoramica non è entrata in una
schermata togliendo margini: è entrata perché coperti e occupazione erano
scritti **due volte**, nel briefing e in una card da 266 pixel. Cancellata la
card, lo spazio c'era. Lo stesso per la scorciatoia "Nuova prenotazione", che
era già un pulsante nell'intestazione: quattro riquadri da 268px sono diventati
una riga da 44.

**Le intestazioni delle tabelle sono `sticky`.** Se il corpo della tabella
scorre dentro la sua regione, l'intestazione deve restare: `Testa` è
`sticky top-0` con fondo pieno, altrimenti si perde di vista cosa si sta
leggendo.

**Niente barre `fixed`.** Una barra dei comandi sovrapposta con `position: fixed`
obbliga a indovinare un `padding-bottom` sul contenuto (`pb-24` e simili). In
una schermata che non scorre la barra è semplicemente l'ultima riga `.fissa`
della colonna: nessun numero da indovinare.

### Come si verifica

**Mai a occhio.** Si misura con una sonda: per ogni rotta e per quattro
risoluzioni (1440×900, 1280×800, 820×1180, 390×844) si legge
`scrollHeight - clientHeight` su `document.scrollingElement` e su `main`, e si
pretende zero. Un valore anche di 40 pixel è una piega, e la piega è dove
l'informazione smette di esistere. La sonda va eseguita su una build di
produzione: in sviluppo le altezze cambiano con il ricaricamento a caldo.

## 8. Pagina, pannello, modale, foglio: quando si usa cosa

Prima c'erano due contenitori e una regola implicita: `Dialog` (ventinove file)
e `Sheet` (due, il pannello dell'agente). Quindi ogni **dettaglio** era una
pagina e ogni **azione** una finestra modale — e aprire il dettaglio di una riga
da una lista significava perdere la posizione nella lista.

Cinque contenitori, cinque usi.

| Contenitore | Quando | Esempi |
|---|---|---|
| **Pagina** | un compito lungo, o una destinazione che si condivide con un link | Analisi, Impostazioni, procedura campagne, carta |
| **Pannello** (`ui/pannello.tsx`) | il dettaglio di una riga, restando nella lista | prenotazione, ospite, tavolo, riga di attesa |
| **Modale** (`ui/dialog.tsx`) | un'azione concentrata da finire o annullare | emettere una gift card, una conferma distruttiva |
| **Popover** (`ui/popover.tsx`) | una scelta breve | menù di riga, filtro |
| **Avviso** (`ui/avvisi.tsx`) | dire cosa è successo, e offrire di annullarlo | «Sofia segnata come arrivata — Annulla» |

**Il pannello è la stessa cosa in due forme**, non due componenti: pannello
laterale da `md`, foglio dal basso su telefono. A 390 px un pannello da 420 è
la pagina intera, e allora tanto vale la forma che il telefono conosce — sale
dal basso, si chiude verso il basso, e ha le azioni in fondo dove arriva il
pollice.

**Il pannello non oscura la pagina.** Nessun velo: quello che sta sotto resta
visibile e cliccabile, perché il senso è tenere il contesto, non sostituirlo. Un
clic fuori non chiude: chiudono il pulsante, `Esc`, o l'apertura di un'altra
riga. Su un tablet al leggio un tocco impreciso non deve far sparire quello che
si stava leggendo.

**Le rotte dei dettagli restano.** `/bookings/[id]` continua a rendere una
pagina, così un link condiviso funziona. È la **lista** che apre un pannello
invece di navigare.

**La domanda di verifica:** ogni volta che si apre una pagina e poi si torna
indietro, chiedersi se poteva essere un pannello. Se la risposta è sì e la rotta
serve per condividere, si fanno entrambe.

## 9. Annullare invece di chiedere conferma

Non esisteva nessun sistema di avvisi temporanei. Quindi ogni azione era o
**silenziosa** — segni un arrivo e non succede niente di visibile, e resta il
dubbio di aver premuto — o protetta da una **conferma**, che è una domanda in
più per un gesto che si fa cinquanta volte a sera.

La terza via: l'azione si fa subito, e per qualche secondo si può tornare
indietro. È più veloce di una conferma e più sicura del silenzio, perché sposta
la protezione **dopo** l'errore invece di metterla prima di ogni gesto giusto.

**La conferma preventiva resta solo per ciò che non si annulla:** la
cancellazione dei dati di una persona, l'annullamento di una gift card, un
rimborso, l'eliminazione di un tavolo con prenotazioni collegate. Per tutto il
resto — arrivato, seduto, libera, avvisa, assegna — si agisce e si offre
l'annulla.

**Un avviso alla volta**, perché in sala non si leggono tre messaggi impilati.
**Non copre le azioni**: sta sopra la barra di navigazione, altrimenti nasconde
il pulsante appena premuto. **Cinque secondi**, sette se c'è un annulla: tre
bastano a vedere il messaggio, non a decidere di annullarlo.

## 10. Tre densità, scelte dal modo operativo

`.riquadro.operativa` · `.riquadro.denso` · normale · `.riquadro.comodo`

La densità **non** dipende dalla pagina, dipende da cosa si sta facendo:

| Modo | Densità | Perché |
|---|---|---|
| Servizio, Sala, Prenotazioni, Attesa | `operativa` | si guarda per un secondo mentre qualcuno aspetta: ogni pixel speso è una riga in meno |
| Analisi, Ospiti, Carta, Marketing | `denso` o normale | si legge, si confronta |
| Impostazioni, moduli, pagine pubbliche | `comodo` | si decide con calma, e lo spazio aiuta a capire cosa si sta cambiando |

## 11. La scala tipografica, per ruolo

La scala era in pratica binaria: `text-xs` 488 usi, `text-sm` 454, tutto il
resto sotto cinquanta. Con due misure la gerarchia si regge sul peso e sul
colore, e su una schermata densa non basta.

`.t-titolo-pagina` · `.t-titolo-sezione` · `.t-titolo-scheda` · `.t-corpo` ·
`.t-dato` · `.t-etichetta` · `.t-nota`

**Il serif solo dove aggiunge personalità** — numeri grandi e titoli di pagina —
e **non** sui dati operativi: in una riga di servizio un numero in serif si
legge più lentamente di uno in sans tabellare, e quella riga si legge in un
secondo. `.t-dato` è sans e `tabular-nums`, così le cifre si incolonnano fra
righe diverse.

## 12. Un vocabolario solo per lo stato di un tavolo

C'erano due dizionari: la sala viva con sette stati e la piantina con quattro.
Lo stesso tavolo era «al conto» in una schermata e «occupato» nell'altra, e
«non disponibile» qui era «bloccato» là.

**Sette stati, un dizionario** (`lib/table-status.ts`):

`LIBERO` · `PRENOTATO` · `IN_ARRIVO` · `OCCUPATO` · `CONTO` · `PULIZIA` ·
`BLOCCATO`

La vista di una **giornata** — che può essere un sabato non ancora arrivato — ne
usa quattro: libero, prenotato, occupato, bloccato. Non è una semplificazione: è
che «al conto» e «in pulizia» sono fatti del presente, e su una data futura non
vogliono dire niente. Sono gli **stessi nomi**, un sottoinsieme dichiarato nel
tipo.

**Il ritardo non è uno stato**, è una proprietà di `IN_ARRIVO`: un tavolo il cui
ospite è in ritardo è ancora in arrivo, e trattarlo come stato a sé
raddoppierebbe i casi senza aggiungere informazione. Lo stesso vale per
**«sta pagando»**: è un fatto del conto — c'è un pagamento col QR in corso — e
si legge accanto allo stato, non al suo posto.

**Anche il vestito sta in un posto solo.** Le parole erano già condivise; il
colore e l'icona vivevano dentro la mappa del Servizio, e la terza schermata
che ne ha avuto bisogno — il profilo del tavolo — li avrebbe copiati. Stanno in
`components/tables/stile-stato.tsx`, con la pillola già fatta
(`StatoTavoloBadge`), così «al conto» non può essere terracotta in una
schermata e qualcos'altro nell'altra.

## 13. Il titolo della pagina sta nella testata

Ogni schermata cominciava col proprio nome: una riga di titolo, spesso con
sotto il nome del locale e un'etichetta di sezione. Tre righe prima del
lavoro, uguali su tutte le pagine, e nella testata — alta 64 px — a sinistra
c'era un quadratino da 36 e poi il vuoto.

**Il titolo sta accanto al marchio del locale** (`VenueSwitcher`), e lo decide
il percorso: `titoloPagina()` in `components/shell/nav-items.ts` prende il nome
dalla voce di navigazione, con un elenco a parte per le sottopagine che hanno
un nome loro. Due misure dello stesso nome — intero e abbreviato — perché sul
telefono, fra il marchio e le quattro icone a destra, restano meno di cento
pixel: la forma corta è **la stessa parola** della barra in basso, mai un
sinonimo.

**Chi tocca il marchio sceglie il locale, e il titolo scivola via.** Le due
cose vivono nello stesso angolo e non si contendono lo spazio: 400 ms, la
stessa curva del selettore che si apre. Chi sta scegliendo il locale non ha
bisogno di leggere in che pagina si trova.

**Le pagine non scrivono più il proprio nome.** Quello che resta sotto la
testata è ciò che cambia mentre si lavora: il conteggio delle prenotazioni, la
coda in attesa, la frase che dice a cosa serve la pagina. Un nome lo scrive
ancora **solo chi ne ha uno vero e proprio**: un ospite, una prenotazione, una
campagna, una sala. Quelli non sono titoli di pagina, sono il soggetto di
quella schermata.
