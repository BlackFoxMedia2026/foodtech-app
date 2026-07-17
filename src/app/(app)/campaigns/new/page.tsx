import { getActiveVenue } from "@/lib/tenant";
import { CampaignWizard } from "@/components/campaigns/wizard/campaign-wizard";

export default async function NewCampaignPage() {
  const ctx = await getActiveVenue();
  return (
    <CampaignWizard
      initialState={{
        senderName: process.env.BREVO_FROM_NAME || "Tavolo",
        senderEmail: process.env.BREVO_FROM_EMAIL || "marketing@tavolo.local",
        brandLogoUrl: ctx.venue.brandLogoUrl ?? "",
        brandPrimaryColor: ctx.venue.brandAccent ?? "",
      }}
    />
  );
}
