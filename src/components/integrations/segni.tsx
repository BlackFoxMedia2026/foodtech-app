import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { Salute, StatoInstallazione } from "@/server/integrations/tipi";
import type { VoceVista } from "@/server/integrations/vista";

/**
 * I segni che si ripetono in catalogo, percorso e dettaglio. Un posto solo,
 * così «Connessa» ha lo stesso colore dappertutto.
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
        "inline-flex shrink-0 items-center justify-center rounded-md border border-cream/20 bg-cream font-semibold text-clay-ink",
        grande ? "h-14 w-14 text-lg" : "h-10 w-10 text-sm",
      )}
    >
      {testo}
    </span>
  );
}

const STATO: Record<StatoInstallazione, { etichetta: string; tono: Parameters<typeof Badge>[0]["tone"] }> = {
  NOT_INSTALLED: { etichetta: "Non installata", tono: "neutral" },
  INSTALLING: { etichetta: "Installazione iniziata", tono: "info" },
  NEEDS_CONFIGURATION: { etichetta: "Da configurare", tono: "info" },
  CONNECTED: { etichetta: "Collegata, da attivare", tono: "gold" },
  SYNCING: { etichetta: "Sincronizzazione in corso", tono: "success-soft" },
  ACTIVE: { etichetta: "Connessa", tono: "success" },
  ERROR: { etichetta: "Errore", tono: "danger" },
  DISABLED: { etichetta: "Disattivata", tono: "neutral" },
  REAUTH_REQUIRED: { etichetta: "Richiede attenzione", tono: "warning" },
};

export function etichettaStato(s: StatoInstallazione): string {
  return STATO[s].etichetta;
}

export function BadgeStato({ stato, salute }: { stato: StatoInstallazione; salute?: Salute }) {
  // Attiva ma con qualcosa da guardare: lo stato resta «Connessa», la
  // pillola avvisa.
  if (stato === "ACTIVE" && salute === "DEGRADED") return <Badge tone="warning">Connessa, da controllare</Badge>;
  const s = STATO[stato];
  return <Badge tone={s.tono}>{s.etichetta}</Badge>;
}

/** Il pallino accanto al nome: dice la salute senza leggere. */
export function PallinoSalute({ salute }: { salute: Salute }) {
  const colore =
    salute === "HEALTHY"
      ? "bg-sage-strong"
      : salute === "DEGRADED" || salute === "AUTH_REQUIRED"
        ? "bg-accent"
        : salute === "ERROR"
          ? "bg-destructive"
          : "border border-muted-foreground";
  return <span aria-hidden="true" className={cn("inline-block h-2.5 w-2.5 shrink-0 rounded-full", colore)} />;
}

/**
 * Quanto è vero il connettore, detto sulla scheda. Solo quando non è
 * operativo: una voce `IMPLEMENTED` non porta niente, perché funzionare è il
 * caso normale e non una medaglia.
 */
export function BadgeImplementazione({ voce }: { voce: Pick<VoceVista, "implementazione" | "disponibilita"> }) {
  if (voce.implementazione === "IN_DEVELOPMENT") return <Badge tone="gold">Anteprima</Badge>;
  if (voce.implementazione === "PLANNED") return <Badge tone="neutral">In arrivo</Badge>;
  return null;
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
