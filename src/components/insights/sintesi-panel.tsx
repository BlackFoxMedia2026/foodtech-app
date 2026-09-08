import { AlertTriangle, CheckCircle2, Info } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { RigaSintesi, TonoSintesi } from "@/server/sintesi-esecutiva";

/**
 * La sintesi in cima ad Analytics.
 *
 * Sta **prima** di tutto il resto perché è quella che si legge su un
 * telefono, in piedi, fra due servizi: undici pannelli e quattro grafici
 * sono una pagina da scrivania, e su un telefono erano la stessa pagina
 * compressa.
 *
 * Ogni riga porta la sua base come suggerimento: un numero senza la sua base
 * è un'opinione con la faccia di un dato.
 */

const STILE: Record<TonoSintesi, { icona: typeof Info; classe: string }> = {
  problema: { icona: AlertTriangle, classe: "text-accent" },
  attenzione: { icona: Info, classe: "text-muted-foreground" },
  bene: { icona: CheckCircle2, classe: "text-sage" },
};

export function SintesiPanel({ righe, periodoGiorni }: { righe: RigaSintesi[]; periodoGiorni: number }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Com&apos;è andata</CardTitle>
        <CardDescription>
          Gli ultimi {periodoGiorni} giorni in {righe.length === 0 ? "una riga" : `${righe.length} righe`}, con i
          problemi per primi. Ogni riga dice su cosa è misurata.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {righe.length === 0 ? (
          // Non «nessun dato»: è una risposta, ed è diversa da «non lo
          // sappiamo». Nessuno scostamento rilevante vuol dire che il periodo
          // assomiglia a quello prima.
          <p className="text-sm text-muted-foreground">
            Nessuno scostamento rilevante rispetto al periodo prima, e niente da segnalare fra assenze,
            costi e voti. I numeri per esteso sono qui sotto.
          </p>
        ) : (
          <ul className="space-y-2.5">
            {righe.map((r) => {
              const stile = STILE[r.tono];
              const Icona = stile.icona;
              return (
                <li key={r.testo} className="flex items-start gap-2.5" title={r.base}>
                  <Icona className={cn("mt-0.5 h-4 w-4 shrink-0", stile.classe)} aria-hidden="true" />
                  <div className="min-w-0">
                    <p className="text-sm leading-snug">{r.testo}</p>
                    <p className="text-xs leading-snug text-tertiary-foreground">{r.base}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
