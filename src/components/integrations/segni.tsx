import { cn } from "@/lib/utils";
import type { StatoCliente } from "@/server/integrations/cliente";

/**
 * I segni che si ripetono in catalogo, pagina e wizard. Un posto solo, così
 * «Collegato» ha lo stesso colore dappertutto.
 */

/**
 * Il marchio di un'integrazione, in una tessera uguale per tutti.
 *
 * Dove il titolare del marchio lo concede (vedi `registry.ts`, `logo.marchio`)
 * c'è il file ufficiale, **non modificato**: niente ricolorazioni, niente
 * filtri, niente ritagli. Per non trasformare il catalogo in una raccolta di
 * loghi, tutti stanno nella stessa tessera bianca con la stessa cornice e lo
 * stesso margine, così i pesi visivi si pareggiano e la voce Foodtech resta
 * quella della pagina.
 *
 * Dove il marchio non è concesso resta il monogramma: due lettere in una
 * tessera crema, lo stesso materiale delle carte dei numeri. Riconosce la
 * voce senza fingere un'identità visiva che non abbiamo il diritto di usare.
 */
export function Logo({ src, testo, grande = false }: { src: string | null; testo: string; grande?: boolean }) {
  const misura = grande ? "h-14 w-14" : "h-11 w-11";
  if (src) {
    return (
      <span
        aria-hidden="true"
        className={cn("inline-flex shrink-0 items-center justify-center rounded-lg border border-line-20 bg-[color:var(--integ-logo-fondo)]", misura, grande ? "p-2.5" : "p-2")}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- file statico già ottimizzato, 1-30 KB */}
        <img src={src} alt="" className="h-full w-full object-contain" loading="lazy" decoding="async" />
      </span>
    );
  }
  return <Monogramma testo={testo} grande={grande} />;
}

export function Monogramma({ testo, grande = false }: { testo: string; grande?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-lg border border-line-20 bg-cream font-semibold text-clay-ink",
        grande ? "h-14 w-14 text-lg" : "h-11 w-11 text-sm",
      )}
    >
      {testo}
    </span>
  );
}

/**
 * Gli stati della connessione che vede il cliente (`server/integrations/cliente.ts`):
 * la parola resta inchiostro, il colore sta nel pallino (DESIGN.md, «Uno
 * stato è parola + pallino»). Verde per ciò che va, ambra per ciò che è a
 * metà, rosso per ciò che non va, contorno per ciò che non c'è ancora.
 */
const STILE: Record<StatoCliente, { pallino: string; testo: string }> = {
  NON_COLLEGATO: { pallino: "bg-[color:var(--integ-dot-disponibile)]", testo: "text-ink" },
  IN_ANTEPRIMA: { pallino: "border border-[color:var(--integ-dot-anteprima-bordo)] bg-[color:var(--integ-dot-anteprima)]", testo: "text-ink" },
  CONFIGURAZIONE_NECESSARIA: { pallino: "bg-[color:var(--integ-dot-configura)]", testo: "text-ink" },
  VERIFICA_IN_CORSO: { pallino: "animate-pulse bg-[color:var(--integ-dot-verifica)]", testo: "text-ink" },
  COLLEGATO: { pallino: "bg-[color:var(--integ-dot-collegata)]", testo: "text-ink" },
  ERRORE_CONNESSIONE: { pallino: "bg-[color:var(--integ-dot-errore)]", testo: "text-ink" },
  CREDENZIALI_SCADUTE: { pallino: "bg-[color:var(--integ-dot-errore)]", testo: "text-ink" },
  IN_PAUSA: { pallino: "bg-[color:var(--integ-dot-pausa)]", testo: "text-ink" },
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

/**
 * «Anteprima»: l'integrazione è ancora in prova presso Foodtech. Sta accanto
 * allo stato della connessione, non al suo posto: un'anteprima collegata è
 * collegata, e va detto che è in prova.
 */
export function SegnoAnteprima({ className }: { className?: string }) {
  return (
    <span
      className={cn("inline-flex items-center rounded-full border border-border px-2 py-0.5 text-[11px] font-medium leading-none text-muted-foreground", className)}
      title="In prova con i primi ristoranti: alcune funzioni possono cambiare."
    >
      Anteprima
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

/** Data e ora per esteso: «24 settembre 2026, 14:05». */
export function dataOra(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  return `${d.toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric" })}, ${d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}`;
}

export function giorno(iso: string): string {
  return new Date(iso).toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric" });
}
