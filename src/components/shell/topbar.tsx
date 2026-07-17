import Link from "next/link";
import { Bell, Search, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { VenueSwitcher } from "./venue-switcher";
import { ProfileMenu } from "./profile-menu";
import { LiquidSurface } from "./liquid-surface";

export function Topbar({
  user,
  venues,
  activeVenueId,
}: {
  user: { name?: string | null; email?: string | null };
  venues: { id: string; name: string; city: string | null }[];
  activeVenueId: string;
}) {
  return (
    <header className="relative z-10 flex h-20 items-center justify-between gap-4 border-b border-white/10 px-6">
      <div className="flex items-center gap-3">
        <VenueSwitcher venues={venues} activeId={activeVenueId} />
        <LiquidSurface className="hidden h-10 w-[300px] md:block" contentClassName="relative h-full w-full" radius="14px">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Cerca ospite, prenotazione, tavolo…"
            className="h-full w-full border-transparent bg-transparent pl-9"
          />
        </LiquidSurface>
      </div>

      <div className="flex items-center gap-3">
        <Button asChild size="sm" variant="gold" className="hidden sm:inline-flex">
          <Link href="/bookings/new">
            <Plus className="h-4 w-4" />
            Nuova prenotazione
          </Link>
        </Button>
        <Button size="icon" variant="ghost" aria-label="Notifiche" className="rounded-xl border border-white/10 bg-white/5">
          <Bell className="h-4 w-4" />
        </Button>
        <ProfileMenu user={user} />
      </div>
    </header>
  );
}
