import { Fraunces, Inter, Space_Mono } from "next/font/google";
import { getContestoStaff } from "@/lib/staff-auth";
import { AvvisiProvider } from "@/components/ui/avvisi";
import { NavBasso } from "@/components/staff-app/nav-basso";
import { daLeggere } from "@/server/staff-app/notifiche";

const sans = Inter({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
const display = Fraunces({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-display",
  display: "swap",
});
const mono = Space_Mono({ subsets: ["latin"], weight: ["400", "700"], variable: "--font-mono", display: "swap" });

/**
 * **Il guscio della Staff App.**
 *
 * Non è il guscio del back office con qualcosa di nascosto: è un guscio suo, e
 * le differenze sono quelle che il §48 chiede di far percepire.
 *
 * | | Back office | Staff App |
 * |---|---|---|
 * | testata | logo, ricerca, campanella, selettore locale, avatar | nessuna: la testata la fa la pagina |
 * | navigazione | otto voci + «Altro» + azioni rapide | cinque voci, niente tendine |
 * | larghezza | fino a `lg`, tre colonne | una colonna, sempre |
 * | densità | comoda dove si legge | operativa ovunque |
 *
 * **La testata sta nella pagina e non qui**, ed è la scelta che fa sembrare
 * questo un'applicazione invece di un sito: la Home saluta per nome, il tavolo
 * aperto mostra «← Tavolo 12 · 4 ospiti», le Comande mostrano le linguette.
 * Sono tre testate diverse perché sono tre contesti diversi, e una barra fissa
 * uguale per tutti avrebbe rubato quarantotto pixel di sala per ripetere il
 * nome del ristorante a chi ci sta lavorando dentro.
 *
 * I caratteri sono gli stessi del prodotto e il fondo è lo stesso verde: si
 * cambia ambiente, non marca.
 */
export default async function GuscioStaff({ children }: { children: React.ReactNode }) {
  const ctx = await getContestoStaff();
  const nonLette = await daLeggere(ctx.venueId, ctx.persona.waiterId);

  return (
    <AvvisiProvider>
      <div
        className={`${sans.variable} ${display.variable} ${mono.variable} relative z-0 flex h-[100dvh] flex-col overflow-hidden bg-background text-foreground`}
      >
        {/*
          `100dvh` e non `100vh`: su iOS la barra degli indirizzi si ritrae
          scorrendo, e con `vh` il fondo della pagina resta per sempre sotto
          di essa — cioè la barra di navigazione, che è tutta la navigazione
          di questa app, finisce fuori schermo.
        */}
        <main className="flex min-h-0 flex-1 flex-col overflow-hidden">{children}</main>
        <NavBasso profilo={ctx.profilo} permessi={ctx.permessi} daVedere={nonLette} />
      </div>
    </AvvisiProvider>
  );
}
