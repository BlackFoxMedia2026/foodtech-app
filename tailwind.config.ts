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
      },
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
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
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
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
      },
      animation: {
        "fade-in": "fade-in 220ms ease-out",
        "slide-up": "slide-up 240ms ease-out",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};

export default config;
