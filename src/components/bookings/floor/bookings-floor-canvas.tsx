"use client";

import { useMemo } from "react";
import type { RoomLayoutMode, Table } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { ZoomIn, ZoomOut, Maximize2, MapIcon } from "lucide-react";
import { useRoomCamera, MIN_ZOOM, MAX_ZOOM } from "@/components/floor/use-room-camera";
import { useViewportGestures } from "@/components/floor/use-viewport-gestures";
import { RoomLayoutRenderer } from "@/components/floor/builder/room-layout-renderer";
import { parseRoomLayoutElements } from "@/lib/room-layout";
import { BookingTableNode, type FloorBooking } from "./booking-table-node";
import { cn } from "@/lib/utils";

/**
 * Read-only counterpart to FloorCanvas (brief section 8: "Reservation mode,
 * NON modalità editor") — reuses the exact same camera/gesture hooks and
 * RoomLayoutRenderer as the Sala editor so pan/zoom/fit/coordinates/shapes
 * are pixel-identical, but never lets a table be repositioned and swaps the
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
  const { camera, worldRef, viewportRef, getZoom, panBy, zoomAt, fitRoom, reset100, stepZoom } = useRoomCamera({
    roomWidth: width,
    roomHeight: height,
  });
  const parsedLayoutElements = useMemo(() => parseRoomLayoutElements(roomLayoutElements), [roomLayoutElements]);

  const gestures = useViewportGestures({
    viewportRef,
    getZoom,
    panBy,
    zoomAt,
    onBackgroundClick: () => onSelectTable(""),
  });

  const isDragActive = draggingPartySize !== null;

  return (
    <div
      ref={viewportRef}
      className={cn(
        "relative h-full w-full touch-none select-none overflow-hidden rounded-xl",
        gestures.isPanning ? "cursor-grabbing" : "cursor-grab",
      )}
      onPointerDown={gestures.onPointerDown}
      onPointerMove={gestures.onPointerMove}
      onPointerUp={gestures.onPointerUp}
      onPointerCancel={gestures.onPointerUp}
    >
      <div
        ref={worldRef}
        className="absolute left-0 top-0 origin-top-left bg-[radial-gradient(circle_at_1px_1px,rgba(0,0,0,0.06)_1px,transparent_0)] [background-size:20px_20px]"
        style={{ width, height, transform: `translate(${camera.x}px, ${camera.y}px) scale(${camera.zoom})` }}
      >
        {activeLayoutMode === "BUILDER" ? (
          <RoomLayoutRenderer elements={parsedLayoutElements} width={width} height={height} />
        ) : (
          floorPlanUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={floorPlanUrl}
              alt=""
              className="pointer-events-none absolute inset-0 h-full w-full object-contain opacity-60"
              draggable={false}
            />
          )
        )}

        {activeLayoutMode !== "BUILDER" && !floorPlanUrl && (
          <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center">
            <div
              className="pointer-events-auto flex items-center gap-2 rounded-md border border-border bg-card/90 px-3 py-1.5 text-xs text-muted-foreground shadow-sm"
              onPointerDown={(e) => e.stopPropagation()}
            >
              Questa sala non ha ancora una mappa.
              <a href={`/floor?room=${roomId}`} className="font-medium text-accent-strong hover:underline">
                Gestisci piantina
              </a>
            </div>
          </div>
        )}

        {tables.map((t) => (
          <BookingTableNode
            key={t.id}
            table={t}
            bookings={bookingsByTableId[t.id] ?? []}
            isSelected={selectedTableId === t.id}
            isDragActive={isDragActive}
            isCompatibleDropTarget={isDragActive && t.active && t.seats >= (draggingPartySize ?? 0) && !occupiedTableIds?.has(t.id)}
            onSelect={onSelectTable}
          />
        ))}
      </div>

      <div className="pointer-events-none absolute bottom-3 right-3 z-10 flex items-center gap-1 rounded-md border border-border bg-card/90 p-1 shadow-lg backdrop-blur-sm">
        <div className="pointer-events-auto flex items-center gap-1" onPointerDown={(e) => e.stopPropagation()}>
          <Button type="button" size="icon" variant="ghost" className="h-7 w-7" onClick={() => stepZoom(-1)} disabled={camera.zoom <= MIN_ZOOM} aria-label="Riduci zoom">
            <ZoomOut className="h-4 w-4" />
          </Button>
          <button type="button" className="w-10 text-center text-xs text-muted-foreground hover:text-foreground" onClick={() => reset100()} title="Dimensione reale (100%)">
            {Math.round(camera.zoom * 100)}%
          </button>
          <Button type="button" size="icon" variant="ghost" className="h-7 w-7" onClick={() => stepZoom(1)} disabled={camera.zoom >= MAX_ZOOM} aria-label="Aumenta zoom">
            <ZoomIn className="h-4 w-4" />
          </Button>
          <Button type="button" size="icon" variant="ghost" className="h-7 w-7" onClick={() => fitRoom(true)} aria-label="Adatta alla sala" title="Adatta alla sala">
            <Maximize2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {!floorPlanUrl && activeLayoutMode !== "BUILDER" && tables.length === 0 && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          <div className="pointer-events-auto flex flex-col items-center gap-2 rounded-md border border-dashed border-border bg-card/90 px-6 py-8 text-center">
            <MapIcon className="h-6 w-6 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Questa sala non ha ancora tavoli.</p>
          </div>
        </div>
      )}
    </div>
  );
}
