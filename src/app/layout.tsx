import type { Metadata } from "next";
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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="it" className={`${sans.variable} ${display.variable}`}>
      <body className="min-h-screen bg-background">{children}</body>
    </html>
  );
}
