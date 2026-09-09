import { can, getActiveVenue } from "@/lib/tenant";
import { getMenu } from "@/server/menu";
import { MenuEditor } from "@/components/menu/menu-editor";

export const dynamic = "force-dynamic";

export default async function MenuPage({
  searchParams,
}: {
  searchParams: { filtro?: string };
}) {
  const ctx = await getActiveVenue();
  const categorie = await getMenu(ctx.venueId);

  return (
    <div className="schermo animate-fade-in gap-3">
      <MenuEditor
        categorie={categorie}
        venueSlug={ctx.venue.slug}
        currency={ctx.venue.currency}
        canEdit={can(ctx.role, "manage_venue")}
        /* Da Analisi si arriva qui con il filtro già acceso: vedi la nota in
           menu-editor.tsx. */
        filtroIniziale={searchParams.filtro}
      />
    </div>
  );
}
