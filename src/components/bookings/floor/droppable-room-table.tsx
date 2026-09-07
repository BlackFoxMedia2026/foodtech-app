"use client";

import { useDroppable } from "@dnd-kit/core";
import type { LocalTable } from "@/components/floor/table-node";
import { RoomTableNode, type FloorBooking } from "@/components/floor/operational/room-table-node";

/**
 * dnd-kit needs `useDroppable` called once per table with a stable identity
 * — that hook can never live inside OperationalRoomView's render-prop
 * callback (see its Rules-of-Hooks note), so it lives here instead, in a
 * real per-table component with a real `key`, and just forwards the ref.
 */
export function DroppableRoomTable({
  table,
  bookings,
  isSelected,
  isDragActive,
  isCompatibleDropTarget,
  onSelect,
}: {
  table: LocalTable;
  bookings: FloorBooking[];
  isSelected: boolean;
  isDragActive: boolean;
  isCompatibleDropTarget: boolean;
  onSelect: (tableId: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: table.id,
    data: { type: "table", tableId: table.id, seats: table.seats },
  });

  return (
    <RoomTableNode
      ref={setNodeRef}
      table={table}
      mode="RESERVATIONS"
      bookings={bookings}
      isSelected={isSelected}
      isDragActive={isDragActive}
      isCompatibleDropTarget={isCompatibleDropTarget}
      isOver={isOver}
      onSelect={onSelect}
    />
  );
}
