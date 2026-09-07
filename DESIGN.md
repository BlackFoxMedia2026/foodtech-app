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

**La Regola della Texture sulla Superficie.** `finish-parchment`, `table-pearl` e
il grano (`--noise`) vanno sulle superfici, mai sotto il testo o dentro un campo:
servono a dire di che materiale è fatta una superficie, non a decorare.

**Una nota per chi misura il contrasto.** Le card crema sono dipinte con
`background-image` (gradiente più texture), non con `background-color`: gli
strumenti automatici non riescono a leggere il colore di fondo e riportano falsi
allarmi di contrasto. Quelle superfici vanno verificate a mano.

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
