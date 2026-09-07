"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Booking, Guest, Table } from "@prisma/client";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { StatusBadge, SourceBadge } from "@/components/bookings/status-badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Check, MoreHorizontal } from "lucide-react";
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
    /* Sette colonne su 390 px non si leggono. Su telefono restano le quattro
       che servono a riconoscere una prenotazione — ora, chi, quanti, come sta
       — e spariscono tavolo e provenienza, che si guardano da fermi. */
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <table className="w-full text-sm">
        <thead className="border-b border-border bg-secondary/50 text-xs uppercase tracking-wider text-muted-foreground">
          <tr>
            <th className="px-2 py-3 text-left md:px-4">Orario</th>
            <th className="px-2 py-3 text-left md:px-4">Ospite</th>
            <th className="px-2 py-3 text-left md:px-4">Persone</th>
            <th className="hidden px-4 py-3 text-left md:table-cell">Tavolo</th>
            <th className="hidden px-4 py-3 text-left md:table-cell">Fonte</th>
            <th className="px-2 py-3 text-left md:px-4">Stato</th>
            <th className="px-2 py-3 text-right md:px-4">Azioni</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((b) => {
            const name = b.guest ? `${b.guest.firstName} ${b.guest.lastName ?? ""}`.trim() : "Walk-in";
            const isPending = b.status === "PENDING";
            return (
              <tr
                key={b.id}
                className={`transition-colors ${isPending ? "bg-red-50 hover:bg-red-100" : "hover:bg-secondary/30"}`}
              >
                <td className="px-2 py-3 font-medium md:px-4">{formatTime(b.startsAt)}</td>
                <td className="px-2 py-3 md:px-4">
                  <div className="flex items-center gap-2">
                    <Avatar className="hidden h-7 w-7 sm:flex">
                      <AvatarFallback className="text-[10px]">{initials(name)}</AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="font-medium">{name}</p>
                      {b.guest?.phone && <p className="text-xs text-muted-foreground">{b.guest.phone}</p>}
                    </div>
                  </div>
                </td>
                <td className="px-2 py-3 md:px-4">{b.partySize}</td>
                <td className="hidden px-4 py-3 text-muted-foreground md:table-cell">{b.table?.label ?? "—"}</td>
                <td className="hidden px-4 py-3 md:table-cell"><SourceBadge source={b.source} /></td>
                <td className="px-2 py-3 md:px-4"><StatusBadge status={b.status} /></td>
                <td className="px-2 py-3 md:px-4">
                  <div className="flex items-center justify-end gap-2">
                    {isPending ? (
                      <>
                        <Button
                          size="sm"
                          className="bg-green-600 hover:bg-green-700"
                          onClick={() => changeStatus(b.id, "CONFIRMED")}
                        >
                          Approva
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => changeStatus(b.id, "CANCELLED")}
                        >
                          Rifiuta
                        </Button>
                      </>
                    ) : (
                      /* Era un menu a tendina largo 140 px che ripeteva la
                         stessa parola già scritta nella colonna Stato: due
                         elementi per la stessa informazione, su ogni riga.
                         Ora la colonna Stato si legge, e il cambio è
                         un'azione — con il nome della persona nell'etichetta,
                         perché su tredici righe uguali serve sapere quale. */
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            aria-label={`Cambia lo stato di ${name}`}
                            title="Cambia stato"
                          >
                            <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {STATUS_OPTIONS.map(([k, l]) => (
                            <DropdownMenuItem key={k} onSelect={() => changeStatus(b.id, k)}>
                              <span className="flex-1">{l}</span>
                              {b.status === k && <Check className="ml-2 h-3.5 w-3.5" aria-hidden="true" />}
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
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
