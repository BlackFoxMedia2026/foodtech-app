"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Base } from "@/components/ui/base-del-numero";
import { ComparisonStat } from "@/components/insights/comparison-stat";
import { accorda } from "@/lib/accordo";
import { formatCurrency, formatDate } from "@/lib/utils";
import { MINIMO_VENDITE_PIATTO } from "@/server/menu-engineering";
import { SETTIMANE_ANDAMENTO, type RendimentoPiatto } from "@/server/menu";

/**
 * Le vendite di un piatto.
 *
 * Erano sei riquadri identici in fila — sei numeri della stessa misura, dello
 * stesso colore, nella stessa scatola — e sei cose tutte importanti allo
 * stesso modo sono sei cose di cui non se ne guarda nessuna. Un elenco di
 * valori non è un'analisi: dice quanto, non **come sta andando**.
 *
 * Adesso la sezione risponde a tre domande diverse, e ognuna ha la forma che
 * le serve:
 *
 * - **come sta andando** — dodici settimane di porzioni, a barre: la forma
 *   giusta per una quantità nel tempo, e l'unica che mostra una stagionalità
 *   o una caduta;
 * - **sta salendo o scendendo** — gli ultimi trenta giorni contro i trenta
 *   precedenti, con la freccia. Se prima non aveva venduto niente il
 *   confronto **non si fa**: `computeDelta` non inventa un +100% su una base
 *   zero, ed è lo stesso confronto che usa Analisi;
 * - **quanto pesa** — la quota sulle porzioni della sua categoria, con il
 *   posto che occupa. Il confronto è fra vicini di carta: dire che una
 *   tartare vende meno del pane sarebbe vero e inutile.
 *
 * Quello che resta è una riga sola in fondo: totali, conti, incasso, ultima
 * volta. Sono i numeri di servizio — si cercano, non si sorvegliano.
 *
 * Nessuna cifra è stimata: vengono tutte dalle righe dei conti chiusi. Per
 * questo il riquadro porta il segno «misurato», lo stesso che il prodotto usa
 * dove un numero non è dedotto.
 */

/** Il terracotta chiaro dei grafici, lo stesso dell'andamento in Panoramica. */
const TERRACOTTA = "#C29B72";

/** «1 porzioni» non è italiano: la parola si accorda col numero. */
const PORZIONI: [string, string] = ["porzione", "porzioni"];

export function MenuItemSales({ dati, currency }: { dati: RendimentoPiatto; currency: string }) {
  if (!dati.ciSonoConti) {
    return (
      <Sezione>
        <p className="text-sm text-muted-foreground">
          Nessun conto è ancora stato chiuso in questo locale: sulle vendite di questo piatto non c&apos;è
          ancora niente da dire.
        </p>
      </Sezione>
    );
  }

  if (dati.quantitaTotale === 0) {
    return (
      <Sezione>
        <p className="text-sm text-muted-foreground">
          Questo piatto non è ancora comparso su nessun conto chiuso.
        </p>
      </Sezione>
    );
  }

  const nelPeriodo = dati.settimane.reduce((n, s) => n + s.quantita, 0);
  const serie = dati.settimane.map((s) => ({
    /* Una data corta: «15 lug». Con dodici barre le etichette lunghe si
       accavallano, e una barra senza data non dice niente. */
    etichetta: new Intl.DateTimeFormat("it-IT", { day: "numeric", month: "short" }).format(s.inizio),
    quantita: s.quantita,
  }));

  return (
    <Sezione>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,18rem)]">
        <div className="riquadro comodo">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="t-etichetta">Porzioni per settimana</p>
            <p className="t-nota">ultime {SETTIMANE_ANDAMENTO} settimane</p>
          </div>

          {nelPeriodo === 0 ? (
            <p className="mt-6 text-sm text-muted-foreground">
              Nessuna vendita nelle ultime {SETTIMANE_ANDAMENTO} settimane.
              {dati.ultimaVendita && <> L&apos;ultima è del {formatDate(dati.ultimaVendita)}.</>}
            </p>
          ) : (
            <div className="mt-3 h-40 w-full md:h-48">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={serie} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="hsl(var(--border))"
                    vertical={false}
                    opacity={0.4}
                  />
                  <XAxis
                    dataKey="etichetta"
                    stroke="hsl(var(--card-foreground) / 0.65)"
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                    interval="preserveStartEnd"
                    minTickGap={12}
                  />
                  <YAxis
                    stroke="hsl(var(--card-foreground) / 0.65)"
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                    width={28}
                    allowDecimals={false}
                  />
                  <Tooltip
                    cursor={{ fill: "hsl(var(--secondary))", opacity: 0.4 }}
                    labelFormatter={(v) => `Settimana del ${v}`}
                    formatter={(v: number) => [`${v} ${accorda(PORZIONI, v)}`, ""]}
                    contentStyle={{
                      borderRadius: 8,
                      border: "1px solid hsl(var(--border))",
                      fontSize: 12,
                      background: "hsl(var(--card))",
                      color: "hsl(var(--card-foreground))",
                    }}
                  />
                  {/* Una serie sola, quindi un colore solo e nessuna legenda:
                      il titolo sopra dice già che cosa si sta contando. */}
                  <Bar dataKey="quantita" fill={TERRACOTTA} radius={[4, 4, 0, 0]} maxBarSize={34} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <div className="space-y-3">
          {/* La soglia è quella del menu engineering: sotto tre vendite di un
              piatto non si dice niente, e men che meno «+13300%». */}
          <ComparisonStat
            label="Ultimi 30 giorni"
            current={dati.quantita30}
            previous={dati.quantita30Precedenti}
            minPrecedente={MINIMO_VENDITE_PIATTO}
            format={(v) => `${v} ${accorda(PORZIONI, v)}`}
          />
          <QuotaCategoria dati={dati.nellaCategoria} />
        </div>
      </div>

      {/* I numeri di servizio: una riga, non sei scatole. */}
      <dl className="mt-4 flex flex-wrap items-baseline gap-x-5 gap-y-2 text-sm">
        <Voce etichetta="in tutto" valore={`${dati.quantitaTotale} ${accorda(PORZIONI, dati.quantitaTotale)}`} />
        <Voce etichetta="ultimi 7 giorni" valore={`${dati.quantita7} ${accorda(PORZIONI, dati.quantita7)}`} />
        <Voce etichetta={dati.contiTotali === 1 ? "conto" : "conti"} valore={String(dati.contiTotali)} />
        <Voce etichetta="incassati" valore={formatCurrency(dati.incassoCents, currency)} />
        {dati.ultimaVendita && (
          <Voce etichetta={quandoInParole(dati.ultimaVendita)} valore={formatDate(dati.ultimaVendita)} />
        )}
      </dl>
    </Sezione>
  );
}

function Sezione({ children }: { children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-center justify-between gap-2 space-y-0">
        <CardTitle>Vendite</CardTitle>
        <Base
          base="misurato"
          dettaglio="Dalle righe dei conti chiusi: quelli aperti sono serate in corso, quelli annullati non sono vendite. Nessuna stima."
        />
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function Voce({ etichetta, valore }: { etichetta: string; valore: string }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <dt className="sr-only">{etichetta}</dt>
      <dd className="tabular-nums">{valore}</dd>
      <span className="t-nota" aria-hidden="true">
        {etichetta}
      </span>
    </div>
  );
}

/**
 * Quanto pesa nella sua parte di carta.
 *
 * La barra è la quota sulle porzioni della categoria negli ultimi trenta
 * giorni; il posto accanto dice se è il piatto che tiene in piedi la sezione
 * o quello che nessuno ordina. Senza vendite nella categoria non c'è quota:
 * una percentuale su zero è una divisione per zero travestita da dato.
 */
function QuotaCategoria({ dati }: { dati: RendimentoPiatto["nellaCategoria"] }) {
  if (!dati) {
    return (
      <div className="riquadro p-3">
        <p className="t-etichetta">Nella categoria</p>
        <p className="mt-1 text-display text-xl">—</p>
        <p className="text-xs text-muted-foreground">
          Negli ultimi 30 giorni questa categoria non ha venduto niente.
        </p>
      </div>
    );
  }

  const quota = Math.round((dati.porzioni / dati.porzioniCategoria) * 100);

  return (
    <div className="riquadro p-3">
      <p className="t-etichetta">In {dati.categoria}</p>
      <div className="mt-1 flex items-baseline gap-2">
        <p className="text-display text-xl tabular-nums">{quota}%</p>
        <span className="text-xs text-muted-foreground">
          {dati.posizione}º su {dati.quantiPiatti} {dati.quantiPiatti === 1 ? "piatto" : "piatti"}
        </span>
      </div>
      <div
        className="mt-2 h-2 w-full overflow-hidden rounded-full bg-secondary"
        role="img"
        aria-label={`${quota}% delle porzioni di ${dati.categoria} negli ultimi 30 giorni`}
      >
        <div className="h-full rounded-full bg-accent" style={{ width: `${Math.max(quota, 2)}%` }} />
      </div>
      <p className="mt-1.5 text-xs text-muted-foreground">
        {dati.porzioni} {accorda(PORZIONI, dati.porzioni)} su {dati.porzioniCategoria} della categoria,
        ultimi 30 giorni
      </p>
    </div>
  );
}

/**
 * «2 giorni fa», «oggi»: una data da sola non dice se è roba di ieri.
 *
 * I giorni si contano sul **calendario**, non sulle ore trascorse: una
 * vendita di ieri sera dista meno di ventiquattro ore, e scrivere «venduto
 * oggi» accanto alla data di ieri è una schermata che si contraddice da sola.
 */
function quandoInParole(quando: Date): string {
  const aMezzanotte = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const giorni = Math.round((aMezzanotte(new Date()) - aMezzanotte(new Date(quando))) / (24 * 60 * 60 * 1000));
  if (giorni <= 0) return "venduto oggi";
  if (giorni === 1) return "ieri";
  if (giorni < 30) return `${giorni} giorni fa`;
  const mesi = Math.round(giorni / 30);
  return mesi === 1 ? "un mese fa" : `${mesi} mesi fa`;
}
