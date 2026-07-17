import { UserCog, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

export default function WaitersPage() {
  return (
    <div className="space-y-6 animate-fade-in">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-widest text-muted-foreground">Sala</p>
          <h1 className="text-display text-3xl">Camerieri</h1>
        </div>
        <Button variant="gold">
          <Plus className="h-4 w-4" /> Nuovo cameriere
        </Button>
      </header>

      <div className="rounded-md border border-dashed p-12 text-center text-sm text-muted-foreground">
        <UserCog className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
        Nessun cameriere registrato ancora.
      </div>
    </div>
  );
}
