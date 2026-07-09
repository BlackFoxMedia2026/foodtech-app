"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";

const PRESETS = [
  { key: "week", label: "Settimana" },
  { key: "month", label: "Mese" },
  { key: "year", label: "Anno" },
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
    <div className="flex flex-wrap items-center gap-2">
      {PRESETS.map((p) => (
        <Button
          key={p.key}
          size="sm"
          variant={range === p.key ? "default" : "outline"}
          onClick={() => setRange(p.key)}
        >
          {p.label}
        </Button>
      ))}
      {range === "custom" && (
        <div className="flex items-center gap-2 text-sm">
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
