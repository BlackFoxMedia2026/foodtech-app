import Link from "next/link";
import { db } from "@/lib/db";
import { getActiveVenue } from "@/lib/tenant";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatCard } from "@/components/overview/stat-card";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatDateTime } from "@/lib/utils";
import {
  ETICHETTA_STATO,
  ETICHETTA_TIPO as KIND_LABEL,
  TONO_STATO as STATUS_TONE,
} from "@/lib/pagamento-vista";

export const dynamic = "force-dynamic";

/** Quanti movimenti si mostrano. Il totale si dice sempre. */
const PER_PAGINA = 100;

/**
 * I movimenti di denaro del locale.
 *
 * ## Cosa è cambiato, e perché la vecchia frase non c'è più
 *
 * Fino a oggi questa pagina dichiarava: «I conti al tavolo non passano da
 * qui». Era vero — l'unico denaro che ci arrivava erano caparre e ticket
 * segnati a mano — e ha smesso di esserlo con il pagamento al tavolo col QR:
 * adesso un cliente seduto paga la propria cena, e quel denaro **è** un
 * movimento di questa pagina.
 *
 * Resta invece vera la distinzione che quella frase difendeva, ed è il motivo
 * per cui i riquadri in cima sono tre e non uno: *quanto è stato incassato
 * qui* non è *l'incasso del servizio*. Un conto pagato per metà col QR e per
 * metà in contanti compare qui per metà, e in Panoramica per intero. Sono due
 * numeri veri e diversi, e l'unico errore sarebbe chiamarli con la stessa
 * parola.
 *
 * ## Conto e mancia restano separati, sempre
 *
 * `Payment.amountCents` è il totale della transazione — quello che il cliente
 * si è visto addebitare — e la mancia ne è una parte. Sommarle in una colonna
 * sola renderebbe impossibile rispondere, a fine mese, a «quanto ha incassato
 * la cucina e quanto ha preso la sala».
 */
export default async function PaymentsPage() {
  const ctx = await getActiveVenue();

  const [items, totale, somme] = await Promise.all([
    db.payment.findMany({
      where: { venueId: ctx.venueId, deletedAt: null },
      orderBy: { createdAt: "desc" },
      take: PER_PAGINA,
      include: {
        booking: true,
        guest: true,
        table: { select: { label: true } },
      },
    }),
    // Il tetto senza totale è una bugia per omissione: se ci sono più
    // movimenti di quelli mostrati, va scritto.
    db.payment.count({ where: { venueId: ctx.venueId, deletedAt: null } }),
    /*
      Le somme si chiedono al database su **tutti** i movimenti, non si
      calcolano sui cento mostrati.

      Prima si sommava la pagina: con più di cento movimenti, «Incassato»
      mostrava il totale degli ultimi cento e lo presentava come il totale. Un
      numero sbagliato che cresce col successo del locale è il tipo di errore
      che nessuno scopre finché non conta a mano.
    */
    db.payment.groupBy({
      by: ["status"],
      where: { venueId: ctx.venueId, deletedAt: null },
      _sum: { amountCents: true, tipCents: true, refundedCents: true },
      _count: true,
    }),
  ]);

  const di = (s: string) => somme.find((x) => x.status === s);
  const riusciti = di("SUCCEEDED");
  const parziali = di("PARTIALLY_REFUNDED");

  const incassatoCents =
    (riusciti?._sum.amountCents ?? 0) +
    (parziali?._sum.amountCents ?? 0) -
    (parziali?._sum.refundedCents ?? 0);
  const manceCents = (riusciti?._sum.tipCents ?? 0) + (parziali?._sum.tipCents ?? 0);
  const rimborsatoCents =
    (di("REFUNDED")?._sum.amountCents ?? 0) + (parziali?._sum.refundedCents ?? 0);
  const inCorso = (di("PROCESSING")?._count ?? 0) + (di("PENDING")?._count ?? 0);
  const falliti = di("FAILED")?._count ?? 0;

  return (
    <div className="schermo animate-fade-in gap-3">
      <header className="fissa">
        <p className="max-w-2xl text-sm text-muted-foreground">
          Pagamenti al tavolo col QR, caparre, ticket e rimborsi. L&apos;incasso complessivo del
          servizio — contanti e carte alla cassa compresi — si legge in{" "}
          <Link href="/overview" className="underline">
            Panoramica
          </Link>{" "}
          e in{" "}
          <Link href="/insights" className="underline">
            Analytics
          </Link>
          .
        </p>
      </header>

      <section className="fissa grid gap-3 md:grid-cols-4">
        <StatCard
          label="Incassato qui"
          value={formatCurrency(incassatoCents - manceCents, ctx.venue.currency)}
          emphasize
        />
        <StatCard label="Di cui mance" value={formatCurrency(manceCents, ctx.venue.currency)} />
        <StatCard label="Rimborsato" value={formatCurrency(rimborsatoCents, ctx.venue.currency)} />
        <StatCard
          label="In corso"
          value={String(inCorso)}
          // I falliti si dicono accanto ai pendenti e non in un riquadro loro:
          // un pagamento fallito da solo non è una notizia — tre di fila sullo
          // stesso tavolo sì.
          hint={falliti > 0 ? `${falliti} non riusciti` : undefined}
        />
      </section>

      {/* I movimenti sono una lista senza lunghezza massima: scorre lei. */}
      <Card className="flex min-h-0 flex-1 flex-col">
        <CardHeader className="fissa py-3">
          <CardTitle className="text-base">Movimenti recenti</CardTitle>
        </CardHeader>
        <CardContent className="min-h-0 flex-1 overflow-y-auto">
          {items.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Nessun movimento. I pagamenti al tavolo compaiono qui appena un cliente inquadra il QR
              e paga.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-card text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left">Quando</th>
                  <th className="px-3 py-2 text-left">Tipo</th>
                  <th className="px-3 py-2 text-left">Da</th>
                  <th className="px-3 py-2 text-right">Conto</th>
                  <th className="px-3 py-2 text-right">Mancia</th>
                  <th className="px-3 py-2 text-right">Totale</th>
                  <th className="px-3 py-2 text-left">Stato</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {items.map((p) => (
                  <tr key={p.id}>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {formatDateTime(p.paidAt ?? p.createdAt)}
                    </td>
                    <td className="px-3 py-2">
                      {KIND_LABEL[p.kind]}
                      {p.paymentMethod && (
                        <span className="ml-1.5 text-xs text-muted-foreground">
                          {p.paymentMethod}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {/* Per un pagamento dal tavolo il «chi» è il tavolo: chi
                          ha pagato non si è registrato, ed è il punto. */}
                      {p.table
                        ? `Tavolo ${p.table.label}`
                        : p.guest
                          ? `${p.guest.firstName} ${p.guest.lastName ?? ""}`.trim()
                          : "—"}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {formatCurrency(p.amountCents - p.tipCents, p.currency)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                      {p.tipCents > 0 ? formatCurrency(p.tipCents, p.currency) : "—"}
                    </td>
                    <td className="px-3 py-2 text-right font-medium tabular-nums">
                      {formatCurrency(p.amountCents, p.currency)}
                    </td>
                    <td className="px-3 py-2">
                      <Badge tone={STATUS_TONE[p.status]}>{ETICHETTA_STATO[p.status]}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {totale > items.length && (
            <p className="mt-3 text-xs text-muted-foreground">
              Mostrati gli ultimi {items.length} movimenti di {totale}.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
