import { Info, Timer } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { durataUmana } from "@/lib/durata";
import { MINIMO_MISURATE, type RotazioneReport } from "@/server/rotazione";

/**
 * Quanto stanno a tavola, e quante volte gira un tavolo.
 *
 * Il confronto fra durata misurata e durata prevista è la parte che serve
 * davvero: quel numero decide quanti tavoli il motore accetta di vendere ogni
 * sera, e finora era una convenzione (105 minuti) che nessuno aveva mai
 * confrontato con la realtà del locale.
 */
export function RotazionePanel({ report }: { report: RotazioneReport }) {
  const scarto =
    report.durataMediaMin != null && report.durataPrevistaMin != null
      ? report.durataMediaMin - report.durataPrevistaMin
      : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Timer className="h-4 w-4 text-accent" aria-hidden="true" /> Quanto stanno a tavola
        </CardTitle>
        <CardDescription>
          Misurato su chi si è seduto e ha chiuso il conto: {report.misurate}{" "}
          {report.misurate === 1 ? "prenotazione" : "prenotazioni"} su {report.sedute} con l&apos;ora di
          arrivo segnata.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {!report.abbastanza ? (
          <div className="riquadro p-4 text-sm">
            <p className="font-medium">Ancora presto per dirlo.</p>
            <p className="mt-1 text-muted-foreground">
              Servono almeno {MINIMO_MISURATE} prenotazioni con arrivo e conto chiuso: qui{" "}
              {report.misurate === 0
                ? "non ce n'è nessuna"
                : report.misurate === 1
                  ? "ce n'è una"
                  : `ce ne sono ${report.misurate}`}
              . Una media su sei cene non è la durata media del locale, è la durata di sei cene.
            </p>
          </div>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="riquadro p-3">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Durata media</p>
                <p className="mt-1 text-display text-2xl">{durataUmana(report.durataMediaMin!)}</p>
                <p className="text-xs text-muted-foreground">dall&apos;arrivo alla chiusura del conto</p>
              </div>
              <div className="riquadro p-3">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Durata prevista</p>
                <p className="mt-1 text-display text-2xl">{durataUmana(report.durataPrevistaMin!)}</p>
                <p className="text-xs text-muted-foreground">quella impostata sulle prenotazioni</p>
              </div>
              <div className="riquadro p-3">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Giri per tavolo</p>
                <p className="mt-1 text-display text-2xl tabular-nums">{report.giri ?? "—"}</p>
                <p className="text-xs text-muted-foreground">
                  in un giorno di servizio, su {report.tavoliUsati}{" "}
                  {report.tavoliUsati === 1 ? "tavolo usato" : "tavoli usati"}
                </p>
              </div>
            </div>

            {scarto != null && Math.abs(scarto) >= 10 && (
              /* Il consiglio operativo, non il numero: la durata prevista è ciò
                 che decide quanti tavoli si vendono, e sbagliarla di venti
                 minuti si sente su ogni servizio. */
              <p className="rounded-md border border-accent/30 bg-accent/10 p-3 text-sm">
                {scarto > 0 ? (
                  <>
                    Le cene durano <strong>{durataUmana(scarto)} più</strong> di quanto è impostato: il motore
                    vende tavoli che non si liberano in tempo, e in sala si accumulano ritardi. Alzare la
                    durata prevista costa qualche coperto e toglie la coda all&apos;ingresso.
                  </>
                ) : (
                  <>
                    Le cene durano <strong>{durataUmana(-scarto)} meno</strong> di quanto è impostato: il
                    motore tiene occupati tavoli che sono già liberi. Abbassare la durata prevista fa entrare
                    più gente senza toccare niente in cucina.
                  </>
                )}
              </p>
            )}
          </>
        )}

        <p className="flex items-start gap-2 text-xs text-tertiary-foreground">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          Contiamo solo quello che il servizio ha segnato: chi viene accomodato senza toccare Tavolo, o un
          conto chiuso a voce, qui non c&apos;è. È il motivo per cui accanto alla media c&apos;è sempre
          scritto su quante prenotazioni è stata fatta.
        </p>
      </CardContent>
    </Card>
  );
}
