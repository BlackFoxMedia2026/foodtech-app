"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronsUpDown, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

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
    <Select value={activeId} onValueChange={pick} disabled={pending}>
      <SelectTrigger className="w-[240px]">
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
  );
}
