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
import { Corpo, Riga, Tabella, Td, Testa, Th } from "@/components/ui/table";

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

export function BookingsTable({ rows, fill = false }: { rows: Row[]; fill?: boolean }) {
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
    <Tabella densita="densa" fill={fill}>
      <Testa>
        <Th densita="densa">Orario</Th>
        <Th densita="densa">Ospite</Th>
        <Th densita="densa">Persone</Th>
        <Th className="hidden md:table-cell">Tavolo</Th>
        <Th className="hidden md:table-cell">Fonte</Th>
        <Th densita="densa">Stato</Th>
        <Th densita="densa" allineamento="right">
          Azioni
        </Th>
      </Testa>
      <Corpo>
          {rows.map((b) => {
            const name = b.guest ? `${b.guest.firstName} ${b.guest.lastName ?? ""}`.trim() : "Walk-in";
            const isPending = b.status === "PENDING";
            return (
              // Una riga in attesa di una decisione era dipinta con
              // `bg-red-50`: un rosso da tema chiaro, che su questo fondo
              // verde diventa una banda quasi bianca col testo illeggibile.
              // Non si vedeva perché la demo non ha quasi mai prenotazioni in
              // sospeso. Adesso è un bordo e un velo dell'accento.
              <Riga key={b.id} daDecidere={isPending}>
                <Td densita="densa" className="font-medium tabular-nums">{formatTime(b.startsAt)}</Td>
                <Td densita="densa">
                  <div className="flex items-center gap-2">
                    <Avatar className="hidden h-7 w-7 sm:flex">
                      <AvatarFallback className="text-[10px]">{initials(name)}</AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="font-medium">{name}</p>
                      {b.guest?.phone && <p className="text-xs text-muted-foreground">{b.guest.phone}</p>}
                    </div>
                  </div>
                </Td>
                <Td densita="densa" className="tabular-nums">{b.partySize}</Td>
                <Td className="hidden text-muted-foreground md:table-cell">{b.table?.label ?? "—"}</Td>
                <Td className="hidden md:table-cell"><SourceBadge source={b.source} /></Td>
                <Td densita="densa"><StatusBadge status={b.status} /></Td>
                <Td densita="densa">
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
                </Td>
              </Riga>
            );
          })}
      </Corpo>
    </Tabella>
  );
}
