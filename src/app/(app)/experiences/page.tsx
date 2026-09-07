import { can, getActiveVenue } from "@/lib/tenant";
import { listExperiences } from "@/server/experiences";
import { ExperienceList } from "@/components/experiences/experience-list";

export const dynamic = "force-dynamic";

export default async function ExperiencesPage() {
  const ctx = await getActiveVenue();
  const items = await listExperiences(ctx.venueId);

  return (
    <div className="space-y-6 animate-fade-in">
      <ExperienceList
        items={items}
        currency={ctx.venue.currency}
        canEdit={can(ctx.role, "edit_marketing")}
      />
    </div>
  );
}
