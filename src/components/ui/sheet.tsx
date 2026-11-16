"use client";

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { cn } from "@/lib/utils";

export const Sheet = DialogPrimitive.Root;
export const SheetTrigger = DialogPrimitive.Trigger;
export const SheetClose = DialogPrimitive.Close;
export const SheetPortal = DialogPrimitive.Portal;
export const SheetTitle = DialogPrimitive.Title;
export const SheetDescription = DialogPrimitive.Description;

// Right-anchored panel, no overlay/scrim — the app underneath stays fully
// visible and interactive (Radix Dialog `modal={false}` on the Root, set by
// the caller), matching how this app already treats non-blocking floating
// UI (the search/agent popover has no scrim either). Sits below the h-16
// header and reaches the viewport bottom, per the drawer's own spec.
export const SheetContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>
>(({ className, children, onInteractOutside, ...props }, ref) => (
  <SheetPortal>
    <DialogPrimitive.Content
      ref={ref}
      onInteractOutside={(e) => {
        // Non-blocking side panel: the rest of the app stays interactive,
        // so clicking it must not dismiss the drawer — only the close
        // button, Escape, or re-clicking the trigger should.
        e.preventDefault();
        onInteractOutside?.(e);
      }}
      className={cn(
        "sheet-content surface fixed bottom-0 right-0 top-16 z-40 flex w-[400px] max-w-[92vw] flex-col overflow-hidden rounded-none rounded-tl-xl border-r-0 border-t-0 sm:max-w-[90vw]",
        className,
        /*
          Sul telefono: a tutta larghezza sotto la testata e **sopra** la barra
          in basso. A z-40 e largo il 92% la barra copriva il campo dove si
          scrive all'agente, e la striscia di pagina a sinistra era troppo
          stretta per servire a qualcosa. Le classi `max-md:` vengono dopo
          quelle della pagina, che restano tutte per la scrivania.
        */
        "max-md:inset-x-0 max-md:top-[calc(4rem+env(safe-area-inset-top))] max-md:z-50 max-md:w-full max-md:max-w-none max-md:rounded-none max-md:rounded-t-[20px] max-md:border-x-0 max-md:pb-[env(safe-area-inset-bottom)]",
      )}
      {...props}
    >
      {children}
    </DialogPrimitive.Content>
  </SheetPortal>
));
SheetContent.displayName = DialogPrimitive.Content.displayName;
