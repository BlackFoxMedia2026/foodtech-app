import { db } from "@/lib/db";
import { tuttiIPiani } from "@/server/dem/piani";
import { PianiAdmin } from "@/components/dem/piani-admin";

export const dynamic = "force-dynamic";

export default async function AdminPianiPage() {
  const piani = await tuttiIPiani();
  const abbonati = await db.demSubscription.groupBy({
    by: ["planId"],
    _count: { planId: true },
  });
  const perPiano = new Map(abbonati.map((a) => [a.planId, a._count.planId]));

  return (
    <div className="space-y-6">
      <header>
        <h1 className="t-titolo-pagina">Piani DEM</h1>
        <p className="t-nota mt-1">
          I prezzi e le quote vivono qui, non nel codice: cambiarli non richiede una pubblicazione.
        </p>
      </header>

      <PianiAdmin
        piani={piani.map((p) => ({
          id: p.id,
          slug: p.slug,
          name: p.name,
          monthlyEmails: p.monthlyEmails,
          priceCents: p.priceCents,
          stripePriceId: p.stripePriceId,
          active: p.active,
          sortOrder: p.sortOrder,
          badge: p.badge,
          description: p.description,
          abbonati: perPiano.get(p.id) ?? 0,
        }))}
      />
    </div>
  );
}
