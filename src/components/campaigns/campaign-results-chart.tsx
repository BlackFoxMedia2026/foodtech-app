"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

/**
 * Inviate e aperte, e niente altro.
 *
 * C'era una terza colonna, «Prenotazioni», che leggeva `Campaign.bookedCount`:
 * un campo che **nessuna parte del codice scrive**. Su ogni campagna mostrava
 * zero, cioè diceva al ristoratore che la sua campagna non aveva portato
 * nessuno — quando in realtà non lo sapevamo. Peggio di non mostrare niente.
 *
 * Per saperlo davvero serve l'attribuzione: il link dentro l'email deve
 * portarsi dietro la campagna, e la prenotazione che nasce da quel clic deve
 * ricordarsene. Finché non c'è, qui ci sono i due numeri veri: gli invii, che
 * contiamo noi, e le aperture, che arrivano dal fornitore.
 */
export function CampaignResultsChart({ sentCount, openedCount }: { sentCount: number; openedCount: number }) {
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
  ];

  return (
    <div className="space-y-2">
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 12, left: -16, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
            <XAxis
              dataKey="step"
              stroke="hsl(var(--muted-foreground))"
              fontSize={12}
              tickLine={false}
              axisLine={false}
            />
            <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} />
            <Tooltip
              cursor={{ fill: "hsl(var(--muted))" }}
              contentStyle={{ borderRadius: 8, border: "1px solid hsl(var(--border))", fontSize: 12 }}
            />
            <Bar dataKey="value" fill="#c9a25a" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <p className="text-xs text-tertiary-foreground">
        Quante prenotazioni ha portato questa campagna non lo sappiamo ancora: servirebbe collegare il clic
        sul link alla prenotazione che ne nasce. Mostrare uno zero sarebbe stato peggio.
      </p>
    </div>
  );
}
