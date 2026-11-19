import Link from "next/link";
import { CalendarRange, Receipt, Users, Wallet } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ChiEVenuto, Margine, Previsione, VotiOspiti } from "@/components/insights/domanda";
import { VistaCarta } from "@/components/insights/carta";
import { getFoodCost } from "@/server/food-cost";
import { getNoShowReport } from "@/server/no-show";
import { VistaServizio } from "@/components/insights/servizio";
import { getOccupancyByWeekday, getWeekForecast } from "@/server/forecast";
import { getSurveyStats } from "@/server/surveys";
import { reviewFunnel } from "@/server/reviews";
import { menuEngineering } from "@/server/menu-engineering";
import { waitlistReport } from "@/server/waitlist";
import { debitoGiftCards } from "@/server/gift-cards";
import { incassoNelPeriodo } from "@/server/orders";
import { sintesiEsecutiva } from "@/server/sintesi-esecutiva";
import { EsitoPrenotazioni, FilaConfronto, RigheSintesi, TesseraConfronto, puntiNelTempo } from "@/components/insights/andamento";
import { CopertiNelTempo, LegendaCurve } from "@/components/insights/coperti-nel-tempo";
import { rotazioneTavoli } from "@/server/rotazione";
import { resolveSegment } from "@/server/campaigns";
import {
  SlotChart,
  SourcesChart,
  WeekdayHeatmap,
} from "@/components/insights/charts";
import { SchedeViste } from "@/components/insights/schede-viste";
import { vistaDa } from "@/lib/viste-insights";
import { getActiveVenue } from "@/lib/tenant";
import { getAnalytics, getPreviousPeriodMetrics } from "@/server/analytics";
import { computeDelta } from "@/lib/period-delta";
import { formatCurrency, cn } from "@/lib/utils";
import { periodoDa } from "@/lib/periodo-insights";
import { perchePercentualeAssente, quotaAffidabile } from "@/lib/quota";
import { statoCentralino } from "@/server/licenza-centralino";
import { numeriTelefono } from "@/server/voice/numeri";
import { TelefonoPanel } from "@/components/insights/telefono-panel";

export const dynamic = "force-dynamic";

export default async function InsightsPage({
  searchParams,
}: {
  searchParams: { range?: string; from?: string; to?: string; vista?: string };
}) {
  const ctx = await getActiveVenue();
  const { from, to, fromKey, toKey } = periodoDa(searchParams, ctx.venue.timezone);
  const giorni = Math.max(
    1,
    Math.round((to.getTime() - from.getTime()) / 86_400_000),
  );
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
  const [
    a,
    prev,
    nps,
    ponteRecensioni,
    previsione,
    occupazione,
    foodCost,
    assenze,
    codaAttesa,
    giftCard,
    rotazione,
    inattivi,
    incassoPrima,
    centralino,
  ] = await Promise.all([
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
    /* Il telefono si legge solo se il locale l'ha comprato, e la funzione
         che lo accende qui è `statistiche`: le altre due accendono il
         riconoscimento e le prenotazioni. Una licenza che non la comprende non
         deve far comparire un pannello vuoto in Analytics. */
    statoCentralino(ctx.venueId),
  ]);

  /* La lettura dei numeri del telefono si fa **dopo** e solo se serve: sono
     un'interrogazione in più, e su tutti i locali che non hanno il telefono —
     cioè quasi tutti — non si paga niente. */
  const numeriDelTelefono =
    centralino.attivo && centralino.funzioni.includes("statistiche")
      ? await numeriTelefono(ctx.venueId, from, to, ctx.venue.timezone)
      : null;

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
  /* Il periodo da portare nel dettaglio di un numero: aprendo «Coperti» si
     guarda lo stesso periodo, e tornando indietro si ritrova la vista. */
  const periodoQuery = new URLSearchParams(
    Object.entries({ range: searchParams.range, from: searchParams.from, to: searchParams.to, vista: searchParams.vista }).filter(
      (x): x is [string, string] => typeof x[1] === "string",
    ),
  ).toString();


  return (
    <div className="schermo animate-fade-in gap-3">
      {/* In colonna flessibile: nella vista «Com'è andata» la riga della curva
          prende l'altezza che avanza, e in fondo non resta un vuoto. */}
      <div className="fill-scroll -mx-2 -mt-2 flex flex-col gap-4 px-2 pb-4 pt-2">
        {/* Quattro numeri, ognuno col periodo prima **dentro** la tessera:
            prima c'era anche un «Confronto periodi» che ripeteva gli
            stessi numeri una seconda volta. */}
        <FilaConfronto>
          <TesseraConfronto
            href={`/insights/coperti?${periodoQuery}`}
            icona={Users}
            etichetta="Coperti"
            valore={String(a.covers)}
            ora={a.covers}
            prima={prev.covers}
          />
          <TesseraConfronto
            href={`/insights/prenotazioni?${periodoQuery}`}
            icona={CalendarRange}
            etichetta="Prenotazioni"
            valore={String(a.bookings)}
            ora={a.bookings}
            prima={prev.bookings}
          />
          <TesseraConfronto
            href={`/insights/incasso?${periodoQuery}`}
            icona={Wallet}
            etichetta="Incasso"
            valore={foodCost.conti > 0 ? formatCurrency(foodCost.incassoCents, ctx.venue.currency) : "—"}
            ora={foodCost.incassoCents}
            prima={incassoPrima.totalCents}
            confrontabile={foodCost.conti > 0 && incassoPrima.conti > 0}
          />
          {/* Misurata sui conti chiusi: senza un conto, un trattino. */}
          <TesseraConfronto
            href={`/insights/spesa?${periodoQuery}`}
            icona={Receipt}
            etichetta="Spesa media"
            valore={a.ospitiConConti > 0 ? formatCurrency(a.avgSpendCents, ctx.venue.currency) : "—"}
            ora={a.avgSpendCents}
            prima={prev.avgSpendCents}
            confrontabile={a.ospitiConConti > 0 && prev.ospitiConConti > 0}
          />
        </FilaConfronto>

        {/* La barra **sotto** i numeri: i numeri del periodo valgono per
            tutte e quattro le viste, la barra sceglie cosa guardare dopo. */}
        <SchedeViste from={fromKey} to={toKey} />

        {/* ---- COM'È ANDATA ---- */}
        {vistaAttiva === "andamento" && (
          <>

            {/* La curva accanto alla sintesi: si guarda il disegno e si legge
                il perché, senza scorrere. */}
            <section className="grid gap-3 md:gap-4 lg:flex-1 lg:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)] [&>*]:min-w-0">
              <Card className="card-notch flex flex-col">
                <CardHeader className="flex-row flex-wrap items-start justify-between gap-x-4 gap-y-2 space-y-0 pb-2">
                  <div>
                    <CardTitle>Coperti nel tempo</CardTitle>
                    <CardDescription>
                      {giorni > 62 ? "Settimana per settimana" : "Giorno per giorno"}, contro il periodo prima
                    </CardDescription>
                  </div>
                  <div className="pt-1">
                    <LegendaCurve />
                  </div>
                </CardHeader>
                <CardContent className="flex min-h-0 flex-1 flex-col pb-4">
                  <CopertiNelTempo punti={puntiNelTempo(fromKey, toKey, a.perGiorno, prev.perGiorno)} />
                </CardContent>
              </Card>

              <Card className="card-notch flex flex-col">
                <CardHeader className="pb-1">
                  <CardTitle>In breve</CardTitle>
                  <CardDescription>I problemi per primi</CardDescription>
                </CardHeader>
                <CardContent className="flex flex-1 flex-col">
                  <RigheSintesi righe={sintesi} />
                </CardContent>
              </Card>
            </section>

            {/* Completate, assenze e cancellazioni sono parti di un intero:
                una barra sola invece di tre tessere da sommare a mente. */}
            <Card className="card-notch">
              <CardHeader className="flex-row items-baseline justify-between gap-3 space-y-0 pb-3">
                <CardTitle>Come sono finite le prenotazioni</CardTitle>
                <span className="text-xs text-muted-foreground">
                  Su {a.bookings} · frecce in punti sul periodo prima
                </span>
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
          </>
        )}

        {/* ---- CIBO E CARTA ---- */}
        {vistaAttiva === "carta" && (
          /* Stessa serata, stessi piatti: la matrice si calcola sul
             rendiconto già letto invece di rifare le stesse letture. */
          <VistaCarta
            report={foodCost}
            matrice={foodCost.conti > 0 ? menuEngineering(foodCost) : null}
            currency={ctx.venue.currency}
          />
        )}

        {/* ---- SERVIZIO ---- */}
        {vistaAttiva === "servizio" && (
          <VistaServizio assenze={assenze} rotazione={rotazione} coda={codaAttesa} currency={ctx.venue.currency} />
        )}

        {/* ---- DOMANDA E OSPITI ---- */}
        {vistaAttiva === "domanda" && (
          <>
            {/* La settimana che arriva e i giorni con margine, affiancati. */}
            <section className="grid gap-3 md:gap-4 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)] [&>*]:min-w-0">
              <Previsione giorni={previsione} />
              <Margine occupazione={occupazione} inattivi={inattivi.length} />
            </section>

            {/* Il telefono sta in «Domanda e ospiti» e non in una quinta vista:
              una telefonata è domanda che arriva da un altro canale, e le
              domande che si fanno a questa pagina sono quattro — non cinque.
              Sta sopra le fonti di prenotazione, che è la sua parente più
              vicina. */}
            {numeriDelTelefono && (
              <TelefonoPanel
                numeri={numeriDelTelefono}
                periodoGiorni={giorni}
              />
            )}
            <VotiOspiti stats={nps} funnel={ponteRecensioni} giorni={giorniVoti} />
            <section className="grid gap-6 lg:grid-cols-2 [&>*]:min-w-0">
              <Card>
                <CardHeader>
                  <CardTitle>Coperti per fascia oraria</CardTitle>
                  <CardDescription>
                    Distribuzione del flusso nel periodo selezionato
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <SlotChart data={a.slots} />
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Domanda per giorno e orario</CardTitle>
                  <CardDescription>
                    Coperti per giorno della settimana e fascia oraria
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <WeekdayHeatmap data={a.heatmap} />
                </CardContent>
              </Card>
            </section>
            {/* Da dove arrivano e chi sono, affiancati. */}
            <section className="grid gap-3 md:gap-4 xl:grid-cols-2 [&>*]:min-w-0">
              <Card className="card-notch">
                <CardHeader className="pb-3">
                  <CardTitle>Fonti di prenotazione</CardTitle>
                  <CardDescription>Da dove arrivano i tuoi ospiti, dalla più usata</CardDescription>
                </CardHeader>
                <CardContent>
                  <SourcesChart data={a.sources} />
                </CardContent>
              </Card>
              <ChiEVenuto ora={a} prima={prev} />
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
