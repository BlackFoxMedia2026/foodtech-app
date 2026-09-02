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
        className="h-[46px] w-[46px] shrink-0 -translate-x-[14px] overflow-visible text-foreground hover:bg-transparent"
        {...props}
      >
        <AgentVisual state={state} size={76} />
      </Button>
    );
  },
);
AgentButton.displayName = "AgentButton";
