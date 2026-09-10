"use client";

import { Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

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
            {/* Un dodicesimo di respiro in cima: senza, la barra più alta
                arriva al bordo e la **sua etichetta viene tagliata** — che è
                il difetto peggiore possibile, perché è proprio il numero più
                grande a sparire. Vedi DESIGN.md, «Draw charts to the scale». */}
            <YAxis
              stroke="hsl(var(--muted-foreground))"
              fontSize={12}
              tickLine={false}
              axisLine={false}
              domain={[0, (max: number) => Math.ceil(max * 1.12)]}
              allowDecimals={false}
            />
            <Tooltip
              cursor={{ fill: "hsl(var(--muted))" }}
              contentStyle={{ borderRadius: 8, border: "1px solid hsl(var(--border))", fontSize: 12 }}
            />
            {/* I numeri stanno **sulle** barre, non solo nel tooltip: il
                tooltip vive del passaggio del mouse, e questo prodotto si usa
                col dito su un tablet in sala. Senza, per sapere quante email
                sono partite bisognava stimare la barra sulle linee della
                griglia. */}
            <Bar dataKey="value" fill="#c9a25a" radius={[6, 6, 0, 0]}>
              <LabelList
                dataKey="value"
                position="top"
                fill="hsl(var(--card-foreground))"
                fontSize={13}
                fontWeight={600}
                formatter={(v: number) => new Intl.NumberFormat("it-IT").format(v)}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      {/* Quante ne sono state aperte in proporzione: il grafico mostra due
          barre accanto e non dice il loro rapporto, che è la cosa che si
          guarda per capire se l'oggetto dell'email funzionava. */}
      <p className="t-nota">
        {openedCount > 0
          ? `${Math.round((openedCount / sentCount) * 100)}% delle email inviate è stato aperto.`
          : "Nessuna apertura registrata: il fornitore email le segnala solo se il tracciamento è attivo."}
      </p>

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
