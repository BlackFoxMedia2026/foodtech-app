import type { Metadata, Viewport } from "next";
import { Montserrat, Archivo } from "next/font/google";
import "@/styles/globals.css";

const sans = Montserrat({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
const display = Archivo({
  subsets: ["latin"],
  weight: "variable",
  axes: ["wdth"],
  variable: "--font-display",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Tavolo · Gestionale ospitalità",
  description:
    "Tavolo è la piattaforma di gestione prenotazioni, sala, CRM ed esperienze per ristoranti e beach club indipendenti.",
};

/*
  `viewportFit: "cover"` è ciò che accende `env(safe-area-inset-*)` su iPhone:
  senza, le zone sicure valgono zero e la barra in basso, i fogli e le azioni
  ferme finiscono sotto la linea della home. La pagina arriva fino ai bordi, e
  chi sta in basso o in alto si sposta da solo con il margine giusto.
*/
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="it" className={`${sans.variable} ${display.variable}`}>
      <body className="min-h-screen bg-background">{children}</body>
    </html>
  );
}
