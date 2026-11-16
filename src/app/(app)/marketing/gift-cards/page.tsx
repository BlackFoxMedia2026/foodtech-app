import { can, getActiveVenue } from "@/lib/tenant";
import { listGiftCards } from "@/server/gift-cards";
import { GiftCardList } from "@/components/gift-cards/gift-card-list";

export const dynamic = "force-dynamic";

export default async function GiftCardsPage() {
  const ctx = await getActiveVenue();
  const items = await listGiftCards(ctx.venueId);

  return (
    /* Su telefono scorre la pagina intera: con numeri e nota fissi in cima
       all'elenco delle carte restava una finestrella sotto la piega. */
    <div className="flex flex-col gap-4 animate-fade-in md:schermo">
      <GiftCardList
        items={items}
        canIssue={can(ctx.role, "manage_venue")}
        currency={ctx.venue.currency}
      />
    </div>
  );
}
