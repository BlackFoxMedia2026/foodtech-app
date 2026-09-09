import { can, getActiveVenue } from "@/lib/tenant";
import { getServiceSnapshot } from "@/server/service";
import { getServiceInsights } from "@/server/service-intelligence";
import { ServiceView } from "@/components/service/service-view";

export const dynamic = "force-dynamic";

export default async function ServicePage() {
  const ctx = await getActiveVenue();
  const [snapshot, insights] = await Promise.all([
    // L'utente serve per **escludere** i propri cambiamenti dall'attribuzione:
    // chi li ha fatti li ha visti succedere.
    getServiceSnapshot(ctx.venueId, { utente: ctx.userId }),
    getServiceInsights(ctx.venueId),
  ]);

  return (
    <ServiceView
      initial={snapshot}
      insights={insights}
      venueName={ctx.venue.name}
      canManage={can(ctx.role, "manage_bookings")}
    />
  );
}
