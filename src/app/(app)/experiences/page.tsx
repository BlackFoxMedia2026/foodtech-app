import { can, getActiveVenue } from "@/lib/tenant";
import { listExperiences } from "@/server/experiences";
import { ExperienceList } from "@/components/experiences/experience-list";

export const dynamic = "force-dynamic";

export default async function ExperiencesPage() {
  const ctx = await getActiveVenue();
  const items = await listExperiences(ctx.venueId);

  return (
    <div className="schermo animate-fade-in">
      {/* «Adesso» lo decide il server e non il browser: la lista divide il
          programma fra quello che deve ancora succedere e quello che è
          passato, e se i due lati calcolassero l'ora per conto loro la
          divisione potrebbe cadere in due punti diversi fra il render del
          server e quello del client. */}
      <ExperienceList
        items={items}
        currency={ctx.venue.currency}
        canEdit={can(ctx.role, "edit_marketing")}
        adesso={new Date().toISOString()}
      />
    </div>
  );
}
