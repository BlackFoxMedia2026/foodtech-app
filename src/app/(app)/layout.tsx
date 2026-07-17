import { Sidebar } from "@/components/shell/sidebar";
import { Topbar } from "@/components/shell/topbar";
import { AmbientScene } from "@/components/shell/ambient-scene";
import { AmbientBackground } from "@/components/shell/ambient-background";
import { LiquidGlassDefs } from "@/components/shell/liquid-glass-defs";
import { SidebarCollapseProvider } from "@/components/shell/sidebar-state";
import { getActiveVenue } from "@/lib/tenant";

export default async function AppShell({ children }: { children: React.ReactNode }) {
  const ctx = await getActiveVenue();

  const venueList = ctx.allMemberships.map((m) => ({
    id: m.venue.id,
    name: m.venue.name,
    city: m.venue.city,
  }));

  return (
    <SidebarCollapseProvider>
      <AmbientScene className="dark relative z-0 grid h-screen grid-cols-[var(--sidebar-w,288px)_1fr] overflow-hidden bg-background text-foreground transition-[grid-template-columns] duration-300 ease-in-out motion-reduce:transition-none">
        <LiquidGlassDefs />
        <AmbientBackground />
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
    </SidebarCollapseProvider>
  );
}
