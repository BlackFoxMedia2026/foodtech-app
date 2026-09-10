import Link from "next/link";
import { ArrowRight, ArrowUp, ArrowDown } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StatCard } from "@/components/overview/stat-card";
import { NpsPanel } from "@/components/surveys/nps-panel";
import { ForecastPanel } from "@/components/insights/forecast-panel";
import { FoodCostPanel } from "@/components/insights/food-cost-panel";
import { MenuEngineeringPanel } from "@/components/insights/menu-engineering-panel";
import { WaitlistPanel } from "@/components/insights/waitlist-panel";
import { RotazionePanel } from "@/components/insights/rotazione-panel";
import { getFoodCost } from "@/server/food-cost";
import { getNoShowReport } from "@/server/no-show";
import { NoShowPanel } from "@/components/insights/no-show-panel";
import { getOccupancyByWeekday, getWeekForecast } from "@/server/forecast";
import { getSurveyStats } from "@/server/surveys";
import { reviewFunnel } from "@/server/reviews";
import { menuEngineering } from "@/server/menu-engineering";
import { waitlistReport } from "@/server/waitlist";
import { debitoGiftCards } from "@/server/gift-cards";
import { incassoNelPeriodo } from "@/server/orders";
import { sintesiEsecutiva } from "@/server/sintesi-esecutiva";
import { SintesiPanel } from "@/components/insights/sintesi-panel";
import { rotazioneTavoli } from "@/server/rotazione";
import { resolveSegment } from "@/server/campaigns";
import { Button } from "@/components/ui/button";
import { SlotChart, SourcesChart, WeekdayHeatmap } from "@/components/insights/charts";
import { PeriodSelector } from "@/components/insights/period-selector";
import { SchedeViste } from "@/components/insights/schede-viste";
import { VISTE, vistaDa } from "@/lib/viste-insights";
import { ComparisonStat } from "@/components/insights/comparison-stat";
import { getActiveVenue } from "@/lib/tenant";
import { getAnalytics, getPreviousPeriodMetrics } from "@/server/analytics";
import { computeDelta } from "@/lib/period-delta";
import { generateInsights, SOURCE_LABELS } from "@/lib/insight-rules";
import { formatCurrency, startOfDay, endOfDay, cn } from "@/lib/utils";
import { perchePercentualeAssente, quotaAffidabile } from "@/lib/quota";

export const dynamic = "force-dynamic";

const PRESET_RANGE_KEYS = new Set(["last7", "last30", "last90", "currentMonth", "currentYear"]);

function computeRange(searchParams: { range?: string; from?: string; to?: string }) {
  const now = new Date();

  if (searchParams.range === "custom" && searchParams.from && searchParams.to) {
    return { range: "custom", from: startOfDay(new Date(searchParams.from)), to: endOfDay(new Date(searchParams.to)) };
  }

  const key = searchParams.range && PRESET_RANGE_KEYS.has(searchParams.range) ? searchParams.range : "last7";

  if (key === "currentMonth") {
    return { range: key, from: startOfDay(new Date(now.getFullYear(), now.getMonth(), 1)), to: endOfDay(now) };
  }
  if (key === "currentYear") {
    return { range: key, from: startOfDay(new Date(now.getFullYear(), 0, 1)), to: endOfDay(now) };
  }
  const days = key === "last30" ? 30 : key === "last90" ? 90 : 7;
  const from = startOfDay(now);
  /*
    `- (days - 1)`, non `- days`. Oggi conta come uno dei giorni del periodo:
    sottraendone sette da mezzanotte di oggi la finestra copriva **otto**
    giorni di calendario, e la sintesi scriveva «gli ultimi 8 giorni» sotto una
    pillola che dice «Ultimi 7 giorni». Lo stesso valeva per 30 e 90.
  */
  from.setDate(from.getDate() - (days - 1));
  return { range: key, from, to: endOfDay(now) };
}

function trendFor(current: number, previous: number, opts?: { higherIsBetter?: boolean; kind?: "count" | "rate" }) {
  const delta = computeDelta(current, previous, opts);
  /* `value` porta il **segno**, che diventa la freccia; `isGood` porta il
     giudizio, che diventa il colore. Prima `positive` riceveva `isGood` e la
     scheda ne ricavava la freccia: su ogni metrica «meglio se scende» la
     freccia puntava dalla parte sbagliata. */
  return delta.available ? { value: delta.value, buono: delta.isGood } : undefined;
}

function DeltaBadge({ current, previous }: { current: number; previous: number }) {
  const delta = computeDelta(current, previous);
  if (!delta.available) return <p className="text-xs text-muted-foreground">Confronto non disponibile</p>;
  if (delta.value === 0) return <p className="text-xs text-muted-foreground">Invariato rispetto al periodo precedente</p>;
  return (
    <p className={cn("flex items-center gap-1 text-xs font-medium", delta.isGood ? "text-sage-strong" : "text-destructive-soft")}>
      {delta.value > 0 ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
      {Math.abs(delta.value)}% rispetto al periodo precedente
    </p>
  );
}

export default async function InsightsPage({
  searchParams,
}: {
  searchParams: { range?: string; from?: string; to?: string; vista?: string };
}) {
  const ctx = await getActiveVenue();
  const { range, from, to } = computeRange(searchParams);
  const giorni = Math.max(1, Math.round((to.getTime() - from.getTime()) / 86_400_000));
  /*
    Qui c'era `Math.max(30, ...)`, e con l'intervallo predefinito di sette
    giorni la sintesi scriveva «gli ultimi 30 giorni» sopra numeri di sette:
    l'etichetta non descriveva il calcolo. `giorni` adesso è il periodo scelto.

    Il pavimento a trenta serviva a un'altra cosa, legittima: i voti degli
    ospiti sono pochi, e su sette giorni un NPS è un aneddoto. Quel pavimento
    resta, ma con un nome suo — e il pannello dice su quanti giorni è
    misurato, perché un numero senza la sua finestra non è un numero.
  */
  const giorniVoti = Math.max(30, giorni);
  const [a, prev, nps, ponteRecensioni, previsione, occupazione, foodCost, assenze, codaAttesa, giftCard, rotazione, inattivi, incassoPrima] =
    await Promise.all([
      getAnalytics(ctx.venueId, from, to),
    getPreviousPeriodMetrics(ctx.venueId, from, to),
    getSurveyStats(ctx.venueId, { days: giorniVoti }),
    // Lo stesso periodo del sondaggio: due numeri accanto che contassero
    // finestre diverse sarebbero una percentuale falsa.
    reviewFunnel(ctx.venueId, { days: giorniVoti }),
    // La previsione guarda avanti: non dipende dal periodo selezionato, che
    // riguarda il passato.
    getWeekForecast(ctx.venueId),
    getOccupancyByWeekday(ctx.venueId),
    // Il costo del cibo segue il periodo scelto: è un rendiconto, non una
    // fotografia di adesso.
    getFoodCost(ctx.venueId, from, to),
    getNoShowReport(ctx.venueId, from, to),
      waitlistReport(ctx.venueId, from, to),
      // Il debito delle gift card **non** dipende dal periodo scelto: è quanto
      // il locale deve, adesso, a chi ha già pagato. Un debito «degli ultimi
      // trenta giorni» non vuol dire niente.
      debitoGiftCards(ctx.venueId),
      rotazioneTavoli(ctx.venueId, from, to),
    // Quanti si potrebbero invitare davvero: con email e consenso, non
    // «quanti clienti ho». È lo stesso segmento che userebbe la campagna.
    resolveSegment(ctx.venueId, { audienceTag: "inattivi" }),
      // L'incasso del periodo **prima**, per il confronto della sintesi: una
      // somma sola, non il rendiconto completo calcolato due volte.
      incassoNelPeriodo(
        ctx.venueId,
        new Date(from.getTime() - (to.getTime() - from.getTime())),
        from,
      ),
  ]);

  /**
   * La sintesi: cinque righe con i problemi per primi.
   *
   * È una funzione pura sui numeri già letti qui sopra — non aggiunge nessuna
   * lettura, e si può verificare senza database.
   */
  const sintesi = sintesiEsecutiva({
    periodoGiorni: giorni,
    valuta: ctx.venue.currency,
    ora: a,
    prima: prev,
    assenze,
    foodCost,
    incassoPrimaCents: incassoPrima.conti > 0 ? incassoPrima.totalCents : null,
    coda: codaAttesa,
    voti: nps,
    rotazione,
    giftCard,
    inattivi: inattivi.length,
  });

  const insights = generateInsights({
    current: a,
    previous: prev,
    slots: a.slots,
    heatmap: a.heatmap,
    sources: a.sources,
    sourceLabels: SOURCE_LABELS,
  });

  /**
   * Una vista per volta, scelta dall'indirizzo.
   *
   * Analytics era un rendiconto di tredici pannelli uno sotto l'altro:
   * 5.791 px, sette schermate di scorrimento. Un rendiconto si legge, ma non
   * si legge tutto insieme — e le domande che ci si fa sono quattro, non
   * tredici: com'è andata, come va la carta, come va il servizio, cosa
   * chiede la gente.
   *
   * Come in Impostazioni, la vista sta nell'indirizzo: link condivisibile,
   * tasto indietro che funziona, e nessun JavaScript per cambiarla.
   */
  const vistaAttiva = vistaDa(searchParams.vista);

  const pctNewGuests = a.totalGuests ? Math.round((a.newGuests / a.totalGuests) * 100) : null;
  const pctRepeatGuests = a.totalGuests ? Math.round((a.repeatGuests / a.totalGuests) * 100) : null;

  return (
    <div className="schermo animate-fade-in gap-3">
      <header className="fissa flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-baseline gap-2">
          <h1 className="text-lg font-semibold leading-none">Analytics</h1>
          <p className="t-etichetta">
            {VISTE.find((v) => v.id === vistaAttiva)!.sottotitolo}
          </p>
        </div>
        <PeriodSelector range={range} from={from.toISOString().slice(0, 10)} to={to.toISOString().slice(0, 10)} />
      </header>

      <SchedeViste />

      <div className="fill-scroll space-y-4 pr-0.5">
      {/* ---- COM'È ANDATA ---- */}
      {vistaAttiva === "andamento" && (
        <>
      {/* Prima di tutto il resto: è la riga che si legge su un telefono. */}
      <SintesiPanel righe={sintesi} periodoGiorni={giorni} />

      <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <StatCard
          label="Prenotazioni totali"
          value={String(a.bookings)}
          hint="Nel periodo selezionato"
          trend={trendFor(a.bookings, prev.bookings)}
          emphasize
        />
        <StatCard
          label="Coperti totali"
          value={String(a.covers)}
          hint="Somma dei posti prenotati"
          trend={trendFor(a.covers, prev.covers)}
        />
        {/*
          Queste tre sono **percentuali**, e una percentuale su pochi casi dice
          piu' di quello che sa: una prenotazione mancata su una sola fa
          «100% di assenze». Con zero prenotazioni scrivevano «0%», cioe'
          «abbiamo misurato zero assenze» dove non c'era niente da misurare.

          La regola era gia' scritta e applicata al pannello delle assenze, in
          fondo a questa stessa pagina; queste tre schede la ignoravano. Ora
          vive in `lib/quota.ts` e la rispettano entrambe.

          Anche il confronto col periodo prima si mostra solo se **entrambi** i
          periodi hanno una base: variare da una percentuale inventata a
          un'altra non e' una variazione.
        */}
        <StatCard
          label="Tasso completamento"
          value={quotaAffidabile(a.bookings) ? `${a.occupancyRate}%` : "—"}
          hint={quotaAffidabile(a.bookings) ? "Prenotazioni completate" : perchePercentualeAssente(a.bookings)}
          trend={
            quotaAffidabile(a.bookings) && quotaAffidabile(prev.bookings)
              ? trendFor(a.occupancyRate, prev.occupancyRate, { kind: "rate" })
              : undefined
          }
        />
        <StatCard
          label="No-show"
          value={quotaAffidabile(a.bookings) ? `${a.noShowRate}%` : "—"}
          hint={quotaAffidabile(a.bookings) ? "Sul totale prenotazioni" : perchePercentualeAssente(a.bookings)}
          trend={
            quotaAffidabile(a.bookings) && quotaAffidabile(prev.bookings)
              ? trendFor(a.noShowRate, prev.noShowRate, { higherIsBetter: false, kind: "rate" })
              : undefined
          }
        />
        <StatCard
          label="Cancellazioni"
          value={quotaAffidabile(a.bookings) ? `${a.cancelRate}%` : "—"}
          hint={quotaAffidabile(a.bookings) ? "Sul totale prenotazioni" : perchePercentualeAssente(a.bookings)}
          trend={
            quotaAffidabile(a.bookings) && quotaAffidabile(prev.bookings)
              ? trendFor(a.cancelRate, prev.cancelRate, { higherIsBetter: false, kind: "rate" })
              : undefined
          }
        />
        {giftCard.carte > 0 && (
          /* Non è un incasso del periodo: è denaro già incassato e non ancora
             servito, cioè un debito verso i clienti. Sta fra i numeri
             d'insieme perché è lì che qualcuno lo cerca a fine mese. */
          <StatCard
            label="Debito gift card"
            value={formatCurrency(giftCard.residuoCents, ctx.venue.currency)}
            hint={`${giftCard.carte} ${giftCard.carte === 1 ? "carta" : "carte"} da onorare — già incassate, cena da servire`}
          />
        )}
        {/*
          La spesa media è **misurata sui conti chiusi**, e va detto su quanti
          ospiti: prima si calcolava da una colonna che nessuno scrive, quindi
          su un locale vero mostrava «0,00 €» con accanto una freccia di
          tendenza — il modo più efficace di far sembrare un dato mancante un
          dato brutto. Senza nemmeno un conto chiuso il riquadro dice cosa
          manca invece di mostrare uno zero.
        */}
        <StatCard
          label="Spesa media per visita"
          value={a.ospitiConConti > 0 ? formatCurrency(a.avgSpendCents, ctx.venue.currency) : "—"}
          hint={
            a.ospitiConConti > 0
              ? `Sui conti chiusi di ${a.ospitiConConti} ${a.ospitiConConti === 1 ? "ospite" : "ospiti"}`
              : "Nessun conto chiuso nel periodo: non c'è niente da misurare"
          }
          trend={
            a.ospitiConConti > 0 && prev.ospitiConConti > 0
              ? trendFor(a.avgSpendCents, prev.avgSpendCents)
              : undefined
          }
        />
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Confronto periodi</CardTitle>
          <CardDescription>Periodo selezionato rispetto a quello immediatamente precedente</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-6">
            <ComparisonStat label="Prenotazioni" current={a.bookings} previous={prev.bookings} />
            <ComparisonStat label="Coperti" current={a.covers} previous={prev.covers} />
            <ComparisonStat label="Tasso completamento" current={a.occupancyRate} previous={prev.occupancyRate} format={(v) => `${v}%`} kind="rate"
              nonDisponibile={quotaAffidabile(a.bookings) ? undefined : perchePercentualeAssente(a.bookings)} />
            <ComparisonStat label="No-show" current={a.noShowRate} previous={prev.noShowRate} format={(v) => `${v}%`} higherIsBetter={false} kind="rate"
              nonDisponibile={quotaAffidabile(a.bookings) ? undefined : perchePercentualeAssente(a.bookings)} />
            <ComparisonStat label="Cancellazioni" current={a.cancelRate} previous={prev.cancelRate} format={(v) => `${v}%`} higherIsBetter={false} kind="rate"
              nonDisponibile={quotaAffidabile(a.bookings) ? undefined : perchePercentualeAssente(a.bookings)} />
            {/* Un confronto fra due periodi ha senso solo se entrambi hanno
                conti chiusi: «0 → 32 €» non è una crescita, è la comparsa
                della misura. */}
            {a.ospitiConConti > 0 && prev.ospitiConConti > 0 && (
              <ComparisonStat
                label="Spesa media"
                current={a.avgSpendCents}
                previous={prev.avgSpendCents}
                format={(v) => formatCurrency(v, ctx.venue.currency)}
              />
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Insight principali</CardTitle>
          <CardDescription>Cosa dicono i dati di questo periodo</CardDescription>
        </CardHeader>
        <CardContent>
          {insights.length === 0 ? (
            <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
              Non ci sono ancora abbastanza dati per generare insight affidabili.
            </p>
          ) : (
            <ul className="space-y-2">
              {insights.map((insight, i) => (
                <li key={i} className="rounded-md border bg-secondary/30 p-3 text-sm">{insight}</li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
        </>
      )}

      {/* ---- CIBO E CARTA ---- */}
      {vistaAttiva === "carta" && (
        <>
          <FoodCostPanel report={foodCost} currency={ctx.venue.currency} />
          {/* Stessa serata, stessi piatti: la classifica si calcola sul
              rendiconto già letto invece di rifare le stesse letture. */}
          {foodCost.conti > 0 && (
            <MenuEngineeringPanel dati={menuEngineering(foodCost)} currency={ctx.venue.currency} />
          )}
        </>
      )}

      {/* ---- SERVIZIO ---- */}
      {vistaAttiva === "servizio" && (
        <>
          <NoShowPanel report={assenze} currency={ctx.venue.currency} />
          <RotazionePanel report={rotazione} />
          <WaitlistPanel report={codaAttesa} />
        </>
      )}

      {/* ---- DOMANDA E OSPITI ---- */}
      {vistaAttiva === "domanda" && (
        <>
          <ForecastPanel giorni={previsione} occupazione={occupazione} inattivi={inattivi.length} />
          <NpsPanel stats={nps} funnel={ponteRecensioni} giorni={giorniVoti} />
      <section className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Coperti per fascia oraria</CardTitle>
            <CardDescription>Distribuzione del flusso nel periodo selezionato</CardDescription>
          </CardHeader>
          <CardContent><SlotChart data={a.slots} /></CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Domanda per giorno e orario</CardTitle>
            <CardDescription>Coperti per giorno della settimana e fascia oraria</CardDescription>
          </CardHeader>
          <CardContent><WeekdayHeatmap data={a.heatmap} /></CardContent>
        </Card>
      </section>
      <Card>
        <CardHeader>
          <CardTitle>Fonti di prenotazione</CardTitle>
          <CardDescription>Dove arrivano i tuoi ospiti</CardDescription>
        </CardHeader>
        <CardContent><SourcesChart data={a.sources} /></CardContent>
      </Card>
      <section className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Nuovi ospiti</CardTitle>
            <CardDescription>Profili creati nel periodo selezionato</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-display text-4xl">{a.newGuests}</p>
            <p className="text-sm text-muted-foreground">
              {pctNewGuests !== null ? `${pctNewGuests}% degli ospiti nel periodo` : "Nessun ospite nel periodo"}
            </p>
            <DeltaBadge current={a.newGuests} previous={prev.newGuests} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Ospiti ricorrenti</CardTitle>
            <CardDescription>Hanno visitato più di una volta</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-display text-4xl">{a.repeatGuests}</p>
            <p className="text-sm text-muted-foreground">
              {pctRepeatGuests !== null ? `${pctRepeatGuests}% degli ospiti nel periodo` : "Nessun ospite nel periodo"}
            </p>
            <DeltaBadge current={a.repeatGuests} previous={prev.repeatGuests} />
            <Button asChild variant="outline" size="sm">
              <Link href="/guests">Vai a Ospiti <ArrowRight className="h-4 w-4" /></Link>
            </Button>
          </CardContent>
        </Card>
      </section>
        </>
      )}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Le quattro domande                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Analytics era un rendiconto di tredici pannelli in colonna: 5.791 px,
 * sette schermate di scorrimento. Ma le domande che un ristoratore si fa
 * guardando i numeri sono quattro, non tredici — e una per volta.
 *
 * Il nome di ogni vista è la domanda, non l'argomento: «com'è andata» e non
 * «performance».
 */
