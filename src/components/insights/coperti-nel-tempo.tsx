"use client";

import { Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export type PuntoNelTempo = {
  /** L'etichetta sull'asse: «lun 16», «3 nov». */
  etichetta: string;
  /** Il periodo per esteso, per il riquadro al passaggio. */
  quando: string;
  ora: number;
  prima: number;
};

/**
 * Un numero del periodo, punto per punto, sopra lo stesso numero del periodo
 * prima.
 *
 * Il periodo prima è una linea tratteggiata e senza riempimento: serve da
 * metro, non deve competere con la curva che si sta leggendo. È la stessa
 * curva della Panoramica, così un ristoratore riconosce il disegno.
 *
 * Con `valuta` i valori sono centesimi: l'asse li scrive in euro interi, il
 * riquadro al passaggio in euro e centesimi.
 */
export function CopertiNelTempo({
  punti,
  valuta,
  className,
}: {
  punti: PuntoNelTempo[];
  valuta?: string;
  className?: string;
}) {
  const euro = valuta
    ? new Intl.NumberFormat("it-IT", { style: "currency", currency: valuta, maximumFractionDigits: 0 })
    : null;
  const euroPieno = valuta ? new Intl.NumberFormat("it-IT", { style: "currency", currency: valuta }) : null;

  return (
    <div className={className ?? "h-56 w-full sm:h-64 lg:h-auto lg:min-h-56 lg:flex-1"}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={punti} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="copertiPeriodo" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" style={{ stopColor: "var(--trend-line)" }} stopOpacity={0.28} />
              <stop offset="100%" style={{ stopColor: "var(--trend-line)" }} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} opacity={0.5} />
          <XAxis
            dataKey="etichetta"
            stroke="hsl(var(--card-foreground) / 0.6)"
            fontSize={12}
            tickLine={false}
            axisLine={false}
            interval="preserveStartEnd"
            minTickGap={18}
          />
          <YAxis
            stroke="hsl(var(--card-foreground) / 0.6)"
            fontSize={12}
            tickLine={false}
            axisLine={false}
            width={euro ? 56 : 34}
            allowDecimals={false}
            tickFormatter={(v: number) => (euro ? euro.format(v / 100) : String(v))}
          />
          <Tooltip
            cursor={{ stroke: "var(--trend-line)", strokeOpacity: 0.3 }}
            labelFormatter={(_, p) => (p?.[0]?.payload as PuntoNelTempo | undefined)?.quando ?? ""}
            formatter={(v: number, nome: string) => [euroPieno ? euroPieno.format(v / 100) : v, nome]}
            contentStyle={{
              borderRadius: 10,
              border: "1px solid hsl(var(--border))",
              fontSize: 12,
              background: "hsl(var(--card))",
              color: "hsl(var(--card-foreground))",
            }}
          />
          <Line
            dataKey="prima"
            name="Periodo prima"
            type="monotone"
            stroke="hsl(var(--card-foreground) / 0.35)"
            strokeWidth={1.5}
            strokeDasharray="4 4"
            dot={false}
            activeDot={false}
          />
          <Area
            dataKey="ora"
            name="Questo periodo"
            type="monotone"
            stroke="var(--trend-line)"
            strokeWidth={2.25}
            fill="url(#copertiPeriodo)"
            dot={punti.length <= 14 ? { r: 3.5, fill: "var(--trend-line)", strokeWidth: 0 } : false}
            activeDot={{ r: 5, fill: "var(--trend-line)", strokeWidth: 0 }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

/** La legenda delle due curve, da mettere nella testata del riquadro. */
export function LegendaCurve() {
  return (
    <div className="flex items-center gap-4 text-xs text-muted-foreground">
      <span className="flex items-center gap-1.5">
        <span className="h-0.5 w-4 rounded-full bg-[color:var(--trend-line)]" aria-hidden="true" />
        Questo periodo
      </span>
      <span className="flex items-center gap-1.5">
        <span className="w-4 border-t-[1.5px] border-dashed border-muted-foreground/60" aria-hidden="true" />
        Periodo prima
      </span>
    </div>
  );
}
