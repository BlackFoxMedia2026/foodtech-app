"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Check, Maximize2, Redo2, Undo2, X, ZoomIn, ZoomOut } from "lucide-react";
import { MIN_ZOOM, MAX_ZOOM } from "../use-room-camera";
import { useViewportGestures } from "../use-viewport-gestures";
import { TableNode, TABLE_SIZE } from "../table-node";
import { boundingBox, formatMeters, isTableRef, isWall } from "@/lib/room-layout";
import { RoomLayoutRenderer } from "./room-layout-renderer";
import type { RoomBuilder } from "./use-room-builder";

export function RoomBuilderCanvas({ builder }: { builder: RoomBuilder }) {
  const [previewPoint, setPreviewPoint] = useState<{ x: number; y: number } | null>(null);

  const gestures = useViewportGestures({
    viewportRef: builder.viewportRef,
    getZoom: builder.getZoom,
    panBy: builder.panBy,
    zoomAt: builder.zoomAt,
    onBackgroundClick: builder.handleBackgroundClick,
  });

  const drawing = builder.tool.mode === "drawing-wall";
  const placedTableIds = new Set(builder.elements.filter(isTableRef).map((e) => e.tableId));
  const placedTables = builder.tables.filter((t) => placedTableIds.has(t.id));
  const walls = builder.elements.filter(isWall);
  // Discreet overall-size quotes on the generated perimeter (brief §31-32).
  // Derived straight from the wall bounding box every render, so they track
  // any later edits for free without a dedicated recompute path.
  const wallBox = walls.length > 0 ? boundingBox(walls) : null;

  function onPointerMove(e: React.PointerEvent) {
    gestures.onPointerMove(e);
    if (drawing) setPreviewPoint(builder.toWorld(e.clientX, e.clientY));
  }

  return (
    <div
      ref={builder.viewportRef}
      data-testid="room-builder-canvas"
      className={cn(
        "relative h-full w-full touch-none select-none overflow-hidden rounded-lg border border-border bg-[#F4EFE4]",
        gestures.isPanning ? "cursor-grabbing" : drawing ? "cursor-crosshair" : "cursor-grab",
      )}
      onPointerDown={gestures.onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={gestures.onPointerUp}
      onPointerCancel={gestures.onPointerUp}
      onDragOver={(e) => e.preventDefault()}
      onDrop={builder.handleDrop}
    >
      <div
        ref={builder.worldRef}
        className="absolute left-0 top-0 origin-top-left bg-[radial-gradient(circle_at_1px_1px,rgba(60,70,60,0.12)_1px,transparent_0)] [background-size:25px_25px]"
        style={{
          width: builder.dims.width,
          height: builder.dims.height,
          transform: `translate(${builder.camera.x}px, ${builder.camera.y}px) scale(${builder.camera.zoom})`,
        }}
      >
        <RoomLayoutRenderer
          elements={builder.elements}
          width={builder.dims.width}
          height={builder.dims.height}
          selectedId={builder.selectedId}
          interactive
          getZoom={builder.getZoom}
          onSelect={builder.setSelectedId}
          onUpdateElement={builder.updateElementLive}
          onDragStart={builder.beginTransaction}
          onCommit={builder.endTransaction}
        />

        {wallBox && (
          <svg
            className="pointer-events-none absolute left-0 top-0 overflow-visible"
            width={builder.dims.width}
            height={builder.dims.height}
            aria-hidden
          >
            <text
              x={(wallBox.minX + wallBox.maxX) / 2}
              y={wallBox.minY - 14}
              textAnchor="middle"
              fontSize={12}
              fill="#905B38"
              className="select-none font-medium"
            >
              {formatMeters(wallBox.maxX - wallBox.minX)}
            </text>
            <text
              x={wallBox.minX - 14}
              y={(wallBox.minY + wallBox.maxY) / 2}
              textAnchor="middle"
              fontSize={12}
              fill="#905B38"
              className="select-none font-medium"
              transform={`rotate(-90 ${wallBox.minX - 14} ${(wallBox.minY + wallBox.maxY) / 2})`}
            >
              {formatMeters(wallBox.maxY - wallBox.minY)}
            </text>
          </svg>
        )}

        {placedTables.map((t) => (
          <TableNode
            key={t.id}
            table={t}
            isSelected={builder.selectedId === t.id}
            matchesFilter
            lod="full"
            onSelect={builder.setSelectedId}
            onDelete={() => builder.removeTableFromPlan(t.id)}
            onStartDrag={builder.onStartTableDrag}
            onStartRotate={builder.onStartTableRotate}
          />
        ))}

        {drawing && (
          <svg className="pointer-events-none absolute left-0 top-0 overflow-visible" width={builder.dims.width} height={builder.dims.height}>
            {builder.drawPoints.map((p, i) => {
              const next = builder.drawPoints[i + 1] ?? previewPoint;
              return (
                <g key={i}>
                  {next && (
                    <line x1={p.x} y1={p.y} x2={next.x} y2={next.y} stroke="#AF7944" strokeDasharray={i === builder.drawPoints.length - 1 ? "6 4" : undefined} strokeWidth={3} />
                  )}
                  <circle cx={p.x} cy={p.y} r={6} fill="#AF7944" stroke="white" strokeWidth={1.5} />
                </g>
              );
            })}
            {builder.drawPoints.length === 0 && previewPoint && (
              <circle cx={previewPoint.x} cy={previewPoint.y} r={5} fill="#AF7944" opacity={0.5} />
            )}
          </svg>
        )}
      </div>

      {drawing && (
        <div className="pointer-events-none absolute inset-x-0 top-3 z-10 flex justify-center">
          <div
            className="pointer-events-auto flex items-center gap-2 rounded-md border border-border bg-card/95 px-3 py-1.5 text-xs text-card-foreground shadow-lg backdrop-blur-sm"
            onPointerDown={(e) => e.stopPropagation()}
          >
            <span className="text-muted-foreground">
              Clicca per aggiungere pareti · clicca sul primo punto per chiudere la forma
            </span>
            <Button type="button" size="sm" variant="accent" disabled={builder.drawPoints.length < 3} onClick={builder.finishDrawingManually}>
              <Check className="h-3.5 w-3.5" /> Chiudi forma
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={builder.cancelDrawing}>
              <X className="h-3.5 w-3.5" /> Annulla
            </Button>
          </div>
        </div>
      )}

      {(builder.tool.mode === "placing" || builder.tool.mode === "placing-table") && (
        <div className="pointer-events-none absolute inset-x-0 top-3 z-10 flex justify-center">
          <div
            className="pointer-events-auto flex items-center gap-2 rounded-md border border-border bg-card/95 px-3 py-1.5 text-xs text-card-foreground shadow-lg backdrop-blur-sm"
            onPointerDown={(e) => e.stopPropagation()}
          >
            <span className="text-muted-foreground">Clicca sulla piantina per posizionare l&apos;elemento</span>
            <Button type="button" size="sm" variant="ghost" onClick={() => builder.setTool({ mode: "idle" })}>
              <X className="h-3.5 w-3.5" /> Annulla
            </Button>
          </div>
        </div>
      )}

      <div className="pointer-events-none absolute bottom-3 right-3 z-10 flex items-center gap-1 rounded-md border border-border bg-card/90 p-1 text-card-foreground shadow-lg backdrop-blur-sm">
        <div className="pointer-events-auto flex items-center gap-1" onPointerDown={(e) => e.stopPropagation()}>
          <Button type="button" size="icon" variant="ghost" className="h-7 w-7" onClick={builder.undo} disabled={!builder.canUndo} aria-label="Annulla">
            <Undo2 className="h-4 w-4" />
          </Button>
          <Button type="button" size="icon" variant="ghost" className="h-7 w-7" onClick={builder.redo} disabled={!builder.canRedo} aria-label="Ripeti">
            <Redo2 className="h-4 w-4" />
          </Button>
          <div className="mx-1 h-4 w-px bg-border" />
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            onClick={() => builder.stepZoom(-1)}
            disabled={builder.camera.zoom <= MIN_ZOOM}
            aria-label="Riduci zoom"
          >
            <ZoomOut className="h-4 w-4" />
          </Button>
          <button type="button" className="w-10 text-center text-xs text-muted-foreground hover:text-foreground" onClick={() => builder.reset100()}>
            {Math.round(builder.camera.zoom * 100)}%
          </button>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            onClick={() => builder.stepZoom(1)}
            disabled={builder.camera.zoom >= MAX_ZOOM}
            aria-label="Aumenta zoom"
          >
            <ZoomIn className="h-4 w-4" />
          </Button>
          <Button type="button" size="icon" variant="ghost" className="h-7 w-7" onClick={() => builder.fitRoom(true)} aria-label="Adatta alla sala">
            <Maximize2 className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
