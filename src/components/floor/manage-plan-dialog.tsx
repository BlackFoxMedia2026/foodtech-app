"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Table } from "@prisma/client";
import { Camera, Hammer, UploadCloud } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { RoomElement } from "@/lib/room-layout";
import type { RoomLayoutMode } from "@prisma/client";
import { FloorPlanDialog } from "./floor-plan-dialog";
import { RoomBuilderOverlay } from "./builder/room-builder-overlay";

type Step = "choice" | "upload" | "builder";

/**
 * "Come vuoi creare la sala?" — entry point for Gestisci/Carica piantina.
 * Owns the switch between the two real flows (upload vs Room Builder) so
 * neither of them needs to know about the other; each keeps working exactly
 * as it did before this dialog existed (brief §3, §33-34).
 */
export function ManagePlanDialog({
  open,
  onOpenChange,
  roomId,
  roomName,
  currentFloorPlanUrl,
  activeLayoutMode,
  roomLayoutElements,
  roomWidth,
  roomHeight,
  allTables,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  roomId: string;
  roomName: string;
  currentFloorPlanUrl: string | null;
  activeLayoutMode: RoomLayoutMode | null;
  roomLayoutElements: RoomElement[];
  roomWidth: number;
  roomHeight: number;
  allTables: Table[];
}) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("choice");
  const [confirmSwitch, setConfirmSwitch] = useState(false);

  function reset(next: boolean) {
    onOpenChange(next);
    if (!next) {
      setStep("choice");
      setConfirmSwitch(false);
    }
  }

  function chooseBuilder() {
    if (currentFloorPlanUrl && activeLayoutMode !== "BUILDER") {
      setConfirmSwitch(true);
      return;
    }
    setStep("builder");
  }

  return (
    <>
      <Dialog open={open && step === "choice"} onOpenChange={reset}>
        <DialogContent className="max-w-[640px]" aria-labelledby="manage-plan-title" aria-describedby="manage-plan-description">
          <DialogHeader>
            <DialogTitle id="manage-plan-title">Come vuoi creare la sala?</DialogTitle>
            <DialogDescription id="manage-plan-description">{roomName}</DialogDescription>
          </DialogHeader>

          {!confirmSwitch ? (
            <div className="grid gap-3 sm:grid-cols-3">
              <PlanChoiceCard
                icon={UploadCloud}
                title="Carica una piantina"
                description="Hai già una planimetria o un'immagine della sala."
                cta="Carica piantina"
                onClick={() => setStep("upload")}
              />
              <PlanChoiceCard
                icon={Hammer}
                title="Crea la tua sala"
                description="Costruisci la sala direttamente nel gestionale."
                cta="Crea sala"
                onClick={chooseBuilder}
              />
              <PlanChoiceCard
                icon={Camera}
                title="Importa da foto / schizzo"
                description="Trasforma una foto o uno schizzo in una base modificabile."
                cta="Prossimamente"
                badge="Prossimamente"
                disabled
              />
            </div>
          ) : (
            <div className="flex flex-col gap-3 rounded-md border border-border bg-secondary/40 p-4 text-sm">
              <p>Hai già una piantina caricata per questa sala. Passando al Costruttore sala, la piantina caricata resterà salvata e potrai tornare a usarla in qualsiasi momento.</p>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => setConfirmSwitch(false)}>
                  Annulla
                </Button>
                <Button type="button" variant="accent" size="sm" onClick={() => setStep("builder")}>
                  Continua con il Costruttore sala
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <FloorPlanDialog
        open={step === "upload"}
        onOpenChange={(next) => {
          if (!next) reset(false);
        }}
        roomId={roomId}
        roomName={roomName}
        currentUrl={currentFloorPlanUrl}
      />

      <RoomBuilderOverlay
        open={step === "builder"}
        onOpenChange={(next) => {
          if (!next) reset(false);
        }}
        roomId={roomId}
        roomName={roomName}
        initialElements={roomLayoutElements}
        initialWidth={roomWidth}
        initialHeight={roomHeight}
        allTables={allTables}
        onSaved={() => router.refresh()}
      />
    </>
  );
}

function PlanChoiceCard({
  icon: Icon,
  title,
  description,
  cta,
  badge,
  disabled,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  cta: string;
  badge?: string;
  disabled?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex flex-col items-start gap-2 rounded-xl border border-border bg-card p-4 text-left transition-colors",
        disabled ? "cursor-not-allowed opacity-60" : "hover:border-accent-strong hover:bg-accent-strong/10",
      )}
    >
      <div className="flex w-full items-center justify-between">
        <Icon className="h-5 w-5 text-accent-strong" />
        {badge && <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{badge}</span>}
      </div>
      <span className="text-sm font-semibold">{title}</span>
      <span className="text-xs text-muted-foreground">{description}</span>
      <span className={cn("mt-1 text-xs font-medium", disabled ? "text-muted-foreground" : "text-accent-strong")}>{cta}</span>
    </button>
  );
}
