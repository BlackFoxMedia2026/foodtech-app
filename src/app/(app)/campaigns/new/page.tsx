import { CampaignWizard } from "@/components/campaigns/wizard/campaign-wizard";

export default function NewCampaignPage() {
  return (
    <CampaignWizard
      initialState={{
        senderName: process.env.BREVO_FROM_NAME || "Tavolo",
        senderEmail: process.env.BREVO_FROM_EMAIL || "marketing@tavolo.local",
      }}
    />
  );
}
