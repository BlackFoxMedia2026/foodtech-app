import Link from "next/link";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * «Nuova persona». Era il grilletto di una modale; ora porta alla pagina a
 * passi `/staff/nuova`, che ha lo spazio per tutti i campi della scheda.
 */
export function NuovaPersonaPulsante({ className }: { className?: string }) {
  return (
    <Button asChild variant="accent" className={className}>
      <Link href="/staff/nuova">
        <Plus className="h-4 w-4" aria-hidden="true" /> Nuova persona
      </Link>
    </Button>
  );
}
