"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

/**
 * Adds the "servizio" concept to the Prenotazioni page (it didn't have one
 * before — reused from the same Shift-backed options already used on
 * Sala/Camerieri, brief section 6/8) without touching the existing `day`
 * param or the list view's own filters.
 */
export function BookingServiceSelect({
  service,
  serviceOptions,
  className,
}: {
  service: string;
  serviceOptions: string[];
  /** La barra dei comandi impone la sua altezza e il suo raggio a tutti i
   *  controlli: qui il selettore la riceve invece di dichiararne una sua. */
  className?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();

  function update(next: string) {
    const sp = new URLSearchParams(search);
    sp.set("service", next);
    router.push(`${pathname}?${sp.toString()}`);
  }

  if (serviceOptions.length === 0) return null;

  return (
    <Select value={service} onValueChange={update}>
      <SelectTrigger className={cn("h-9 w-36 border-border bg-card", className)}>
        <SelectValue placeholder="Servizio" />
      </SelectTrigger>
      <SelectContent>
        {serviceOptions.map((s) => (
          <SelectItem key={s} value={s}>
            {s}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
