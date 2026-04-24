import { Sidebar } from "@/components/shell/sidebar";
import { Topbar } from "@/components/shell/topbar";
import { getActiveVenue } from "@/lib/tenant";

export default async function AppShell({ children }: { children: React.ReactNode }) {
  const ctx = await getActiveVenue();

  const venueList = ctx.allMemberships.map((m) => ({
    id: m.venue.id,
    name: m.venue.name,
    city: m.venue.city,
  }));

  return (
    <div className="grid min-h-screen grid-cols-[260px_1fr]">
      <aside className="border-r border-border bg-sand-50/40">
        <Sidebar />
      </aside>
      <div className="flex min-h-screen flex-col">
        <Topbar
          user={{ name: ctx.session.user?.name, email: ctx.session.user?.email }}
          venues={venueList}
          activeVenueId={ctx.venueId}
        />
        <main className="flex-1 px-6 py-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
