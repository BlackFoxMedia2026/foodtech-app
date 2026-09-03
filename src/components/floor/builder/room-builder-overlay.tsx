"use client";

import { useEffect, useState } from "react";
import type { Table } from "@prisma/client";
import { ArrowLeft, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { RoomElement } from "@/lib/room-layout";
import { DEFAULT_WIZARD_FORM, ShapeWizard, type WizardFormState } from "./shape-wizard";
import { WizardStepper, type WizardStepDef } from "./wizard-stepper";
import { ElementLibraryPanel, type ToolCategory } from "./element-library-panel";
import { ElementInspectorPanel } from "./element-inspector-panel";
import { RoomBuilderCanvas } from "./room-builder-canvas";
import { ToolRail } from "./tool-rail";
import { useRoomBuilder } from "./use-room-builder";

const MIN_WIDTH_PX = 1024;

const WIZARD_STEPS: WizardStepDef[] = [
  { key: "shape", label: "Forma" },
  { key: "dimensions", label: "Dimensioni" },
  { key: "customize", label: "Personalizza" },
];

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
  // Lifted out of ShapeWizard so shape/width/depth survive it being
  // unmounted — e.g. "Modifica forma e dimensioni" from step 3 (brief §25/§36).
  const [wizardForm, setWizardForm] = useState<WizardFormState>(DEFAULT_WIZARD_FORM);
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
    if (!open) {
      setWizardResult(initialElements.length > 0 ? { elements: initialElements, startTool: "idle" } : null);
      setWizardForm(DEFAULT_WIZARD_FORM);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  // 0 = scelta forma, 1 = dimensioni, 2 = editor — pilota lo stesso stepper
  // in tutti e tre gli step (brief §1-3).
  const stepIndex = wizardResult ? 2 : wizardForm.shapeConfirmed ? 1 : 0;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Costruisci la sala ${roomName}`}
      // The whole workspace now matches the app's own dark theme (brief §2) —
      // only the actual room surface (the editor canvas, and the Forma/
      // Dimensioni previews standing in for it) stays cream.
      className="fixed inset-0 z-50 flex flex-col bg-background text-foreground"
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
          <OverlayHeader roomName={roomName} onClose={() => onOpenChange(false)} isDirty={() => false} stepIndex={stepIndex} />
          {/* Keyed on stepIndex so Forma↔Dimensioni replays the fade-in
              instead of a hard cut (brief §10/§32), while panel/preview stay
              in the same slot. */}
          <div key={stepIndex} className="min-h-0 flex-1 animate-fade-in overflow-hidden">
            <ShapeWizard value={wizardForm} onChange={setWizardForm} onComplete={setWizardResult} />
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
  const [confirmEditShape, setConfirmEditShape] = useState(false);
  const [activeCategory, setActiveCategory] = useState<ToolCategory>("structure");

  // Inspector opens only when there's something to show (brief §30): a
  // selected element/table, or an armed tool with instructions to display.
  const inspectorOpen = builder.selectedId !== null || builder.tool.mode !== "idle";

  async function handleSave() {
    await builder.save();
  }

  // Free to bail out while nothing has been touched yet; once walls/elements
  // exist, confirm first since regenerating the perimeter replaces them
  // (brief §35).
  function requestEditShape() {
    if (builder.canUndo) setConfirmEditShape(true);
    else onBack();
  }

  return (
    <div className="flex h-full flex-col animate-fade-in">
      <OverlayHeader
        roomName={roomName}
        onClose={onClose}
        isDirty={builder.isDirty}
        stepIndex={2}
        onEditShape={requestEditShape}
        onSave={handleSave}
        saving={builder.saving}
      />
      <div className="flex min-h-0 flex-1 gap-3 overflow-hidden p-3">
        <ToolRail active={activeCategory} onChange={setActiveCategory} />
        <div className="w-[228px] shrink-0 overflow-hidden rounded-lg border border-border bg-card text-card-foreground">
          <ElementLibraryPanel builder={builder} category={activeCategory} />
        </div>
        <div className="min-w-0 flex-1">
          <RoomBuilderCanvas builder={builder} />
        </div>
        <div
          className={cn(
            "shrink-0 overflow-hidden rounded-lg border border-border bg-card text-card-foreground transition-[width] duration-200",
            inspectorOpen ? "w-[260px]" : "w-0 border-transparent",
          )}
        >
          <div className="h-full w-[260px] overflow-y-auto">
            <ElementInspectorPanel builder={builder} />
          </div>
        </div>
      </div>

      <Dialog open={confirmEditShape} onOpenChange={setConfirmEditShape}>
        <DialogContent className="max-w-[440px]">
          <DialogHeader>
            <DialogTitle>Modificare forma o dimensioni?</DialogTitle>
            <DialogDescription>Modificare forma o dimensioni può cambiare la geometria della sala.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setConfirmEditShape(false)}>
              Annulla
            </Button>
            <Button
              type="button"
              variant="accent"
              onClick={() => {
                setConfirmEditShape(false);
                onBack();
              }}
            >
              Continua
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function OverlayHeader({
  roomName,
  onClose,
  isDirty,
  stepIndex,
  onEditShape,
  onSave,
  saving,
}: {
  roomName: string;
  onClose: () => void;
  isDirty: () => boolean;
  stepIndex: number;
  onEditShape?: () => void;
  onSave?: () => void;
  saving?: boolean;
}) {
  const [confirmClose, setConfirmClose] = useState(false);

  function requestClose() {
    if (isDirty()) setConfirmClose(true);
    else onClose();
  }

  return (
    <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-border bg-card px-4 py-2.5 text-card-foreground">
      <div className="flex flex-wrap items-center gap-4">
        <div>
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Costruisci la sala</p>
          <h1 className="text-display text-base font-semibold">{roomName}</h1>
        </div>
        <WizardStepper steps={WIZARD_STEPS} currentIndex={stepIndex} />
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
          {onEditShape && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-xs text-muted-foreground hover:text-card-foreground"
              onClick={onEditShape}
            >
              <ArrowLeft className="h-3.5 w-3.5" /> Modifica forma e dimensioni
            </Button>
          )}
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
