"use client";

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogPortal = DialogPrimitive.Portal;
export const DialogClose = DialogPrimitive.Close;

export const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn("fixed inset-0 z-50 bg-carbon-900/55 backdrop-blur-sm animate-fade-in", className)}
    {...props}
  />
));
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName;

/*
  Sul telefono (sotto `md`) la finestra diventa un **foglio dal basso**: sale
  dal bordo, prende tutta la larghezza, si ferma al 92% dell'altezza e scorre
  dentro. Una finestra centrata a 390 px è un francobollo con i margini, e i
  suoi pulsanti stanno a metà schermo, lontano dal pollice.

  Le classi del telefono sono tutte `max-md:` di proposito: battono quelle che
  le pagine passano per la scrivania (`top-[12%]`, `w-[calc(100vw-2rem)]`,
  `rounded-[28px]`…) senza che nessuna pagina debba saperlo, e da `md` in su
  non esistono — la scrivania resta com'era.
*/
const FOGLIO_TELEFONO =
  "max-md:inset-x-0 max-md:bottom-0 max-md:left-0 max-md:top-auto max-md:h-auto max-md:w-full max-md:max-w-none " +
  "max-md:max-h-[92dvh] max-md:translate-x-0 max-md:translate-y-0 max-md:rounded-b-none max-md:rounded-t-[20px] " +
  "max-md:border-x-0 max-md:border-b-0 max-md:animate-foglio-sale max-md:pt-3";

export const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>
>(({ className, children, ...props }, ref) => (
  <DialogPortal>
    <DialogOverlay />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        "surface fixed left-[50%] top-[50%] z-50 grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 p-6 animate-finestra-entra",
        // Se il contenuto supera la finestra (un form che si apre, una lista lunga)
        // il dialog non può crescere fuori schermo: si ferma e scorre dentro.
        "scorrimento max-h-[calc(100dvh-2rem)] overflow-y-auto",
        className,
        FOGLIO_TELEFONO,
      )}
      {...props}
    >
      {/*
        La chiusura del telefono sta **prima** del contenuto e resta ferma in
        alto mentre il foglio scorre: in fondo a un modulo lungo la ✕ della
        scrivania era sparita insieme alla prima riga. Su scrivania non
        esiste (`md:hidden`), quindi lì il fuoco d'apertura va ancora al primo
        campo come prima; sul telefono va alla ✕, e la tastiera non salta su
        da sola coprendo metà foglio.
      */}
      <DialogPrimitive.Close className="sticky top-0 z-20 -mb-11 ml-auto mr-1 grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[color:var(--card-fill)] text-muted-foreground shadow-sm ring-1 ring-border md:hidden">
        <X className="h-5 w-5" aria-hidden="true" />
        <span className="sr-only">Chiudi</span>
      </DialogPrimitive.Close>
      {children}
      <DialogPrimitive.Close className="absolute right-4 top-4 hidden rounded-sm opacity-60 transition-opacity hover:opacity-100 md:block">
        <X className="h-4 w-4" />
        <span className="sr-only">Chiudi</span>
      </DialogPrimitive.Close>
    </DialogPrimitive.Content>
  </DialogPortal>
));
DialogContent.displayName = DialogPrimitive.Content.displayName;

export const DialogHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("flex flex-col gap-1.5 max-md:pr-12", className)} {...props} />
);

/*
  Sul telefono i pulsanti sono la fascia ferma in fondo al foglio: il corpo
  scorre sotto di loro, e restano dove arriva il pollice anche in un modulo
  lungo. Il margine sotto tiene conto della linea della home dell'iPhone.
  Pulsanti alti 44 px e a tutta larghezza, uno sopra l'altro.
*/
export const DialogFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex flex-col-reverse gap-2 sm:flex-row sm:justify-end",
      // Niente margini negativi (le finestre hanno padding diversi, e uscire dal
      // bordo farebbe scorrere il foglio di lato): il fondo pieno lo allarga
      // un'ombra senza sfumatura, ai lati e sotto, mai sopra.
      "max-md:sticky max-md:bottom-0 max-md:z-10 max-md:border-t max-md:border-border max-md:bg-[color:var(--card-fill)] max-md:pt-3 max-md:pb-[env(safe-area-inset-bottom)] max-md:shadow-[0_24px_0_24px_var(--card-fill)] max-md:[&>*]:min-h-[44px]",
      className,
    )}
    {...props}
  />
);

export const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn("text-display text-lg font-medium leading-none", className)}
    {...props}
  />
));
DialogTitle.displayName = DialogPrimitive.Title.displayName;

export const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props}
  />
));
DialogDescription.displayName = DialogPrimitive.Description.displayName;
