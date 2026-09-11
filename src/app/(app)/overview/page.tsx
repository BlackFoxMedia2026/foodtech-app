import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Briefing } from "@/components/overview/briefing";
import { ProssimePrenotazioni } from "@/components/overview/prossime-prenotazioni";
import { QuickActions } from "@/components/overview/quick-actions";
import { WeekTrend } from "@/components/overview/week-trend";
import { getActiveVenue } from "@/lib/tenant";
import { getOverview } from "@/server/insights";

export const dynamic = "force-dynamic";

export default async function OverviewPage() {
  const ctx = await getActiveVenue();
  const data = await getOverview(ctx.venueId);

  const today = new Date().toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" });

  return (
    // Niente scroll: testata e briefing restano fissi, e tutto il resto sta
    // in una regione sola che prende l'altezza che avanza. La Panoramica è
    // una schermata che si **legge**, quindi il saluto in serif resta — su
    // una riga sola, con la data accanto invece che sotto.
    <div className="schermo animate-fade-in gap-4">
      <header className="fissa flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="hidden t-etichetta sm:block">
            {ctx.venue.name}
          </p>
          {/* Sul telefono il saluto sta su una riga e la data si nasconde: due
              righe di intestazione qui sono due prenotazioni in meno visibili. */}
          <h1 className="truncate text-display text-xl md:text-2xl">
            Buona giornata, {ctx.session.user?.name?.split(" ")[0] ?? "ospite"}.
            <span className="ml-2 hidden align-middle text-sm font-normal capitalize text-muted-foreground lg:inline">
              {today}
            </span>
          </h1>
        </div>

        {/* I gesti stanno qui, dove stanno i comandi in ogni altra schermata:
            a riposo quattro icone, il nome esce passandoci sopra o arrivandoci
            col tabulatore. Prima erano tre riquadri larghi in mezzo alla
            pagina, e lo spazio che liberano è quello in cui ora ci sta il
            grafico dell'andamento senza far scorrere niente. */}
        <QuickActions />
      </header>

      {/* Prima cosa in pagina: i numeri che si dicono alla brigata prima di
          aprire — prenotazioni, coperti, pienezza, incasso — un blocco per
          numero. `fissa` perché è la riga che la pagina promette di tenere
          ferma: in una colonna flex senza `shrink-0` sarebbe la prima cosa
          che si schiaccia su uno schermo basso. */}
      <Briefing
        prenotazioni={data.todayBookings.length}
        coperti={data.totalCovers}
        occupancyPct={data.occupancyPct}
        estimatedRevenueCents={data.estimatedRevenueCents}
        incasso={data.incasso}
        currency={ctx.venue.currency}
        deltaIncasso={data.comparisons.revenue}
      />

      {/*
        Due colonne **da tablet in su**. Impilate a 820 px diventavano due
        regioni che scorrono una sopra l'altra — due barre di scorrimento in
        una schermata che non dovrebbe averne nemmeno una. Sul telefono una
        regione sola, con tutto dentro: due colonne su 390 px diventano due
        finestrelle da settanta pixel, inservibili.

        Le due card finiscono **alla stessa altezza** e arrivano **in fondo
        alla schermata**. Le card sono direttamente le celle della griglia,
        quindi si stirano all'altezza della riga per conto loro
        (`align-items: stretch`), e la riga si stira all'altezza della fascia.

        Qui c'era `content-start`, e il motivo per cui c'era non vale più.
        Teneva la riga alta quanto il suo contenuto perché altrimenti il
        grafico scendeva fino in fondo mentre le prenotazioni restavano alte
        quanto le loro tre righe: due card accostate che finivano in due punti
        diversi. Il prezzo però si vedeva su ogni schermo alto — una fascia di
        pagina vuota sotto le due card, che su un 27 pollici erano trecento
        pixel di niente. Adesso si stirano **tutte e due**: il grafico lo
        faceva già, la finestra delle prenotazioni ha imparato a farlo
        (`rotazione.tsx`), e la schermata è piena come promette di essere una
        schermata che non scorre.

        E lo scorrimento, se serve, è **della sezione**: su uno schermo basso
        (1152 × 720, con i quattro numeri su due file) la riga è più alta
        dello spazio che avanza, e con `overflow-hidden` il fondo della card
        delle prenotazioni veniva tagliato senza modo di raggiungerlo. Una
        barra sola per la fascia tiene anche le due card allineate mentre
        scorre.
      */}
      <section className="fill min-h-0 space-y-4 overflow-y-auto md:grid md:grid-cols-[1.4fr_1fr] md:gap-4 md:space-y-0">
        {/*
          A sinistra le prenotazioni. Prima qui c'era **tutta** la giornata in
          una lista alta quanto la schermata, e a metà servizio erano quasi
          tutte «Completata»: il posto migliore della pagina raccontava cose
          già finite. Ora il mazzo tiene le tre che riguardano i prossimi
          minuti e «Calendario» porta a tutte — quindi la colonna è alta quanto
          basta, e l'andamento può starle **accanto** invece che sotto.
        */}
        <ProssimePrenotazioni bookings={data.todayBookings} picco={data.picco} />

        {/*
          A destra l'andamento, alto quanto le prenotazioni. Il grafico stava
          in fondo alla colonna sinistra, cioè sotto la linea dello schermo:
          per vedere come va la settimana bisognava scorrere una pagina che non
          dovrebbe scorrere. Qui è la prima cosa che si vede a destra, e della
          larghezza ci fa qualcosa — sette punti su una colonna stretta stavano
          schiacciati.

          Le assenze attese, che stavano qui sotto in un riquadro loro, si
          leggono in Prenotazioni: sono un fatto sulle prenotazioni della
          giornata, e là stanno nella riga che le conta.
        */}
        {/* `flex flex-col` sul riquadro e `min-h-0` in tutta la catena: è il
            grafico che si allunga fino a pareggiare la card accanto. Senza
            `min-h-0` a ogni livello un elemento flex non scende sotto
            l'altezza del proprio contenuto, e la colonna sforerebbe invece di
            adattarsi. */}
        <Card className="card-notch md:flex md:min-h-0 md:flex-col">
          <CardHeader className="py-3">
            <CardTitle className="text-base">Andamento settimanale</CardTitle>
            <CardDescription>
              Coperti ·{" "}
              <span className={data.weekComparisonPct >= 0 ? "text-sage-strong" : "text-destructive-soft"}>
                {data.weekComparisonPct >= 0 ? "▲" : "▼"} {Math.abs(data.weekComparisonPct)}% sulla
                settimana scorsa
              </span>
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-0 md:flex md:min-h-0 md:flex-1 md:flex-col">
            <WeekTrend data={data.trend} />
            <Link
              href="/insights"
              /* Non è un collegamento dentro una frase: è l'unica uscita
                 dal riquadro, quindi ha diritto a un bersaglio vero. */
              className="tocco-comodo mt-2 inline-flex min-h-[36px] items-center text-xs font-medium text-surface-brown-light hover:underline"
            >
              Vedi report completo
            </Link>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
