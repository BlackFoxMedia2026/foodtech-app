import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export interface StepperStep {
  id: string;
  label: string;
}

interface StepperProps {
  steps: StepperStep[];
  currentStepIndex: number;
  furthestStepIndex: number;
  onStepClick?: (index: number) => void;
  /**
   * `esteso` occupa tutta la riga, con i trattini che si allungano fino a
   * riempirla. `compatto` prende solo lo spazio che gli serve, per stare
   * accanto a un titolo senza diventare la cosa più vistosa della pagina:
   * lo stepper dice *dove sei*, e nessuno arriva qui per guardarlo.
   */
  variant?: "esteso" | "compatto";
}

export function Stepper({
  steps,
  currentStepIndex,
  furthestStepIndex,
  onStepClick,
  variant = "esteso",
}: StepperProps) {
  const compatto = variant === "compatto";
  return (
    <ol className={cn("flex items-center", compatto ? "w-auto" : "w-full")}>
      {steps.map((step, index) => {
        const isCompleted = index < furthestStepIndex;
        const isCurrent = index === currentStepIndex;
        const isReachable = index <= furthestStepIndex;
        return (
          <li key={step.id} className={cn("flex items-center last:flex-none", !compatto && "flex-1")}>
            <button
              type="button"
              disabled={!isReachable || !onStepClick}
              onClick={() => onStepClick?.(index)}
              className={cn(
                "flex items-center gap-2 text-left",
                isReachable && onStepClick ? "cursor-pointer" : "cursor-default",
              )}
            >
              <span
                className={cn(
                  "flex shrink-0 items-center justify-center rounded-full border font-semibold transition-colors",
                  compatto ? "h-6 w-6 text-[11px]" : "h-7 w-7 text-xs",
                  isCompleted && "border-accent-strong bg-accent-strong text-accent-strong-foreground",
                  isCurrent && !isCompleted && "border-accent-strong text-accent-strong",
                  !isCompleted && !isCurrent && "border-border text-muted-foreground",
                )}
              >
                {isCompleted ? <Check className="h-3.5 w-3.5" /> : index + 1}
              </span>
              <span
                className={cn(
                  "text-xs font-medium",
                  // Nello stepper compatto restano solo il passo corrente e i
                  // suoi vicini a portare l'etichetta finché lo schermo è
                  // stretto: sei parole in fila diventano due righe di puntini.
                  compatto ? (isCurrent ? "hidden sm:block" : "hidden lg:block") : "hidden sm:block",
                  isCurrent ? "text-foreground" : "text-muted-foreground",
                )}
              >
                {step.label}
              </span>
            </button>
            {index < steps.length - 1 && (
              <div
                className={cn(
                  "h-px",
                  compatto ? "mx-2 w-4 lg:w-6" : "mx-2 flex-1",
                  isCompleted ? "bg-accent-strong" : "bg-border",
                )}
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}
