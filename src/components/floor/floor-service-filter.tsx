"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

export function FloorServiceFilter({
  date,
  service,
  serviceOptions,
  variante = "riquadro",
}: {
  date: string;
  service: string;
  serviceOptions: string[];
  /** `barra`: il filtro è già dentro un riquadro — non ne serve un secondo attorno. */
  variante?: "riquadro" | "barra";
}) {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();

  function update(next: { date?: string; service?: string }) {
    const sp = new URLSearchParams(search);
    if (next.date) sp.set("date", next.date);
    if (next.service) sp.set("service", next.service);
    router.push(`${pathname}?${sp.toString()}`);
  }

  const inBarra = variante === "barra";

  return (
    <div className={cn("flex items-center", inBarra ? "gap-0.5 rounded-lg bg-secondary/60 p-0.5" : "gap-2 riquadro bg-card p-1")}>
      <input
        type="date"
        value={date}
        onChange={(e) => update({ date: e.target.value })}
        className={cn("bg-transparent px-2 text-sm font-medium focus:outline-none", inBarra && "h-8")}
      />
      <Select value={service} onValueChange={(v) => update({ service: v })}>
        {/* 36 px come gli altri controlli: su un tablet si tocca anche qui. */}
        <SelectTrigger
          className={cn(
            "border-0 bg-transparent",
            // Nella barra il nome del servizio non manda a capo la riga: si accorcia.
            inBarra ? "h-8 w-40 whitespace-nowrap [&>span]:truncate" : "h-9 w-36",
          )}
        >
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
    </div>
  );
}
