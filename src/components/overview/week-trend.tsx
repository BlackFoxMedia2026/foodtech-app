"use client";

import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export function WeekTrend({ data }: { data: { day: string; covers: number; bookings: number }[] }) {
  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 12, left: -16, bottom: 0 }}>
          <defs>
            <linearGradient id="coversFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="hsl(var(--accent))" stopOpacity={0.22} />
              <stop offset="100%" stopColor="hsl(var(--accent))" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} opacity={0.4} />
          <XAxis dataKey="day" stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} />
          <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} width={32} />
          <Tooltip
            cursor={{ stroke: "hsl(var(--accent))", strokeOpacity: 0.3 }}
            contentStyle={{
              borderRadius: 8,
              border: "1px solid hsl(var(--border))",
              fontSize: 12,
              background: "hsl(var(--card))",
            }}
          />
          <Area
            dataKey="covers"
            name="Coperti"
            type="monotone"
            stroke="hsl(var(--accent))"
            strokeWidth={2}
            fill="url(#coversFill)"
            dot={{ r: 3.5, fill: "hsl(var(--accent))", strokeWidth: 0 }}
            activeDot={{ r: 5, fill: "hsl(var(--accent))", strokeWidth: 0 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
