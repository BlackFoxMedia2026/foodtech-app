import type { Prisma } from "@prisma/client";

/**
 * Quanto resta da pagare su un conto.
 *
 * ## Perché sta in un file suo
 *
 * Perché la stessa domanda la fanno tre posti — il conto, il riscatto di una
 * gift card, il riscatto dei punti — e i tre non possono importarsi a vicenda:
 * `orders.ts` importa già `loyalty.ts`, e la strada inversa sarebbe un
 * cerchio. Un file senza dipendenze lo rompe.
 *
 * ## Perché serve
 *
 * Perché fino al 20 settembre 2026 **non lo chiedeva nessuno**. Il riscatto di
 * una gift card controllava il residuo *della carta*, il riscatto dei punti il
 * saldo *dell'ospite*, e nessuno dei due il totale del conto. Su un conto da
 * 38 € con una carta da 100 € chi batteva 100 azzerava la carta: 62 € del
 * cliente scomparsi, e il conto segnato «niente da incassare». La regola «il
 * resto resta sulla carta» era scritta in un commento del server e viveva
 * soltanto in un campo dell'interfaccia — cioè in nessun posto che conti.
 *
 * ## Il totale si calcola dalle righe
 *
 * Come fa la vista del conto: le righe sono quello che è stato consumato, e la
 * colonna del totale è una copia. Due formule per lo stesso totale
 * divergerebbero al primo sconto.
 */

export type ResiduoConto = {
  /** Il totale delle righe, in centesimi. */
  totaleCents: number;
  /** Quanto è già coperto da gift card e punti. */
  copertoCents: number;
  /** Quanto resta da coprire. Mai sotto zero. */
  restaCents: number;
};

/**
 * `null` quando il conto non esiste.
 *
 * Non zero: «non c'è niente da pagare» e «questo conto non c'è» sono due
 * risposte diverse, e confonderle farebbe passare un riscatto su un conto
 * inventato.
 */
export async function residuoDelConto(
  tx: Prisma.TransactionClient,
  orderId: string,
): Promise<ResiduoConto | null> {
  const conto = await tx.order.findUnique({
    where: { id: orderId },
    select: { id: true, OrderItem: { select: { priceCents: true, quantity: true } } },
  });
  if (!conto) return null;

  const totaleCents = conto.OrderItem.reduce((s, r) => s + r.priceCents * r.quantity, 0);

  const [gift, punti] = await Promise.all([
    tx.giftCardRedemption.aggregate({
      where: { orderId },
      _sum: { amountCents: true },
    }),
    tx.loyaltyTransaction.aggregate({
      where: { orderId, kind: "REDEEMED" },
      _sum: { amountCents: true },
    }),
  ]);

  /* Gli annullamenti sono righe negative, quindi la somma con il segno è il
     vero importo coperto: un utilizzo annullato torna disponibile da solo. */
  const copertoCents = (gift._sum.amountCents ?? 0) + (punti._sum.amountCents ?? 0);

  return {
    totaleCents,
    copertoCents,
    restaCents: Math.max(0, totaleCents - copertoCents),
  };
}
