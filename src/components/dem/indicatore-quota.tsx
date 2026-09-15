import Link from "next/link";
import { Mail } from "lucide-react";
import { invii } from "@/lib/dem-piani";
import { cn } from "@/lib/utils";

/**
 * «67.520 email disponibili», e nient'altro.
 *
 * Sta in cima alle Campagne e deve **non farsi notare**: chi apre quella
 * pagina vuole scrivere una newsletter, non leggere un cruscotto commerciale.
 * Quindi una riga, il numero che serve a decidere se si può inviare, e un
 * collegamento per chi vuole saperne di più.
 *
 * Diventa un avviso solo quando c'è qualcosa da fare davvero: sotto il dieci
 * per cento rimasto, o a quota finita. Un indicatore sempre allarmato è un
 * indicatore che si smette di guardare.
 */
export function IndicatoreQuota({
  disponibili,
  limite,
  sospeso = false,
  className,
}: {
  disponibili: number;
  limite: number;
  sospeso?: boolean;
  className?: string;
}) {
  const esaurita = disponibili === 0;
  const agliSgoccioli = !esaurita && limite > 0 && disponibili / limite < 0.1;

  return (
    <Link
      href="/settings/marketing/piano"
      className={cn(
        "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs transition-colors",
        esaurita || sospeso
          ? "border-destructive/50 bg-destructive/20 text-cream hover:bg-destructive/25"
          : agliSgoccioli
            ? "border-accent/60 bg-accent/30 text-cream hover:bg-accent/40"
            : "border-border text-muted-foreground hover:bg-white/5 hover:text-foreground",
      )}
    >
      <Mail className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span className="tabular-nums">
        {sospeso
          ? "Invii sospesi"
          : esaurita
            ? "Nessun invio disponibile"
            : `${invii(disponibili)} email disponibili`}
      </span>
    </Link>
  );
}
