import { cn } from "@/lib/utils";
import type { StatoCliente } from "@/server/integrations/cliente";

/**
 * I segni che si ripetono in catalogo, pagina e wizard. Un posto solo, così
 * «Collegata» ha lo stesso colore dappertutto.
 */

/**
 * Il monogramma al posto del logo. Nessun marchio di terzi nel repository
 * (vedi `registry.ts`): due lettere in una tessera crema, lo stesso
 * materiale delle carte dei numeri, bastano a riconoscere la voce senza
 * fingere un'identità visiva che non abbiamo il diritto di usare.
 */
export function Monogramma({ testo, grande = false }: { testo: string; grande?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-lg border border-cream/20 bg-cream font-semibold text-clay-ink",
        grande ? "h-14 w-14 text-lg" : "h-11 w-11 text-sm",
      )}
    >
      {testo}
    </span>
  );
}

/**
 * I cinque stati che vede il cliente (`server/integrations/cliente.ts`), con
 * un pallino che li dice senza leggere: verde per ciò che va, terracotta per
 * ciò che chiede un gesto, contorno per ciò che non c'è ancora.
 */
const STILE: Record<StatoCliente, { pallino: string; testo: string }> = {
  DISPONIBILE: { pallino: "bg-cream", testo: "text-cream" },
  ANTEPRIMA: { pallino: "border border-accent bg-accent/40", testo: "text-cream" },
  COLLEGATA: { pallino: "bg-sage-strong", testo: "text-cream" },
  ATTENZIONE: { pallino: "bg-accent", testo: "text-accent-strong" },
  PROSSIMAMENTE: { pallino: "border border-muted-foreground", testo: "text-muted-foreground" },
};

export function PillolaStato({ stato, etichetta, className }: { stato: StatoCliente; etichetta: string; className?: string }) {
  const s = STILE[stato];
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-xs font-medium", s.testo, className)}>
      <span aria-hidden="true" className={cn("inline-block h-2 w-2 shrink-0 rounded-full", s.pallino)} />
      {etichetta}
    </span>
  );
}

export function quando(iso: string | null, adesso = new Date()): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  const minuti = Math.floor((adesso.getTime() - d.getTime()) / 60_000);
  if (minuti < 1) return "proprio ora";
  if (minuti < 60) return `${minuti} ${minuti === 1 ? "minuto" : "minuti"} fa`;
  const oggi = d.toDateString() === adesso.toDateString();
  const ora = d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
  if (oggi) return `oggi alle ${ora}`;
  return `${d.toLocaleDateString("it-IT", { day: "numeric", month: "long" })} alle ${ora}`;
}

export function giorno(iso: string): string {
  return new Date(iso).toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric" });
}
