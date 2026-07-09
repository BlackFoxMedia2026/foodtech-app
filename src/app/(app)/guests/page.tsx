import { getActiveVenue } from "@/lib/tenant";
import { listGuests, listDistinctTags } from "@/server/guests";
import { GuestsTable } from "@/components/guests/guests-table";

export const dynamic = "force-dynamic";

export default async function GuestsPage({ searchParams }: { searchParams: { q?: string; tag?: string } }) {
  const ctx = await getActiveVenue();
  const [guests, availableTags] = await Promise.all([
    listGuests(ctx.venueId, searchParams.q, searchParams.tag),
    listDistinctTags(ctx.venueId),
  ]);

  return (
    <div className="space-y-6 animate-fade-in">
      <header>
        <p className="text-xs uppercase tracking-widest text-muted-foreground">CRM</p>
        <h1 className="text-display text-3xl">Ospiti</h1>
        <p className="text-sm text-muted-foreground">{guests.length} risultati</p>
      </header>
      <GuestsTable rows={guests} availableTags={availableTags} />
    </div>
  );
}
