"use client";

import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export function WeekTrend({ data }: { data: { day: string; covers: number; bookings: number }[] }) {
  return (
    // 40 invece di 56: questo grafico vive solo nella colonna della
    // Panoramica, e là deve stare dentro l'altezza che avanza. Sette punti si
    // leggono uguale, e la pagina non scorre. I grafici alti stanno in
    // Analytics, che è la schermata dove si legge.
    <div className="h-40 w-full">
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
