import type { Metadata } from "next";
import { Inter, Fraunces } from "next/font/google";
import "@/styles/globals.css";

const sans = Inter({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
const display = Fraunces({ subsets: ["latin"], variable: "--font-display", display: "swap" });

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
