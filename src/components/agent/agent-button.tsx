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

          Sul telefono la sfera scende a 50 px con una scala, non con un'altra
          misura: l'animazione è disegnata a 62 e rifarla più piccola vorrebbe
          dire due sfere da tenere uguali. La scatola scende con lei, e sono i
          12 px che tengono intero il titolo della pagina accanto al marchio.
        */
        className="h-[46px] w-[50px] shrink-0 overflow-visible text-foreground hover:bg-transparent md:w-[62px]"
        {...props}
      >
        <span className="grid scale-[0.8] place-items-center md:scale-100">
          <AgentVisual state={state} size={62} />
        </span>
      </Button>
    );
  },
);
AgentButton.displayName = "AgentButton";
