import { can, getActiveVenue } from "@/lib/tenant";
import { getServiceSnapshot } from "@/server/service";
import { ServiceView } from "@/components/service/service-view";

export const dynamic = "force-dynamic";

export default async function ServicePage() {
  const ctx = await getActiveVenue();
  const snapshot = await getServiceSnapshot(ctx.venueId);

  return (
    <ServiceView
      initial={snapshot}
      venueName={ctx.venue.name}
      canManage={can(ctx.role, "manage_bookings")}
    />
  );
}
