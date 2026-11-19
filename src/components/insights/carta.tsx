import Link from "next/link";
import { ArrowRight, ChefHat, Info, Megaphone, RefreshCw, ThumbsUp, TrendingUp } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Spiega } from "@/components/insights/spiega";
import { cn, formatCurrency } from "@/lib/utils";
import type { FoodCostReport } from "@/server/food-cost";
import {
  MINIMO_VENDITE_PIATTO,
  type MenuEngineering,
  type Quadrante,
} from "@/server/menu-engineering";

/**
 * La vista «Cibo e carta» (18 nov 2026).
 *
 * Erano due rendiconti di testo: tre riquadri di numeri, una nota, una
 * tabella a cinque colonne, due elenchi di piatti esclusi (gli stessi cinque
 * piatti, scritti due volte) e quattro gruppi di piatti con un paragrafo
 * ciascuno. Adesso: un anello per «quanto resta», una barra per piatto, una
 * matrice per la carta. Le regole del calcolo ci sono ancora tutte, dietro
 * la «i» — una vista che si legge non è una vista che nasconde il suo metro.
 */

/* -------------------------------------------------------------------------- */
/*  Pezzi comuni                                                               */
/* -------------------------------------------------------------------------- */

/** L'anello: quanto si mangia la materia prima, quanto resta. */
function Anello({ restaPct }: { restaPct: number }) {
  const r = 42;
  const c = 2 * Math.PI * r;
  const resta = (Math.max(0, Math.min(100, restaPct)) / 100) * c;
  return (
    <div className="relative h-40 w-40 shrink-0">
      <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90" aria-hidden="true">
        <circle cx="50" cy="50" r={r} fill="none" strokeWidth="9" className="stroke-accent/70" />
        <circle
          cx="50"
          cy="50"
          r={r}
          fill="none"
          strokeWidth="9"
          strokeLinecap="round"
          strokeDasharray={`${resta} ${c}`}
          style={{ stroke: "var(--trend-line)" }}
        />
      </svg>
      <div className="absolute inset-0 grid place-content-center text-center">
        <p className="font-mono text-4xl leading-none tabular-nums text-foreground">{restaPct}%</p>
        <p className="mt-1.5 text-xs text-muted-foreground">resta</p>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  La vista                                                                   */
/* -------------------------------------------------------------------------- */

export function VistaCarta({
  report,
  matrice,
  currency,
}: {
  report: FoodCostReport;
  matrice: MenuEngineering | null;
  currency: string;
}) {
  const euro = (c: number) => formatCurrency(c, currency);

  if (report.conti === 0) {
    return (
      <Card className="card-notch">
        <CardContent className="pt-6">
          <EmptyState icon={ChefHat} compact title="Nessun conto chiuso nel periodo">
            Il costo del cibo si calcola sui conti chiusi. Apri un conto dalla scheda della prenotazione in
            Servizio, batti i piatti e incassa: da lì questi numeri diventano veri.
          </EmptyState>
        </CardContent>
      </Card>
    );
  }

  const senza = report.senzaCosto.length;
  const maxIncasso = Math.max(1, ...report.piatti.map((p) => p.incassoCents));

  return (
    <>
      <section className="grid gap-3 md:gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.7fr)] [&>*]:min-w-0">
        {/* ---- Quanto è rimasto ---- */}
        <Card className="card-notch flex flex-col">
          <CardHeader className="flex-row items-start justify-between gap-3 space-y-0 pb-2">
            <div>
              <CardTitle>Quanto è rimasto</CardTitle>
              <CardDescription>
                {report.conti} {report.conti === 1 ? "conto chiuso" : "conti chiusi"}, {euro(report.incassoCents)}
              </CardDescription>
            </div>
            <Spiega titolo="Come si calcola">
              <p>
                Le percentuali valgono sui {euro(report.incassoCopertoCents)} di cui conosciamo il costo
                ({report.coperturaPct}% dell&apos;incasso), non su tutto l&apos;incasso. Non le estendiamo al
                resto: sarebbe una moltiplicazione, non una misura.
              </p>
              {report.fuoriCartaCents > 0 && (
                <p>
                  {euro(report.fuoriCartaCents)} arrivano da righe scritte a mano sul conto: un costo non possono
                  averlo, e restano fuori dal calcolo.
                </p>
              )}
            </Spiega>
          </CardHeader>
          <CardContent className="flex flex-1 flex-col gap-5">
            {report.foodCostPct == null ? (
              <p className="text-sm leading-relaxed text-muted-foreground">
                Non sappiamo il costo di nessuno dei piatti venduti: l&apos;incasso si vede, quello che resta no.
              </p>
            ) : (
              <div className="flex flex-1 flex-col items-center justify-center gap-5 py-2">
                <Anello restaPct={100 - report.foodCostPct} />
                <dl className="grid w-full grid-cols-2 gap-3 text-center">
                  <div>
                    <dt className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
                      <span className="h-2.5 w-2.5 rounded-full bg-[color:var(--trend-line)]" aria-hidden="true" />
                      Resta
                    </dt>
                    <dd className="mt-0.5 font-mono text-2xl tabular-nums text-foreground">
                      {euro(report.margineCents)}
                    </dd>
                  </div>
                  <div>
                    <dt className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
                      <span className="h-2.5 w-2.5 rounded-full bg-accent/70" aria-hidden="true" />
                      Materie prime
                    </dt>
                    <dd className="mt-0.5 font-mono text-2xl tabular-nums text-muted-foreground">
                      {euro(report.costoCents)}
                    </dd>
                  </div>
                </dl>
              </div>
            )}

            <div className="space-y-2">
              {/* La copertura: senza, «26%» sembra il food cost del locale. */}
              <div>
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>Misurato su</span>
                  <span className="font-mono tabular-nums text-foreground">{report.coperturaPct}% dell&apos;incasso</span>
                </div>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-border/60">
                  <div className="h-full rounded-full bg-sage-strong/70" style={{ width: `${report.coperturaPct}%` }} />
                </div>
              </div>
              {senza > 0 && (
                <Link
                  href="/menu?filtro=senza_costo"
                  className="group flex items-center justify-between gap-3 rounded-xl bg-accent-strong/10 px-3.5 py-2.5 text-sm transition-colors hover:bg-accent-strong/15"
                >
                  <span>
                    <span className="font-medium text-card-foreground">
                      {senza === 1 ? "1 piatto senza costo" : `${senza} piatti senza costo`}
                    </span>
                    <span className="text-muted-foreground"> · restano fuori</span>
                  </span>
                  <span className="flex items-center gap-1 font-medium text-accent-strong">
                    Completa
                    <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                  </span>
                </Link>
              )}
            </div>
          </CardContent>
        </Card>

        {/* ---- Piatti per margine ---- */}
        <Card className="card-notch">
          <CardHeader className="flex-row items-start justify-between gap-3 space-y-0 pb-3">
            <div>
              <CardTitle>Piatti, dal margine più alto</CardTitle>
              <CardDescription>La barra è l&apos;incasso del piatto: in verde quello che resta</CardDescription>
            </div>
            <Spiega titolo="Perché nessun colore di allarme">
              <p>
                In cima i piatti che tengono su il conto, in fondo quelli che lo affondano. Nessuna soglia decisa
                da noi su cosa sia un buon margine: cambia troppo fra un antipasto e una bottiglia.
              </p>
            </Spiega>
          </CardHeader>
          <CardContent>
            {report.piatti.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nessun piatto venduto ha un costo dichiarato.</p>
            ) : (
              <ul className="space-y-2.5">
                {report.piatti.map((p) => {
                  const larga = (p.incassoCents / maxIncasso) * 100;
                  const resta = p.incassoCents > 0 ? ((p.margineCents ?? 0) / p.incassoCents) * 100 : 0;
                  return (
                    <li
                      key={p.menuItemId ?? p.name}
                      className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 sm:grid-cols-[minmax(10rem,16rem)_minmax(0,1fr)_7.5rem]"
                      title={`${p.quantita} venduti · incasso ${euro(p.incassoCents)} · costo ${euro(p.costoCents ?? 0)}`}
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm text-card-foreground">{p.name}</p>
                        <p className="text-[11px] tabular-nums text-muted-foreground">{p.quantita} venduti</p>
                      </div>
                      <div className="col-span-2 row-start-2 h-2 sm:col-span-1 sm:row-start-auto">
                        <div className="flex h-full overflow-hidden rounded-full" style={{ width: `${larga}%` }}>
                          <span className="h-full bg-[color:var(--trend-line)]" style={{ width: `${resta}%` }} />
                          <span className="h-full flex-1 bg-accent/60" />
                        </div>
                      </div>
                      <p className="col-start-2 row-start-1 text-right font-mono text-sm tabular-nums text-foreground sm:col-start-3">
                        {euro(p.margineCents ?? 0)}
                        <span className="ml-1.5 text-[11px] text-muted-foreground">{p.marginePct}%</span>
                      </p>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </section>

      {matrice && <Matrice dati={matrice} euro={euro} />}
    </>
  );
}

/* -------------------------------------------------------------------------- */
/*  La matrice della carta                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Cosa fare con i piatti: **una colonna per azione**.
 *
 * Tre tentativi (18 nov 2026): i nomi del menu engineering non si capivano;
 * il quadrato con gli assi nemmeno; l'elenco di frasi si capiva ma non si
 * leggeva — la stessa frase lunga ripetuta piatto per piatto. Adesso il
 * perché si dice **una volta**, in testa alla colonna, e per ogni piatto
 * restano due numeri: quante volte l'hanno ordinato e quanto ti lascia,
 * colorato rispetto alla media della carta.
 */
type Gruppo = {
  q: Quadrante;
  azione: string;
  perche: string;
  icona: typeof Info;
  tinta: string;
  bordo: string;
};

const GRUPPI: Gruppo[] = [
  {
    q: "cavallo",
    azione: "Alza il prezzo",
    perche: "Li ordinano spesso, ma ti lasciano poco",
    icona: TrendingUp,
    tinta: "bg-accent-strong/15 text-accent-strong",
    bordo: "border-t-accent",
  },
  {
    q: "cane",
    azione: "Toglili o rifalli",
    perche: "Li ordinano poco e ti lasciano poco",
    icona: RefreshCw,
    tinta: "bg-destructive-soft/15 text-destructive-soft",
    bordo: "border-t-destructive-soft",
  },
  {
    q: "enigma",
    azione: "Falli conoscere",
    perche: "Ti lasciano bene, ma li ordinano poco",
    icona: Megaphone,
    tinta: "bg-accent-strong/15 text-accent-strong",
    bordo: "border-t-accent-strong",
  },
  {
    q: "stella",
    azione: "Vanno bene così",
    perche: "Li ordinano spesso e ti lasciano bene",
    icona: ThumbsUp,
    tinta: "bg-sage-strong/15 text-sage-strong",
    bordo: "border-t-sage-strong",
  },
];

function Matrice({ dati, euro }: { dati: MenuEngineering; euro: (c: number) => string }) {
  // Si mostrano solo i gruppi con dei piatti: una colonna vuota è rumore.
  const gruppi = GRUPPI.map((g) => ({
    ...g,
    piatti: dati.piatti.filter((p) => p.quadrante === g.q).sort((x, y) => y.quantita - x.quantita),
  })).filter((g) => g.piatti.length > 0);

  return (
    <Card className="card-notch">
      <CardHeader className="flex-row items-start justify-between gap-3 space-y-0 pb-3">
        <div>
          <CardTitle>Cosa fare con i piatti</CardTitle>
          {dati.abbastanzaDati && (
            <CardDescription>
              In media un piatto ti lascia <span className="font-medium text-card-foreground">{euro(dati.margineMedioCents)}</span>
            </CardDescription>
          )}
        </div>
        <Spiega titolo="Come lo decidiamo">
          {dati.abbastanzaDati ? (
            <p>
              Ogni piatto è confrontato con gli altri della carta su due cose: quante volte lo ordinano («spesso»
              vuol dire almeno il {dati.sogliaPopolaritaPct}% delle vendite) e quanto ti lascia a piatto, tolto il
              costo delle materie prime («bene» vuol dire più della media, {euro(dati.margineMedioCents)}). Calcolato
              su {dati.vendutiClassificati} piatti venduti nel periodo.
            </p>
          ) : null}
          {dati.esclusi.length > 0 && (
            <p>
              Non giudichiamo {dati.esclusi.length === 1 ? "un piatto" : `${dati.esclusi.length} piatti`}:{" "}
              {dati.esclusi
                .slice(0, 8)
                .map((e) => e.name)
                .join(", ")}
              {dati.esclusi.length > 8 ? ` e altri ${dati.esclusi.length - 8}` : ""}. Manca il costo, o è stato
              venduto meno di {MINIMO_VENDITE_PIATTO} volte.
            </p>
          )}
        </Spiega>
      </CardHeader>
      <CardContent>
        {!dati.abbastanzaDati ? (
          <p className="text-sm leading-relaxed text-muted-foreground">
            Ancora presto per dirlo. {dati.perche} Preferiamo non dare consigli su due coperti.
          </p>
        ) : (
          <ul
            className={cn(
              "grid gap-3",
              gruppi.length >= 3 ? "md:grid-cols-3" : "md:grid-cols-2",
              gruppi.length === 4 && "xl:grid-cols-4",
            )}
          >
            {gruppi.map((g) => {
              const Icona = g.icona;
              return (
                <li key={g.q} className={cn("rounded-2xl border-t-[3px] bg-card/50 p-4", g.bordo)}>
                  <div className="flex items-center gap-2.5">
                    <span className={cn("grid h-8 w-8 shrink-0 place-items-center rounded-full", g.tinta)}>
                      <Icona className="h-4 w-4" aria-hidden="true" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-[15px] font-semibold leading-tight text-card-foreground">{g.azione}</p>
                      <p className="text-xs text-muted-foreground">{g.perche}</p>
                    </div>
                  </div>

                  <div className="mt-4 flex items-center justify-between border-b border-border/60 pb-1.5 text-[11px] uppercase tracking-wide text-muted-foreground/80">
                    <span>Piatto</span>
                    <span className="flex gap-4">
                      <span className="w-14 text-right">Ordinato</span>
                      <span className="w-16 text-right">Ti lascia</span>
                    </span>
                  </div>
                  <ul className="divide-y divide-border/50">
                    {g.piatti.map((p) => {
                      const sopra = p.margineUnitCents >= dati.margineMedioCents;
                      return (
                        <li key={p.menuItemId ?? p.name} className="flex items-center justify-between gap-3 py-2 text-sm">
                          <span className="min-w-0 truncate text-card-foreground" title={p.name}>
                            {p.name}
                          </span>
                          <span className="flex shrink-0 gap-4 font-mono tabular-nums">
                            <span className="w-14 text-right text-muted-foreground">{p.quantita}×</span>
                            <span className={cn("w-16 text-right", sopra ? "text-sage-strong" : "text-destructive-soft")}>
                              {euro(p.margineUnitCents)}
                            </span>
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
