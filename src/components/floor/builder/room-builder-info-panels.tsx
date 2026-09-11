"use client";

import { Image as ImageIcon, Info, Layers3, Eye, EyeOff, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { boundingBox, formatMeters, isWall, pxToMeters } from "@/lib/room-layout";
import type { RoomBuilder } from "./use-room-builder";
import type { LayerVisibility } from "./room-builder-canvas";

/** Small titled card shell shared by the three right-column panels below —
 * matches the ElementInspectorPanel's own bordered/rounded card so the three
 * stack visually as one family (SCREEN 1's Proprietà/Informazioni
 * sala/Livelli/Immagine originale). */
function InfoCard({ icon: Icon, title, children }: { icon: React.ComponentType<{ className?: string }>; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-card text-card-foreground">
      <div className="flex items-center gap-1.5 border-b border-border px-3 py-2">
        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
        <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{title}</h3>
      </div>
      <div className="p-3">{children}</div>
    </div>
  );
}

/** "Informazioni sala" — real numbers derived from the actual wall geometry
 * on the canvas right now (never hardcoded): area/dimensions read straight
 * off the wall bounding box, converted via the same PIXELS_PER_METER scale
 * used everywhere else in the builder. Empty room (no walls yet) shows a
 * dash instead of a fake measurement. */
export function RoomInfoCard({ roomName, builder }: { roomName: string; builder: RoomBuilder }) {
  const walls = builder.elements.filter(isWall);
  const box = walls.length > 0 ? boundingBox(walls) : null;
  const widthM = box ? pxToMeters(box.maxX - box.minX) : null;
  const heightM = box ? pxToMeters(box.maxY - box.minY) : null;
  const areaM2 = widthM != null && heightM != null ? widthM * heightM : null;

  return (
    <InfoCard icon={Info} title="Informazioni sala">
      <dl className="flex flex-col gap-2 text-sm">
        <Row label="Nome" value={roomName} />
        <Row label="Superficie stimata" value={areaM2 != null ? `~ ${Math.round(areaM2)} m²` : "—"} />
        <Row label="Dimensioni" value={box ? `${formatMeters(box.maxX - box.minX)} x ${formatMeters(box.maxY - box.minY)}` : "—"} />
      </dl>
    </InfoCard>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="truncate text-right font-medium">{value}</dd>
    </div>
  );
}

const LAYER_ROWS: { key: keyof LayerVisibility; label: string }[] = [
  { key: "tables", label: "Tavoli" },
  { key: "structure", label: "Elementi strutturali" },
  { key: "areas", label: "Aree e zone" },
];

/** "Livelli" — show/hide whole categories on the canvas, editor-only state
 * (never persisted, never affects what gets saved). "Testi" stays listed to
 * match SCREEN 1's four rows but disabled: there is no text-element type
 * yet (see the "Altro" section of ElementLibraryPanel). */
export function LayersCard({ visibility, onChange }: { visibility: LayerVisibility; onChange: (next: LayerVisibility) => void }) {
  return (
    <InfoCard icon={Layers3} title="Livelli">
      <div className="flex flex-col gap-1">
        {LAYER_ROWS.map((row) => {
          const visible = visibility[row.key];
          return (
            <button
              key={row.key}
              type="button"
              onClick={() => onChange({ ...visibility, [row.key]: !visible })}
              className="flex items-center justify-between rounded-md px-1.5 py-1.5 text-sm hover:bg-secondary"
            >
              <span className={visible ? undefined : "text-muted-foreground"}>{row.label}</span>
              {visible ? <Eye className="h-3.5 w-3.5 text-muted-foreground" /> : <EyeOff className="h-3.5 w-3.5 text-muted-foreground" />}
            </button>
          );
        })}
        <div className="flex cursor-not-allowed items-center justify-between rounded-md px-1.5 py-1.5 text-sm opacity-50" title="Testi · Prossimamente">
          <span>Testi</span>
          <EyeOff className="h-3.5 w-3.5 text-muted-foreground" />
        </div>
      </div>
    </InfoCard>
  );
}

/** "Immagine originale" — the uploaded plan this room started from, if any
 * (Room.floorPlanUrl, retained even after switching to the Builder). Purely
 * a shortcut into the "Vedi originale" tab; never edited from here. */
export function OriginalImageCard({ referenceImageUrl, onShowOriginal }: { referenceImageUrl?: string | null; onShowOriginal: () => void }) {
  return (
    <InfoCard icon={ImageIcon} title="Immagine originale">
      {referenceImageUrl ? (
        <div className="flex flex-col gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={referenceImageUrl} alt="" className="max-h-32 w-full rounded-md border border-border object-contain" />
          <Button type="button" variant="outline" size="sm" onClick={onShowOriginal}>
            <Pencil className="h-3.5 w-3.5" /> Mostra originale
          </Button>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">Nessuna immagine caricata per questa sala.</p>
      )}
    </InfoCard>
  );
}
