"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutList, Map } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Due modi di guardare la stessa cosa.
 *
 * Durante il servizio si passa continuamente dall'elenco («chi arriva
 * adesso?») alla pianta («dove lo metto?»). Sono la stessa realtà da due
 * angoli, e tenerle in due sezioni distanti costringerebbe a navigare invece
 * di guardare.
 */
export function ServiceSwitch() {
  const pathname = usePathname();
  const voci = [
    { href: "/service", label: "Elenco", icon: LayoutList },
    { href: "/service/room", label: "Sala", icon: Map },
  ];

  return (
    <div className="flex gap-1 rounded-full border border-border bg-muted/70 p-1">
      {voci.map(({ href, label, icon: Icon }) => {
        const attivo = pathname === href;
        return (
          <Link
            key={href}
            href={href}
            aria-current={attivo ? "page" : undefined}
            className={cn(
              "flex min-h-[40px] items-center gap-1.5 rounded-full px-3 text-sm font-medium transition-colors",
              attivo ? "bg-cream text-clay-ink" : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className="h-4 w-4" aria-hidden="true" />
            {label}
          </Link>
        );
      })}
    </div>
  );
}
