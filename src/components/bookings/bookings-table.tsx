"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Booking, Guest, Table } from "@prisma/client";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { StatusBadge, SourceBadge } from "@/components/bookings/status-badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatTime, initials } from "@/lib/utils";

type Row = Booking & { guest: Guest | null; table: Table | null };

const STATUS_OPTIONS = [
  ["CONFIRMED", "Confermata"],
  ["PENDING", "In attesa"],
  ["ARRIVED", "Arrivato"],
  ["SEATED", "Seduto"],
  ["COMPLETED", "Completata"],
  ["CANCELLED", "Cancellata"],
  ["NO_SHOW", "No-show"],
] as const;

export function BookingsTable({ rows }: { rows: Row[] }) {
  const router = useRouter();

  async function changeStatus(id: string, status: string) {
    await fetch(`/api/bookings/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
      headers: { "content-type": "application/json" },
    });
    router.refresh();
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-md border border-dashed p-12 text-center text-sm text-muted-foreground">
        Nessuna prenotazione per questa data.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <table className="w-full text-sm">
        <thead className="border-b border-border bg-secondary/50 text-xs uppercase tracking-wider text-muted-foreground">
          <tr>
            <th className="px-4 py-3 text-left">Orario</th>
            <th className="px-4 py-3 text-left">Ospite</th>
            <th className="px-4 py-3 text-left">Persone</th>
            <th className="px-4 py-3 text-left">Tavolo</th>
            <th className="px-4 py-3 text-left">Fonte</th>
            <th className="px-4 py-3 text-left">Stato</th>
            <th className="px-4 py-3 text-right">Azioni</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((b) => {
            const name = b.guest ? `${b.guest.firstName} ${b.guest.lastName ?? ""}`.trim() : "Walk-in";
            return (
              <tr key={b.id} className="transition-colors hover:bg-secondary/30">
                <td className="px-4 py-3 font-medium">{formatTime(b.startsAt)}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <Avatar className="h-7 w-7">
                      <AvatarFallback className="text-[10px]">{initials(name)}</AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="font-medium">{name}</p>
                      {b.guest?.phone && <p className="text-xs text-muted-foreground">{b.guest.phone}</p>}
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3">{b.partySize}</td>
                <td className="px-4 py-3 text-muted-foreground">{b.table?.label ?? "—"}</td>
                <td className="px-4 py-3"><SourceBadge source={b.source} /></td>
                <td className="px-4 py-3"><StatusBadge status={b.status} /></td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-2">
                    <Select value={b.status} onValueChange={(v) => changeStatus(b.id, v)}>
                      <SelectTrigger className="h-8 w-[140px] text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {STATUS_OPTIONS.map(([k, l]) => (
                          <SelectItem key={k} value={k}>{l}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button asChild variant="ghost" size="sm">
                      <Link href={`/bookings/${b.id}`}>Apri</Link>
                    </Button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
