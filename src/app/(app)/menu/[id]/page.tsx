import { notFound } from "next/navigation";
import { can, getActiveVenue } from "@/lib/tenant";
import { getMenuItemDettaglio, getRendimentoPiatto } from "@/server/menu";
import { MenuItemDetail } from "@/components/menu/menu-item-detail";

export const dynamic = "force-dynamic";

/**
 * La scheda di un piatto.
 *
 * Ha un indirizzo suo — `/menu/<id>` — perché è una cosa che si manda a
 * qualcuno («guarda la tartare»), si apre in una linguetta e si lascia aperta
 * mentre si cucina. Una modale non fa niente di tutto questo.
 */
export default async function PiattoPage({ params }: { params: { id: string } }) {
  const ctx = await getActiveVenue();
  const dettaglio = await getMenuItemDettaglio(ctx.venueId, params.id);
  if (!dettaglio) notFound();

  const rendimento = await getRendimentoPiatto(ctx.venueId, params.id);

  return (
    <MenuItemDetail
      modalita="modifica"
      itemId={dettaglio.item.id}
      item={dettaglio.item}
      categoryIdIniziale={dettaglio.categoryId}
      categorie={dettaglio.categorie}
      currency={ctx.venue.currency}
      canEdit={can(ctx.role, "manage_venue")}
      rendimento={rendimento}
      fratelli={dettaglio.fratelli}
      posizione={dettaglio.posizione}
    />
  );
}
