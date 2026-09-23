import type { Config } from "tailwindcss";

/**
 * I colori con un nome proprio (`cream`, `forest`, `clay-ink`...) leggono una
 * variabile di `globals.css` invece di portare l'esadecimale: è ciò che
 * permette a un ambiente di cambiare tema con un attributo, senza toccare i
 * componenti. Terzine RGB e non HSL perché la conversione in HSL arrotonda, e
 * i valori del tema scuro devono restare quelli di prima al bit.
 *
 * TODO(rename-colori): i nomi descrivono il tema scuro (`cream` è il testo
 * chiaro, `clay-ink` l'inchiostro sopra il crema) e col tema Carta mentono.
 * Il rename si fa a tema stabile e da solo, non insieme al cambio di valori.
 */
const v = (nome: string) => `rgb(var(--${nome}) / <alpha-value>)`;

const config: Config = {
  darkMode: ["class"],
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    container: {
      center: true,
      padding: "1.5rem",
      screens: { "2xl": "1440px" },
    },
    extend: {
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui"],
        display: ["var(--font-display)", "ui-serif", "Georgia"],
        mono: ["var(--font-mono)", "ui-monospace", "SFMono-Regular", "monospace"],
      },
      colors: {
        border: {
          DEFAULT: "hsl(var(--border) / <alpha-value>)",
          strong: "hsl(var(--border-strong) / <alpha-value>)",
        },
        input: "hsl(var(--input) / <alpha-value>)",
        ring: "hsl(var(--focus-ring) / <alpha-value>)",
        background: "hsl(var(--background) / <alpha-value>)",
        foreground: "hsl(var(--foreground) / <alpha-value>)",
        tertiary: {
          foreground: "hsl(var(--tertiary) / <alpha-value>)",
        },
        forest: v("forest"),
        cream: v("cream"),
        terracotta: v("terracotta"),
        /** The brown family — exact user-given bases, not reinterpreted.
         * dark = card scure/tile interne, DEFAULT = card marroni principali,
         * light = CTA/superfici chiare. Any tonal variation (gradient stops)
         * is these exact values scaled ±10-15%, never a separately-picked
         * hue — that's what previously drifted toward gold, then toward
         * pink/peach. */
        "surface-brown": {
          dark: v("surface-brown-dark"),
          DEFAULT: v("surface-brown"),
          light: v("surface-brown-light"),
        },
        "clay-ink": {
          DEFAULT: v("clay-ink"),
          soft: v("clay-ink-soft"),
        },
        sage: {
          DEFAULT: v("sage"),
          deep: v("sage-deep"),
          /** Il verde salvia che si legge: #8A9F60 fa 2,95-5,14 : 1 sul fondo
           * scuro (sotto soglia nell'angolo chiaro), questo 5,68 : 1. */
          strong: v("sage-strong"),
        },
        carbon: {
          DEFAULT: v("carbon"),
          50: v("carbon-50"),
          100: v("carbon-100"),
          200: v("carbon-200"),
          300: v("carbon-300"),
          400: v("carbon-400"),
          500: v("carbon-500"),
          600: v("carbon-600"),
          700: v("carbon-700"),
          800: v("carbon-800"),
          900: v("carbon-900"),
        },
        sand: {
          DEFAULT: v("sand"),
          50: v("sand-50"),
          100: v("sand-100"),
          200: v("sand-200"),
          300: v("sand-300"),
          400: v("sand-400"),
          500: v("sand-500"),
          600: v("sand-600"),
          700: v("sand-700"),
          800: v("sand-800"),
          900: v("sand-900"),
        },
        gilt: {
          DEFAULT: v("gilt"),
          light: v("gilt-light"),
          dark: v("gilt-dark"),
        },
        muted: {
          DEFAULT: "hsl(var(--muted) / <alpha-value>)",
          foreground: "hsl(var(--muted-foreground) / <alpha-value>)",
        },
        accent: {
          DEFAULT: "hsl(var(--accent) / <alpha-value>)",
          foreground: "hsl(var(--accent-foreground) / <alpha-value>)",
        },
        /** L'accento che si **legge**, non quello che riempie.
         * `accent` (hsl 30 44% 48%) su verde scuro fa 2,79-4,16 : 1 a seconda
         * dell'angolo del gradiente: non è un colore da testo. Questo lo è —
         * stessa terracotta, alzata di luminosità fino a 5,44 : 1 sul fondo
         * peggiore e 4,76 : 1 anche sopra una tinta accento al 15%.
         * Regola: `accent` riempie e borda, `accent-strong` si legge. */
        "accent-strong": {
          DEFAULT: v("accent-strong"),
          hover: v("accent-strong-hover"),
          foreground: v("accent-strong-foreground"),
          /** Il vecchio valore, per quando serve terracotta su fondo CHIARO:
           * lì la versione chiara non si vede (1,65 : 1 sul crema). */
          ink: v("accent-strong-ink"),
        },
        /** Il rosso da leggere su verde scuro: vedi la nota in `globals.css`. */
        "destructive-soft": "hsl(var(--destructive-soft) / <alpha-value>)",
        /**
         * I ruoli del tema, per chi prima scriveva un colore del buio.
         *
         * Ognuno ha al buio **esattamente** il valore della classe che ha
         * sostituito (`text-cream`, `bg-cream text-clay-ink`, `bg-cream/10`,
         * `border-cream/40`...), e in Carta quello del suo ruolo. È ciò che
         * tiene identico il back office quando `:has()` non si risolve e si
         * ricade al buio. Vedi il blocco Carta in `globals.css`.
         */
        /** L'inchiostro della superficie: crema al buio, verde-nero sulla carta. */
        ink: v("ink"),
        /** Il pulsante primario. */
        cta: { DEFAULT: "var(--cta-fill)", ink: "var(--cta-ink)" },
        /** Il segmento scelto di un selettore, la voce attiva di una fila. */
        segment: { DEFAULT: "var(--segment-fill)", ink: "var(--segment-ink)", "ink-forest": "var(--segment-ink-forest)" },
        /** La pillola che scorre sotto la voce di menu attiva. */
        "nav-pill": { DEFAULT: "var(--nav-pill)", ink: "var(--nav-pill-ink)" },
        /** Il selezionato morbido (`bg-accent/25` al buio). */
        "pill-selected": "var(--pill-selected)",
        /** I veli crema, uno per opacità in uso: niente opacità calcolata. */
        veil: {
          "1.8": "var(--veil-1-8)",
          "3": "var(--veil-3)",
          "3.5": "var(--veil-3-5)",
          "4": "var(--veil-4)",
          "5": "var(--veil-5)",
          "6": "var(--veil-6)",
          "7": "var(--veil-7)",
          "8": "var(--veil-8)",
          "10": "var(--veil-10)",
          "12": "var(--veil-12)",
          "15": "var(--veil-15)",
          "20": "var(--veil-20)",
        },
        /** I bordi crema, uno per opacità in uso. */
        line: {
          DEFAULT: "var(--line-100)",
          "10": "var(--line-10)",
          "15": "var(--line-15)",
          "20": "var(--line-20)",
          "25": "var(--line-25)",
          "30": "var(--line-30)",
          "40": "var(--line-40)",
          "50": "var(--line-50)",
          "60": "var(--line-60)",
        },
        /** La tessera dei numeri (`CartaKpi`): etichetta, nota, pastiglia dell'icona. */
        kpi: {
          label: "var(--kpi-label)",
          note: "var(--kpi-note)",
          "icon-fill": "var(--kpi-icon-fill)",
          "icon-border": "var(--kpi-icon-border)",
          "icon-ink": "var(--kpi-icon-ink)",
          "label-muted": "var(--kpi-label-muted)",
        },
        /** Gli stati di una prenotazione: il pallino porta il colore, la parola resta inchiostro. */
        stato: {
          dot: {
            positive: "var(--stato-dot-positive)",
            seated: "var(--stato-dot-seated)",
            warn: "var(--stato-dot-warn)",
            negative: "var(--stato-dot-negative)",
            neutral: "var(--stato-dot-neutral)",
          },
          testo: {
            positive: "var(--stato-testo-positive)",
            seated: "var(--stato-testo-seated)",
            warn: "var(--stato-testo-warn)",
            negative: "var(--stato-testo-negative)",
            neutral: "var(--stato-testo-neutral)",
          },
        },
        card: {
          DEFAULT: "hsl(var(--card) / <alpha-value>)",
          foreground: "hsl(var(--card-foreground) / <alpha-value>)",
          /** Il piano incassato: sotto la cornice, non accanto. Vedi la nota
           * su `--card-sunken` in `globals.css`. */
          sunken: "hsl(var(--card-sunken) / <alpha-value>)",
        },
        popover: {
          DEFAULT: "hsl(var(--popover) / <alpha-value>)",
          foreground: "hsl(var(--popover-foreground) / <alpha-value>)",
        },
        primary: {
          DEFAULT: "hsl(var(--primary) / <alpha-value>)",
          foreground: "hsl(var(--primary-foreground) / <alpha-value>)",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary) / <alpha-value>)",
          foreground: "hsl(var(--secondary-foreground) / <alpha-value>)",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive) / <alpha-value>)",
          foreground: "hsl(var(--destructive-foreground) / <alpha-value>)",
        },
      },
      borderRadius: {
        xl: "calc(var(--radius) + 4px)",
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      keyframes: {
        "fade-in": { from: { opacity: "0" }, to: { opacity: "1" } },
        "slide-up": {
          from: { opacity: "0", transform: "translateY(8px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        mesh: {
          "0%, 100%": { opacity: "0.5", transform: "translate(0, 0) scale(1)" },
          "50%": { opacity: "0.85", transform: "translate(3%, -3%) scale(1.05)" },
        },
        /* Il passaggio fra il gestionale e le Impostazioni: la barra in alto
           cambia contenuto e la pagina sotto cambia con lei. Trecento
           millisecondi e sei pixel di scivolata — abbastanza da leggersi come
           un cambio di area, troppo poco per doverlo aspettare. */
        "cambio-area": {
          from: { opacity: "0", transform: "translateY(-6px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        /* Il respiro di «c'è un piatto pronto», nella Staff App.

           Non è un lampeggio e non cambia dimensione: cambia **opacità**,
           fra 1 e 0,55, in due secondi e mezzo. Una cosa che pulsa forte su
           una schermata che si guarda per un secondo si legge come un
           allarme, e in sala gli allarmi finti si imparano a ignorare in una
           serata. Questo si nota solo se lo sguardo resta lì, che è
           esattamente quando serve. */
        respiro: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.55" },
        },
      },
      animation: {
        "fade-in": "fade-in 220ms ease-out",
        "slide-up": "slide-up 240ms ease-out",
        mesh: "mesh 18s ease-in-out infinite",
        "cambio-area": "cambio-area 300ms cubic-bezier(0.22, 1, 0.36, 1)",
        respiro: "respiro 2500ms ease-in-out infinite",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};

export default config;
