import Link from "next/link";
import { Bell, Search, Plus } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { initials } from "@/lib/utils";
import { VenueSwitcher } from "./venue-switcher";

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
        <div className="relative hidden md:block">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Cerca ospite, prenotazione, tavolo…"
            className="h-10 w-[300px] rounded-xl border-white/10 bg-white/5 pl-9 backdrop-blur-xl"
          />
        </div>
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
        <Avatar className="h-10 w-10 border border-white/10">
          <AvatarFallback className="bg-foreground text-background">{initials(user.name ?? user.email)}</AvatarFallback>
        </Avatar>
      </div>
    </header>
  );
}
