"use client";

import { forwardRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { AgentVisual, type AgentVisualState } from "./agent-visual";

type ButtonProps = React.ComponentPropsWithoutRef<typeof Button>;

export const AgentButton = forwardRef<HTMLButtonElement, { open: boolean; processing: boolean } & Omit<ButtonProps, "children">>(
  ({ open, processing, ...props }, ref) => {
    const [hovering, setHovering] = useState(false);
    const state: AgentVisualState = processing ? "processing" : open ? "active" : hovering ? "hover" : "idle";

    return (
      <Button
        ref={ref}
        type="button"
        size="icon"
        variant="ghost"
        aria-label={open ? "Chiudi Agente" : "Apri Agente"}
        onMouseEnter={() => setHovering(true)}
        onMouseLeave={() => setHovering(false)}
        /*
          La scatola è larga quanto la sfera, non quanto il bottone.

          La sfera è disegnata a 62 px e trabocca dal bottone (`overflow-visible`):
          con una scatola da 46 px il suo alone stava **fuori** dal conto del
          layout, e il `gap` della barra lo misurava dal bordo del bottone. Ci si
          aggiungeva uno spostamento di 14 px a sinistra, e il risultato si vedeva:
          l'alone entrava dentro il cerchio della ricerca. Ora la larghezza è
          quella dell'alone, lo spostamento non serve più, e lo spazio fra la
          sfera e ciò che le sta accanto è davvero quello che dice la barra.

          L'altezza resta 46: in verticale l'alone sborda sopra e sotto, dove non
          c'è nient'altro da toccare.
        */
        className="h-[46px] w-[62px] shrink-0 overflow-visible text-foreground hover:bg-transparent"
        {...props}
      >
        <AgentVisual state={state} size={62} />
      </Button>
    );
  },
);
AgentButton.displayName = "AgentButton";
