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
 * Ogni giorno è un collegamento: si tocca e si apre quel giorno **nell'elenco**,
 * perché il gesto vero dopo aver visto la settimana è entrare in una serata.
 *
 * Che l'elenco si apra davvero non dipende da qui. Il collegamento cambia la
 * data nell'indirizzo, ma quale vista disegnarla è deciso più in alto, in
 * `BookingsPageClient`: senza `onApriGiorno` il clic cambiava il giorno
 * **restando** sulla settimana, e a schermo sembrava che non fosse successo
 * niente. Sette schede cliccabili che non portano da nessuna parte sono
 * peggio di sette schede non cliccabili.
 *
 * Niente colori d'allarme decisi da noi sulla percentuale: «pieno» per un
 * bistrot da trenta coperti e per una sala da duecento non sono la stessa
 * cosa, e un rosso deciso qui sarebbe un giudizio travestito da dato. Si
 * evidenzia solo quello che chiede un'azione: **le prenotazioni da
 * confermare**.
 */
export function WeekBoard({
  settimana,
  onApriGiorno,
}: {
  settimana: Settimana;
  /** Chiamata quando si apre un giorno: serve a passare all'elenco. */
  onApriGiorno?: () => void;
}) {
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
    /*
      La settimana **prende l'altezza che le avanza**.

      Prima era una fila di scatole basse appoggiate sotto l'intestazione, con
      due terzi di schermata vuoti sotto: sette riquadri da 112 px su una
      pagina alta 900. Il difetto non era la dimensione del testo — era la
      **proporzione**. Una vista che si chiama «Settimana» e che risponde alla
      domanda «come siamo messi?» non può essere la striscia più piccola della
      pagina.

      Adesso la griglia è l'elemento elastico della colonna: intestazione e
      nota in fondo restano a misura propria, le sette schede si prendono il
      resto. Con un tetto, però: a 24 rem si fermano. Una scheda larga 180 px e
      alta 560 sarebbe una feritoia, non una scheda — su uno schermo molto alto
      è giusto che avanzi spazio, non che le colonne diventino grissini.
    */
    <section className="flex h-full min-h-0 flex-col gap-5 xl:gap-6">
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1">
          <Button asChild size="icon" variant="ghost" aria-label="Settimana precedente">
            <Link href={`/bookings?day=${sposta(-1)}`}>
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            </Link>
          </Button>
          <p className="min-w-[11rem] text-center text-base font-medium capitalize">{etichettaPeriodo()}</p>
          <Button asChild size="icon" variant="ghost" aria-label="Settimana successiva">
            <Link href={`/bookings?day=${sposta(1)}`}>
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </Button>
        </div>

        <p className="text-[0.9375rem] text-muted-foreground">
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

      {/*
        `auto-rows-fr` è ciò che rende le sette schede **alte uguali** anche
        quando una ha una riga in più («3 da confermare»): senza, la riga si
        adatta alla più alta e le altre restano corte, e la fila si legge come
        sette oggetti diversi invece che come una settimana.

        L'elasticità vale solo da `xl` in su, dove i giorni stanno su una riga
        sola. Sotto, dove vanno a capo su due o quattro righe, allungarle
        significherebbe una pagina da scorrere per leggere sette numeri.
      */}
      <div className="grid auto-rows-fr gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:max-h-[21rem] xl:min-h-0 xl:flex-1 xl:grid-cols-7 xl:gap-3.5 min-[1500px]:max-h-[24rem] min-[1500px]:gap-4">
        {giorni.map((g) => {
          const data = new Date(`${g.dateKey}T12:00:00`);
          return (
            <Link
              key={g.dateKey}
              href={`/bookings?day=${g.dateKey}`}
              onClick={onApriGiorno}
              aria-current={g.oggi ? "date" : undefined}
              className={cn(
                // `justify-between` è il punto di tutta la modifica: l'altezza
                // in più non serve a niente se il contenuto resta accatastato
                // in cima. Tre blocchi — quando, quanto, quanto pieno — che si
                // distribuiscono sull'altezza invece di impilarsi.
                "surface relative flex min-h-[12rem] flex-col justify-between gap-4 rounded-xl border p-4 transition-colors xl:min-h-[15rem] min-[1500px]:p-5",
                g.oggi ? "border-accent-strong/60" : "border-border hover:border-border-strong",
                g.passato && "opacity-60",
              )}
            >
              {/*
                La velatura calda di oggi, come strato separato: `.surface`
                dipinge il proprio fondo con un gradiente **opaco**, quindi un
                `bg-` sulla stessa scatola non si vedrebbe. Sette per cento —
                si distingue di sfuggita, non illumina.
              */}
              {g.oggi && (
                <span
                  className="pointer-events-none absolute inset-0 rounded-xl bg-accent/[0.07]"
                  aria-hidden="true"
                />
              )}

              {/* Quando. */}
              <div className="relative flex items-start justify-between gap-2">
                <p className="t-etichetta whitespace-nowrap text-[0.9375rem] text-foreground/85">
                  {GIORNI[g.weekday].slice(0, 3)}{" "}
                  <span className="tabular-nums">{data.toLocaleDateString("it-IT", { day: "numeric" })}</span>
                </p>
                {/* «oggi» era una parola in coda alla data, e in una fila di
                    sette si perdeva. Come pastiglia in alto a destra si trova
                    senza leggere. */}
                {g.oggi && (
                  <span className="shrink-0 rounded-full border border-accent-strong/55 bg-accent/15 px-2 py-0.5 text-[0.6875rem] font-semibold uppercase tracking-wider text-accent-strong">
                    Oggi
                  </span>
                )}
              </div>

              {/* Quanto: il dato per cui si apre questa vista. */}
              <div className="relative">
                <p className="text-display text-[2.25rem] leading-none tabular-nums min-[1500px]:text-[2.375rem]">
                  {g.coperti}
                </p>
                <p className="mt-1.5 text-[1.0625rem] text-muted-foreground">coperti</p>
                <p className="mt-3 text-base text-foreground/75">
                  {g.prenotazioni === 0
                    ? "nessuna prenotazione"
                    : `${g.prenotazioni} ${g.prenotazioni === 1 ? "prenotazione" : "prenotazioni"}`}
                </p>
              </div>

              {/* Quanto pieno. */}
              <div className="relative space-y-2">
                {/* La percentuale solo dove la capienza è dichiarata: senza
                    turni non c'è un «pieno» da calcolare, e inventarne uno
                    sarebbe peggio che non dirlo. */}
                {g.occupazione != null ? (
                  <>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-current/10">
                      <div
                        className="h-full rounded-full bg-accent"
                        style={{ width: `${Math.min(100, g.occupazione)}%` }}
                      />
                    </div>
                    <p className="text-[0.9375rem] text-muted-foreground">
                      <span className="tabular-nums">{g.occupazione}%</span> di {g.capienza}
                    </p>
                  </>
                ) : (
                  <p className="text-[0.9375rem] text-tertiary-foreground">nessun turno configurato</p>
                )}

                {g.inAttesa > 0 && (
                  <p className="text-[0.9375rem] font-medium text-accent-strong">
                    {g.inAttesa} da confermare
                  </p>
                )}
              </div>
            </Link>
          );
        })}
      </div>

      <p className="t-nota max-w-5xl shrink-0">
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
