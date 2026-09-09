"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

/**
 * Inviate, aperte, prenotate — e tutti e tre veri.
 *
 * La terza colonna leggeva `Campaign.bookedCount`, un campo che nessuno
 * scriveva: su ogni campagna mostrava zero, cioè diceva al ristoratore che la
 * sua campagna non aveva portato nessuno, quando in realtà non lo sapevamo.
 *
 * Ora il numero viene dall'attribuzione: il link dentro l'email si porta
 * dietro la campagna, e la prenotazione che nasce da quel clic la ricorda. Il
 * merito vale per un mese dall'invio — senza una finestra, il merito di una
 * campagna crescerebbe per sempre.
 */
export function CampaignResultsChart({
  sentCount,
  openedCount,
  bookings,
  covers,
  revenueCents,
  fuoriFinestra,
  giorniFinestra,
}: {
  sentCount: number;
  openedCount: number;
  bookings: number;
  covers: number;
  revenueCents: number | null;
  fuoriFinestra: number;
  giorniFinestra: number;
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
    { step: "Prenotazioni", value: bookings },
  ];

  const euro = (cents: number) =>
    new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(
      cents / 100
    );

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
      {bookings > 0 ? (
        <p className="text-sm">
          <strong>{bookings}</strong> {bookings === 1 ? "prenotazione" : "prenotazioni"} dal link di questa
          campagna, <strong>{covers}</strong> coperti
          {revenueCents != null ? (
            <>
              {" "}
              — <strong>{euro(revenueCents)}</strong> stimati sullo scontrino medio
            </>
          ) : (
            <span className="text-muted-foreground">
              {" "}
              — imposta lo scontrino medio in Impostazioni per vedere quanto valgono
            </span>
          )}
          .
        </p>
      ) : (
        <p className="text-sm text-muted-foreground">Nessuna prenotazione dal link di questa campagna.</p>
      )}

      <p className="t-nota">
        Contiamo le prenotazioni nate dal link di questa email entro {giorniFinestra} giorni dall&apos;invio,
        senza le disdette e chi non si è presentato: una prenotazione disdetta è arrivata dalla campagna ma non
        ha portato nessuno a tavola.
        {fuoriFinestra > 0 &&
          ` Altre ${fuoriFinestra} sono arrivate dallo stesso link più tardi e non le contiamo.`}
      </p>
    </div>
  );
}
