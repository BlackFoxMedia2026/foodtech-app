import Link from "next/link";
import { notFound } from "next/navigation";
import { getActiveVenue } from "@/lib/tenant";
import { getCampaign } from "@/server/campaigns";
import { CampaignWizard } from "@/components/campaigns/wizard/campaign-wizard";
import { Button } from "@/components/ui/button";
import type { Block } from "@/lib/campaign-blocks";
import type { SegmentFilterType } from "@/server/campaigns";

export const dynamic = "force-dynamic";

export default async function EditCampaignPage({ params }: { params: { id: string } }) {
  const ctx = await getActiveVenue();
  const campaign = await getCampaign(ctx.venueId, params.id);
  if (!campaign) notFound();

  if (campaign.status !== "DRAFT") {
    return (
      <div className="mx-auto max-w-lg space-y-4 py-12 text-center">
        <h1 className="text-display text-xl">Questa campagna non è più modificabile</h1>
        <p className="text-sm text-muted-foreground">
          Solo le campagne in bozza possono essere modificate con il wizard.
        </p>
        <Button asChild>
          <Link href={`/campaigns/${campaign.id}`}>Vai al dettaglio campagna</Link>
        </Button>
      </div>
    );
  }

  return (
    <CampaignWizard
      initialState={{
        campaignId: campaign.id,
        name: campaign.name,
        subject: campaign.subject ?? "",
        previewText: campaign.previewText ?? "",
        segment: (campaign.segment as SegmentFilterType | null) ?? {},
        contentBlocks: (campaign.contentBlocks as unknown as Block[] | null) ?? [],
        step: 1,
        furthestStep: 1,
        senderName: process.env.BREVO_FROM_NAME || "Tavolo",
        senderEmail: process.env.BREVO_FROM_EMAIL || "marketing@tavolo.local",
        brandLogoUrl: ctx.venue.brandLogoUrl ?? "",
        brandPrimaryColor: ctx.venue.brandAccent ?? "",
      }}
    />
  );
}
