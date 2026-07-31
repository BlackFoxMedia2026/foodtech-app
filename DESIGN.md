---
name: Tavolo
description: Gestionale ospitalità multi-locale — prenotazioni, sala, CRM, marketing, pagamenti, analytics
colors:
  ember-glow: "#FCEC9C"
  ember-bright: "#FFE14D"
  ember-core: "#FFD400"
  ember-deep: "#A98804"
  ember-char: "#5B4706"
  ember-ash: "#1A1A1A"
  accent-ember: "#B88E05"
  ink: "#1A1A1A"
  surface-card: "#262626"
  paper: "#FFFFFF"
  muted-clay: "#B6B6B6"
  hairline: "#484848"
  destructive-ember: "#D53434"
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

**Creative North Star: "The Ember Hearth"**

Tavolo è il gestionale che scalda il retro-sala: sotto ogni schermata brace un fondo quasi nero (`#1A1A1A`) e un solo accento incandescente, l'ember giallo, che emerge da vetro smerigliato e bagliori radiali invece che da colori piatti. Non è un tool enterprise freddo — ogni riquadro con dati (tabelle prenotazioni, liste ospiti, righe di pagamento) resta leggibile e denso, ma la cornice attorno — sidebar, badge, CTA, stato attivo — porta calore, non decorazione. Questo è deliberatamente l'opposto del "gestionale generico enterprise": niente grigi anonimi, niente tabelle senza personalità (vedi PRODUCT.md, Anti-references).

Il sistema respinge esplicitamente due tentazioni: il minimalismo grigio da SaaS B2B, e il glassmorphism decorativo ovunque. Il vetro sfocato è riservato alla "cornice" strutturale (sidebar, chip di navigazione, il badge dell'agente AI) — non copre indiscriminatamente ogni card di dati.

**Key Characteristics:**
- Fondo quasi-nero caldo (non un grigio neutro freddo) con un mesh ambientale di braci sfocate in movimento lentissimo dietro il contenuto
- Un solo accento cromatico — l'ember giallo — usato con intenzione su CTA, stato attivo, badge, mai come tinta di sfondo diffusa
- Vetro smerigliato riservato alla cornice strutturale (sidebar), non ai contenuti di dati
- Tipografia display "espansa" (font-stretch 125%) per titoli con presenza, bilanciata da un sans geometrico compatto per il corpo denso di dati

## 2. Colors

La palette è essenziale: un fondo nero neutro, testo bianco puro, un grigio chiaro per le superfici secondarie, e una singola famiglia gialla ("ember") che scala dal chiarore acceso al giallo scuro/olivastro bruciato — niente più bronzo/rame: la scala resta pulita, dal giallo pieno al nero, senza deviare verso il caldo terracotta.

### Primary
- **Ember Core** (#FFD400): il midpoint del gradiente ember — il giallo principale del brand. Usato nei bottoni CTA primari (variant `gold`/`btn-ember`), nel pill di navigazione attivo, nel bagliore della sidebar.
- **Ember Glow** (#FCEC9C) e **Ember Bright** (#FFE14D): gli estremi chiari del gradiente ember, usati per gli highlight radiali (`--ember-hi`) e per gli stati hover.
- **Ember Deep** (#A98804) e **Ember Char** (#5B4706): gli estremi scuri, dove il gradiente ember si fonde nel fondo nero della sidebar — restano gialli scuri/olivastri, non bronzo o rame.
- **Accent Ember** (#B88E05): la variante solida (non-gradiente) dell'accento, usata su testo, icone, link e badge (`text-accent`, `border-accent`) dove serve un colore piatto e più leggibile invece di un gradiente.

### Neutral
- **Ink** (#1A1A1A): il fondo dell'intera applicazione (dashboard e landing) — il nero neutro del brand ("Night Black").
- **Surface Card** (#262626): il fondo delle card e dei pannelli di contenuto, leggermente più chiaro dell'ink, spesso con `backdrop-blur` e bordo bianco 10% per un effetto vetro sottile.
- **Paper** (#FFFFFF): il testo primario e il bianco del brand, puro.
- **Muted Clay** (#B6B6B6): testo secondario/didascalie, un grigio neutro medio.
- **Hairline** (#484848): bordi e divisori, un grigio scuro quasi invisibile a riposo.
- **Destructive Ember** (#D53434): stati di errore/eliminazione — un rosso distinto dal giallo del brand per non creare ambiguità con l'accento.

### Named Rules
**La Regola del Fuoco Unico.** L'ember (in ogni sua tonalità) è l'unico accento cromatico del sistema. Non introdurre una seconda famiglia di colore per un modulo diverso (es. un blu per "analytics", un verde per "pagamenti"): tutta l'enfasi passa per la stessa fiamma, altrimenti il sistema perde identità.

**La Regola del Vetro Strutturale.** Il `backdrop-filter` è riservato agli elementi di cornice e navigazione (sidebar, chip, badge dell'agente) — mai alle tabelle o alle liste di dati, che restano leggibili su fondo pieno.

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
