"use client";

import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Settimana } from "@/server/booking-week";

const GIORNI = ["domenica", "lunedì", "martedì", "mercoledì", "giovedì", "venerdì", "sabato"];

/**
 * La settimana sui libri.
 *
 * Risponde alla domanda che si fa al telefono — «avete posto sabato?» — in un
 * colpo d'occhio, invece di cinque frecce e cinque pagine.
 *
 * Ogni giorno è un collegamento: si tocca e si apre quel giorno nell'elenco,
 * perché il gesto vero dopo aver visto la settimana è entrare in una serata.
 *
 * Niente colori d'allarme decisi da noi sulla percentuale: «pieno» per un
 * bistrot da trenta coperti e per una sala da duecento non sono la stessa
 * cosa, e un rosso deciso qui sarebbe un giudizio travestito da dato. Si
 * evidenzia solo quello che chiede un'azione: **le prenotazioni da
 * confermare**.
 */
export function WeekBoard({ settimana }: { settimana: Settimana }) {
  const { giorni } = settimana;

  /** Il giorno mostrato quando si scorre di una settimana. */
  const sposta = (delta: number) => {
    const d = new Date(`${settimana.dal}T12:00:00`);
    d.setDate(d.getDate() + delta * 7);
    return d.toISOString().slice(0, 10);
  };

  const etichettaPeriodo = () => {
    const primo = new Date(`${giorni[0].dateKey}T12:00:00`);
    const ultimo = new Date(`${giorni[6].dateKey}T12:00:00`);
    const stessoMese = primo.getMonth() === ultimo.getMonth();
    const g = (d: Date) => d.toLocaleDateString("it-IT", { day: "numeric" });
    const m = (d: Date) => d.toLocaleDateString("it-IT", { month: "long" });
    return stessoMese
      ? `${g(primo)} – ${g(ultimo)} ${m(ultimo)}`
      : `${g(primo)} ${m(primo)} – ${g(ultimo)} ${m(ultimo)}`;
  };

  return (
    <section className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1">
          <Button asChild size="icon" variant="ghost" aria-label="Settimana precedente">
            <Link href={`/bookings?day=${sposta(-1)}`}>
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            </Link>
          </Button>
          <p className="min-w-[11rem] text-center text-sm font-medium capitalize">{etichettaPeriodo()}</p>
          <Button asChild size="icon" variant="ghost" aria-label="Settimana successiva">
            <Link href={`/bookings?day=${sposta(1)}`}>
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </Button>
        </div>

        <p className="text-sm text-muted-foreground">
          {/* «In questa settimana» va detto: sopra, nell'intestazione della
              pagina, c'è il totale del giorno selezionato, e due numeri
              diversi vicini senza etichetta sembrano una contraddizione. */}
          In questa settimana: <span className="tabular-nums">{settimana.copertiTotali}</span> coperti su{" "}
          <span className="tabular-nums">{settimana.prenotazioniTotali}</span>{" "}
          {settimana.prenotazioniTotali === 1 ? "prenotazione" : "prenotazioni"}
          {settimana.inAttesaTotali > 0 && (
            <>
              {" · "}
              <span className="text-accent-strong">
                {settimana.inAttesaTotali} da confermare
              </span>
            </>
          )}
        </p>
      </header>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
        {giorni.map((g) => {
          const data = new Date(`${g.dateKey}T12:00:00`);
          return (
            <Link
              key={g.dateKey}
              href={`/bookings?day=${g.dateKey}`}
              className={cn(
                "surface flex min-h-[7rem] flex-col justify-between rounded-md border p-3 transition-colors",
                g.oggi ? "border-accent" : "border-border hover:border-border-strong",
                g.passato && "opacity-60",
              )}
            >
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  {GIORNI[g.weekday].slice(0, 3)}{" "}
                  <span className="tabular-nums">{data.toLocaleDateString("it-IT", { day: "numeric" })}</span>
                  {g.oggi && <span className="text-accent-strong"> oggi</span>}
                </p>

                <p className="mt-1 text-display text-2xl tabular-nums">
                  {g.coperti}{" "}
                  <span className="text-sm text-muted-foreground">coperti</span>
                </p>

                <p className="text-xs text-muted-foreground">
                  {g.prenotazioni === 0
                    ? "nessuna prenotazione"
                    : `${g.prenotazioni} ${g.prenotazioni === 1 ? "prenotazione" : "prenotazioni"}`}
                </p>
              </div>

              <div className="mt-2 space-y-1">
                {/* La percentuale solo dove la capienza è dichiarata: senza
                    turni non c'è un «pieno» da calcolare, e inventarne uno
                    sarebbe peggio che non dirlo. */}
                {g.occupazione != null ? (
                  <>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-current/10">
                      <div
                        className="h-full rounded-full bg-accent"
                        style={{ width: `${Math.min(100, g.occupazione)}%` }}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      <span className="tabular-nums">{g.occupazione}%</span> di {g.capienza}
                    </p>
                  </>
                ) : (
                  <p className="text-xs text-tertiary-foreground">nessun turno configurato</p>
                )}

                {g.inAttesa > 0 && (
                  <p className="text-xs font-medium text-accent-strong">
                    {g.inAttesa} da confermare
                  </p>
                )}
              </div>
            </Link>
          );
        })}
      </div>

      <p className="text-xs text-tertiary-foreground">
        {/* Due schermate che rispondono a due domande diverse: dirlo evita che
            qualcuno le confronti e pensi che una delle due sbagli. */}
        Qui c&apos;è quello che è già prenotato, settimane passate comprese. La{" "}
        <Link href="/insights" className="underline">
          previsione dei coperti
        </Link>{" "}
        è un&apos;altra cosa: dice quanti ne aspettiamo, non quanti sono sui libri.
      </p>
    </section>
  );
}
