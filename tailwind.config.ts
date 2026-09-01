import type { Config } from "tailwindcss";

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
        ring: "hsl(var(--ring) / <alpha-value>)",
        background: "hsl(var(--background) / <alpha-value>)",
        foreground: "hsl(var(--foreground) / <alpha-value>)",
        tertiary: {
          foreground: "hsl(var(--tertiary) / <alpha-value>)",
        },
        forest: "#13332C",
        cream: "#F2E7D0",
        terracotta: "#AF6648",
        /** The brown family — exact user-given bases, not reinterpreted.
         * dark = card scure/tile interne, DEFAULT = card marroni principali,
         * light = CTA/superfici chiare. Any tonal variation (gradient stops)
         * is these exact values scaled ±10-15%, never a separately-picked
         * hue — that's what previously drifted toward gold, then toward
         * pink/peach. */
        "surface-brown": {
          dark: "#74432D",
          DEFAULT: "#905B38",
          light: "#C29B72",
        },
        "clay-ink": {
          DEFAULT: "#2F1F11",
          soft: "#4F351B",
        },
        sage: {
          DEFAULT: "#8A9F60",
          deep: "#3D5C34",
        },
        carbon: {
          DEFAULT: "#15161a",
          50: "#f6f6f7",
          100: "#e8e8ea",
          200: "#c6c6cb",
          300: "#a3a4ab",
          400: "#5e6068",
          500: "#3a3b42",
          600: "#2a2b31",
          700: "#1f2025",
          800: "#15161a",
          900: "#0c0d10",
        },
        sand: {
          DEFAULT: "#f3ead9",
          50: "#fcf9f1",
          100: "#f6efe0",
          200: "#ecdfc1",
          300: "#dec59a",
          400: "#cdaa70",
          500: "#b88e4d",
          600: "#9a733b",
          700: "#7a5a2f",
          800: "#544023",
          900: "#312718",
        },
        gilt: {
          DEFAULT: "#c9a25a",
          light: "#e2c98a",
          dark: "#8c6b2e",
        },
        muted: {
          DEFAULT: "hsl(var(--muted) / <alpha-value>)",
          foreground: "hsl(var(--muted-foreground) / <alpha-value>)",
        },
        accent: {
          DEFAULT: "hsl(var(--accent) / <alpha-value>)",
          foreground: "hsl(var(--accent-foreground) / <alpha-value>)",
        },
        "accent-strong": {
          DEFAULT: "#AF7944",
          hover: "#936637",
          foreground: "#2F1F11",
        },
        card: {
          DEFAULT: "hsl(var(--card) / <alpha-value>)",
          foreground: "hsl(var(--card-foreground) / <alpha-value>)",
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
      },
      animation: {
        "fade-in": "fade-in 220ms ease-out",
        "slide-up": "slide-up 240ms ease-out",
        mesh: "mesh 18s ease-in-out infinite",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};

export default config;
