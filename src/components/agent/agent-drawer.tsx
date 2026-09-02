"use client";

import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SheetContent, SheetClose, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { AgentVisual } from "./agent-visual";

export function AgentDrawer({
  onNewConversation,
  children,
}: {
  onNewConversation: () => void;
  children: React.ReactNode;
}) {
  return (
    <SheetContent>
      <div className="flex shrink-0 items-center gap-2.5 border-b border-border px-4 py-3">
        <AgentVisual state="active" size={22} />
        <div className="min-w-0 flex-1">
          <SheetTitle className="text-sm font-medium leading-tight text-card-foreground">Agente</SheetTitle>
          <SheetDescription className="truncate text-xs text-muted-foreground">
            Assistente del tuo ristorante
          </SheetDescription>
        </div>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="h-8 w-8"
          aria-label="Nuova conversazione"
          title="Nuova conversazione"
          onClick={onNewConversation}
        >
          <Plus className="h-4 w-4" />
        </Button>
        <SheetClose asChild>
          <Button type="button" size="icon" variant="ghost" className="h-8 w-8" aria-label="Chiudi Agente">
            <X className="h-4 w-4" />
          </Button>
        </SheetClose>
      </div>
      {children}
    </SheetContent>
  );
}
