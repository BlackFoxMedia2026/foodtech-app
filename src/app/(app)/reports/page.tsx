import { Flag } from "lucide-react";

export const dynamic = "force-dynamic";

export default function ReportsPage() {
  return (
    <div className="space-y-6 animate-fade-in">
      <header>
        <p className="text-xs uppercase tracking-widest text-muted-foreground">Ospiti</p>
        <h1 className="text-display text-3xl">Segnalazioni</h1>
      </header>

      <div className="rounded-md border border-dashed p-12 text-center text-sm text-muted-foreground">
        <Flag className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
        Nessuna segnalazione registrata ancora.
      </div>
    </div>
  );
}
