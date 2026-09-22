"use client";

import * as React from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * **Il foglio che sale dal basso** — §12 e §35 del brief.
 *
 * Il `Sheet` che il prodotto ha già è ancorato a destra e comincia sotto una
 * testata alta 64 px: è il pannello della scrivania, e su un telefono
 * arriverebbe largo 400 px su uno schermo da 375. Questo è l'altro gesto, e
 * l'unico che ha senso con una mano sola: il contenuto sale da dove sta il
 * pollice, e si chiude trascinandolo giù o toccando fuori.
 *
 * ## Le misure
 *
 * - **`max-h-[88dvh]`**: resta sempre una striscia del tavolo sotto, così si
 *   capisce di essere dentro una cosa e non su una pagina nuova;
 * - **`dvh` e non `vh`**: su iOS la barra degli indirizzi si ritrae, e con
 *   `vh` il fondo del foglio — cioè il pulsante di conferma — finisce sotto
 *   di essa;
 * - **il piede è fisso**, il corpo scorre: la conferma di una
 *   personalizzazione lunga non deve chiedere di scorrere fino in fondo per
 *   essere premuta;
 * - **`pb-[env(safe-area-inset-bottom)]`** sul piede, sommato al padding: sui
 *   telefoni con la barra gestuale, senza, il pulsante ci finisce sotto.
 *
 * ## Perché è modale
 *
 * Il pannello della scrivania non lo è di proposito: lì si consulta qualcosa
 * mentre si guarda altro. Qui si sta **compilando** — la cottura di una
 * tagliata, l'ospite a cui va — e un tocco distratto sulla sala dietro che
 * facesse perdere quello che si è scritto costerebbe più di quanto costi
 * dover chiudere.
 */
export function Foglio({
  aperto,
  onChiudi,
  titolo,
  sottotitolo,
  piede,
  children,
  /** `alto` per il menu, che ha bisogno di quanto più schermo possibile. */
  altezza = "normale",
}: {
  aperto: boolean;
  onChiudi: () => void;
  titolo: string;
  sottotitolo?: string | null;
  piede?: React.ReactNode;
  children: React.ReactNode;
  altezza?: "normale" | "alto";
}) {
  return (
    <Dialog.Root open={aperto} onOpenChange={(v) => !v && onChiudi()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-[2px] data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <Dialog.Content
          className={cn(
            "fixed inset-x-0 bottom-0 z-50 flex flex-col overflow-hidden rounded-t-2xl border-t border-border bg-card shadow-2xl",
            "data-[state=open]:animate-in data-[state=open]:slide-in-from-bottom-4 motion-reduce:data-[state=open]:animate-none",
            altezza === "alto" ? "h-[92dvh]" : "max-h-[88dvh]",
          )}
        >
          {/* La maniglia: non trascina niente — Radix non lo fa — ma dice
              che questo oggetto viene dal basso e si chiude verso il basso.
              Decorativa, quindi nascosta ai lettori di schermo. */}
          <div aria-hidden="true" className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-border-strong" />

          <header className="flex shrink-0 items-start gap-3 px-4 pb-3 pt-3">
            <div className="min-w-0 flex-1">
              <Dialog.Title className="t-titolo-sezione truncate">{titolo}</Dialog.Title>
              {sottotitolo && (
                <Dialog.Description className="t-nota mt-0.5 truncate">
                  {sottotitolo}
                </Dialog.Description>
              )}
            </div>
            <Dialog.Close
              aria-label="Chiudi"
              className="-mr-1 -mt-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors active:bg-current/10"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </Dialog.Close>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">{children}</div>

          {piede && (
            <div className="shrink-0 border-t border-border bg-card px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
              {piede}
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
