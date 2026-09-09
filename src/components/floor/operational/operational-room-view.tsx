"use client";

import { Fragment, type ReactNode, useMemo } from "react";
import type { RoomLayoutMode } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { ZoomIn, ZoomOut, Maximize2 } from "lucide-react";
import { useRoomCamera, MAX_ZOOM } from "@/components/floor/use-room-camera";
import { useViewportGestures } from "@/components/floor/use-viewport-gestures";
import { RoomLayoutRenderer } from "@/components/floor/builder/room-layout-renderer";
import { parseRoomLayoutElements, type RoomBounds } from "@/lib/room-layout";
import { cn } from "@/lib/utils";

export type RoomTableLod = "full" | "medium" | "low";

/**
 * Shared operational "room as a finite surface" shell for Sala (mode STAFF)
 * and Prenotazioni→Mappa (mode RESERVATIONS) — owns the viewport/camera/
 * floor-surface/zones/fallback-plan/zoom-cluster that used to be duplicated
 * byte-for-byte between floor-canvas.tsx and bookings-floor-canvas.tsx. Each
 * page keeps its own chrome (save button, staff filter, dnd-kit context,
 * assignment panels) around this component.
 *
 * `renderTable` MUST return the JSX of a real component with a stable key
 * (e.g. `<RoomTableNode key={table.id} .../>`), never call a hook inline
 * inside the callback — the number of tables can change at runtime (new
 * table, delete, switch room), and an inline hook call would be attributed
 * to this component's own fiber instead of a per-table one, breaking the
 * Rules of Hooks. This component wraps every result in a keyed Fragment as
 * a defensive backstop, but the caller's own key should still be present.
 */
export function OperationalRoomView<T extends { id: string }>({
  width,
  height,
  roomBounds,
  floorPlanUrl,
  activeLayoutMode,
  roomLayoutElements,
  tables,
  renderTable,
  onBackgroundClick,
  emptyPlanSlot,
  noTablesSlot,
  className,
  children,
}: {
  /** Raw saved Room canvas size — the coordinate space Table.posX/posY and
   * RoomLayout elements live in. Unrelated to how much of it is visible. */
  width: number;
  height: number;
  /** The finite, operative surface the camera fits/clamps to — see
   * getRoomBounds in lib/room-layout.ts. */
  roomBounds: RoomBounds;
  floorPlanUrl: string | null;
  activeLayoutMode: RoomLayoutMode | null;
  roomLayoutElements: unknown;
  tables: T[];
  renderTable: (table: T, ctx: { lod: RoomTableLod; zoom: number }) => ReactNode;
  onBackgroundClick?: () => void;
  /** CTA shown when there's no plan at all (neither BUILDER nor an uploaded image). */
  emptyPlanSlot?: ReactNode;
  /** Shown when the room has a plan but zero tables. */
  noTablesSlot?: ReactNode;
  className?: string;
  /** Extra overlay chrome from the calling page (toolbars, panels), rendered
   * as further absolutely-positioned siblings inside the viewport div. */
  children?: ReactNode;
}) {
  const { camera, worldRef, viewportRef, getZoom, panBy, zoomAt, fitRoom, reset100, stepZoom, minZoom } = useRoomCamera({
    roomWidth: width,
    roomHeight: height,
    bounds: roomBounds,
    boundsMargin: 48,
    minZoomMode: "relativeToFit",
    minZoomFactor: 0.9,
  });
  const parsedLayoutElements = useMemo(() => parseRoomLayoutElements(roomLayoutElements), [roomLayoutElements]);

  const gestures = useViewportGestures({
    viewportRef,
    getZoom,
    panBy,
    zoomAt,
    onBackgroundClick: () => onBackgroundClick?.(),
  });

  const lod: RoomTableLod = camera.zoom > 0.7 ? "full" : camera.zoom > 0.45 ? "medium" : "low";
  const hasPlan = activeLayoutMode === "BUILDER" || Boolean(floorPlanUrl);
  const boundsWidth = roomBounds.maxX - roomBounds.minX;
  const boundsHeight = roomBounds.maxY - roomBounds.minY;

  return (
    <div
      ref={viewportRef}
      className={cn(
        "relative h-full w-full touch-none select-none overflow-hidden rounded-xl",
        gestures.isPanning ? "cursor-grabbing" : "cursor-grab",
        className,
      )}
      onPointerDown={gestures.onPointerDown}
      onPointerMove={gestures.onPointerMove}
      onPointerUp={gestures.onPointerUp}
      onPointerCancel={gestures.onPointerUp}
    >
      <div
        ref={worldRef}
        className="absolute left-0 top-0 origin-top-left"
        style={{ width, height, transform: `translate(${camera.x}px, ${camera.y}px) scale(${camera.zoom})` }}
      >
        {boundsWidth > 0 && boundsHeight > 0 && (
          <div
            className="room-floor-surface absolute rounded-[18px]"
            style={{ left: roomBounds.minX, top: roomBounds.minY, width: boundsWidth, height: boundsHeight }}
            aria-hidden="true"
          />
        )}

        {activeLayoutMode === "BUILDER" ? (
          <RoomLayoutRenderer elements={parsedLayoutElements} width={width} height={height} variant="operational" />
        ) : (
          floorPlanUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={floorPlanUrl}
              alt=""
              // A raw uploaded blueprint (walls/quotes/mq/WC labels) is
              // technical drawing detail the operational view should only
              // hint at, not headline (brief section 3). Opacity alone
              // isn't enough — alpha-blending a high-contrast dark-text-on-
              // white scan onto the dark floor still leaves the text/bg
              // *contrast* almost fully intact, just dimmer (confirmed via
              // screenshot). Collapsing the image's own internal contrast
              // first (contrast well below 1) pulls the text and its
              // background toward the same gray so opacity actually reads
              // as "faint sketch" instead of "dim but legible blueprint".
              // The floor plan file itself is unchanged; only how this
              // read-only view renders it changes.
              className="pointer-events-none absolute object-contain opacity-60"
              style={{
                left: roomBounds.minX,
                top: roomBounds.minY,
                width: boundsWidth,
                height: boundsHeight,
                filter: "grayscale(1) contrast(0.15) brightness(1.15)",
              }}
              draggable={false}
            />
          )
        )}

        {!hasPlan && emptyPlanSlot && (
          <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center">
            <div
              className="pointer-events-auto flex items-center gap-2 riquadro bg-card/90 px-3 py-1.5 text-xs text-muted-foreground shadow-sm"
              onPointerDown={(e) => e.stopPropagation()}
            >
              {emptyPlanSlot}
            </div>
          </div>
        )}

        {tables.map((t) => (
          <Fragment key={t.id}>{renderTable(t, { lod, zoom: camera.zoom })}</Fragment>
        ))}
      </div>

      {hasPlan && tables.length === 0 && noTablesSlot && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center">{noTablesSlot}</div>
      )}

      {children}

      <div className="pointer-events-none absolute bottom-3 right-3 z-10 flex items-center gap-1 riquadro bg-card/90 p-1 shadow-lg backdrop-blur-sm">
        <div className="pointer-events-auto flex items-center gap-1" onPointerDown={(e) => e.stopPropagation()}>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="tocco-comodo h-9 w-9"
            onClick={() => stepZoom(-1)}
            disabled={camera.zoom <= minZoom}
            aria-label="Riduci zoom"
          >
            <ZoomOut className="h-4 w-4" />
          </Button>
          <button
            type="button"
            className="tocco-comodo h-9 w-10 text-center text-xs text-muted-foreground hover:text-foreground"
            onClick={() => reset100()}
            title="Dimensione reale (100%)"
          >
            {Math.round(camera.zoom * 100)}%
          </button>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="tocco-comodo h-9 w-9"
            onClick={() => stepZoom(1)}
            disabled={camera.zoom >= MAX_ZOOM}
            aria-label="Aumenta zoom"
          >
            <ZoomIn className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="tocco-comodo h-9 w-9"
            onClick={() => fitRoom(true)}
            aria-label="Adatta alla sala"
            title="Adatta alla sala"
          >
            <Maximize2 className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
