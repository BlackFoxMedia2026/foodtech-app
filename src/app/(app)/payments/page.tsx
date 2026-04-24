import { db } from "@/lib/db";
import { getActiveVenue } from "@/lib/tenant";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatCard } from "@/components/overview/stat-card";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatDateTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

const KIND_LABEL = {
  DEPOSIT: "Caparra",
  PREAUTH: "Preautorizzazione",
  TICKET: "Ticket",
  REFUND: "Rimborso",
  PACKAGE: "Pacchetto",
} as const;

const STATUS_TONE = {
  PENDING: "warning",
  SUCCEEDED: "success",
  FAILED: "danger",
  REFUNDED: "neutral",
} as const;

export default async function PaymentsPage() {
  const ctx = await getActiveVenue();
  const items = await db.payment.findMany({
    where: { venueId: ctx.venueId },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { booking: true, guest: true },
  });

  const total = items
    .filter((p) => p.status === "SUCCEEDED")
    .reduce((s, p) => s + p.amountCents, 0);
  const refunded = items
    .filter((p) => p.status === "REFUNDED")
    .reduce((s, p) => s + p.amountCents, 0);
  const pending = items.filter((p) => p.status === "PENDING").length;

  return (
    <div className="space-y-6 animate-fade-in">
      <header>
        <p className="text-xs uppercase tracking-widest text-muted-foreground">Finanze</p>
        <h1 className="text-display text-3xl">Pagamenti</h1>
      </header>

      <section className="grid gap-4 md:grid-cols-3">
        <StatCard label="Incassato" value={formatCurrency(total, ctx.venue.currency)} emphasize />
        <StatCard label="Rimborsato" value={formatCurrency(refunded, ctx.venue.currency)} />
        <StatCard label="In attesa" value={String(pending)} />
      </section>

      <Card>
        <CardHeader><CardTitle>Movimenti recenti</CardTitle></CardHeader>
        <CardContent>
          {items.length === 0 ? (
            <p className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
              Nessun pagamento registrato.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left">Data</th>
                  <th className="px-3 py-2 text-left">Tipo</th>
                  <th className="px-3 py-2 text-left">Ospite</th>
                  <th className="px-3 py-2 text-right">Importo</th>
                  <th className="px-3 py-2 text-left">Stato</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {items.map((p) => (
                  <tr key={p.id}>
                    <td className="px-3 py-2">{formatDateTime(p.createdAt)}</td>
                    <td className="px-3 py-2">{KIND_LABEL[p.kind]}</td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {p.guest ? `${p.guest.firstName} ${p.guest.lastName ?? ""}` : "—"}
                    </td>
                    <td className="px-3 py-2 text-right font-medium">{formatCurrency(p.amountCents, p.currency)}</td>
                    <td className="px-3 py-2"><Badge tone={STATUS_TONE[p.status]}>{p.status}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
