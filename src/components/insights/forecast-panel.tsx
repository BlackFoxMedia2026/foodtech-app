import Link from "next/link";
import { Button } from "@/components/ui/button";
import { CalendarClock, Info } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { DayForecast, WeekdayOccupancy } from "@/server/forecast";

/**
 * Quanto sarai pieno, con il perché accanto.
 *
 * Il numero da solo non serve: un ristoratore che legge «previsti 70 coperti»
 * senza sapere da dove viene, o non ci crede o ci compra la spesa. Quindi
 * ogni giorno porta la sua frase — «a 3 giorni dal servizio hai già il 60%
 * dei coperti» — e i giorni senza storia dicono che non lo sappiamo, invece
 * di mostrare uno zero che sembra un dato.
 */

function Barra({ pct, forte }: { pct: number; forte: boolean }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-current/20">
      <div
        className={cn("h-full rounded-full", forte ? "bg-accent" : "bg-accent/55")}
        style={{ width: `${Math.min(100, pct)}%` }}
      />
    </div>
  );
}

function etichettaGiorno(g: DayForecast): string {
  if (g.giorniDaOggi === 0) return "Oggi";
  if (g.giorniDaOggi === 1) return "Domani";
  const [, m, d] = g.dateKey.split("-");
  return `${g.weekdayLabel} ${Number(d)}/${Number(m)}`;
}

export function ForecastPanel({
  giorni,
  occupazione,
  inattivi,
}: {
  giorni: DayForecast[];
  occupazione: WeekdayOccupancy[];
  /**
   * Quanti clienti non vengono da un po' e si possono ancora scrivere.
   * Nullo quando non lo sappiamo: senza, non si propone niente.
   */
  inattivi?: number | null;
}) {
  // Il primo dell'elenco è già il più vuoto (l'ordine arriva dal server), ma
  // solo se la sua percentuale è calcolabile: senza capienza dichiarata non
  // esiste un «più vuoto» da nominare.
  const giornoPiuVuoto = occupazione.find((r) => r.occupancyPct != null) ?? null;

  const conPrevisione = giorni.filter((g) => g.forecastCovers != null);
  const senzaStoria = conPrevisione.length === 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CalendarClock className="h-4 w-4 text-accent" aria-hidden="true" /> Quanto sarai pieno
        </CardTitle>
        <CardDescription>
          {senzaStoria
            ? "Serve qualche settimana di servizi registrati prima di poter prevedere qualcosa."
            : "I prossimi sette giorni, con il ragionamento dietro ogni numero."}
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-5">
        <ul className="divide-y divide-border">
          {giorni.map((g) => (
            <li key={g.dateKey} className="flex flex-col gap-1.5 py-3 first:pt-0">
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <span className="text-sm font-medium">{etichettaGiorno(g)}</span>
                <span className="text-sm">
                  {g.forecastCovers != null ? (
                    <>
                      {/* «prenotati» e «a tavola» sono due cose diverse, e la
                          seconda è già al netto delle assenze attese: chiamarli
                          entrambi «coperti» faceva sembrare la previsione più
                          bassa dei fatti. */}
                      <span className="text-muted-foreground">{g.bookedCovers} prenotati · a tavola</span>{" "}
                      <strong>~{g.forecastCovers}</strong>
                      {g.capacity ? <span className="text-muted-foreground"> su {g.capacity}</span> : null}
                      {g.occupancyPct != null && (
                        <span className={cn("ml-2", g.occupancyPct >= 85 ? "text-accent" : "text-muted-foreground")}>
                          {g.occupancyPct}%
                        </span>
                      )}
                    </>
                  ) : (
                    <span className="text-muted-foreground">
                      {g.bookedCovers} prenotati · previsione non disponibile
                    </span>
                  )}
                </span>
              </div>

              {g.occupancyPct != null && <Barra pct={g.occupancyPct} forte={g.occupancyPct >= 85} />}

              <p className="text-xs text-tertiary-foreground">{g.why}</p>
            </li>
          ))}
        </ul>

        {occupazione.length > 0 && (
          <div className="rounded-md border border-border p-3">
            <p className="text-sm font-medium">Dove hai margine</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Coperti prenotati in media, per giorno della settimana, dal più vuoto al più pieno — esclusi i
              disdetti e chi non si è presentato. È qui che una campagna o un&apos;offerta cambiano qualcosa: su un
              venerdì già pieno non cambiano niente.
            </p>
            <ul className="mt-3 space-y-2">
              {occupazione.map((r) => (
                <li key={r.weekday} className="space-y-1">
                  <div className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="capitalize">{r.label}</span>
                    <span className="text-muted-foreground">
                      {r.copertiMedi} coperti
                      {r.capacity ? ` su ${r.capacity}` : ""}
                      {r.occupancyPct != null ? ` · ${r.occupancyPct}%` : ""}
                    </span>
                  </div>
                  {r.occupancyPct != null && <Barra pct={r.occupancyPct} forte={r.occupancyPct >= 85} />}
                  <p className="text-[11px] text-tertiary-foreground">
                    misurato su {r.giorni} {r.giorni === 1 ? "giornata" : "giornate"}
                  </p>
                </li>
              ))}
            </ul>

            {/* Da qui in poi il numero diventa un gesto.
                «Il martedì sei al 54%» non muove niente da solo: muove se
                accanto c'è chi si può invitare e il pulsante che lo fa. Il
                segmento non è inventato qui — è la stessa etichetta calcolata
                che usano le campagne. */}
            {giornoPiuVuoto && inattivi != null && inattivi > 0 && (
              <div className="mt-4 border-t border-border pt-3">
                <p className="text-sm">
                  Il <strong className="capitalize">{giornoPiuVuoto.label}</strong> è il tuo giorno più vuoto
                  {giornoPiuVuoto.occupancyPct != null ? ` (${giornoPiuVuoto.occupancyPct}%)` : ""}, e{" "}
                  <strong>{inattivi}</strong> {inattivi === 1 ? "cliente non viene" : "clienti non vengono"} da un
                  po&apos;.
                </p>
                <Button asChild variant="accent" size="sm" className="mt-2">
                  <Link
                    href={`/campaigns/new?segmento=inattivi&nome=${encodeURIComponent(
                      `Torna a trovarci di ${giornoPiuVuoto.label}`,
                    )}`}
                  >
                    Scrivi a chi non torna
                  </Link>
                </Button>
              </div>
            )}
          </div>
        )}

        <p className="flex items-start gap-2 text-xs text-tertiary-foreground">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          La previsione confronta ogni giorno con gli stessi giorni della settimana precedenti e guarda quanto era
          già prenotato alla stessa distanza dal servizio. Le assenze attese sono già sottratte. Dove la storia non
          basta, non prevediamo: preferiamo dirlo.
        </p>
      </CardContent>
    </Card>
  );
}
