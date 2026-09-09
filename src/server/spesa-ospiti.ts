import { db } from "@/lib/db";

/**
 * Quanto ha speso un ospite: **la somma dei suoi conti chiusi**.
 *
 * `Guest.totalSpend` è una colonna che esiste da sempre e che **nessuna parte
 * del prodotto scrive**: conteneva valori messi dal seed, e due schermate li
 * mostravano come misure — l'elenco ospiti («1.118,00 €» accanto a un nome) e
 * la spesa media in Analytics, che divideva quel numero per le visite. Su un
 * locale vero quella colonna è zero, quindi la spesa media era zero con
 * accanto una freccia di tendenza.
 *
 * Qui la domanda ha una risposta sola, calcolata dalle righe: i conti in stato
 * `COMPLETED`, che è l'unico stato in cui il denaro è entrato. Un conto aperto
 * non è un incasso, e un conto annullato non lo è mai stato.
 *
 * Chi non ha conti chiusi **non compare nella mappa**: è diverso da «ha speso
 * zero». Chi legge deve poter dire «non ancora misurata» invece di scrivere
 * uno zero che sembra una misura.
 */
export async function spesaPerOspite(
  venueId: string,
  guestIds?: string[],
): Promise<Map<string, number>> {
  // Con un elenco vuoto non c'è niente da chiedere: `in: []` è una query che
  // non restituirà mai nulla, e farla è comunque un giro sul database.
  if (guestIds && guestIds.length === 0) return new Map();

  const somme = await db.order.groupBy({
    by: ["guestId"],
    where: {
      venueId,
      status: "COMPLETED",
      guestId: guestIds ? { in: guestIds } : { not: null },
    },
    _sum: { totalCents: true },
  });

  const mappa = new Map<string, number>();
  for (const s of somme) {
    if (s.guestId) mappa.set(s.guestId, s._sum.totalCents ?? 0);
  }
  return mappa;
}
