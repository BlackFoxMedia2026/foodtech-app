"use client";

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Il **pannello di contesto**: pannello laterale da `md`, foglio dal basso su
 * telefono.
 *
 * ## Perché esiste
 *
 * Prima c'erano due contenitori: `Dialog` (usato in ventinove file) e `Sheet`
 * (in due, ed è il pannello dell'agente). Quindi ogni dettaglio era una
 * **pagina** — scheda prenotazione, scheda ospite — e aprirla da una lista
 * significava perdere la posizione nella lista e tornare indietro.
 *
 * Durante la preparazione di un servizio si controllano nove prenotazioni una
 * dopo l'altra: apri, leggi, torna, apri la seconda. Ventisette navigazioni
 * per un lavoro che è «scorrere una lista guardando i dettagli». Il pannello
 * serve a questo: si apre accanto alla lista, la lista resta, si passa da una
 * riga all'altra senza chiudere niente.
 *
 * ## Le tre scelte che lo definiscono
 *
 * **Non oscura la pagina.** Nessun velo: quello che sta sotto resta visibile e
 * cliccabile (`modal={false}`), perché il senso è tenere il contesto, non
 * sostituirlo. Un clic fuori non chiude — chiudono il pulsante, `Esc`, o
 * l'apertura di un'altra riga: su un tablet al leggio un tocco impreciso non
 * deve far sparire quello che si stava leggendo.
 *
 * **Su telefono è un foglio dal basso.** Non un pannello laterale ristretto: a
 * 390px un pannello da 400 è la pagina intera, e allora tanto vale la forma
 * che il telefono conosce — sale dal basso, si chiude verso il basso, e ha le
 * azioni in fondo, dove arriva il pollice.
 *
 * **Le azioni stanno in fondo, e restano ferme.** Il corpo scorre, la fascia
 * delle azioni no: è la stessa regola delle pagine (`.fissa` + `.fill-scroll`),
 * perché anche qui l'informazione che serve non deve finire sotto la piega.
 *
 * ## Quando usarlo e quando no
 *
 * - **pannello** → il dettaglio di una riga, restando nella lista: prenotazione,
 *   ospite, tavolo, riga di attesa;
 * - **modale** (`Dialog`) → un'azione concentrata che chiede attenzione e va
 *   finita o annullata: emettere una gift card, una conferma distruttiva;
 * - **pagina** → un compito lungo, o una destinazione che si condivide con un
 *   link: Analisi, Impostazioni, la procedura delle campagne.
 *
 * Le rotte dei dettagli **restano**: `/bookings/[id]` continua a rendere una
 * pagina, così un link condiviso funziona. È la lista che apre un pannello
 * invece di navigare.
 */
export const Pannello = DialogPrimitive.Root;
export const PannelloTrigger = DialogPrimitive.Trigger;
export const PannelloClose = DialogPrimitive.Close;
export const PannelloTitle = DialogPrimitive.Title;
export const PannelloDescription = DialogPrimitive.Description;

export const PannelloContenuto = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>
>(({ className, children, onInteractOutside, ...props }, ref) => (
  <DialogPrimitive.Portal>
    <DialogPrimitive.Content
      ref={ref}
      onInteractOutside={(e) => {
        e.preventDefault();
        onInteractOutside?.(e);
      }}
      className={cn(
        "pannello surface fixed z-40 flex flex-col overflow-hidden",
        // Telefono: foglio dal basso, alto al massimo l'85% dello schermo —
        // resta un dito di pagina sopra, così si vede che c'è qualcosa dietro.
        "inset-x-0 bottom-0 max-h-[85vh] rounded-t-xl border-x-0 border-b-0",
        // Da `md`: pannello laterale sotto la testata, fino in fondo.
        "md:inset-x-auto md:bottom-0 md:right-0 md:top-16 md:max-h-none md:w-[420px] md:max-w-[92vw] md:rounded-t-none md:rounded-tl-xl md:border-x md:border-b",
        className,
      )}
      {...props}
    >
      {children}
    </DialogPrimitive.Content>
  </DialogPrimitive.Portal>
));
PannelloContenuto.displayName = "PannelloContenuto";

/** L'intestazione: non scorre, e porta il pulsante di chiusura. */
export function PannelloTesta({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("fissa flex items-start justify-between gap-3 border-b border-border p-4", className)}>
      <div className="min-w-0">{children}</div>
      <PannelloClose
        className="shrink-0 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground"
        aria-label="Chiudi"
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </PannelloClose>
    </div>
  );
}

/** Il corpo: è l'unica parte che scorre. */
export function PannelloCorpo({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={cn("fill-scroll space-y-4 p-4", className)}>{children}</div>;
}

/**
 * Le azioni: in fondo, ferme, e su telefono con il margine per la zona
 * sicura — altrimenti su un iPhone il pulsante principale finisce sotto la
 * barra di sistema.
 */
export function PannelloAzioni({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "fissa flex flex-wrap gap-2 border-t border-border bg-card/60 p-3",
        "pb-[max(0.75rem,env(safe-area-inset-bottom))] md:pb-3",
        className,
      )}
    >
      {children}
    </div>
  );
}
