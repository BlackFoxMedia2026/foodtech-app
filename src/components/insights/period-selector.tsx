"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";

const PRESETS = [
  { key: "last7", label: "Ultimi 7 giorni" },
  { key: "last30", label: "Ultimi 30 giorni" },
  { key: "last90", label: "Ultimi 90 giorni" },
  { key: "currentMonth", label: "Mese corrente" },
  { key: "currentYear", label: "Anno corrente" },
  { key: "custom", label: "Personalizzato" },
] as const;

export function PeriodSelector({ range, from, to }: { range: string; from: string; to: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();

  function setRange(key: string) {
    const sp = new URLSearchParams(search);
    sp.set("range", key);
    router.push(`${pathname}?${sp.toString()}`);
  }

  function setCustom(field: "from" | "to", value: string) {
    const sp = new URLSearchParams(search);
    sp.set("range", "custom");
    sp.set(field, value);
    router.push(`${pathname}?${sp.toString()}`);
  }

  return (
    /*
      Sul telefono queste sei pillole andavano a capo su tre righe, e insieme
      alle quattro viste prendevano metà degli 844 pixel: al contenuto ne
      restavano 380. Qui scorrono in orizzontale su una riga sola — un gesto
      che sul telefono è naturale — e da `sm` tornano a disporsi su più righe,
      dove lo spazio c'è.
    */
    <div className="-mx-1 flex items-center gap-2 overflow-x-auto px-1 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0">
      {PRESETS.map((p) => (
        <Button
          key={p.key}
          size="sm"
          variant={range === p.key ? "default" : "outline"}
          className="shrink-0"
          onClick={() => setRange(p.key)}
        >
          {p.label}
        </Button>
      ))}
      {range === "custom" && (
        <div className="flex shrink-0 items-center gap-2 text-sm">
          <input
            type="date"
            value={from}
            max={to}
            onChange={(e) => setCustom("from", e.target.value)}
            className="rounded-md border border-input bg-background px-2 py-1 text-sm"
          />
          <span className="text-muted-foreground">→</span>
          <input
            type="date"
            value={to}
            min={from}
            onChange={(e) => setCustom("to", e.target.value)}
            className="rounded-md border border-input bg-background px-2 py-1 text-sm"
          />
        </div>
      )}
    </div>
  );
}
