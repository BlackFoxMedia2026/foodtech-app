import { db } from "@/lib/db";
import { getActiveVenue } from "@/lib/tenant";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { FloorCanvas } from "@/components/floor/floor-canvas";

export const dynamic = "force-dynamic";

export default async function FloorPage() {
  const ctx = await getActiveVenue();
  const room = await db.room.findFirst({ where: { venueId: ctx.venueId } });
  const tables = await db.table.findMany({
    where: { venueId: ctx.venueId },
    orderBy: { label: "asc" },
  });

  const totalSeats = tables.reduce((s, t) => s + t.seats, 0);

  return (
    <div className="space-y-6 animate-fade-in">
      <header>
        <p className="text-xs uppercase tracking-widest text-muted-foreground">Sala</p>
        <h1 className="text-display text-3xl">{room?.name ?? "Mappa sala"}</h1>
        <p className="text-sm text-muted-foreground">
          {tables.length} tavoli · {totalSeats} posti totali
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Editor visuale</CardTitle>
          <CardDescription>
            Riorganizza la sala visivamente. Le modifiche restano locali finché non premi
            <span className="font-medium"> Salva sala</span>.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FloorCanvas
            initialTables={tables}
            width={room?.width ?? 1200}
            height={room?.height ?? 760}
          />
        </CardContent>
      </Card>
    </div>
  );
}
