"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export function CampaignResultsChart({
  sentCount,
  openedCount,
  bookedCount,
}: {
  sentCount: number;
  openedCount: number;
  bookedCount: number;
}) {
  if (sentCount === 0) {
    return (
      <div className="flex h-56 flex-col items-center justify-center rounded-md border border-dashed p-6 text-center">
        <p className="text-sm font-medium text-foreground">Nessun invio ancora registrato.</p>
        <p className="mt-1 text-xs text-muted-foreground">
          I risultati appariranno qui una volta inviata la campagna.
        </p>
      </div>
    );
  }

  const data = [
    { step: "Inviate", value: sentCount },
    { step: "Aperte", value: openedCount },
    { step: "Prenotazioni", value: bookedCount },
  ];

  return (
    <div className="h-56">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 12, left: -16, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
          <XAxis dataKey="step" stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} />
          <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} />
          <Tooltip
            cursor={{ fill: "hsl(var(--muted))" }}
            contentStyle={{ borderRadius: 8, border: "1px solid hsl(var(--border))", fontSize: 12 }}
          />
          <Bar dataKey="value" fill="#c9a25a" radius={[6, 6, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
