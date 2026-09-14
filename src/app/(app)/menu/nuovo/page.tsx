import { redirect } from "next/navigation";
import { can, getActiveVenue } from "@/lib/tenant";
import { listCategorie } from "@/server/menu";
import { MenuItemDetail } from "@/components/menu/menu-item-detail";

export const dynamic = "force-dynamic";

/**
 * Un piatto nuovo, sulla stessa scheda con cui poi si modifica.
 *
 * Due moduli per la stessa cosa — uno per creare, uno per cambiare — sono il
 * modo in cui un campo finisce per esistere solo in uno dei due: qui è la
 * stessa pagina, senza le parti che a un piatto che non esiste ancora non
 * possono appartenere (le vendite, la posizione, l'eliminazione).
 */
export default async function NuovoPiattoPage({
  searchParams,
}: {
  searchParams: { categoria?: string };
}) {
  const ctx = await getActiveVenue();
  if (!can(ctx.role, "manage_venue")) redirect("/menu");

  const categorie = await listCategorie(ctx.venueId);
  // Senza categorie non c'è dove metterlo: si torna alla carta, dove si creano.
  if (categorie.length === 0) redirect("/menu");

  const scelta = categorie.find((c) => c.id === searchParams.categoria) ?? categorie[0];

  return (
    <MenuItemDetail
      modalita="nuovo"
      categoryIdIniziale={scelta.id}
      categorie={categorie}
      currency={ctx.venue.currency}
      canEdit
    />
  );
}
