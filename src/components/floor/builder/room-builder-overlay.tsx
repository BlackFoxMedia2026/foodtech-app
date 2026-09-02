"use client";

import { useEffect, useState } from "react";
import type { Table } from "@prisma/client";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { RoomElement } from "@/lib/room-layout";
import { ShapeWizard } from "./shape-wizard";
import { ElementLibraryPanel } from "./element-library-panel";
import { UnplacedTablesPanel } from "./unplaced-tables-panel";
import { ElementInspectorPanel } from "./element-inspector-panel";
import { RoomBuilderCanvas } from "./room-builder-canvas";
import { useRoomBuilder } from "./use-room-builder";

const MIN_WIDTH_PX = 1024;

export function RoomBuilderOverlay({
  open,
  onOpenChange,
  roomId,
  roomName,
  initialElements,
  initialWidth,
  initialHeight,
  allTables,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  roomId: string;
  roomName: string;
  initialElements: RoomElement[];
  initialWidth: number;
  initialHeight: number;
  allTables: Table[];
  onSaved: () => void;
}) {
  const [tooSmall, setTooSmall] = useState(false);
  const [wizardResult, setWizardResult] = useState<{ elements: RoomElement[]; startTool: "idle" | "drawing-wall" } | null>(
    initialElements.length > 0 ? { elements: initialElements, startTool: "idle" } : null,
  );

  useEffect(() => {
    if (!open) return;
    function check() {
      setTooSmall(window.innerWidth < MIN_WIDTH_PX);
    }
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, [open]);

  useEffect(() => {
    if (open && initialElements.length > 0) {
      setWizardResult({ elements: initialElements, startTool: "idle" });
    }
    if (!open) setWizardResult(initialElements.length > 0 ? { elements: initialElements, startTool: "idle" } : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Costruisci la sala ${roomName}`}
      className="fixed inset-0 z-50 flex flex-col bg-[#F4EFE4] text-carbon-900"
      // Full-screen takeover, not a portal — it's a real DOM descendant of
      // FloorCanvas's pan/zoom viewport. Without this, every pointerdown in
      // here would bubble into the viewport's gesture handler and hijack the
      // click via setPointerCapture (see use-viewport-gestures.ts).
      onPointerDown={(e) => e.stopPropagation()}
    >
      {/* The canvas below (RoomBuilderCanvas) has its own independent
          pan/zoom viewport and intentionally receives pointerdown normally. */}
      {tooSmall ? (
        <div className="flex h-full flex-col items-center justify-center gap-4 p-8 text-center">
          <p className="max-w-xs text-sm text-muted-foreground">Per creare o modificare la piantina utilizza uno schermo più grande.</p>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Torna alla Sala
          </Button>
        </div>
      ) : !wizardResult ? (
        <div className="flex h-full flex-col">
          <OverlayHeader roomName={roomName} onClose={() => onOpenChange(false)} isDirty={() => false} />
          <div className="flex flex-1 items-center justify-center overflow-y-auto">
            <ShapeWizard onComplete={setWizardResult} />
          </div>
        </div>
      ) : (
        <RoomBuilderShell
          roomId={roomId}
          roomName={roomName}
          initialElements={wizardResult.elements}
          initialWidth={initialWidth}
          initialHeight={initialHeight}
          startTool={wizardResult.startTool}
          allTables={allTables}
          onBack={() => setWizardResult(null)}
          onClose={() => onOpenChange(false)}
          onSaved={onSaved}
        />
      )}
    </div>
  );
}

function RoomBuilderShell({
  roomId,
  roomName,
  initialElements,
  initialWidth,
  initialHeight,
  startTool,
  allTables,
  onBack,
  onClose,
  onSaved,
}: {
  roomId: string;
  roomName: string;
  initialElements: RoomElement[];
  initialWidth: number;
  initialHeight: number;
  startTool: "idle" | "drawing-wall";
  allTables: Table[];
  onBack: () => void;
  onClose: () => void;
  onSaved: () => void;
}) {
  const builder = useRoomBuilder({
    roomId,
    initialElements,
    initialWidth,
    initialHeight,
    initialTables: allTables,
    startTool,
    onSaved: () => {
      onSaved();
      onClose();
    },
  });

  async function handleSave() {
    await builder.save();
  }

  return (
    <div className="flex h-full flex-col">
      <OverlayHeader
        roomName={roomName}
        onClose={onClose}
        isDirty={builder.isDirty}
        onBack={initialElements.length === 0 && !builder.canUndo ? onBack : undefined}
        onSave={handleSave}
        saving={builder.saving}
      />
      <div className="grid flex-1 grid-cols-[220px_1fr_260px] gap-3 overflow-hidden p-3">
        <aside className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="flex h-full flex-col">
            <div className="flex-[3] overflow-hidden">
              <ElementLibraryPanel builder={builder} />
            </div>
            <div className="flex-[2] overflow-hidden">
              <UnplacedTablesPanel builder={builder} />
            </div>
          </div>
        </aside>
        <RoomBuilderCanvas builder={builder} />
        <aside className="overflow-y-auto rounded-xl border border-border bg-card">
          <ElementInspectorPanel builder={builder} />
        </aside>
      </div>
    </div>
  );
}

function OverlayHeader({
  roomName,
  onClose,
  isDirty,
  onBack,
  onSave,
  saving,
}: {
  roomName: string;
  onClose: () => void;
  isDirty: () => boolean;
  onBack?: () => void;
  onSave?: () => void;
  saving?: boolean;
}) {
  const [confirmClose, setConfirmClose] = useState(false);

  function requestClose() {
    if (isDirty()) setConfirmClose(true);
    else onClose();
  }

  return (
    <header className="flex items-center justify-between border-b border-border bg-card px-4 py-3">
      <div className="flex items-center gap-3">
        {onBack && (
          <Button type="button" variant="ghost" size="sm" onClick={onBack}>
            Indietro
          </Button>
        )}
        <div>
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Costruisci la sala</p>
          <h1 className="text-display text-base font-semibold">{roomName}</h1>
        </div>
      </div>

      {confirmClose ? (
        <div className="flex items-center gap-2 rounded-md border border-border bg-secondary/60 px-3 py-1.5 text-xs">
          <span>Hai modifiche non salvate.</span>
          <Button type="button" size="sm" variant="ghost" className="h-7 text-xs" onClick={onClose}>
            Continua senza salvare
          </Button>
          {onSave && (
            <Button
              type="button"
              size="sm"
              variant="accent"
              className="h-7 text-xs"
              onClick={async () => {
                await onSave();
                setConfirmClose(false);
              }}
            >
              Salva
            </Button>
          )}
          <Button type="button" size="icon" variant="ghost" className="h-7 w-7" onClick={() => setConfirmClose(false)} aria-label="Annulla">
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          {onSave && (
            <Button type="button" variant="accent" size="sm" onClick={onSave} disabled={saving}>
              {saving ? "Salvataggio…" : "Salva sala"}
            </Button>
          )}
          <Button type="button" variant="ghost" size="icon" onClick={requestClose} aria-label="Chiudi editor">
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}
    </header>
  );
}
