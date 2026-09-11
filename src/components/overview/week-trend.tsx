"use client";

import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export function WeekTrend({ data }: { data: { day: string; covers: number; bookings: number }[] }) {
  return (
    /*
      L'altezza: 160 px sul telefono, e da tablet in su quella che avanza nel
      riquadro — che è alto quanto le prenotazioni accanto.

      Era fissa a 160 px anche sul desktop, e da quando il grafico sta
      **accanto** alle prenotazioni invece che sotto restavano centocinquanta
      pixel vuoti in fondo al riquadro. Ora quello spazio è dei sette punti,
      che così si leggono meglio, e il fondo delle due card coincide.

      Il minimo resta: in una giornata senza prenotazioni la card accanto è
      bassa, e un grafico di venti pixel non è un grafico.
    */
    <div className="h-40 w-full md:h-auto md:min-h-40 md:flex-1">
      <ResponsiveContainer width="100%" height="100%">
        {/* Il margine sinistro era -16 con un asse da 32: le etichette,
              allineate a destra dentro l'asse, finivano mezzo pixel fuori dal
              contenitore e perdevano la prima cifra. «40» si leggeva «0», e
              tutti i valori tondi si leggevano zero. */}
          <AreaChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="coversFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#C29B72" stopOpacity={0.3} />
              <stop offset="100%" stopColor="#C29B72" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} opacity={0.4} />
          <XAxis dataKey="day" stroke="hsl(var(--card-foreground) / 0.65)" fontSize={12} tickLine={false} axisLine={false} />
          <YAxis stroke="hsl(var(--card-foreground) / 0.65)" fontSize={12} tickLine={false} axisLine={false} width={34} />
          <Tooltip
            cursor={{ stroke: "#C29B72", strokeOpacity: 0.3 }}
            contentStyle={{
              borderRadius: 8,
              border: "1px solid hsl(var(--border))",
              fontSize: 12,
              background: "hsl(var(--card))",
              color: "hsl(var(--card-foreground))",
            }}
          />
          <Area
            dataKey="covers"
            name="Coperti"
            type="monotone"
            stroke="#C29B72"
            strokeWidth={2}
            fill="url(#coversFill)"
            dot={{ r: 3.5, fill: "#C29B72", strokeWidth: 0 }}
            activeDot={{ r: 5, fill: "#C29B72", strokeWidth: 0 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
