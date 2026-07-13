import { db } from "@/lib/db";
import { getActiveVenue } from "@/lib/tenant";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { initials } from "@/lib/utils";

export const dynamic = "force-dynamic";

const ROLE_LABELS = {
  MANAGER: "Manager",
  RECEPTION: "Reception",
  WAITER: "Cameriere",
  MARKETING: "Marketing",
  READ_ONLY: "Sola lettura",
} as const;

export default async function SettingsPage() {
  const ctx = await getActiveVenue();
  const [venues, members, shifts] = await Promise.all([
    db.venue.findMany({ where: { orgId: ctx.orgId }, orderBy: { name: "asc" } }),
    db.venueMembership.findMany({
      where: { venueId: ctx.venueId },
      include: { user: true },
    }),
    db.shift.findMany({
      where: { venueId: ctx.venueId, weekday: 0 },
      orderBy: { startMinute: "asc" },
    }),
  ]);

  return (
    <div className="space-y-6 animate-fade-in">
      <header>
        <p className="text-xs uppercase tracking-widest text-muted-foreground">Configurazione</p>
        <h1 className="text-display text-3xl">Impostazioni</h1>
      </header>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Locali del gruppo</CardTitle>
            <CardDescription>{ctx.org.name} · piano {ctx.org.plan}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {venues.map((v) => (
              <div key={v.id} className="flex items-center justify-between rounded-md border p-3 text-sm">
                <div>
                  <p className="font-medium">{v.name}</p>
                  <p className="text-xs text-muted-foreground">{v.city ?? ""} · {v.kind}</p>
                </div>
                {v.id === ctx.venueId && <Badge tone="gold">Attivo</Badge>}
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Team</CardTitle>
            <CardDescription>Accessi al locale corrente</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {members.map((m) => (
              <div key={m.id} className="flex items-center justify-between rounded-md border p-3 text-sm">
                <div className="flex items-center gap-3">
                  <Avatar className="h-8 w-8"><AvatarFallback>{initials(m.user.name ?? m.user.email)}</AvatarFallback></Avatar>
                  <div>
                    <p className="font-medium">{m.user.name ?? m.user.email}</p>
                    <p className="text-xs text-muted-foreground">{m.user.email}</p>
                  </div>
                </div>
                <Badge tone="neutral">{ROLE_LABELS[m.role]}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Turni di servizio (domenica esempio)</CardTitle>
          <CardDescription>Gestisci capienza e durata slot per ogni turno</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-3">
          {shifts.map((s) => (
            <div key={s.id} className="rounded-md border p-3 text-sm">
              <p className="font-medium">{s.name}</p>
              <p className="text-xs text-muted-foreground">
                {String(Math.floor(s.startMinute / 60)).padStart(2, "0")}:00 –{" "}
                {String(Math.floor(s.endMinute / 60)).padStart(2, "0")}:00
              </p>
              <p className="mt-2 text-xs">Capienza: {s.capacity} · Slot: {s.slotMinutes}&apos;</p>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
