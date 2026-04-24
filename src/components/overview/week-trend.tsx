"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export function WeekTrend({ data }: { data: { day: string; covers: number; bookings: number }[] }) {
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 12, left: -16, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
          <XAxis dataKey="day" stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} />
          <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} />
          <Tooltip
            cursor={{ fill: "hsl(var(--muted))" }}
            contentStyle={{
              borderRadius: 8,
              border: "1px solid hsl(var(--border))",
              fontSize: 12,
              background: "hsl(var(--card))",
            }}
          />
          <Bar dataKey="covers" fill="#c9a25a" radius={[6, 6, 0, 0]} name="Coperti" />
          <Bar dataKey="bookings" fill="#15161a" radius={[6, 6, 0, 0]} name="Prenotazioni" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
