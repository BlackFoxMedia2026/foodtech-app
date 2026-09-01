"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { Table } from "@prisma/client";
import { ChevronLeft, ChevronRight, MoreVertical, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { FloorCanvas, type FloorCanvasHandle } from "./floor-canvas";
import { FloorServiceFilter } from "./floor-service-filter";

type RoomWithTables = {
  id: string;
  name: string;
  width: number;
  height: number;
  floorPlanUrl: string | null;
  tables: Table[];
};

function RoomTransition({ roomKey, children }: { roomKey: string; children: React.ReactNode }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    setVisible(false);
    const id = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(id);
  }, [roomKey]);
  return (
    <div
      className="motion-reduce:!translate-x-0 motion-reduce:!opacity-100 motion-reduce:transition-none"
      style={{
        transition: "opacity 200ms ease-out, transform 200ms ease-out",
        opacity: visible ? 1 : 0,
        transform: visible ? "translateX(0)" : "translateX(6px)",
      }}
    >
      {children}
    </div>
  );
}

export function FloorRoomsView({
  rooms,
  isTablesMode,
  date,
  service,
  serviceOptions,
  waiterByTableId,
  waiters,
}: {
  rooms: RoomWithTables[];
  isTablesMode: boolean;
  date: string;
  service: string;
  serviceOptions: string[];
  waiterByTableId: Record<string, { id: string; name: string }>;
  waiters: { id: string; name: string }[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const canvasRef = useRef<FloorCanvasHandle>(null);

  const [activeRoomId, setActiveRoomId] = useState(() => {
    const fromUrl = search.get("room");
    return rooms.find((r) => r.id === fromUrl)?.id ?? rooms[0]?.id ?? "";
  });
  const [pendingRoomId, setPendingRoomId] = useState<string | null>(null);
  const [unsavedOpen, setUnsavedOpen] = useState(false);
  const [dirty, setDirty] = useState(false);

  const [renameOpen, setRenameOpen] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [renameError, setRenameError] = useState<string | null>(null);
  const [renameSubmitting, setRenameSubmitting] = useState(false);

  const [newRoomOpen, setNewRoomOpen] = useState(false);
  const [newRoomValue, setNewRoomValue] = useState("");
  const [newRoomError, setNewRoomError] = useState<string | null>(null);
  const [newRoomSubmitting, setNewRoomSubmitting] = useState(false);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);

  const activeIndex = Math.max(
    0,
    rooms.findIndex((r) => r.id === activeRoomId),
  );
  const activeRoom = rooms[activeIndex] ?? rooms[0];
  const totalSeats = activeRoom ? activeRoom.tables.reduce((s, t) => s + t.seats, 0) : 0;
  const activeTables = activeRoom ? activeRoom.tables.filter((t) => t.active) : [];
  const assignedCount = activeTables.filter((t) => waiterByTableId[t.id]).length;
  const fullyCovered = activeTables.length > 0 && assignedCount === activeTables.length;

  function navigateTo(roomId: string) {
    const sp = new URLSearchParams(search);
    sp.set("room", roomId);
    router.replace(`${pathname}?${sp.toString()}`, { scroll: false });
  }

  function applySwitch(roomId: string) {
    setActiveRoomId(roomId);
    navigateTo(roomId);
  }

  function goTo(delta: number) {
    if (rooms.length <= 1) return;
    const nextIndex = ((activeIndex + delta) % rooms.length + rooms.length) % rooms.length;
    const nextRoomId = rooms[nextIndex].id;
    if (nextRoomId === activeRoomId) return;
    if (canvasRef.current?.isDirty()) {
      setPendingRoomId(nextRoomId);
      setUnsavedOpen(true);
      return;
    }
    applySwitch(nextRoomId);
  }

  async function handleSaveAndContinue() {
    await canvasRef.current?.save();
    if (pendingRoomId) applySwitch(pendingRoomId);
    setPendingRoomId(null);
    setUnsavedOpen(false);
  }

  function handleContinueWithoutSaving() {
    if (pendingRoomId) applySwitch(pendingRoomId);
    setPendingRoomId(null);
    setUnsavedOpen(false);
  }

  function handleCancelSwitch() {
    setPendingRoomId(null);
    setUnsavedOpen(false);
  }

  async function handleRename(e: React.FormEvent) {
    e.preventDefault();
    const name = renameValue.trim();
    if (!name) {
      setRenameError("Inserisci un nome per la sala.");
      return;
    }
    setRenameSubmitting(true);
    setRenameError(null);
    const res = await fetch(`/api/rooms/${activeRoom.id}`, {
      method: "PATCH",
      body: JSON.stringify({ name }),
      headers: { "content-type": "application/json" },
    });
    setRenameSubmitting(false);
    if (!res.ok) {
      setRenameError("Impossibile rinominare la sala. Riprova.");
      return;
    }
    setRenameOpen(false);
    router.refresh();
  }

  async function handleCreateRoom(e: React.FormEvent) {
    e.preventDefault();
    const name = newRoomValue.trim();
    if (!name) {
      setNewRoomError("Inserisci un nome per la sala.");
      return;
    }
    setNewRoomSubmitting(true);
    setNewRoomError(null);
    const res = await fetch("/api/rooms", {
      method: "POST",
      body: JSON.stringify({ name }),
      headers: { "content-type": "application/json" },
    });
    setNewRoomSubmitting(false);
    if (!res.ok) {
      setNewRoomError("Impossibile creare la sala. Riprova.");
      return;
    }
    const created = await res.json();
    setNewRoomOpen(false);
    setNewRoomValue("");
    setActiveRoomId(created.id);
    navigateTo(created.id);
    router.refresh();
  }

  async function handleDelete() {
    setDeleteSubmitting(true);
    setDeleteError(null);
    const res = await fetch(`/api/rooms/${activeRoom.id}`, { method: "DELETE" });
    setDeleteSubmitting(false);
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setDeleteError(body?.message ?? "Impossibile eliminare la sala.");
      return;
    }
    const remaining = rooms.filter((r) => r.id !== activeRoom.id);
    setDeleteOpen(false);
    if (remaining[0]) {
      setActiveRoomId(remaining[0].id);
      navigateTo(remaining[0].id);
    }
    router.refresh();
  }

  if (!activeRoom) {
    return (
      <div className="rounded-md border border-dashed p-12 text-center text-sm text-muted-foreground">
        Nessuna sala configurata.
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-widest text-muted-foreground">Sala</p>
          <div className="flex items-center gap-1">
            <Button
              type="button"
              size="icon"
              variant="ghost"
              onClick={() => goTo(-1)}
              disabled={rooms.length <= 1}
              aria-label="Sala precedente"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <h1 className="text-display text-3xl">{activeRoom.name}</h1>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              onClick={() => goTo(1)}
              disabled={rooms.length <= 1}
              aria-label="Sala successiva"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
            {rooms.length > 1 && (
              <span className="ml-1 text-xs text-muted-foreground">
                {activeIndex + 1} / {rooms.length}
              </span>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button type="button" size="icon" variant="ghost" aria-label="Azioni sala">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuItem
                  onClick={() => {
                    setRenameValue(activeRoom.name);
                    setRenameError(null);
                    setRenameOpen(true);
                  }}
                >
                  <Pencil className="h-4 w-4" /> Rinomina sala
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => {
                    setNewRoomValue("");
                    setNewRoomError(null);
                    setNewRoomOpen(true);
                  }}
                >
                  <Plus className="h-4 w-4" /> Nuova sala
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => {
                    setDeleteError(null);
                    setDeleteOpen(true);
                  }}
                  className="text-destructive"
                >
                  <Trash2 className="h-4 w-4" /> Elimina sala
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <p className="text-sm text-muted-foreground">
            {activeRoom.tables.length} tavoli · {totalSeats} posti totali
            {dirty && <span className="text-accent"> · Modifiche non salvate</span>}
          </p>
        </div>
        {isTablesMode && (
          <div className="flex flex-wrap items-center gap-3">
            <FloorServiceFilter date={date} service={service} serviceOptions={serviceOptions} />
            <Badge tone={fullyCovered ? "success" : "neutral"}>
              {assignedCount} di {activeTables.length} tavoli assegnati
            </Badge>
          </div>
        )}
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Editor visuale</CardTitle>
          <CardDescription>
            Riorganizza la sala visivamente. Le modifiche restano locali finché non premi
            <span className="font-medium"> Salva sala</span>.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <RoomTransition roomKey={activeRoom.id}>
            <FloorCanvas
              ref={canvasRef}
              key={activeRoom.id}
              initialTables={activeRoom.tables}
              roomId={activeRoom.id}
              roomName={activeRoom.name}
              floorPlanUrl={activeRoom.floorPlanUrl}
              width={activeRoom.width}
              height={activeRoom.height}
              waiterByTableId={isTablesMode ? waiterByTableId : undefined}
              waiters={waiters}
              date={date}
              service={service}
              onDirtyChange={setDirty}
            />
          </RoomTransition>
        </CardContent>
      </Card>

      <Dialog open={unsavedOpen} onOpenChange={(next) => !next && handleCancelSwitch()}>
        <DialogContent className="max-w-[440px]">
          <DialogHeader>
            <DialogTitle>Modifiche non salvate</DialogTitle>
            <DialogDescription>
              Hai modificato la disposizione dei tavoli. Vuoi salvare prima di cambiare sala?
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={handleCancelSwitch}>
              Annulla
            </Button>
            <Button type="button" variant="subtle" onClick={handleContinueWithoutSaving}>
              Continua senza salvare
            </Button>
            <Button type="button" variant="accent" onClick={handleSaveAndContinue}>
              Salva e continua
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent className="max-w-[420px]">
          <DialogHeader>
            <DialogTitle>Rinomina sala</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleRename} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="rename-room">Nome sala</Label>
              <Input
                id="rename-room"
                autoFocus
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                placeholder="Es. Sala principale"
              />
              {renameError && <p className="text-xs text-destructive">{renameError}</p>}
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setRenameOpen(false)}>
                Annulla
              </Button>
              <Button type="submit" variant="accent" disabled={renameSubmitting}>
                {renameSubmitting ? "Salvataggio…" : "Salva"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={newRoomOpen} onOpenChange={setNewRoomOpen}>
        <DialogContent className="max-w-[420px]">
          <DialogHeader>
            <DialogTitle>Nuova sala</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreateRoom} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="new-room">Nome sala</Label>
              <Input
                id="new-room"
                autoFocus
                value={newRoomValue}
                onChange={(e) => setNewRoomValue(e.target.value)}
                placeholder="Es. Terrazza"
              />
              {newRoomError && <p className="text-xs text-destructive">{newRoomError}</p>}
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setNewRoomOpen(false)}>
                Annulla
              </Button>
              <Button type="submit" variant="accent" disabled={newRoomSubmitting}>
                {newRoomSubmitting ? "Creazione…" : "Crea sala"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="max-w-[440px]">
          <DialogHeader>
            <DialogTitle>Elimina sala</DialogTitle>
            <DialogDescription>
              Stai per eliminare &quot;{activeRoom.name}&quot;. L&apos;operazione non può essere annullata.
            </DialogDescription>
          </DialogHeader>
          {deleteError && <p className="text-sm text-destructive">{deleteError}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setDeleteOpen(false)}>
              Annulla
            </Button>
            <Button type="button" variant="destructive" onClick={handleDelete} disabled={deleteSubmitting}>
              {deleteSubmitting ? "Elimino…" : "Elimina sala"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
