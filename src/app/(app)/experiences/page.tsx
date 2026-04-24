import { db } from "@/lib/db";
import { getActiveVenue } from "@/lib/tenant";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatCurrency, formatDateTime } from "@/lib/utils";
import { Plus, Sparkles } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function ExperiencesPage() {
  const ctx = await getActiveVenue();
  const items = await db.experience.findMany({
    where: { venueId: ctx.venueId },
    orderBy: { startsAt: "asc" },
    include: { tickets: true },
  });

  return (
    <div className="space-y-6 animate-fade-in">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-widest text-muted-foreground">Programma</p>
          <h1 className="text-display text-3xl">Esperienze</h1>
          <p className="text-sm text-muted-foreground">{items.length} eventi in calendario</p>
        </div>
        <Button variant="gold"><Plus className="h-4 w-4" /> Nuova esperienza</Button>
      </header>

      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        {items.length === 0 && (
          <p className="rounded-md border border-dashed p-12 text-center text-sm text-muted-foreground md:col-span-3">
            Nessuna esperienza creata.
          </p>
        )}
        {items.map((e) => {
          const sold = e.tickets.reduce((s, t) => s + t.quantity, 0);
          return (
            <Card key={e.id}>
              <CardHeader>
                <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-gilt-dark">
                  <Sparkles className="h-3.5 w-3.5" />
                  {e.published ? "Pubblicata" : "Bozza"}
                </div>
                <CardTitle>{e.title}</CardTitle>
                <p className="text-sm text-muted-foreground">{formatDateTime(e.startsAt)}</p>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                {e.description && <p className="text-muted-foreground">{e.description}</p>}
                <div className="flex items-center justify-between">
                  <Badge tone="gold">{formatCurrency(e.priceCents, ctx.venue.currency)}</Badge>
                  <span className="text-xs text-muted-foreground">
                    {sold}/{e.capacity} ticket
                  </span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
                  <div
                    className="h-full bg-gilt"
                    style={{ width: `${Math.min(100, (sold / e.capacity) * 100)}%` }}
                  />
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
