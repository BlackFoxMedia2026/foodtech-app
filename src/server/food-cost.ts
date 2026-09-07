import { db } from "@/lib/db";

/**
 * Il costo del cibo — terzo anello di menu → ordini → costo del cibo.
 *
 * Il margine per piatto c'era già nel menu, e l'incasso della giornata
 * tornava già col costo dei piatti venduti. Qui c'è la domanda che un
 * ristoratore si fa davvero a fine mese: **quanto è rimasto, e per merito di
 * cosa**.
 *
 * La tentazione, in un calcolo così, è estrapolare. Se il costo è dichiarato
 * su metà dei piatti venduti, la percentuale di food cost «del locale» si
 * ottiene solo moltiplicando quella metà per due — cioè inventando. Qui non
 * si fa:
 *
 * - la percentuale si calcola **solo sulla parte coperta**, e accanto c'è
 *   scritto quanta parte è coperta;
 * - i piatti senza costo dichiarato non entrano nel calcolo e non
 *   spariscono: stanno in un elenco a parte, che è anche la lista di cose da
 *   fare per avere un numero completo;
 * - il fuori carta (una riga scritta a mano, senza piatto del menu) non ha un
 *   costo per definizione, e viene contato come tale invece di essere
 *   silenziosamente ignorato.
 */

export type PiattoVenduto = {
  menuItemId: string | null;
  name: string;
  quantita: number;
  incassoCents: number;
  /** Nullo quando il costo non è dichiarato: non è zero. */
  costoCents: number | null;
  margineCents: number | null;
  marginePct: number | null;
};

export type FoodCostReport = {
  conti: number;
  incassoCents: number;
  /** Incasso dei soli piatti di cui conosciamo il costo. */
  incassoCopertoCents: number;
  /** Costo dei soli piatti di cui lo conosciamo. */
  costoCents: number;
  /** Quello che resta, sulla parte coperta. */
  margineCents: number;
  /**
   * Quanto del prezzo se lo mangia la materia prima, **sulla parte coperta**.
   * Nullo quando non c'è nessun costo dichiarato: meglio niente che un numero
   * che sembra il food cost del locale e non lo è.
   */
  foodCostPct: number | null;
  /** Quota dell'incasso di cui conosciamo il costo. */
  coperturaPct: number;
  /** Piatti con il costo dichiarato, dal margine più alto al più basso. */
  piatti: PiattoVenduto[];
  /** Venduti ma senza costo dichiarato: è la lista di cose da completare. */
  senzaCosto: PiattoVenduto[];
  /** Righe scritte a mano, che un costo non possono averlo. */
  fuoriCartaCents: number;
};

/**
 * Il conto di quello che è rimasto, in un periodo.
 *
 * Si guardano solo i conti **chiusi**: un conto aperto è una serata in corso,
 * non un incasso.
 */
export async function getFoodCost(venueId: string, from: Date, to: Date): Promise<FoodCostReport> {
  const conti = await db.order.findMany({
    where: { venueId, status: "COMPLETED", completedAt: { gte: from, lte: to } },
    include: { OrderItem: { select: { menuItemId: true, name: true, priceCents: true, quantity: true } } },
  });

  const menuItemIds = [
    ...new Set(conti.flatMap((o) => o.OrderItem.map((i) => i.menuItemId).filter((x): x is string => !!x))),
  ];
  const costi = menuItemIds.length
    ? await db.menuItemCost.findMany({
        where: { venueId, menuItemId: { in: menuItemIds } },
        select: { menuItemId: true, costCents: true },
      })
    : [];
  const costoDi = new Map(costi.map((c) => [c.menuItemId, c.costCents]));

  /** Un piatto per riepilogo, sommando le righe che lo riguardano. */
  const perPiatto = new Map<string, PiattoVenduto>();
  let incassoCents = 0;
  let fuoriCartaCents = 0;

  for (const ordine of conti) {
    for (const riga of ordine.OrderItem) {
      const incassoRiga = riga.priceCents * riga.quantity;
      incassoCents += incassoRiga;

      if (!riga.menuItemId) {
        // Fuori carta: nessun piatto del menu, quindi nessun costo possibile.
        fuoriCartaCents += incassoRiga;
        continue;
      }

      const costoUnitario = costoDi.get(riga.menuItemId);
      const chiave = riga.menuItemId;
      const gia = perPiatto.get(chiave);

      const costoRiga = costoUnitario != null ? costoUnitario * riga.quantity : null;

      if (gia) {
        gia.quantita += riga.quantity;
        gia.incassoCents += incassoRiga;
        if (costoRiga != null) gia.costoCents = (gia.costoCents ?? 0) + costoRiga;
      } else {
        perPiatto.set(chiave, {
          menuItemId: chiave,
          name: riga.name,
          quantita: riga.quantity,
          incassoCents: incassoRiga,
          costoCents: costoRiga,
          margineCents: null,
          marginePct: null,
        });
      }
    }
  }

  const tutti = [...perPiatto.values()].map((p) => {
    const margineCents = p.costoCents != null ? p.incassoCents - p.costoCents : null;
    return {
      ...p,
      margineCents,
      marginePct:
        margineCents != null && p.incassoCents > 0 ? Math.round((margineCents / p.incassoCents) * 100) : null,
    };
  });

  const conCosto = tutti
    .filter((p) => p.costoCents != null)
    .sort((a, b) => (b.margineCents ?? 0) - (a.margineCents ?? 0));
  const senzaCosto = tutti
    .filter((p) => p.costoCents == null)
    .sort((a, b) => b.incassoCents - a.incassoCents);

  const incassoCopertoCents = conCosto.reduce((s, p) => s + p.incassoCents, 0);
  const costoCents = conCosto.reduce((s, p) => s + (p.costoCents ?? 0), 0);
  const margineCents = incassoCopertoCents - costoCents;

  return {
    conti: conti.length,
    incassoCents,
    incassoCopertoCents,
    costoCents,
    margineCents,
    // La percentuale vale sulla parte coperta, e chi la mostra deve dirlo.
    foodCostPct: incassoCopertoCents > 0 ? Math.round((costoCents / incassoCopertoCents) * 100) : null,
    coperturaPct: incassoCents > 0 ? Math.round((incassoCopertoCents / incassoCents) * 100) : 0,
    piatti: conCosto,
    senzaCosto,
    fuoriCartaCents,
  };
}
