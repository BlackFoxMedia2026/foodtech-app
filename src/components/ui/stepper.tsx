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
}

export function Stepper({ steps, currentStepIndex, furthestStepIndex, onStepClick }: StepperProps) {
  return (
    <ol className="flex w-full items-center">
      {steps.map((step, index) => {
        const isCompleted = index < furthestStepIndex;
        const isCurrent = index === currentStepIndex;
        const isReachable = index <= furthestStepIndex;
        return (
          <li key={step.id} className="flex flex-1 items-center last:flex-none">
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
                  "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold transition-colors",
                  isCompleted && "border-accent bg-accent text-accent-foreground",
                  isCurrent && !isCompleted && "border-accent text-accent",
                  !isCompleted && !isCurrent && "border-border text-muted-foreground",
                )}
              >
                {isCompleted ? <Check className="h-3.5 w-3.5" /> : index + 1}
              </span>
              <span
                className={cn(
                  "hidden text-xs font-medium sm:block",
                  isCurrent ? "text-foreground" : "text-muted-foreground",
                )}
              >
                {step.label}
              </span>
            </button>
            {index < steps.length - 1 && (
              <div className={cn("mx-2 h-px flex-1", isCompleted ? "bg-accent" : "bg-border")} />
            )}
          </li>
        );
      })}
    </ol>
  );
}
