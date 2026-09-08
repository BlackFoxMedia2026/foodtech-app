import { ListOrdered } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { durataUmana } from "@/lib/durata";
import type { WaitlistReport } from "@/server/waitlist";

/**
 * Tenere una lista d'attesa serve?
 *
 * È la domanda a cui questo riquadro risponde, e finora la risposta la dava
 * l'impressione di chi era in sala quella sera. I coperti recuperati sono il
 * numero che conta: sono persone che senza la lista sarebbero andate altrove.
 *
 * La percentuale compare solo con abbastanza righe. Tre righe non fanno un
 * tasso di conversione, fanno tre righe.
 */
export function WaitlistPanel({ report }: { report: WaitlistReport }) {
  if (report.chiuse === 0 && report.maiChiuse === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ListOrdered className="h-4 w-4 text-accent" aria-hidden="true" /> La lista d&apos;attesa
          </CardTitle>
        </CardHeader>
        <CardContent>
          <EmptyState icon={ListOrdered} compact title="Nessuno in coda nel periodo">
            Quando il locale è pieno, chi arriva senza prenotazione può entrare in lista invece di andarsene.
            Da qui si vede quanti di loro finiscono davvero a tavola.
          </EmptyState>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ListOrdered className="h-4 w-4 text-accent" aria-hidden="true" /> La lista d&apos;attesa
        </CardTitle>
        <CardDescription>
          {report.chiuse} {report.chiuse === 1 ? "persona è uscita" : "persone sono uscite"} dalla coda nel
          periodo: chi sta aspettando adesso non è né un successo né una perdita, e resta fuori dal conto.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="riquadro p-3">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Si sono sedute</p>
            <p className="mt-1 text-display text-2xl tabular-nums">
              {report.sedute}
              {report.conversione != null && (
                <span className="ml-2 text-base text-muted-foreground">
                  {Math.round(report.conversione * 100)}%
                </span>
              )}
            </p>
            <p className="text-xs text-muted-foreground">
              {report.andateVia} {report.andateVia === 1 ? "se n'è andata" : "se ne sono andate"}
            </p>
          </div>

          <div className="riquadro p-3">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Coperti recuperati</p>
            <p className="mt-1 text-display text-2xl tabular-nums text-accent">{report.copertiRecuperati}</p>
            <p className="text-xs text-muted-foreground">
              persone che senza la lista sarebbero andate altrove
            </p>
          </div>

          <div className="riquadro p-3">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Hanno aspettato</p>
            <p className="mt-1 text-display text-2xl">
              {report.attesaMediaMin != null ? durataUmana(report.attesaMediaMin) : "—"}
            </p>
            <p className="text-xs text-muted-foreground">in media, prima di sedersi</p>
          </div>
        </div>

        {report.conversione == null && report.chiuse > 0 && (
          <p className="text-xs text-tertiary-foreground">
            Troppe poche righe per una percentuale: {report.chiuse}{" "}
            {report.chiuse === 1 ? "persona non fa" : "persone non fanno"} un tasso di conversione.
          </p>
        )}

        {report.maiChiuse > 0 && (
          /* Non sono clienti persi: sono un gesto mancato in sala. Mescolarle
             ai persi racconterebbe una serata peggiore di com'è andata. */
          <p className="riquadro p-3 text-sm text-muted-foreground">
            {report.maiChiuse === 1
              ? "Una riga è rimasta aperta per ore senza che nessuno l'abbia chiusa."
              : `${report.maiChiuse} righe sono rimaste aperte per ore senza che nessuno le abbia chiuse.`}{" "}
            Non contano come persi — sono un gesto mancato in sala, e chiuderle rende veri anche gli altri
            numeri.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
