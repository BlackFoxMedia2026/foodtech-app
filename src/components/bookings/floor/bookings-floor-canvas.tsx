"use client";

import { useMemo } from "react";
import type { RoomLayoutMode, Table } from "@prisma/client";
import { MapIcon } from "lucide-react";
import { OperationalRoomView } from "@/components/floor/operational/operational-room-view";
import { TABLE_SIZE } from "@/components/floor/table-node";
import { parseRoomLayoutElements, getRoomBounds } from "@/lib/room-layout";
import { DroppableRoomTable } from "./droppable-room-table";
import type { FloorBooking } from "@/components/floor/operational/room-table-node";

/**
 * Read-only counterpart to FloorCanvas (brief section 8: "Reservation mode,
 * NON modalità editor") — composes the same OperationalRoomView shell as
 * Sala so pan/zoom/fit/coordinates/shapes/floor-surface/zones are pixel-
 * identical, but never lets a table be repositioned and swaps the
 * staff-assignment badge for booking info + a dnd-kit drop target.
 */
export function BookingsFloorCanvas({
  tables,
  bookingsByTableId,
  floorPlanUrl,
  activeLayoutMode,
  roomLayoutElements,
  width,
  height,
  roomId,
  selectedTableId,
  onSelectTable,
  draggingPartySize,
  occupiedTableIds,
}: {
  tables: Table[];
  bookingsByTableId: Record<string, FloorBooking[]>;
  floorPlanUrl: string | null;
  activeLayoutMode: RoomLayoutMode | null;
  roomLayoutElements: unknown;
  width: number;
  height: number;
  roomId: string;
  selectedTableId: string | null;
  onSelectTable: (tableId: string) => void;
  draggingPartySize: number | null;
  /** Tables that already have a conflicting booking for the dragged
   * reservation's time slot — excluded from the "compatible" highlight even
   * when capacity would otherwise qualify (brief section 16/17: prioritize
   * tables that are genuinely free, not just big enough). */
  occupiedTableIds?: Set<string>;
}) {
  const parsedLayoutElements = useMemo(() => parseRoomLayoutElements(roomLayoutElements), [roomLayoutElements]);
  const roomBounds = useMemo(
    () =>
      getRoomBounds(
        { width, height, activeLayoutMode },
        parsedLayoutElements,
        tables.map((t) => ({ x: t.posX, y: t.posY, ...TABLE_SIZE[t.shape] })),
      ),
    [width, height, activeLayoutMode, parsedLayoutElements, tables],
  );

  const isDragActive = draggingPartySize !== null;

  return (
    <OperationalRoomView
      width={width}
      height={height}
      roomBounds={roomBounds}
      floorPlanUrl={floorPlanUrl}
      activeLayoutMode={activeLayoutMode}
      roomLayoutElements={parsedLayoutElements}
      tables={tables}
      onBackgroundClick={() => onSelectTable("")}
      emptyPlanSlot={
        <>
          Questa sala non ha ancora una mappa.
          <a href={`/floor?room=${roomId}`} className="font-medium text-accent-strong hover:underline">
            Gestisci piantina
          </a>
        </>
      }
      noTablesSlot={
        <div className="pointer-events-auto flex flex-col items-center gap-2 rounded-md border border-dashed border-border bg-card/90 px-6 py-8 text-center">
          <MapIcon className="h-6 w-6 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Questa sala non ha ancora tavoli.</p>
        </div>
      }
      renderTable={(t) => (
        <DroppableRoomTable
          key={t.id}
          table={t}
          bookings={bookingsByTableId[t.id] ?? []}
          isSelected={selectedTableId === t.id}
          isDragActive={isDragActive}
          isCompatibleDropTarget={isDragActive && t.active && t.seats >= (draggingPartySize ?? 0) && !occupiedTableIds?.has(t.id)}
          onSelect={onSelectTable}
        />
      )}
    />
  );
}
