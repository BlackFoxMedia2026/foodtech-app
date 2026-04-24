"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export function DayPicker({ value }: { value: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();

  function go(day: string) {
    const sp = new URLSearchParams(search);
    sp.set("day", day);
    router.push(`${pathname}?${sp.toString()}`);
  }

  function shift(delta: number) {
    const d = new Date(value);
    d.setDate(d.getDate() + delta);
    go(d.toISOString().slice(0, 10));
  }

  const label = new Date(value).toLocaleDateString("it-IT", {
    weekday: "long",
    day: "2-digit",
    month: "long",
  });

  return (
    <div className="flex items-center gap-1 rounded-md border border-border bg-card p-1">
      <Button size="icon" variant="ghost" onClick={() => shift(-1)} aria-label="Giorno precedente">
        <ChevronLeft className="h-4 w-4" />
      </Button>
      <input
        type="date"
        value={value}
        onChange={(e) => go(e.target.value)}
        className="bg-transparent px-2 text-sm font-medium capitalize focus:outline-none"
      />
      <span className="hidden text-sm text-muted-foreground md:inline">{label}</span>
      <Button size="icon" variant="ghost" onClick={() => shift(1)} aria-label="Giorno successivo">
        <ChevronRight className="h-4 w-4" />
      </Button>
      <Button size="sm" variant="subtle" onClick={() => go(new Date().toISOString().slice(0, 10))}>
        Oggi
      </Button>
    </div>
  );
}
