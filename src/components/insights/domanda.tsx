import Link from "next/link";
import { ArrowRight, Frown, Meh, MessageSquareQuote, Repeat2, Smile, Star, UserPlus, Users } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Spiega } from "@/components/insights/spiega";
import { cn, formatDate } from "@/lib/utils";
import type { DayForecast, WeekdayOccupancy } from "@/server/forecast";
import type { SurveyStats } from "@/server/surveys";
import type { ReviewFunnel } from "@/server/reviews";

/**
 * «Domanda e ospiti»: la previsione e i voti (19 nov 2026).
 *
 * Erano due rendiconti di righe: sette giorni con una barra sottile e una
 * frase ciascuno, sette giorni della settimana con «misurato su 5 giornate»
 * ripetuto sette volte, e un NPS fatto di quattro numeri, quattro riquadri e
 * un elenco di commenti a tutta larghezza. Adesso la settimana che arriva è
 * una fila di colonne da leggere in un colpo d'occhio, i giorni con margine
 * stanno accanto, e i voti sono un anello, una barra e i commenti in griglia.
 * Le regole stanno dietro la «i». Solo verde e oro.
 */

/* -------------------------------------------------------------------------- */
/*  La settimana che arriva                                                    */
/* -------------------------------------------------------------------------- */

function nomeGiorno(g: DayForecast): { alto: string; basso: string } {
  const [, m, d] = g.dateKey.split("-");
  const alto = g.giorniDaOggi === 0 ? "Oggi" : g.giorniDaOggi === 1 ? "Domani" : g.weekdayLabel.slice(0, 3);
  return { alto, basso: `${Number(d)}/${Number(m)}` };
}

export function Previsione({ giorni }: { giorni: DayForecast[] }) {
  const conPrevisione = giorni.filter((g) => g.forecastCovers != null);
  const primeFrasi = conPrevisione.map((g) => g.why.split(". ")[0] + ".");
  const comune = conPrevisione.length > 2 && new Set(primeFrasi).size === 1 ? primeFrasi[0] : null;
  const pieno = giorni.reduce<DayForecast | null>(
    (m, g) => (g.occupancyPct != null && (m?.occupancyPct ?? -1) < g.occupancyPct ? g : m),
    null,
  );
  const vuoto = giorni.reduce<DayForecast | null>(
    (m, g) => (g.occupancyPct != null && (m?.occupancyPct ?? 101) > g.occupancyPct ? g : m),
    null,
  );

  return (
    <Card className="card-notch flex flex-col">
      <CardHeader className="flex-row items-start justify-between gap-3 space-y-0 pb-3">
        <div>
          <CardTitle>Quanto sarai pieno</CardTitle>
          <CardDescription>
            {conPrevisione.length === 0
              ? "Serve qualche settimana di servizi registrati prima di poter prevedere"
              : "I prossimi sette giorni, già al netto delle assenze attese"}
          </CardDescription>
        </div>
        <Spiega titolo="Come prevediamo">
          {comune && <p>{comune}</p>}
          <p>
            Ogni giorno è confrontato con gli stessi giorni della settimana precedenti, guardando quanto era già
            prenotato alla stessa distanza dal servizio. Le assenze attese sono già sottratte. Dove la storia non
            basta, non prevediamo.
          </p>
        </Spiega>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-4">
        <ul className="grid flex-1 grid-cols-7 gap-1.5 sm:gap-2.5">
          {giorni.map((g) => {
            const cap = g.capacity ?? 0;
            const prev = g.forecastCovers;
            const pctPrev = cap && prev != null ? Math.min(100, (prev / cap) * 100) : 0;
            const pctPren = cap ? Math.min(100, (g.bookedCovers / cap) * 100) : 0;
            const n = nomeGiorno(g);
            const resto = comune && g.why.startsWith(comune) ? g.why.slice(comune.length).trim() : g.why;
            return (
              <li
                key={g.dateKey}
                className={cn(
                  "flex min-w-0 flex-col items-center rounded-2xl px-1 pb-2.5 pt-3 sm:px-2",
                  g.giorniDaOggi === 0 ? "bg-sage-strong/[0.08]" : "bg-card/50",
                )}
                title={`${g.bookedCovers} già prenotati${prev != null ? ` · ~${prev} a tavola` : ""}${cap ? ` su ${cap}` : ""}. ${resto}`}
              >
                <p className="font-mono text-base tabular-nums text-foreground sm:text-lg">
                  {g.occupancyPct != null ? `${g.occupancyPct}%` : "—"}
                </p>
                {/* La colonna: piena quanto la sala. */}
                <div className="relative mt-2 flex min-h-28 w-full max-w-12 flex-1 overflow-hidden rounded-lg bg-border/40">
                  <span
                    className={cn(
                      "absolute inset-x-0 bottom-0 bg-gradient-to-t",
                      g.giorniDaOggi === 0 ? "from-sage-strong to-sage-strong/70" : "from-accent to-accent/60",
                    )}
                    style={{ height: `${pctPrev || pctPren}%` }}
                  />
                </div>
                <p className="mt-2 hidden font-mono text-[11px] tabular-nums text-muted-foreground sm:block">
                  {prev != null ? `~${prev}` : g.bookedCovers}
                  {cap ? `/${cap}` : ""}
                </p>
                <p
                  className={cn(
                    "mt-1 text-xs",
                    g.giorniDaOggi <= 1 ? "font-semibold text-card-foreground" : "capitalize text-muted-foreground",
                  )}
                >
                  {/* Sul telefono sette colonne da 40 px: il nome corto del giorno. */}
                  <span className="sm:hidden">{g.weekdayLabel.slice(0, 3)}</span>
                  <span className="hidden sm:inline">{n.alto}</span>
                </p>
                <p className="text-[10px] text-muted-foreground/80">{n.basso}</p>
              </li>
            );
          })}
        </ul>

        {pieno && vuoto && pieno !== vuoto && (
          <div className="grid gap-2 sm:grid-cols-2">
            <p className="flex items-center gap-2.5 rounded-xl bg-accent-strong/10 px-3 py-2 text-sm">
              <span className="h-2 w-2 shrink-0 rounded-full bg-accent-strong" aria-hidden="true" />
              <span>
                <span className="font-medium capitalize text-card-foreground">{nomeLungo(pieno)}</span>
                <span className="text-muted-foreground"> il più pieno · {pieno.occupancyPct}%</span>
              </span>
            </p>
            <p className="flex items-center gap-2.5 rounded-xl bg-sage-strong/[0.08] px-3 py-2 text-sm">
              <span className="h-2 w-2 shrink-0 rounded-full bg-sage-strong" aria-hidden="true" />
              <span>
                <span className="font-medium capitalize text-card-foreground">{nomeLungo(vuoto)}</span>
                <span className="text-muted-foreground"> il più libero · {vuoto.occupancyPct}%</span>
              </span>
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function nomeLungo(g: DayForecast): string {
  if (g.giorniDaOggi === 0) return "oggi";
  if (g.giorniDaOggi === 1) return "domani";
  return g.weekdayLabel;
}

/* -------------------------------------------------------------------------- */
/*  Dove hai margine                                                           */
/* -------------------------------------------------------------------------- */

export function Margine({ occupazione, inattivi }: { occupazione: WeekdayOccupancy[]; inattivi?: number | null }) {
  const piuVuoto = occupazione.find((r) => r.occupancyPct != null) ?? null;
  const giornate = occupazione[0]?.giorni;
  const tutteUguali = occupazione.every((r) => r.giorni === giornate);

  return (
    <Card className="card-notch flex flex-col">
      <CardHeader className="flex-row items-start justify-between gap-3 space-y-0 pb-3">
        <div>
          <CardTitle>Dove hai margine</CardTitle>
          <CardDescription>Pienezza media per giorno, dal più libero</CardDescription>
        </div>
        <Spiega titolo="Come si misura">
          <p>
            Coperti prenotati in media per giorno della settimana, esclusi i disdetti e chi non si è presentato
            {tutteUguali && giornate ? `, su ${giornate} giornate per ciascun giorno` : ""}. È sui giorni liberi che una
            campagna o un&apos;offerta cambiano qualcosa: su un venerdì già pieno non cambiano niente.
          </p>
        </Spiega>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-4">
        {occupazione.length === 0 ? (
          <p className="text-sm text-muted-foreground">Ancora nessuna giornata misurata.</p>
        ) : (
          <ul className="flex flex-1 flex-col justify-between gap-2.5">
            {occupazione.map((r, i) => (
              <li
                key={r.weekday}
                className="grid grid-cols-[5.5rem_minmax(0,1fr)_3rem] items-center gap-3 text-sm"
                title={`${r.copertiMedi} coperti in media${r.capacity ? ` su ${r.capacity}` : ""} · misurato su ${r.giorni} giornate`}
              >
                <span className={cn("capitalize", i === 0 ? "font-semibold text-sage-strong" : "text-muted-foreground")}>
                  {r.label}
                </span>
                <span className="h-2 overflow-hidden rounded-full bg-border/50">
                  <span
                    className={cn("block h-full rounded-full", i === 0 ? "bg-sage-strong" : "bg-accent/60")}
                    style={{ width: `${Math.min(100, r.occupancyPct ?? 0)}%` }}
                  />
                </span>
                <span className="text-right font-mono text-xs tabular-nums text-foreground">
                  {r.occupancyPct != null ? `${r.occupancyPct}%` : r.copertiMedi}
                </span>
              </li>
            ))}
          </ul>
        )}

        {piuVuoto && inattivi != null && inattivi > 0 && (
          <Link
            href={`/campaigns/new?segmento=inattivi&nome=${encodeURIComponent(`Torna a trovarci di ${piuVuoto.label}`)}`}
            className="group mt-auto flex items-center justify-between gap-3 rounded-xl bg-sage-strong/[0.09] px-3.5 py-3 text-sm transition-colors hover:bg-sage-strong/15"
          >
            <span className="min-w-0">
              <span className="block font-medium text-card-foreground">
                Riempi il <span className="lowercase">{piuVuoto.label}</span>
              </span>
              <span className="block text-xs text-muted-foreground">
                {inattivi} {inattivi === 1 ? "cliente non viene" : "clienti non vengono"} da un po&apos;: scrivigli
              </span>
            </span>
            <ArrowRight className="h-4 w-4 shrink-0 text-sage-strong transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
          </Link>
        )}
      </CardContent>
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/*  Cosa pensano gli ospiti                                                    */
/* -------------------------------------------------------------------------- */

const SENTIMENTO = {
  PROMOTER: { icona: Smile, tinta: "bg-sage-strong/15 text-sage-strong" },
  PASSIVE: { icona: Meh, tinta: "bg-accent/20 text-card-foreground" },
  DETRACTOR: { icona: Frown, tinta: "bg-accent-strong/15 text-accent-strong" },
} as const;

/** L'NPS come mezzo anello: da -100 a +100, il centro è lo zero. */
function Arco({ nps }: { nps: number | null }) {
  const r = 40;
  const lungo = Math.PI * r;
  const quota = nps == null ? 0 : (nps + 100) / 200;
  return (
    <div className="relative h-24 w-44 shrink-0">
      <svg viewBox="0 0 100 56" className="h-full w-full" aria-hidden="true">
        <path d="M10 50 A40 40 0 0 1 90 50" fill="none" strokeWidth="9" strokeLinecap="round" className="stroke-border/70" />
        <path
          d="M10 50 A40 40 0 0 1 90 50"
          fill="none"
          strokeWidth="9"
          strokeLinecap="round"
          strokeDasharray={`${quota * lungo} ${lungo}`}
          style={{ stroke: "var(--trend-line)" }}
        />
      </svg>
      <div className="absolute inset-x-0 bottom-0 text-center">
        <p className="font-mono text-3xl leading-none tabular-nums text-foreground">
          {nps == null ? "—" : nps > 0 ? `+${nps}` : nps}
        </p>
        <p className="mt-1 text-[11px] uppercase tracking-wide text-muted-foreground">NPS</p>
      </div>
    </div>
  );
}

export function VotiOspiti({
  stats,
  funnel,
  giorni,
}: {
  stats: SurveyStats;
  funnel?: ReviewFunnel | null;
  giorni: number;
}) {
  if (stats.sent === 0) {
    return (
      <Card className="card-notch">
        <CardHeader>
          <CardTitle>Cosa pensano gli ospiti</CardTitle>
        </CardHeader>
        <CardContent>
          <EmptyState icon={Smile} title="Nessuna richiesta ancora inviata" compact>
            Il giorno dopo ogni visita Tavolo chiede all&apos;ospite com&apos;è andata, con una domanda sola.
          </EmptyState>
        </CardContent>
      </Card>
    );
  }

  const tot = Math.max(1, stats.responses);
  const fette = [
    { nome: "Promotori", n: stats.promoters, colore: "bg-sage-strong", icona: Smile },
    { nome: "Passivi", n: stats.passives, colore: "bg-accent/45", icona: Meh },
    { nome: "Detrattori", n: stats.detractors, colore: "bg-accent-strong", icona: Frown },
  ];
  const maxTrend = Math.max(1, ...stats.trend.map((t) => Math.abs(t.nps ?? 0)));

  return (
    <Card className="card-notch">
      <CardHeader className="flex-row items-start justify-between gap-3 space-y-0 pb-3">
        <div>
          <CardTitle>Cosa pensano gli ospiti</CardTitle>
          <CardDescription>
            {stats.responses} risposte su {stats.sent} richieste
            {stats.responseRate != null && ` · ${Math.round(stats.responseRate * 100)}% ha risposto`} · ultimi {giorni}{" "}
            giorni
          </CardDescription>
        </div>
        <Spiega titolo="Cos'è l'NPS">
          <p>
            Va da -100 a +100 e non è una media di voti: è la quota di promotori (voto 9-10) meno quella di
            detrattori (0-6). Un locale con metà ospiti entusiasti e metà delusi fa zero.
          </p>
          <p>
            Per le recensioni contiamo chi è arrivato sulla piattaforma: se poi l&apos;abbia scritta davvero lo sa solo
            Google.
          </p>
        </Spiega>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-5 lg:grid-cols-[auto_minmax(0,1fr)_minmax(0,1fr)] lg:items-center lg:gap-8">
          {/* Il punteggio. */}
          <div className="flex flex-col items-center">
            <Arco nps={stats.nps} />
            {stats.responses > 0 && stats.responses < 10 && (
              <p className="mt-1 text-[11px] text-muted-foreground">poche risposte: indicativo</p>
            )}
          </div>

          {/* Di cosa è fatto. */}
          <div>
            <div className="flex h-3 overflow-hidden rounded-full bg-border/50">
              {fette.map((f) =>
                f.n > 0 ? <span key={f.nome} className={cn("h-full", f.colore)} style={{ width: `${(f.n / tot) * 100}%` }} /> : null,
              )}
            </div>
            <ul className="mt-3 grid grid-cols-3 gap-2">
              {fette.map((f) => (
                <li key={f.nome} className="min-w-0">
                  <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <span className={cn("h-2.5 w-2.5 shrink-0 rounded-full", f.colore)} aria-hidden="true" />
                    {f.nome}
                  </p>
                  <p className="mt-0.5 font-mono text-xl tabular-nums text-foreground">{f.n}</p>
                </li>
              ))}
            </ul>
          </div>

          {/* Le ultime quattro settimane, e il ponte verso le recensioni. */}
          <div className="space-y-4">
            {stats.trend.some((t) => t.responses > 0) && (
              <div>
                <p className="text-xs text-muted-foreground">Ultime quattro settimane</p>
                <div className="mt-2 flex h-16 items-end gap-2">
                  {stats.trend.map((t, i) => (
                    <div
                      key={t.from}
                      className="flex h-full flex-1 flex-col items-center justify-end gap-1"
                      title={`${t.nps != null ? (t.nps > 0 ? `+${t.nps}` : t.nps) : "nessun voto"} · ${t.responses} risposte`}
                    >
                      <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
                        {t.nps != null ? (t.nps > 0 ? `+${t.nps}` : t.nps) : "—"}
                      </span>
                      <span
                        className={cn(
                          "w-full rounded-t-md",
                          t.nps == null ? "h-[3px] rounded-md bg-border/70" : i === stats.trend.length - 1 ? "bg-sage-strong" : "bg-sage-strong/40",
                        )}
                        style={t.nps != null ? { height: `${Math.max(8, (Math.abs(t.nps) / maxTrend) * 70)}%` } : undefined}
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}
            {funnel && funnel.promotori > 0 && (
              <div className="flex items-center gap-3 rounded-xl bg-accent-strong/10 px-3 py-2.5">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-accent-strong/15 text-accent-strong">
                  <Star className="h-4 w-4" aria-hidden="true" />
                </span>
                <p className="text-sm leading-snug">
                  <span className="font-mono font-medium tabular-nums text-card-foreground">
                    {funnel.arrivati} su {funnel.promotori}
                  </span>
                  <span className="text-muted-foreground"> promotori sono andati a scrivere una recensione</span>
                </p>
              </div>
            )}
          </div>
        </div>

        {stats.recentComments.length > 0 && (
          <div className="border-t border-border/60 pt-5">
            {/* Le parole dei clienti, dette come tali (19 nov 2026): prima
                sembravano righe di un registro — un numero in un tondo e una
                frase — e non si capiva chi le avesse scritte. */}
            <div className="flex items-center gap-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-accent-strong/15 text-accent-strong">
                <MessageSquareQuote className="h-4 w-4" aria-hidden="true" />
              </span>
              <div>
                <p className="text-[15px] font-semibold text-card-foreground">Le parole dei tuoi clienti</p>
                <p className="text-xs text-muted-foreground">
                  Le note che hanno lasciato nel sondaggio, il giorno dopo la visita
                </p>
              </div>
            </div>
            <ul className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {stats.recentComments.slice(0, 6).map((c) => {
                const t = SENTIMENTO[c.sentiment];
                const iniziali = (c.guestName ?? "Ospite")
                  .split(/\s+/)
                  .slice(0, 2)
                  .map((x) => x[0]?.toUpperCase())
                  .join("");
                const nome = c.guestName ?? "Un ospite";
                return (
                  <li
                    key={c.id}
                    className="relative flex flex-col rounded-2xl bg-card/70 p-4 pt-5 shadow-[0_1px_2px_rgba(16,32,26,0.05)] ring-1 ring-inset ring-border/60"
                  >
                    <span
                      className="pointer-events-none absolute right-4 top-1 select-none font-serif text-6xl leading-none text-accent/35"
                      aria-hidden="true"
                    >
                      &rdquo;
                    </span>
                    <blockquote className="text-display relative flex-1 pr-6 text-base font-normal italic leading-relaxed text-card-foreground">
                      {c.comment}
                    </blockquote>
                    <div className="mt-4 flex items-center gap-2.5 border-t border-border/50 pt-3">
                      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-sage-strong text-[11px] font-semibold text-white">
                        {iniziali}
                      </span>
                      <div className="min-w-0 flex-1">
                        {c.guestId ? (
                          <Link href={`/guests/${c.guestId}`} className="block truncate text-sm font-medium text-card-foreground hover:underline">
                            {nome}
                          </Link>
                        ) : (
                          <p className="truncate text-sm font-medium text-card-foreground">{nome}</p>
                        )}
                        <p className="text-[11px] text-muted-foreground">{formatDate(new Date(c.at))}</p>
                      </div>
                      <span
                        className={cn("shrink-0 rounded-full px-2.5 py-1 text-xs font-medium", t.tinta)}
                        title={`Ha dato ${c.score} su 10`}
                      >
                        ha dato <span className="font-mono font-semibold tabular-nums">{c.score}/10</span>
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/*  Chi è venuto                                                               */
/* -------------------------------------------------------------------------- */

type Conto = { totalGuests: number; newGuests: number; repeatGuests: number };

function Variazione({ ora, prima }: { ora: number; prima: number }) {
  if (prima === 0) return <span className="text-[11px] text-muted-foreground">nessun confronto</span>;
  const v = Math.round(((ora - prima) / prima) * 100);
  return (
    <span
      className={cn(
        "inline-flex w-fit items-center rounded-full px-2 py-0.5 font-mono text-[11px] font-medium tabular-nums",
        v === 0 ? "bg-border/60 text-muted-foreground" : v > 0 ? "bg-sage-strong/15 text-sage-strong" : "bg-accent-strong/15 text-accent-strong",
      )}
      title={`Periodo prima: ${prima}`}
    >
      {v === 0 ? "=" : v > 0 ? "▲" : "▼"} {Math.abs(v)}%
    </span>
  );
}

/**
 * Chi è venuto nel periodo (19 nov 2026).
 *
 * Erano due card con un numero grande, una percentuale, una riga di
 * confronto e un pulsante: «0 nuovi» e «49 ricorrenti, 100%» stavano in due
 * riquadri separati e non si capiva che fossero parti dello stesso insieme.
 * Adesso è una card sola: il totale, una barra che lo divide fra chi torna e
 * chi è alla prima visita, e tre tessere con il periodo prima.
 */
export function ChiEVenuto({ ora, prima }: { ora: Conto; prima: Conto }) {
  const tot = ora.totalGuests;
  const tornati = ora.repeatGuests;
  const primaVolta = Math.max(0, tot - tornati);
  const pctTornati = tot ? Math.round((tornati / tot) * 100) : 0;

  const tessere = [
    { icona: Users, valore: tot, nome: "ospiti venuti", prima: prima.totalGuests },
    { icona: Repeat2, valore: tornati, nome: "sono tornati", prima: prima.repeatGuests },
    { icona: UserPlus, valore: ora.newGuests, nome: "profili nuovi", prima: prima.newGuests },
  ];

  return (
    <Card className="card-notch">
      <CardHeader className="flex-row items-start justify-between gap-3 space-y-0 pb-3">
        <div>
          <CardTitle>Chi è venuto</CardTitle>
          <CardDescription>
            {tot === 0
              ? "Nessun ospite con un profilo nel periodo"
              : `${pctTornati}% dei tuoi ospiti era già stato da te`}
          </CardDescription>
        </div>
        <Link
          href="/guests"
          className="group flex shrink-0 items-center gap-1 rounded-full bg-sage-strong/[0.09] px-3 py-1.5 text-sm font-medium text-sage-strong transition-colors hover:bg-sage-strong/15"
        >
          Vai a Ospiti
          <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
        </Link>
      </CardHeader>
      <CardContent className="space-y-5">
        {tot > 0 && (
          <div>
            <div className="flex h-3 overflow-hidden rounded-full bg-border/50">
              {tornati > 0 && <span className="h-full bg-sage-strong" style={{ width: `${(tornati / tot) * 100}%` }} />}
              {primaVolta > 0 && <span className="h-full bg-accent/60" style={{ width: `${(primaVolta / tot) * 100}%` }} />}
            </div>
            <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-sage-strong" aria-hidden="true" />
                Tornati <span className="font-mono tabular-nums text-foreground">{tornati}</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-accent/60" aria-hidden="true" />
                Alla prima visita <span className="font-mono tabular-nums text-foreground">{primaVolta}</span>
              </span>
            </div>
          </div>
        )}
        <ul className="grid gap-2">
          {tessere.map((t) => {
            const Icona = t.icona;
            return (
              <li key={t.nome} className="flex items-center gap-3 rounded-2xl bg-card/60 p-3 ring-1 ring-inset ring-border/60">
                <span className="vetro kpi-pastiglia grid h-10 w-10 shrink-0 place-items-center rounded-full">
                  <Icona className="h-5 w-5" stroke="url(#trattoVetro)" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-mono text-2xl leading-none tabular-nums text-foreground">{t.valore}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{t.nome}</p>
                </div>
                <Variazione ora={t.valore} prima={t.prima} />
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
