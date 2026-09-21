import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * Panoramica e Storico, due indirizzi e non due stati.
 *
 * Stessa forma dell'interruttore dello Staff — pillola, bordo tenue, nessun
 * colore nuovo — e stessa ragione: «mandami lo storico di questo cliente» deve
 * poter essere un link. Con uno stato nel browser quel link riporterebbe tutti
 * alla panoramica.
 */
export function Linguette({ venueId, attiva }: { venueId: string; attiva: "panoramica" | "storico" }) {
  const voci = [
    { chiave: "panoramica" as const, testo: "Panoramica", href: `/admin/costi/${venueId}` },
    { chiave: "storico" as const, testo: "Storico", href: `/admin/costi/${venueId}?tab=storico` },
  ];

  return (
    <nav
      aria-label="Vista dei costi del cliente"
      className="flex items-center gap-0.5 rounded-full border border-border/60 bg-cream/[0.04] p-0.5"
    >
      {voci.map((v) => (
        <Link
          key={v.chiave}
          href={v.href}
          scroll={false}
          aria-current={v.chiave === attiva ? "page" : undefined}
          className={cn(
            "rounded-full px-3 py-1.5 text-sm transition-colors",
            v.chiave === attiva
              ? "bg-cream/10 text-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {v.testo}
        </Link>
      ))}
    </nav>
  );
}
