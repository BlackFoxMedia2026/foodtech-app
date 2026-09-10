---
name: Tavolo
description: Gestionale ospitalità multi-locale — prenotazioni, sala, CRM, marketing, pagamenti, analytics
colors:
  forest: "#13332C"
  forest-deep: "#0F2920"
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
(`#0F2920`) come fondo di ogni schermata, testo e superfici chiare in **crema**
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
- **Forest Deep** (`#0F2920`, token `--background`): il fondo di ogni schermata.
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

Il sistema non usa ombre piatte convenzionali come primo linguaggio di profondità: usa vetro smerigliato (`backdrop-filter: blur + saturate`) e bagliori radiali colorati (ember) per separare i piani. Le card di dati (`.surface`) restano quasi piatte in light mode e diventano vetro scuro semitrasparente in dark mode; la sidebar (`.glass-panel-premium`) è il punto di massima elevazione del sistema, con blur pesante, bordi luminosi interni e uno shadow esterno profondo per staccarla dal fondo mesh.

### Shadow Vocabulary
- **Card Rest** (`0 1px 0 0 rgb(0 0 0 / 0.02), 0 18px 40px -32px rgb(0 0 0 / 0.18)`): ombra ambientale minima per le card in light mode.
- **Card Dark** (`0 14px 40px rgba(0,0,0,0.5)`): la stessa card in dark mode, più profonda perché il vetro scuro ha bisogno di più contrasto per staccarsi dal fondo.
- **Sidebar Glass** (`inset 0 1px 0 rgb(255 255 255 / 0.34), 0 32px 70px rgb(0 0 0 / 0.55)`): l'elevazione massima — luce interna in alto (bordo di vetro) + ombra esterna profonda.
- **Ember Glow** (`0 10px 22px -8px rgb(244 76 18 / 0.5)`): non un'ombra neutra ma un bagliore colorato ember, riservato allo stato attivo della navigazione.

### Named Rules
**La Regola del Bagliore, non dell'Ombra.** Dove il sistema convenzionale userebbe un'ombra grigia per segnalare stato attivo/hover, Tavolo usa un bagliore ember colorato. L'ombra neutra resta per la profondità strutturale (card, sidebar); il bagliore è riservato al feedback di interazione.

## 5. Components

### Buttons
- **Shape:** angoli morbidi, raggio medio (11.6px, `rounded-md`).
- **Primary (variant `gold`/`btn-ember`):** gradiente ember 135° da `#CFAD03` a `#C9B139`, testo bianco, leggero rilievo interno (`inset 0 1px 0 rgba(255,255,255,0.12)`); è la CTA di punta, da usare una sola volta per schermata.
- **Default:** inverte i toni neutri primary/foreground — usato per azioni secondarie di forte enfasi ma non di brand.
- **Outline / Ghost / Subtle:** bordo o sfondo neutro trasparente, per azioni terziarie.
- **Hover / Focus:** transizione di filtro (`brightness(1.08)`) sul variant ember; ring di focus a 2px nel colore `ring` per tutte le varianti.

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
raddoppierebbe i casi senza aggiungere informazione.
