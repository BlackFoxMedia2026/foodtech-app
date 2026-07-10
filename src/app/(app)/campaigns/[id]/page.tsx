import { notFound } from "next/navigation";
import { getActiveVenue } from "@/lib/tenant";
import { getCampaign, resolveSegment, type SegmentFilterType } from "@/server/campaigns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CampaignActions } from "@/components/campaigns/campaign-actions";
import { CampaignResultsChart } from "@/components/campaigns/campaign-results-chart";

export const dynamic = "force-dynamic";

const LOYALTY_LABELS: Record<string, string> = {
  NEW: "Nuovo",
  REGULAR: "Abituale",
  VIP: "VIP",
  AMBASSADOR: "Ambassador",
};

export default async function CampaignDetailPage({ params }: { params: { id: string } }) {
  const ctx = await getActiveVenue();
  const campaign = await getCampaign(ctx.venueId, params.id);
  if (!campaign) notFound();

  const segment = (campaign.segment as SegmentFilterType | null) ?? {};
  const matchingGuests = campaign.status === "DRAFT" ? await resolveSegment(ctx.venueId, segment) : [];

  return (
    <div className="space-y-6 animate-fade-in">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-widest text-muted-foreground">Marketing / Campagne</p>
          <h1 className="text-display text-3xl">{campaign.name}</h1>
        </div>
        <Badge tone="neutral">{campaign.status}</Badge>
      </header>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Segmento</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {segment.tags && segment.tags.length > 0 && (
              <p>
                <span className="text-muted-foreground">Tag:</span> {segment.tags.join(", ")}
              </p>
            )}
            {segment.loyaltyTier && (
              <p>
                <span className="text-muted-foreground">Livello fedeltà:</span> {LOYALTY_LABELS[segment.loyaltyTier]}
              </p>
            )}
            {segment.minTotalVisits !== undefined && (
              <p>
                <span className="text-muted-foreground">Visite minime:</span> {segment.minTotalVisits}
              </p>
            )}
            {segment.inactiveDays !== undefined && (
              <p>
                <span className="text-muted-foreground">Inattivo da:</span> {segment.inactiveDays} giorni
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              Solo clienti con consenso marketing attivo ed email valida vengono inclusi.
            </p>
            {campaign.status === "DRAFT" && (
              <p className="pt-2 text-sm font-medium">
                {matchingGuests.length} clienti corrispondono al segmento oggi
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Contenuto</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>
              <span className="text-muted-foreground">Oggetto:</span> {campaign.subject}
            </p>
            <div
              className="rounded-md border bg-secondary/30 p-3 text-xs"
              dangerouslySetInnerHTML={{ __html: campaign.body || "" }}
            />
          </CardContent>
        </Card>
      </div>

      {campaign.status === "DRAFT" && (
        <Card>
          <CardHeader>
            <CardTitle>Invio</CardTitle>
          </CardHeader>
          <CardContent>
            <CampaignActions campaignId={campaign.id} />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Risultati</CardTitle>
        </CardHeader>
        <CardContent>
          <CampaignResultsChart
            sentCount={campaign.sentCount}
            openedCount={campaign.openedCount}
            bookedCount={campaign.bookedCount}
          />
        </CardContent>
      </Card>
    </div>
  );
}
