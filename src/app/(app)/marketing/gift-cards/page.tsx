import { can, getActiveVenue } from "@/lib/tenant";
import { listGiftCards } from "@/server/gift-cards";
import { GiftCardList } from "@/components/gift-cards/gift-card-list";

export const dynamic = "force-dynamic";

export default async function GiftCardsPage() {
  const ctx = await getActiveVenue();
  const items = await listGiftCards(ctx.venueId);

  return (
    <div className="schermo animate-fade-in gap-4">
      <GiftCardList
        items={items}
        canIssue={can(ctx.role, "manage_venue")}
        currency={ctx.venue.currency}
      />
    </div>
  );
}
