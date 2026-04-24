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
    <header className="flex h-16 items-center justify-between gap-4 border-b border-border bg-background/80 px-6 backdrop-blur">
      <div className="flex items-center gap-3">
        <VenueSwitcher venues={venues} activeId={activeVenueId} />
        <div className="relative hidden md:block">
          <Search className="pointer-events-none absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Cerca ospite, prenotazione, tavolo…" className="h-9 w-[300px] pl-8" />
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Button asChild size="sm" variant="gold" className="hidden sm:inline-flex">
          <Link href="/bookings/new">
            <Plus className="h-4 w-4" />
            Nuova prenotazione
          </Link>
        </Button>
        <Button size="icon" variant="ghost" aria-label="Notifiche">
          <Bell className="h-4 w-4" />
        </Button>
        <Avatar className="h-9 w-9">
          <AvatarFallback>{initials(user.name ?? user.email)}</AvatarFallback>
        </Avatar>
      </div>
    </header>
  );
}
