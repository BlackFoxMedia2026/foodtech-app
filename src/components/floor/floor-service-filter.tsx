"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export function FloorServiceFilter({ date, service, serviceOptions }: { date: string; service: string; serviceOptions: string[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();

  function update(next: { date?: string; service?: string }) {
    const sp = new URLSearchParams(search);
    if (next.date) sp.set("date", next.date);
    if (next.service) sp.set("service", next.service);
    router.push(`${pathname}?${sp.toString()}`);
  }

  return (
    <div className="flex items-center gap-2 rounded-md border border-border bg-card p-1">
      <input
        type="date"
        value={date}
        onChange={(e) => update({ date: e.target.value })}
        className="bg-transparent px-2 text-sm font-medium focus:outline-none"
      />
      <Select value={service} onValueChange={(v) => update({ service: v })}>
        <SelectTrigger className="h-8 w-36 border-0 bg-transparent">
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
