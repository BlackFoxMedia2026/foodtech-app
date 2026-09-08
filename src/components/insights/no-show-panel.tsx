import Link from "next/link";
import { CalendarX, Info } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { formatCurrency } from "@/lib/utils";
import { MINIMO_PER_QUOTA, type NoShowReport } from "@/server/no-show";
import { Base } from "@/components/ui/base-del-numero";

/**
 * Quanto costano le assenze.
 *
 * «Il 6% di assenze» non muove niente. «Trentadue coperti persi, circa
 * 1.400 €, e metà di martedì» muove: dice dove guardare e cosa cambiare.
 *
 * La cifra in euro porta scritto **da dove viene**: misurata sui conti chiusi
 * quando ce ne sono, o dallo scontrino medio dichiarato — e in quel caso si
 * chiama stima. È la stessa distinzione che tiene in piedi tutta la
 * Panoramica: le due cose non si mescolano perché rispondono a due domande
 * diverse.
 *
 * Le percentuali per giorno compaiono solo dove ci sono abbastanza
 * prenotazioni: un martedì con due prenotazioni e un'assenza fa «50%», che è
 * vero e non significa niente.
 */
export function NoShowPanel({ report, currency }: { report: NoShowReport; currency: string }) {
  const euro = (c: number) => formatCurrency(c, currency);

  if (report.prenotazioni === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarX className="h-4 w-4 text-accent" aria-hidden="true" /> Quanto costano le assenze
          </CardTitle>
        </CardHeader>
        <CardContent>
          <EmptyState icon={CalendarX} compact title="Nessuna prenotazione nel periodo">
            Con qualche serata alle spalle qui si legge quanti coperti sono andati persi, quanto valevano e in che
            giorni succede.
          </EmptyState>
        </CardContent>
      </Card>
    );
  }

  if (report.assenze === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarX className="h-4 w-4 text-accent" aria-hidden="true" /> Quanto costano le assenze
          </CardTitle>
          <CardDescription>
            Nessuna assenza su {report.prenotazioni}{" "}
            {report.prenotazioni === 1 ? "prenotazione" : "prenotazioni"} nel periodo. Niente da recuperare.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const giorniConQuota = report.perGiorno.filter((g) => g.quota != null && g.prenotazioni > 0);
  const massimo = Math.max(...giorniConQuota.map((g) => g.quota ?? 0), 1);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CalendarX className="h-4 w-4 text-accent" aria-hidden="true" /> Quanto costano le assenze
        </CardTitle>
        <CardDescription>
          {report.assenze} {report.assenze === 1 ? "prenotazione" : "prenotazioni"} andate a vuoto su{" "}
          {report.prenotazioni}
          {report.quota != null ? ` · il ${report.quota}%` : ""}
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-md border border-border p-3">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Coperti persi</p>
            <p className="mt-1 text-display text-2xl tabular-nums">{report.copertiPersi}</p>
            <p className="text-xs text-muted-foreground">tavoli tenuti e non usati</p>
          </div>

          <div className="rounded-md border border-border p-3">
            <p className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-muted-foreground">
              {report.valoreCoperto.tipo === "misurato" ? "Valgono" : "Valore stimato"}
              {/*
                Il segno dice da dove viene la cifra, sempre nello stesso
                modo in tutto il prodotto: la didascalia sotto la spiega, ma
                chi guarda un numero non legge la didascalia.
              */}
              {report.costoCents != null && (
                <Base
                  base={report.valoreCoperto.tipo === "misurato" ? "misurato" : "stimato"}
                  dettaglio={
                    report.valoreCoperto.tipo === "misurato"
                      ? `${euro(report.valoreCoperto.centesimi)} per coperto, dai conti chiusi di questo locale.`
                      : report.valoreCoperto.tipo === "dichiarato"
                        ? `${euro(report.valoreCoperto.centesimi)} per coperto, dallo scontrino medio che hai dichiarato: è una stima, non un incasso.`
                        : "Manca lo scontrino medio: senza quello, questi coperti non hanno un valore in euro."
                  }
                />
              )}
            </p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">
              {report.costoCents != null ? euro(report.costoCents) : "—"}
            </p>
            <p className="text-xs text-muted-foreground">
              {report.valoreCoperto.tipo === "misurato"
                ? `${euro(report.valoreCoperto.centesimi)} per coperto, dai conti chiusi`
                : report.valoreCoperto.tipo === "dichiarato"
                  ? `${euro(report.valoreCoperto.centesimi)} per coperto, dichiarato da te`
                  : "manca lo scontrino medio"}
            </p>
          </div>

          <div className="rounded-md border border-border p-3">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Chi ripete</p>
            <p className="mt-1 text-display text-2xl tabular-nums">{report.recidiviTotali}</p>
            <p className="text-xs text-muted-foreground">
              {report.recidiviTotali === 1 ? "cliente con due o più assenze" : "clienti con due o più assenze"}
            </p>
          </div>
        </div>

        {report.valoreCoperto.tipo === "misurato" ? (
          <p className="flex items-start gap-2 text-xs text-tertiary-foreground">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            {/* Da dove viene la cifra: misurata, non dedotta. */}
            Il valore di un coperto è misurato sui {report.valoreCoperto.suContiChiusi}{" "}
            {report.valoreCoperto.suContiChiusi === 1 ? "conto chiuso" : "conti chiusi"} del periodo, non stimato.
          </p>
        ) : report.valoreCoperto.tipo === "dichiarato" ? (
          <p className="flex items-start gap-2 text-xs text-tertiary-foreground">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            Questa cifra usa lo scontrino medio che hai dichiarato: è una stima. Diventa un numero misurato appena
            ci sono conti chiusi nel periodo.
          </p>
        ) : (
          <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            Quanti coperti hai perso lo sappiamo; quanto valevano no. Si completa dichiarando lo scontrino medio in{" "}
            <Link href="/settings" className="underline">
              Impostazioni
            </Link>
            , o chiudendo i conti al tavolo — quello è il numero vero.
          </p>
        )}

        <div>
          <p className="text-sm font-medium">In che giorni succede</p>
          {report.giornoPeggiore ? (
            <p className="mt-0.5 text-xs text-muted-foreground">
              Il {report.giornoPeggiore.nome} è il giorno peggiore: {report.giornoPeggiore.quota}% di assenze
              contro il {report.quota}% della media.
            </p>
          ) : (
            <p className="mt-0.5 text-xs text-muted-foreground">
              Nessun giorno spicca sugli altri: le assenze sono distribuite.
            </p>
          )}

          <ul className="mt-3 space-y-1.5">
            {report.perGiorno
              .filter((g) => g.prenotazioni > 0)
              .map((g) => (
                <li key={g.weekday} className="flex items-center gap-3 text-sm">
                  <span className="w-20 shrink-0 capitalize text-muted-foreground">{g.nome.slice(0, 3)}</span>
                  <span className="flex h-2 flex-1 overflow-hidden rounded-full bg-current/10">
                    {g.quota != null && (
                      <span
                        className="h-full rounded-full bg-accent"
                        style={{ width: `${Math.round(((g.quota ?? 0) / massimo) * 100)}%` }}
                      />
                    )}
                  </span>
                  <span className="w-32 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                    {g.assenze === 0
                      ? "nessuna"
                      : `${g.assenze} ${g.assenze === 1 ? "assenza" : "assenze"}`}
                    {g.quota != null ? ` · ${g.quota}%` : ""}
                  </span>
                </li>
              ))}
          </ul>

          {report.perGiorno.some((g) => g.prenotazioni > 0 && g.quota == null) && (
            <p className="mt-2 text-xs text-tertiary-foreground">
              {/* Una percentuale su due prenotazioni è vera e non significa
                  niente: meglio il conteggio nudo. */}
              Dove ci sono meno di {MINIMO_PER_QUOTA} prenotazioni la percentuale non si mostra: su numeri così
              piccoli direbbe più di quello che sa.
            </p>
          )}
        </div>

        {report.recidivi.length > 0 && (
          <div className="rounded-md border border-border p-3">
            <p className="text-sm font-medium">
              {report.recidivi.length === 1
                ? "Un cliente è mancato più di una volta"
                : `${report.recidiviTotali} clienti sono mancati più di una volta`}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Non è una lista nera: è a loro che conviene telefonare il giorno prima, o chiedere una conferma.
            </p>
            <ul className="mt-2 space-y-1 text-sm">
              {report.recidivi.map((r) => (
                <li key={r.guestId} className="flex items-baseline justify-between gap-3">
                  <Link href={`/guests/${r.guestId}`} className="min-w-0 truncate underline">
                    {r.nome}
                  </Link>
                  <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                    {r.assenzeNelPeriodo} nel periodo
                    {r.assenzeInTutto > r.assenzeNelPeriodo ? ` · ${r.assenzeInTutto} in tutto` : ""}
                    {r.visite > 0 ? ` · ${r.visite} ${r.visite === 1 ? "visita" : "visite"}` : ""}
                  </span>
                </li>
              ))}
              {report.recidiviTotali > report.recidivi.length && (
                <li className="text-xs text-tertiary-foreground">
                  e altri {report.recidiviTotali - report.recidivi.length}
                </li>
              )}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
