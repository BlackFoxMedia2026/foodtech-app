import Link from "next/link";
import { getActiveVenue } from "@/lib/tenant";
import { listCampaigns } from "@/server/campaigns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { NewCampaignDialog } from "@/components/campaigns/new-campaign-dialog";
import { Megaphone } from "lucide-react";

export const dynamic = "force-dynamic";

const CHANNEL_TONE = {
  EMAIL: "info",
  SMS: "gold",
  WHATSAPP: "success",
} as const;

export default async function CampaignsPage() {
  const ctx = await getActiveVenue();
  const items = await listCampaigns(ctx.venueId);

  return (
    <div className="space-y-6 animate-fade-in">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-widest text-muted-foreground">Marketing</p>
          <h1 className="text-display text-3xl">Campagne</h1>
        </div>
        <NewCampaignDialog />
      </header>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {items.length === 0 && (
          <p className="rounded-md border border-dashed p-12 text-center text-sm text-muted-foreground md:col-span-3">
            Nessuna campagna ancora creata.
          </p>
        )}
        {items.map((c) => {
          const openRate = c.sentCount > 0 ? Math.round((c.openedCount / c.sentCount) * 100) : 0;
          return (
            <Link key={c.id} href={`/campaigns/${c.id}`}>
              <Card className="transition-colors hover:border-gilt-dark/50">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <Badge tone={CHANNEL_TONE[c.channel]}>{c.channel}</Badge>
                    <Badge tone="neutral">{c.status}</Badge>
                  </div>
                  <CardTitle className="flex items-center gap-2">
                    <Megaphone className="h-4 w-4 text-gilt-dark" />
                    {c.name}
                  </CardTitle>
                  {c.subject && <p className="text-sm text-muted-foreground">{c.subject}</p>}
                </CardHeader>
                <CardContent className="grid grid-cols-3 gap-3 text-sm">
                  <Metric label="Inviate" value={c.sentCount} />
                  <Metric label="Aperte" value={`${openRate}%`} />
                  <Metric label="Prenotazioni" value={c.bookedCount} />
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="text-display text-xl">{value}</p>
    </div>
  );
}
