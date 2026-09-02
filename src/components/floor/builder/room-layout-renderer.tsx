"use client";

import { useCallback } from "react";
import { cn } from "@/lib/utils";
import {
  AREA_LABELS,
  formatMeters,
  isArea,
  isColumn,
  isDoor,
  isWall,
  isWindow,
  wallLength,
  type AreaElement,
  type ColumnElement,
  type DoorElement,
  type RoomElement,
  type WallElement,
  type WindowElement,
} from "@/lib/room-layout";
import { snapPointToWalls } from "./snapping";

export type ElementDragKind = "move" | "resize" | "rotate" | "endpoint-start" | "endpoint-end";

/**
 * Structural layer of a Room Builder layout — walls, doors, windows, columns
 * and named areas. Used read-only inside the live Sala view (floor-canvas.tsx,
 * in place of the uploaded floor-plan image) and interactively inside the
 * Room Builder editor, so the two always look identical. Tables are NOT
 * drawn here — they keep rendering via TableNode, driven off the real Table
 * rows, so this component never duplicates table position/name/seats.
 */
export function RoomLayoutRenderer({
  elements,
  width,
  height,
  selectedId = null,
  interactive = false,
  getZoom,
  onSelect,
  onUpdateElement,
  onDragStart,
  onCommit,
}: {
  elements: RoomElement[];
  width: number;
  height: number;
  selectedId?: string | null;
  interactive?: boolean;
  getZoom?: () => number;
  onSelect?: (id: string | null) => void;
  onUpdateElement?: (id: string, patch: Partial<RoomElement>) => void;
  onDragStart?: () => void;
  onCommit?: () => void;
}) {
  const walls = elements.filter(isWall);

  const startDrag = useCallback(
    (
      e: React.PointerEvent,
      id: string,
      kind: ElementDragKind,
      onMove: (dx: number, dy: number) => void,
    ) => {
      if (!interactive) return;
      e.stopPropagation();
      onSelect?.(id);
      onDragStart?.();
      const target = e.currentTarget as SVGElement;
      target.setPointerCapture(e.pointerId);
      const startX = e.clientX;
      const startY = e.clientY;
      const zoom = getZoom?.() ?? 1;

      function move(ev: PointerEvent) {
        onMove((ev.clientX - startX) / zoom, (ev.clientY - startY) / zoom);
      }
      function up() {
        target.removeEventListener("pointermove", move);
        target.removeEventListener("pointerup", up);
        target.removeEventListener("pointercancel", up);
        onCommit?.();
      }
      target.addEventListener("pointermove", move);
      target.addEventListener("pointerup", up);
      target.addEventListener("pointercancel", up);
    },
    [interactive, onSelect, getZoom, onDragStart, onCommit],
  );

  return (
    <svg
      className={cn("absolute left-0 top-0 overflow-visible", !interactive && "pointer-events-none")}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
    >
      {elements.filter(isArea).map((el) => (
        <AreaShape
          key={el.id}
          el={el}
          selected={selectedId === el.id}
          interactive={interactive}
          onPointerDownBody={(e) =>
            startDrag(e, el.id, "move", (dx, dy) => onUpdateElement?.(el.id, { x: el.x + dx, y: el.y + dy }))
          }
          onPointerDownResize={(e) =>
            startDrag(e, el.id, "resize", (dx, dy) =>
              onUpdateElement?.(el.id, { width: Math.max(20, el.width + dx), height: Math.max(20, el.height + dy) }),
            )
          }
        />
      ))}

      {elements.filter(isColumn).map((el) => (
        <ColumnShape
          key={el.id}
          el={el}
          selected={selectedId === el.id}
          interactive={interactive}
          onPointerDownBody={(e) =>
            startDrag(e, el.id, "move", (dx, dy) => onUpdateElement?.(el.id, { x: el.x + dx, y: el.y + dy }))
          }
          onPointerDownResize={(e) =>
            startDrag(e, el.id, "resize", (dx, dy) =>
              onUpdateElement?.(el.id, { width: Math.max(10, el.width + dx), height: Math.max(10, el.height + dy) }),
            )
          }
        />
      ))}

      {walls.map((el) => (
        <WallShape
          key={el.id}
          el={el}
          selected={selectedId === el.id}
          interactive={interactive}
          onPointerDownBody={(e) =>
            startDrag(e, el.id, "move", (dx, dy) =>
              onUpdateElement?.(el.id, {
                startX: el.startX + dx,
                startY: el.startY + dy,
                endX: el.endX + dx,
                endY: el.endY + dy,
              }),
            )
          }
          onPointerDownStart={(e) =>
            startDrag(e, el.id, "endpoint-start", (dx, dy) =>
              onUpdateElement?.(el.id, { startX: el.startX + dx, startY: el.startY + dy }),
            )
          }
          onPointerDownEnd={(e) =>
            startDrag(e, el.id, "endpoint-end", (dx, dy) =>
              onUpdateElement?.(el.id, { endX: el.endX + dx, endY: el.endY + dy }),
            )
          }
        />
      ))}

      {elements.filter(isDoor).map((el) => (
        <OpeningShape
          key={el.id}
          el={el}
          kind="door"
          selected={selectedId === el.id}
          interactive={interactive}
          onPointerDownBody={(e) =>
            startDrag(e, el.id, "move", (dx, dy) => {
              const snapped = snapPointToWalls({ x: el.x + dx, y: el.y + dy }, walls);
              onUpdateElement?.(
                el.id,
                snapped
                  ? { x: snapped.point.x, y: snapped.point.y, wallId: snapped.wallId, rotation: snapped.angle }
                  : { x: el.x + dx, y: el.y + dy },
              );
            })
          }
        />
      ))}

      {elements.filter(isWindow).map((el) => (
        <OpeningShape
          key={el.id}
          el={el}
          kind="window"
          selected={selectedId === el.id}
          interactive={interactive}
          onPointerDownBody={(e) =>
            startDrag(e, el.id, "move", (dx, dy) => {
              const snapped = snapPointToWalls({ x: el.x + dx, y: el.y + dy }, walls);
              onUpdateElement?.(
                el.id,
                snapped
                  ? { x: snapped.point.x, y: snapped.point.y, wallId: snapped.wallId, rotation: snapped.angle }
                  : { x: el.x + dx, y: el.y + dy },
              );
            })
          }
        />
      ))}
    </svg>
  );
}

const AREA_FILL: Record<string, string> = {
  AREA_KITCHEN: "rgba(175, 102, 72, 0.16)",
  AREA_BAR: "rgba(138, 159, 96, 0.18)",
  AREA_WC: "rgba(90, 110, 120, 0.16)",
  AREA_STORAGE: "rgba(120, 120, 120, 0.14)",
  AREA_PRIVATE: "rgba(175, 121, 68, 0.16)",
  AREA_ENTRANCE: "rgba(138, 159, 96, 0.12)",
  AREA_TERRACE: "rgba(61, 92, 52, 0.14)",
};
const AREA_STROKE: Record<string, string> = {
  AREA_KITCHEN: "#AF6648",
  AREA_BAR: "#8A9F60",
  AREA_WC: "#5A6E78",
  AREA_STORAGE: "#787878",
  AREA_PRIVATE: "#AF7944",
  AREA_ENTRANCE: "#8A9F60",
  AREA_TERRACE: "#3D5C34",
};

function AreaShape({
  el,
  selected,
  interactive,
  onPointerDownBody,
  onPointerDownResize,
}: {
  el: AreaElement;
  selected: boolean;
  interactive: boolean;
  onPointerDownBody: (e: React.PointerEvent) => void;
  onPointerDownResize: (e: React.PointerEvent) => void;
}) {
  const cx = el.x + el.width / 2;
  const cy = el.y + el.height / 2;
  return (
    <g transform={`rotate(${el.rotation} ${cx} ${cy})`}>
      <rect
        x={el.x}
        y={el.y}
        width={el.width}
        height={el.height}
        rx={10}
        fill={AREA_FILL[el.type]}
        stroke={selected ? "#AF7944" : AREA_STROKE[el.type]}
        strokeWidth={selected ? 2.5 : 1.5}
        strokeDasharray="6 4"
        className={interactive ? "cursor-move" : undefined}
        onPointerDown={interactive ? onPointerDownBody : undefined}
      />
      <text
        x={cx}
        y={cy}
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize={13}
        fontWeight={700}
        fill="#15161a"
        className="select-none uppercase tracking-wide"
        style={{ pointerEvents: "none" }}
      >
        {el.label || AREA_LABELS[el.type]}
      </text>
      {interactive && selected && (
        <rect
          x={el.x + el.width - 8}
          y={el.y + el.height - 8}
          width={16}
          height={16}
          rx={3}
          fill="#AF7944"
          stroke="white"
          strokeWidth={1.5}
          className="cursor-nwse-resize"
          onPointerDown={onPointerDownResize}
        />
      )}
    </g>
  );
}

function ColumnShape({
  el,
  selected,
  interactive,
  onPointerDownBody,
  onPointerDownResize,
}: {
  el: ColumnElement;
  selected: boolean;
  interactive: boolean;
  onPointerDownBody: (e: React.PointerEvent) => void;
  onPointerDownResize: (e: React.PointerEvent) => void;
}) {
  const cx = el.x + el.width / 2;
  const cy = el.y + el.height / 2;
  return (
    <g transform={`rotate(${el.rotation} ${cx} ${cy})`}>
      <rect
        x={el.x}
        y={el.y}
        width={el.width}
        height={el.height}
        fill="#5e6068"
        stroke={selected ? "#AF7944" : "#3a3b42"}
        strokeWidth={selected ? 2.5 : 1}
        className={interactive ? "cursor-move" : undefined}
        onPointerDown={interactive ? onPointerDownBody : undefined}
      />
      {interactive && selected && (
        <rect
          x={el.x + el.width - 6}
          y={el.y + el.height - 6}
          width={12}
          height={12}
          rx={2}
          fill="#AF7944"
          stroke="white"
          strokeWidth={1.5}
          className="cursor-nwse-resize"
          onPointerDown={onPointerDownResize}
        />
      )}
    </g>
  );
}

function WallShape({
  el,
  selected,
  interactive,
  onPointerDownBody,
  onPointerDownStart,
  onPointerDownEnd,
}: {
  el: WallElement;
  selected: boolean;
  interactive: boolean;
  onPointerDownBody: (e: React.PointerEvent) => void;
  onPointerDownStart: (e: React.PointerEvent) => void;
  onPointerDownEnd: (e: React.PointerEvent) => void;
}) {
  const midX = (el.startX + el.endX) / 2;
  const midY = (el.startY + el.endY) / 2;
  return (
    <g>
      <line
        x1={el.startX}
        y1={el.startY}
        x2={el.endX}
        y2={el.endY}
        stroke={selected ? "#AF7944" : "#3a3b42"}
        strokeWidth={el.thickness}
        strokeLinecap="square"
        className={interactive ? "cursor-move" : undefined}
        onPointerDown={interactive ? onPointerDownBody : undefined}
      />
      {selected && interactive && (
        <text
          x={midX}
          y={midY - el.thickness - 6}
          textAnchor="middle"
          fontSize={12}
          fontWeight={700}
          fill="#15161a"
          className="select-none"
          style={{ pointerEvents: "none" }}
        >
          {formatMeters(wallLength(el))}
        </text>
      )}
      {selected && interactive && (
        <>
          <circle cx={el.startX} cy={el.startY} r={7} fill="#AF7944" stroke="white" strokeWidth={1.5} className="cursor-pointer" onPointerDown={onPointerDownStart} />
          <circle cx={el.endX} cy={el.endY} r={7} fill="#AF7944" stroke="white" strokeWidth={1.5} className="cursor-pointer" onPointerDown={onPointerDownEnd} />
        </>
      )}
    </g>
  );
}

function OpeningShape({
  el,
  kind,
  selected,
  interactive,
  onPointerDownBody,
}: {
  el: DoorElement | WindowElement;
  kind: "door" | "window";
  selected: boolean;
  interactive: boolean;
  onPointerDownBody: (e: React.PointerEvent) => void;
}) {
  const half = el.width / 2;
  return (
    <g transform={`rotate(${el.rotation} ${el.x} ${el.y})`}>
      {/* Gap cut into the wall */}
      <line x1={el.x - half} y1={el.y} x2={el.x + half} y2={el.y} stroke="#e9e6df" strokeWidth={12} />
      {kind === "door" ? (
        <>
          <line x1={el.x - half} y1={el.y} x2={el.x - half} y2={el.y - el.width} stroke={selected ? "#AF7944" : "#8A9F60"} strokeWidth={2} />
          <path
            d={`M ${el.x - half} ${el.y - el.width} A ${el.width} ${el.width} 0 0 1 ${el.x - half + el.width} ${el.y}`}
            fill="none"
            stroke={selected ? "#AF7944" : "#8A9F60"}
            strokeDasharray="3 3"
            strokeWidth={1}
          />
        </>
      ) : (
        <>
          <line x1={el.x - half} y1={el.y - 4} x2={el.x + half} y2={el.y - 4} stroke={selected ? "#AF7944" : "#5A6E78"} strokeWidth={2} />
          <line x1={el.x - half} y1={el.y + 4} x2={el.x + half} y2={el.y + 4} stroke={selected ? "#AF7944" : "#5A6E78"} strokeWidth={2} />
        </>
      )}
      <rect
        x={el.x - half}
        y={el.y - 10}
        width={el.width}
        height={20}
        fill="transparent"
        className={interactive ? "cursor-move" : undefined}
        onPointerDown={interactive ? onPointerDownBody : undefined}
      />
    </g>
  );
}
