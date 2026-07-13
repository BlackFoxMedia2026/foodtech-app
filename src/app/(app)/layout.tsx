import { Sidebar } from "@/components/shell/sidebar";
import { Topbar } from "@/components/shell/topbar";
import { AmbientScene } from "@/components/shell/ambient-scene";
import { LiquidGlassDefs } from "@/components/shell/liquid-glass-defs";
import { getActiveVenue } from "@/lib/tenant";

export default async function AppShell({ children }: { children: React.ReactNode }) {
  const ctx = await getActiveVenue();

  const venueList = ctx.allMemberships.map((m) => ({
    id: m.venue.id,
    name: m.venue.name,
    city: m.venue.city,
  }));

  return (
    <AmbientScene className="dark relative z-0 grid h-screen grid-cols-[288px_1fr] overflow-hidden bg-background text-foreground">
      <LiquidGlassDefs />
      <div className="mesh-bg pointer-events-none absolute -inset-32 -z-10">
        <div className="mesh-blob mesh-blob-1" />
        <div className="mesh-blob mesh-blob-2" />
        <div className="mesh-blob mesh-blob-3" />
        <div className="mesh-blob mesh-blob-4" />
        <div className="mesh-blob mesh-blob-5" />
        <div className="mesh-blob mesh-blob-6" />
      </div>
      <div className="pointer-events-none absolute inset-0 -z-10 bg-background/22" />
      <aside className="relative z-10 p-3.5">
        <Sidebar />
      </aside>
      <div className="relative z-10 flex h-screen flex-col">
        <Topbar
          user={{ name: ctx.session.user?.name, email: ctx.session.user?.email }}
          venues={venueList}
          activeVenueId={ctx.venueId}
        />
        <main className="flex-1 overflow-y-auto px-6 py-6 lg:px-8">{children}</main>
      </div>
    </AmbientScene>
  );
}
