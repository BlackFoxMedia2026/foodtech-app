"use client";

import { Bar, ComposedChart, CartesianGrid, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { AndamentoCampagna as Dati } from "@/server/dem/statistiche";
import { ORO, VERDE } from "./risultati-visivi";

/**
 * Le prime 48 ore, ora per ora (11 novembre 2026): il «24-hour performance»
 * dei report di Mailchimp, allungato a due giorni perché un ristorante manda
 * spesso la sera e la gente apre la mattina dopo.
 *
 * Una scala sola: i click stanno sotto le aperture, sullo stesso asse — mai
 * un secondo asse a destra. Le aperture sono colonne verdi (con pochi numeri
 * interi una curva fa onde che non esistono), i click la linea oro
 * **tratteggiata**: la coppia di colori è al limite per la protanopia, e
 * il tratto li distingue anche senza colore. La legenda è scritta, sopra.
 */
export function AndamentoCampagna({ dati, inizio }: { dati: Dati; inizio: string }) {
  const partenza = new Date(inizio);
  const etichetta = (ora: number) => {
    const d = new Date(partenza.getTime() + ora * 3_600_000);
    return `${String(d.getHours()).padStart(2, "0")}:00`;
  };
  /* L'asse finisce poco dopo l'ultima ora con qualcosa (almeno 24 ore):
     una lunga coda di zeri schiaccia la parte che conta. */
  let ultima = 0;
  dati.ore.forEach((o) => {
    if (o.aperture > 0 || o.click > 0) ultima = o.ora;
  });
  const ore = dati.ore.slice(0, Math.min(48, Math.max(24, ultima + 4)));
  const quotaSei = dati.aperteTotali > 0 ? Math.round((dati.entroSeiOre / dati.aperteTotali) * 100) : 0;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-x-6 gap-y-2">
        <span className="inline-flex items-center gap-2 text-base">
          <span className="h-3 w-3 rounded-[3px]" style={{ background: VERDE }} aria-hidden="true" />
          Aperture
        </span>
        <span className="inline-flex items-center gap-2 text-base">
          <svg width="20" height="4" aria-hidden="true">
            <line x1="0" y1="2" x2="20" y2="2" stroke={ORO} strokeWidth="2.5" strokeDasharray="5 3" />
          </svg>
          Click
        </span>
        <span className="ml-auto rounded-full bg-[#1f8058]/10 px-3 py-1 text-sm font-medium text-[#17603f]">
          {quotaSei}% delle aperture nelle prime 6 ore
        </span>
      </div>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={ore} barCategoryGap={2} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
            <XAxis
              dataKey="ora"
              tickFormatter={etichetta}
              interval={ore.length > 24 ? 5 : 2}
              stroke="hsl(var(--muted-foreground))"
              fontSize={12}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              stroke="hsl(var(--muted-foreground))"
              fontSize={12}
              tickLine={false}
              axisLine={false}
              allowDecimals={false}
              domain={[0, (max: number) => Math.max(1, Math.ceil(max * 1.15))]}
            />
            <Tooltip
              cursor={{ fill: "hsl(var(--secondary))", opacity: 0.6 }}
              labelFormatter={(ora: number) => `${ora < 24 ? "Primo giorno" : "Secondo giorno"}, ${etichetta(ora)}`}
              formatter={(v: number, nome: string) => [new Intl.NumberFormat("it-IT").format(v), nome === "aperture" ? "Aperture" : "Click"]}
              contentStyle={{ borderRadius: 10, border: "1px solid hsl(var(--border))", fontSize: 13 }}
            />
            <Bar dataKey="aperture" fill={VERDE} radius={[4, 4, 0, 0]} maxBarSize={22} />
            <Line type="linear" dataKey="click" stroke={ORO} strokeWidth={2} strokeDasharray="5 3" dot={false} activeDot={{ r: 4 }} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      {dati.dopo48 > 0 && (
        <p className="mt-2 text-sm text-muted-foreground">
          Altre {NUMERO.format(dati.dopo48)} aperture sono arrivate dopo le prime 48 ore.
        </p>
      )}
    </div>
  );
}

const NUMERO = new Intl.NumberFormat("it-IT");
