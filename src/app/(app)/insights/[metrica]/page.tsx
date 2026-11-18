import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CopertiNelTempo, LegendaCurve } from "@/components/insights/coperti-nel-tempo";
import { EsitoPrenotazioni, puntiNelTempo } from "@/components/insights/andamento";
import { SceltaPeriodo } from "@/components/insights/schede-viste";
import { getActiveVenue } from "@/lib/tenant";
import { getAnalytics, getPreviousPeriodMetrics } from "@/server/analytics";
import { getFoodCost } from "@/server/food-cost";
import { incassoNelPeriodo, incassoPerGiorno } from "@/server/orders";
import { computeDelta } from "@/lib/period-delta";
import { nomePeriodo, periodoDa } from "@/lib/periodo-insights";
import { perchePercentualeAssente, quotaAffidabile } from "@/lib/quota";
import { SOURCE_LABELS } from "@/lib/insight-rules";
import { cn, formatCurrency } from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * Il dettaglio di un numero di Analytics (18 nov 2026).
 *
 * Le tessere in cima ad Analytics dicono solo il valore e quanto è cambiato:
 * qui c'è il resto — il valore di prima, la differenza, come si misura, la
 * curva sul periodo prima, e di che cosa è fatto. È la pagina dove si capisce
 * un numero; la panoramica è quella dove lo si vede.
 */

const METRICHE = {
  coperti: {
    nome: "Coperti",
    misura:
      "La somma dei posti di tutte le prenotazioni con data nel periodo, comprese quelle poi cancellate o andate a vuoto: è la domanda che è arrivata, non solo chi si è seduto.",
  },
  prenotazioni: {
    nome: "Prenotazioni",
    misura:
      "Tutte le prenotazioni con data nel periodo, qualunque sia stato l'esito. Sotto, come sono finite e da dove sono arrivate.",
  },
  incasso: {
    nome: "Incasso",
    misura:
      "La somma dei conti chiusi nel periodo. Un conto ancora aperto è una serata in corso, non un incasso: entra quando si chiude.",
  },
  spesa: {
    nome: "Spesa media",
    misura:
      "Quanto spende in media un ospite a ogni visita, misurato sui conti chiusi degli ospiti che hanno almeno un conto nel periodo. Chi non ha un conto collegato non entra nella media.",
  },
} as const;

type Metrica = keyof typeof METRICHE;

export default async function DettaglioNumero({
  params,
  searchParams,
}: {
  params: { metrica: string };
  searchParams: { range?: string; from?: string; to?: string; vista?: string };
}) {
  if (!(params.metrica in METRICHE)) notFound();
  const metrica = params.metrica as Metrica;
  const info = METRICHE[metrica];

  const ctx = await getActiveVenue();
  const fuso = ctx.venue.timezone;
  const valuta = ctx.venue.currency;
  const { range, from, to, fromKey, toKey } = periodoDa(searchParams, fuso);
  const durata = to.getTime() - from.getTime();
  const primaDal = new Date(from.getTime() - durata);
  const servonoConti = metrica === "incasso" || metrica === "spesa";

  const [a, prev, foodCost, incassoPrima, incassoOra, incassoPrimaGiorni] = await Promise.all([
    getAnalytics(ctx.venueId, from, to),
    getPreviousPeriodMetrics(ctx.venueId, from, to),
    metrica === "incasso" ? getFoodCost(ctx.venueId, from, to) : null,
    metrica === "incasso" ? incassoNelPeriodo(ctx.venueId, primaDal, from) : null,
    servonoConti ? incassoPerGiorno(ctx.venueId, from, to, fuso) : null,
    servonoConti ? incassoPerGiorno(ctx.venueId, primaDal, from, fuso) : null,
  ]);

  /* ---- Il numero, il suo «prima», e come si scrive ---- */
  let ora = 0;
  let prima = 0;
  let confrontabile = true;
  let scrivi: (v: number) => string = (v) => String(v);
  let unita = "";
  if (metrica === "coperti") {
    ora = a.covers;
    prima = prev.covers;
    unita = "coperti";
  } else if (metrica === "prenotazioni") {
    ora = a.bookings;
    prima = prev.bookings;
    unita = "prenotazioni";
  } else if (metrica === "incasso") {
    ora = foodCost!.incassoCents;
    prima = incassoPrima!.totalCents;
    confrontabile = foodCost!.conti > 0 && incassoPrima!.conti > 0;
    scrivi = (v) => formatCurrency(v, valuta);
  } else {
    ora = a.avgSpendCents;
    prima = prev.avgSpendCents;
    confrontabile = a.ospitiConConti > 0 && prev.ospitiConConti > 0;
    scrivi = (v) => formatCurrency(v, valuta);
  }
  const misurato = metrica === "spesa" ? a.ospitiConConti > 0 : metrica === "incasso" ? foodCost!.conti > 0 : true;
  const delta = confrontabile ? computeDelta(ora, prima) : ({ available: false } as const);
  const differenza = ora - prima;

  /* ---- La curva ---- */
  let serieOra: Record<string, number> = a.perGiorno;
  let seriePrima: Record<string, number> = prev.perGiorno;
  let titoloCurva = "Coperti nel tempo";
  if (metrica === "prenotazioni") {
    serieOra = a.prenotazioniPerGiorno;
    seriePrima = prev.prenotazioniPerGiorno;
    titoloCurva = "Prenotazioni nel tempo";
  } else if (metrica === "incasso") {
    serieOra = incassoOra!;
    seriePrima = incassoPrimaGiorni!;
    titoloCurva = "Incasso nel tempo";
  } else if (metrica === "spesa") {
    /* Giorno per giorno la media per ospite non si può ricostruire senza
       rifare il calcolo per ogni giorno: qui si mostra l'incasso diviso i
       coperti, e il titolo lo dice. */
    const perCoperto = (incasso: Record<string, number>, coperti: Record<string, number>) =>
      Object.fromEntries(Object.entries(incasso).map(([k, v]) => [k, coperti[k] ? Math.round(v / coperti[k]) : 0]));
    serieOra = perCoperto(incassoOra!, a.perGiorno);
    seriePrima = perCoperto(incassoPrimaGiorni!, prev.perGiorno);
    titoloCurva = "Incasso per coperto, nel tempo";
  }
  const giorni = Math.max(1, Math.round(durata / 86_400_000));
  const inEuro = metrica === "incasso" || metrica === "spesa";

  const indietro = new URLSearchParams(
    Object.entries({ range: searchParams.range, from: searchParams.from, to: searchParams.to, vista: searchParams.vista }).filter(
      (x): x is [string, string] => typeof x[1] === "string",
    ),
  ).toString();

  return (
    <div className="schermo animate-fade-in gap-3">
      <div className="fill-scroll -mx-2 -mt-2 space-y-4 px-2 pb-4 pt-2">
        <header className="flex items-center justify-between gap-3">
          <Link
            href={`/insights${indietro ? `?${indietro}` : ""}`}
            className="vetro flex h-10 items-center gap-1 rounded-xl pl-2 pr-3.5 text-sm font-medium text-foreground transition-colors hover:bg-white/40"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            Analytics
          </Link>
          <SceltaPeriodo from={fromKey} to={toKey} />
        </header>

        <section className="grid gap-3 md:gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.9fr)] [&>*]:min-w-0">
          {/* Il numero per esteso. */}
          <Card className="card-notch">
            <CardHeader className="pb-2">
              <p className="t-etichetta text-sm text-kpi-label-muted">{info.nome}</p>
              <CardDescription>{nomePeriodo(range, fromKey, toKey)}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div>
                <p className="font-mono text-5xl leading-none tabular-nums text-foreground">
                  {misurato ? scrivi(ora) : "—"}
                </p>
                {delta.available && (
                  <p className="mt-3 flex flex-wrap items-center gap-2 text-sm">
                    <span
                      className={cn(
                        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 font-mono text-sm font-medium tabular-nums",
                        delta.value === 0
                          ? "bg-border/60 text-muted-foreground"
                          : delta.isGood
                            ? "bg-sage-strong/15 text-sage-strong"
                            : "bg-destructive-soft/15 text-destructive-soft",
                      )}
                    >
                      {delta.value === 0 ? "=" : delta.value > 0 ? "▲" : "▼"} {Math.abs(delta.value)}%
                    </span>
                    <span className="text-muted-foreground">sul periodo prima</span>
                  </p>
                )}
              </div>

              <dl className="divide-y divide-border/60 border-y border-border/60 text-sm">
                <div className="flex items-center justify-between py-2.5">
                  <dt className="text-muted-foreground">Periodo prima</dt>
                  <dd className="font-mono tabular-nums">{confrontabile ? scrivi(prima) : "—"}</dd>
                </div>
                <div className="flex items-center justify-between py-2.5">
                  <dt className="text-muted-foreground">Differenza</dt>
                  <dd className="font-mono tabular-nums">
                    {confrontabile
                      ? `${differenza > 0 ? "+" : differenza < 0 ? "−" : ""}${scrivi(Math.abs(differenza))}${unita ? ` ${unita}` : ""}`
                      : "—"}
                  </dd>
                </div>
              </dl>

              <div>
                <p className="text-sm font-semibold text-card-foreground">Come si misura</p>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{info.misura}</p>
                {!confrontabile && (
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    Il confronto non c&apos;è: in uno dei due periodi non c&apos;è niente da misurare.
                  </p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* La curva. */}
          <Card className="card-notch flex flex-col">
            <CardHeader className="flex-row flex-wrap items-start justify-between gap-x-4 gap-y-2 space-y-0 pb-2">
              <div>
                <CardTitle>{titoloCurva}</CardTitle>
                <CardDescription>
                  {giorni > 62 ? "Settimana per settimana" : "Giorno per giorno"}, contro il periodo prima
                </CardDescription>
              </div>
              <div className="pt-1">
                <LegendaCurve />
              </div>
            </CardHeader>
            <CardContent className="flex min-h-0 flex-1 flex-col pb-4">
              <CopertiNelTempo
                punti={puntiNelTempo(fromKey, toKey, serieOra, seriePrima)}
                valuta={inEuro ? valuta : undefined}
                className="h-64 w-full lg:h-full lg:min-h-72"
              />
            </CardContent>
          </Card>
        </section>

        {/* Di che cosa è fatto. */}
        {metrica === "coperti" && (
          <Card className="card-notch">
            <CardHeader className="pb-3">
              <CardTitle>Per fascia oraria</CardTitle>
              <CardDescription>Dove si concentrano i coperti del periodo</CardDescription>
            </CardHeader>
            <CardContent>
              <Barre righe={a.slots.map((s) => ({ nome: s.slot, valore: s.covers }))} />
            </CardContent>
          </Card>
        )}

        {metrica === "prenotazioni" && (
          <section className="grid gap-3 md:gap-4 lg:grid-cols-2 [&>*]:min-w-0">
            <Card className="card-notch">
              <CardHeader className="pb-3">
                <CardTitle>Come sono finite</CardTitle>
              </CardHeader>
              <CardContent>
                <EsitoPrenotazioni
                  totale={a.bookings}
                  completate={a.occupancyRate}
                  noShow={a.noShowRate}
                  cancellate={a.cancelRate}
                  affidabile={quotaAffidabile(a.bookings)}
                  perche={perchePercentualeAssente(a.bookings)}
                  prima={{
                    completate: prev.occupancyRate,
                    noShow: prev.noShowRate,
                    cancellate: prev.cancelRate,
                    affidabile: quotaAffidabile(prev.bookings),
                  }}
                />
              </CardContent>
            </Card>
            <Card className="card-notch">
              <CardHeader className="pb-3">
                <CardTitle>Da dove arrivano</CardTitle>
              </CardHeader>
              <CardContent>
                <Barre
                  righe={[...a.sources]
                    .sort((x, y) => y.count - x.count)
                    .map((s) => ({ nome: SOURCE_LABELS[s.source] ?? s.source, valore: s.count }))}
                />
              </CardContent>
            </Card>
          </section>
        )}

        {metrica === "incasso" && foodCost && (
          <Card className="card-notch">
            <CardHeader className="pb-3">
              <CardTitle>Di che cosa è fatto</CardTitle>
              <CardDescription>
                Il dettaglio di costi e piatti è in{" "}
                <Link
                  href={`/insights?${new URLSearchParams({ ...Object.fromEntries(new URLSearchParams(indietro)), vista: "carta" }).toString()}`}
                  className="font-medium text-accent-strong underline decoration-accent-strong/40 underline-offset-4"
                >
                  Cibo e carta
                </Link>
              </CardDescription>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-2 gap-x-6 gap-y-4 md:grid-cols-4">
                <Voce nome="Conti chiusi" valore={String(foodCost.conti)} />
                <Voce
                  nome="Media a conto"
                  valore={foodCost.conti > 0 ? formatCurrency(Math.round(foodCost.incassoCents / foodCost.conti), valuta) : "—"}
                />
                {/* `incassoCopertoCents` è l'incasso di cui conosciamo il costo,
                    non l'incasso per coperto: si dice come quota. */}
                <Voce nome="Con il costo noto" valore={foodCost.conti > 0 ? `${foodCost.coperturaPct}%` : "—"} />
                <Voce nome="Conti, periodo prima" valore={String(incassoPrima?.conti ?? 0)} />
              </dl>
            </CardContent>
          </Card>
        )}

        {metrica === "spesa" && (
          <Card className="card-notch">
            <CardHeader className="pb-3">
              <CardTitle>Su chi è misurata</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-2 gap-x-6 gap-y-4 md:grid-cols-4">
                <Voce nome="Ospiti con un conto" valore={String(a.ospitiConConti)} />
                <Voce nome="Ospiti nel periodo" valore={String(a.totalGuests)} />
                <Voce nome="Ospiti con un conto, prima" valore={String(prev.ospitiConConti)} />
                <Voce
                  nome="Spesa media, prima"
                  valore={prev.ospitiConConti > 0 ? formatCurrency(prev.avgSpendCents, valuta) : "—"}
                />
              </dl>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

function Voce({ nome, valore }: { nome: string; valore: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{nome}</dt>
      <dd className="mt-0.5 font-mono text-xl tabular-nums text-foreground">{valore}</dd>
    </div>
  );
}

/** Barre orizzontali sottili: il nome, la barra, il numero. */
function Barre({ righe }: { righe: { nome: string; valore: number }[] }) {
  const max = Math.max(1, ...righe.map((r) => r.valore));
  if (righe.every((r) => r.valore === 0)) {
    return <p className="text-sm text-muted-foreground">Niente da mostrare nel periodo.</p>;
  }
  return (
    <ul className="space-y-2.5">
      {righe.map((r) => (
        <li key={r.nome} className="grid grid-cols-[6.5rem_minmax(0,1fr)_3rem] items-center gap-3 text-sm">
          <span className="truncate text-muted-foreground">{r.nome}</span>
          <span className="h-2 overflow-hidden rounded-full bg-border/50">
            <span
              className="block h-full rounded-full bg-[color:var(--trend-line)]"
              style={{ width: `${(r.valore / max) * 100}%` }}
            />
          </span>
          <span className="text-right font-mono tabular-nums text-foreground">{r.valore}</span>
        </li>
      ))}
    </ul>
  );
}
