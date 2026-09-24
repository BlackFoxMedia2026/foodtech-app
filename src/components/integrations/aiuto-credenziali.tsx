"use client";

import { HelpCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

/**
 * «Dove trovo la mia API Key?»: la spiegazione dietro un collegamento, non
 * davanti al modulo. Chi ha già la chiave non deve leggerla; chi non ce l'ha
 * la trova a un clic, scritta con le parole di chi gestisce un ristorante.
 */
export function AiutoCredenziali({
  aiuto,
  etichetta,
}: {
  aiuto: { titolo: string; paragrafi: string[] };
  /** Il testo del collegamento, se diverso dal titolo («Non le hai? Scopri dove trovarle»). */
  etichetta?: string;
}) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
        >
          <HelpCircle className="h-4 w-4" aria-hidden="true" />
          {etichetta ?? aiuto.titolo}
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{aiuto.titolo}</DialogTitle>
          <DialogDescription asChild>
            <div className="space-y-3 pt-1 text-sm leading-relaxed">
              {aiuto.paragrafi.map((p) => (
                <p key={p}>{p}</p>
              ))}
            </div>
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="accent">Ho capito</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
