"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import { SquarePen, X } from "lucide-react";

/**
 * L'agente a tutta pagina.
 *
 * Entra come un'onda verde che parte dal suo pulsante e riempie lo schermo
 * (`--agente-x/--agente-y` sono il centro del pulsante), sopra la pagina
 * sfocata come un vetro. I bordi bianchi girano lungo lo schermo come in Siri:
 * forti all'ingresso, poi si calmano e tornano accesi quando l'agente ascolta
 * o risponde (`acceso`). Esce rientrando nel pulsante.
 *
 * Prima era un pannello laterale sotto la testata: sul telefono restava una
 * striscia stretta tra la testata e la tastiera.
 */
export function AgentDrawer({
  origine,
  acceso,
  conMessaggi,
  onNewConversation,
  children,
}: {
  origine: { x: number; y: number } | null;
  acceso: boolean;
  /** «Nuova conversazione» ha senso solo se c'è una conversazione da chiudere. */
  conMessaggi: boolean;
  onNewConversation: () => void;
  children: React.ReactNode;
}) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Content
        className="agente-pagina fixed inset-0 z-[80] flex flex-col text-white focus:outline-none"
        style={
          {
            "--agente-x": origine ? `${origine.x}px` : "calc(100% - 3rem)",
            "--agente-y": origine ? `${origine.y}px` : "2rem",
          } as React.CSSProperties
        }
        data-acceso={acceso || undefined}
        aria-describedby={undefined}
      >
        <span className="agente-bordi" aria-hidden="true">
          {/* Il bagliore: una linea spessa dentro un contenitore sfocato. */}
          <span className="agente-bordi__alone">
            <span className="agente-bordi__linea agente-bordi__linea--spessa" />
          </span>
          <span className="agente-bordi__linea" />
        </span>

        <div className="relative z-10 flex shrink-0 items-center justify-between px-4 pb-2 pt-[max(0.75rem,env(safe-area-inset-top))]">
          {conMessaggi ? (
            <button
              type="button"
              onClick={onNewConversation}
              aria-label="Nuova conversazione"
              title="Nuova conversazione"
              className="agente-tasto grid h-11 w-11 place-items-center rounded-full"
            >
              <SquarePen className="h-5 w-5" aria-hidden="true" />
            </button>
          ) : (
            // Tiene il titolo al centro anche senza il tasto.
            <span className="h-11 w-11" aria-hidden="true" />
          )}
          <DialogPrimitive.Title className="text-base font-medium text-white/90">Agente</DialogPrimitive.Title>
          <DialogPrimitive.Close
            aria-label="Chiudi Agente"
            className="agente-tasto grid h-11 w-11 place-items-center rounded-full"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </DialogPrimitive.Close>
        </div>

        <div className="relative z-10 flex min-h-0 flex-1 flex-col">{children}</div>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}
