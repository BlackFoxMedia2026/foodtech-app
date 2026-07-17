"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Building2 } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { LiquidSurface } from "@/components/shell/liquid-surface";

type Venue = { id: string; name: string; city: string | null };

export function VenueSwitcher({ venues, activeId }: { venues: Venue[]; activeId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  function pick(id: string) {
    start(async () => {
      await fetch("/api/tenant/venue", {
        method: "POST",
        body: JSON.stringify({ venueId: id }),
        headers: { "content-type": "application/json" },
      });
      router.refresh();
    });
  }

  return (
    <LiquidSurface className="h-10 w-[240px]" contentClassName="h-full w-full" radius="14px">
      <Select value={activeId} onValueChange={pick} disabled={pending}>
        <SelectTrigger className="h-full w-full border-transparent bg-transparent">
          <div className="flex items-center gap-2 truncate">
            <Building2 className="h-4 w-4 text-muted-foreground" />
            <SelectValue />
          </div>
        </SelectTrigger>
        <SelectContent>
          {venues.map((v) => (
            <SelectItem key={v.id} value={v.id}>
              <div className="flex flex-col">
                <span className="text-sm font-medium">{v.name}</span>
                {v.city && <span className="text-xs text-muted-foreground">{v.city}</span>}
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </LiquidSurface>
  );
}
