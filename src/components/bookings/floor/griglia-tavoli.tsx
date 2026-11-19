"use client";

import { useDroppable } from "@dnd-kit/core";
import type { Table } from "@prisma/client";
import { LayoutGrid, Lock, Users } from "lucide-react";
import { cn, formatTime } from "@/lib/utils";
import type { FloorBooking } from "./booking-table-node";

/**
 * La Mappa di una sala che in Sala non ha ancora tavoli sulla piantina.
 *
 * Prima era un riquadro grigio vuoto con «Apri Sala», e le prenotazioni già
 * sedute su quei tavoli finivano tutte in «Da assegnare» con la scritta «che
 * non è sulla piantina». Adesso i tavoli della sala stanno in griglia, in
 * ordine di nome: ognuno dice chi ci siede in questo servizio, accetta una
 * prenotazione trascinata e si apre con un tocco, come sulla piantina. La
 * striscia in alto dice che non è la sala vera e porta dove si dispone.
 */
export function GrigliaTavoli({
  tables,
  bookingsByTableId,
  roomId,
  selectedTableId,
  onSelectTable,
  draggingPartySize,
  occupiedTableIds,
}: {
  tables: Table[];
  bookingsByTableId: Record<string, FloorBooking[]>;
  roomId: string;
  selectedTableId: string | null;
  onSelectTable: (tableId: string) => void;
  draggingPartySize: number | null;
  occupiedTableIds?: Set<string>;
}) {
  const isDragActive = draggingPartySize !== null;
  const ordinati = [...tables].sort((a, b) => a.label.localeCompare(b.label, "it", { numeric: true }));
  const occupati = ordinati.filter((t) => (bookingsByTableId[t.id]?.length ?? 0) > 0).length;

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border/60 px-4 py-3">
        <LayoutGrid className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <p className="min-w-0 flex-1 text-sm text-muted-foreground">
          <span className="font-medium text-foreground">
            {occupati} di {ordinati.length} tavoli prenotati
          </span>
          <span className="max-sm:block max-sm:text-xs">
            <span className="max-sm:hidden">{" · "}</span>in griglia: non sono ancora sulla piantina
          </span>
        </p>
        <a href={`/floor?room=${roomId}`} className="text-sm font-medium text-accent-strong hover:underline">
          Disponili in Sala
        </a>
      </div>

      {ordinati.length === 0 ? (
        <div className="grid flex-1 place-items-center p-8 text-center text-sm text-muted-foreground">
          <div className="space-y-2">
            <p className="font-medium text-foreground">Questa sala non ha tavoli</p>
            <a href={`/floor?room=${roomId}`} className="font-medium text-accent-strong hover:underline">
              Aggiungili in Sala
            </a>
          </div>
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-4">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-[repeat(auto-fill,minmax(176px,1fr))] sm:gap-3">
            {ordinati.map((t) => (
              <TavoloInGriglia
                key={t.id}
                table={t}
                bookings={bookingsByTableId[t.id] ?? []}
                isSelected={selectedTableId === t.id}
                isDragActive={isDragActive}
                isCompatibile={isDragActive && t.active && t.seats >= (draggingPartySize ?? 0) && !occupiedTableIds?.has(t.id)}
                onSelect={onSelectTable}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function nomeOspite(b: FloorBooking) {
  return b.guest ? `${b.guest.firstName} ${b.guest.lastName ?? ""}`.trim() : "Walk-in";
}

function TavoloInGriglia({
  table,
  bookings,
  isSelected,
  isDragActive,
  isCompatibile,
  onSelect,
}: {
  table: Table;
  bookings: FloorBooking[];
  isSelected: boolean;
  isDragActive: boolean;
  isCompatibile: boolean;
  onSelect: (tableId: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: table.id,
    data: { type: "table", tableId: table.id, seats: table.seats },
  });
  const prenotato = bookings.length > 0;
  const mostrate = bookings.slice(0, 2);
  const altre = bookings.length - mostrate.length;

  return (
    <button
      ref={setNodeRef}
      type="button"
      onClick={() => onSelect(table.id)}
      className={cn(
        "relative flex min-h-[104px] min-w-0 flex-col overflow-hidden rounded-2xl border p-3 text-left transition-all",
        prenotato
          ? "border-white/70 bg-white/80 shadow-[0_8px_24px_-14px_rgba(16,32,26,0.45)] dark:border-border dark:bg-card"
          : "border-transparent bg-black/[0.035] dark:bg-white/[0.04]",
        !table.active && "opacity-60",
        isSelected && "ring-2 ring-accent",
        isDragActive && !isCompatibile && "opacity-40",
        isDragActive && isCompatibile && "border-solid border-sage ring-2 ring-sage/60",
        isOver && isCompatibile && "scale-[1.03] ring-4 ring-sage",
        !isDragActive && "hover:-translate-y-0.5 hover:shadow-md",
      )}
    >
      {/* Il filo verde a sinistra: i tavoli prenotati si contano a colpo d'occhio. */}
      {prenotato && <span className="absolute inset-y-3 left-0 w-1 rounded-r-full bg-accent" aria-hidden="true" />}
      <div className="flex w-full items-center justify-between gap-2">
        <span className={cn("text-display text-lg font-semibold leading-none", prenotato ? "text-foreground" : "text-muted-foreground")}>
          {table.label}
        </span>
        {/* I posti in una capsula, grandi quasi quanto il nome del tavolo: è
            il numero che si cerca per primo quando si deve sistemare qualcuno.
            Prima era un «6» da 12px grigio, che sui tavoli liberi spariva. */}
        <span className="flex shrink-0 items-center gap-1.5">
          {!table.active && <Lock className="h-3.5 w-3.5 text-muted-foreground" aria-label="Bloccato" />}
          <span
            className={cn(
              "flex items-center gap-1 rounded-full px-2 py-0.5 text-sm font-semibold tabular-nums",
              prenotato ? "bg-accent/15 text-accent-strong" : "bg-black/[0.06] text-foreground dark:bg-white/10",
              isDragActive && isCompatibile && "bg-sage/25 text-foreground",
            )}
            title={`${table.seats} posti`}
          >
            <Users className="h-3.5 w-3.5" aria-hidden="true" />
            {table.seats}
            <span className="sr-only"> posti</span>
          </span>
        </span>
      </div>

      {prenotato ? (
        <ul className="mt-2.5 w-full min-w-0 space-y-1.5">
          {mostrate.map((b) => (
            /* Ora e coperti sopra, il nome sotto a tutta larghezza: affiancati,
               in una scheda da 170px il nome restava «Marco …». */
            <li key={b.id} className="min-w-0 text-sm">
              <span className="flex items-baseline gap-1.5 text-xs tabular-nums">
                <span className="font-semibold text-accent-strong">{formatTime(b.startsAt)}</span>
                <span className={b.partySize > table.seats ? "font-medium text-destructive" : "text-muted-foreground"}>
                  · {b.partySize} {b.partySize === 1 ? "persona" : "persone"}
                </span>
              </span>
              <span className="block truncate font-medium text-foreground" title={nomeOspite(b)}>
                {nomeOspite(b)}
              </span>
            </li>
          ))}
          {altre > 0 && <li className="text-xs text-muted-foreground">+{altre} {altre === 1 ? "altra" : "altre"}</li>}
        </ul>
      ) : (
        <p className="mt-auto pt-3 text-xs text-muted-foreground/80">{isDragActive && isCompatibile ? "Rilascia qui" : "Libero"}</p>
      )}
    </button>
  );
}
