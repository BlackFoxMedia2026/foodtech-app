"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronDown, Loader2 } from "lucide-react";
import type { WaiterStatus } from "@prisma/client";
import { readApiError } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { STAFF_STATUSES, staffStatusLabel } from "@/lib/staff-status";
import { cn } from "@/lib/utils";

/** Cinque pallini che devono distinguersi **senza leggere l'etichetta**: se
 * «a riposo» e «non disponibile» sono due grigi uguali, il pallino non serve
 * a niente e tanto valeva scrivere solo la parola. */
const DOT: Record<WaiterStatus, string> = {
  ACTIVE: "bg-sage",
  RESTING: "bg-[color:var(--dot-riposo)]",
  VACATION: "bg-accent-strong",
  SICK_LEAVE: "bg-destructive",
  UNAVAILABLE: "border border-muted-foreground bg-transparent",
};

/**
 * Lo stato di una persona, da cambiare in un gesto.
 *
 * Era un interruttore fra due valori: «Metti a riposo» / «Rimetti in
 * servizio». Con cinque stati un interruttore non basta più, ma la cosa
 * importante è che il pulsante **dice già lo stato attuale** invece di dire
 * l'azione: prima, per sapere se Marco era in servizio, bisognava leggere
 * l'etichetta del bottone e invertirla mentalmente.
 */
export function StaffStatusSelect({
  waiterId,
  status,
  disabled = false,
}: {
  waiterId: string;
  status: WaiterStatus;
  disabled?: boolean;
}) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function change(next: WaiterStatus) {
    if (next === status) return;
    setSubmitting(true);
    setError(null);
    const res = await fetch(`/api/waiters/${waiterId}`, {
      method: "PATCH",
      body: JSON.stringify({ status: next }),
      headers: { "content-type": "application/json" },
    });
    setSubmitting(false);
    if (res.ok) router.refresh();
    else setError(await readApiError(res, "Non è stato possibile cambiare lo stato."));
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled || submitting}
          className="gap-1.5"
          aria-label={`Stato: ${staffStatusLabel(status)}. Cambia`}
          title={error ?? undefined}
        >
          {submitting ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <span className={cn("h-2 w-2 shrink-0 rounded-full", error ? "bg-destructive" : DOT[status])} />
          )}
          <span>{staffStatusLabel(status)}</span>
          <ChevronDown className="h-3 w-3 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        {STAFF_STATUSES.map((s) => (
          <DropdownMenuItem key={s.value} onSelect={() => change(s.value)} className="gap-2">
            <span className={cn("h-2 w-2 shrink-0 rounded-full", DOT[s.value])} />
            <span className="flex-1">{s.label}</span>
            {s.value === status && <Check className="h-3.5 w-3.5" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
