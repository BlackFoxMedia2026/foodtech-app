import { Info, Timer } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { durataUmana } from "@/lib/durata";
import { MINIMO_MISURATE, type RotazioneReport } from "@/server/rotazione";

/**
 * Quanto stanno a tavola, e quante volte gira un tavolo.
 *
 * Il confronto fra durata misurata e durata prevista è la parte che serve
 * davvero: quel numero decide quanti tavoli il motore accetta di vendere ogni
 * sera, e all'inizio era una convenzione (105 minuti) che nessuno aveva mai
 * confrontato con la realtà del locale. Adesso la durata la **misura**
 * `durataConsigliata`, per gruppo e per fascia: questo quadro serve a vedere
 * se la misura sta funzionando, non a girare una manopola.
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
                <p className="t-etichetta">Durata media</p>
                <p className="mt-1 text-display text-2xl">{durataUmana(report.durataMediaMin!)}</p>
                <p className="text-xs text-muted-foreground">dall&apos;arrivo alla chiusura del conto</p>
              </div>
              <div className="riquadro p-3">
                <p className="t-etichetta">Durata prevista</p>
                <p className="mt-1 text-display text-2xl">{durataUmana(report.durataPrevistaMin!)}</p>
                <p className="text-xs text-muted-foreground">quella impostata sulle prenotazioni</p>
              </div>
              <div className="riquadro p-3">
                <p className="t-etichetta">Giri per tavolo</p>
                <p className="mt-1 text-display text-2xl tabular-nums">{report.giri ?? "—"}</p>
                <p className="text-xs text-muted-foreground">
                  in un giorno di servizio, su {report.tavoliUsati}{" "}
                  {report.tavoliUsati === 1 ? "tavolo usato" : "tavoli usati"}
                </p>
              </div>
            </div>

            {scarto != null && Math.abs(scarto) >= 10 && (
              /*
                Cosa dice questo scarto, adesso che la durata la misura Tavolo.

                Questa riga diceva «alzare la durata prevista costa qualche
                coperto e toglie la coda all'ingresso»: un consiglio a
                cambiare un'impostazione **che non esiste più**. Da quando
                `durataConsigliata` misura la durata per gruppo, fascia e tipo
                di giorno, una prenotazione nuova senza durata scritta a mano
                prende già quella misurata, e il motore di disponibilità
                calcola con la stessa.

                Quindi lo scarto non è più una manopola da girare: è la
                distanza fra quanto è **durato** e quanto era **scritto** su
                queste prenotazioni — cioè quelle con la durata cambiata a
                mano, o create prima che ci fosse una misura. Si chiude da sé.

                È la regola dura del §16 applicata a una riga che c'era già:
                un'azione si scrive solo se si può fare. «Non c'è niente da
                fare, e perché» è un'informazione; un consiglio che non porta
                da nessuna parte insegna a saltare la riga.
              */
              <p className="rounded-md border border-accent/30 bg-accent/10 p-3 text-sm">
                {scarto > 0 ? (
                  <>
                    Le cene sono durate <strong>{durataUmana(scarto)} più</strong> di quanto era scritto su
                    queste prenotazioni: il motore ha venduto tavoli che non si liberavano in tempo, e in sala
                    si sono accumulati ritardi.
                  </>
                ) : (
                  <>
                    Le cene sono durate <strong>{durataUmana(-scarto)} meno</strong> di quanto era scritto su
                    queste prenotazioni: il motore ha tenuto occupati tavoli che erano già liberi.
                  </>
                )}{" "}
                La durata delle prenotazioni nuove la misura Tavolo da sola, per gruppo e per fascia, quindi
                questo scarto si chiude da sé: quello che resta sono le prenotazioni con la durata scritta a
                mano.
              </p>
            )}
          </>
        )}

        <p className="flex items-start gap-2 t-nota">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          Contiamo solo quello che il servizio ha segnato: chi viene accomodato senza toccare Tavolo, o un
          conto chiuso a voce, qui non c&apos;è. È il motivo per cui accanto alla media c&apos;è sempre
          scritto su quante prenotazioni è stata fatta.
        </p>
      </CardContent>
    </Card>
  );
}
