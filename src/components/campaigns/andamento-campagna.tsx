"use client";

import { Area, ComposedChart, CartesianGrid, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { GiornoCampagna } from "@/server/dem/statistiche";
import { ORO, VERDE } from "./risultati-visivi";

/**
 * Aperture e click giorno per giorno dall'invio (11 novembre 2026).
 *
 * Una scala sola: i click stanno sotto le aperture, sullo stesso asse —
 * mai un secondo asse a destra, che fa sembrare vicini due numeri lontani.
 * Le aperture sono l'area verde, i click la linea oro **tratteggiata**: la
 * coppia di colori è al limite per la protanopia, e il tratto li distingue
 * anche senza colore. La legenda è sopra, scritta.
 *
 * Il tooltip vive del passaggio del mouse; su tablet basta toccare il giorno.
 */
export function AndamentoCampagna({ giorni }: { giorni: GiornoCampagna[] }) {
  const totAperture = giorni.reduce((n, g) => n + g.aperture, 0);
  const primoGiorno = giorni[0]?.aperture ?? 0;
  const quotaPrimo = totAperture > 0 ? Math.round((primoGiorno / totAperture) * 100) : 0;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-sm">
        <span className="inline-flex items-center gap-2">
          <span className="h-2.5 w-4 rounded-sm" style={{ background: VERDE, opacity: 0.85 }} aria-hidden="true" />
          Aperture
        </span>
        <span className="inline-flex items-center gap-2">
          <svg width="16" height="4" aria-hidden="true">
            <line x1="0" y1="2" x2="16" y2="2" stroke={ORO} strokeWidth="2" strokeDasharray="4 2" />
          </svg>
          Click
        </span>
        {totAperture > 0 && (
          <span className="ml-auto text-muted-foreground">
            {quotaPrimo}% delle aperture è arrivato il primo giorno
          </span>
        )}
      </div>
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={giorni} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="fondoAperture" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor={VERDE} stopOpacity={0.35} />
                <stop offset="1" stopColor={VERDE} stopOpacity={0.03} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
            <XAxis
              dataKey="giorno"
              tickFormatter={(g: number) => `g${g}`}
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
              domain={[0, (max: number) => Math.max(1, Math.ceil(max * 1.12))]}
            />
            <Tooltip
              cursor={{ stroke: "hsl(var(--border-strong))", strokeWidth: 1 }}
              labelFormatter={(g: number) => (g === 1 ? "Giorno dell'invio" : `${g}° giorno`)}
              formatter={(v: number, nome: string) => [new Intl.NumberFormat("it-IT").format(v), nome === "aperture" ? "Aperture" : "Click"]}
              contentStyle={{ borderRadius: 10, border: "1px solid hsl(var(--border))", fontSize: 13 }}
            />
            <Area type="monotone" dataKey="aperture" stroke={VERDE} strokeWidth={2} fill="url(#fondoAperture)" activeDot={{ r: 4 }} />
            <Line type="monotone" dataKey="click" stroke={ORO} strokeWidth={2} strokeDasharray="5 3" dot={false} activeDot={{ r: 4 }} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
