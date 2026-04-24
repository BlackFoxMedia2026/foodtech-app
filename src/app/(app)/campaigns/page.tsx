import { db } from "@/lib/db";
import { getActiveVenue } from "@/lib/tenant";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Megaphone, Plus } from "lucide-react";

export const dynamic = "force-dynamic";

const CHANNEL_TONE = {
  EMAIL: "info",
  SMS: "gold",
  WHATSAPP: "success",
} as const;

export default async function CampaignsPage() {
  const ctx = await getActiveVenue();
  const items = await db.campaign.findMany({
    where: { venueId: ctx.venueId },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="space-y-6 animate-fade-in">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-widest text-muted-foreground">Marketing</p>
          <h1 className="text-display text-3xl">Campagne</h1>
        </div>
        <Button variant="gold"><Plus className="h-4 w-4" /> Nuova campagna</Button>
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
            <Card key={c.id}>
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
