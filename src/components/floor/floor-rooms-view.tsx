"use client";

import { useEffect, useRef, useState } from "react";
import { readApiError } from "@/lib/api-client";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { Table } from "@prisma/client";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import type { TableStaffMap } from "./table-node";
import type { TableOperationalStatus } from "@/lib/table-status";
import { EditorSala, type SalaPerEditor } from "./editor/editor-sala";
import type { EsitoSalvataggio } from "./editor/use-editor-sala";
import type { PermessiTavolo } from "@/components/tables/table-profile-drawer";

type RoomWithTables = SalaPerEditor & { tables: Table[] };

function RoomTransition({ roomKey, children }: { roomKey: string; children: React.ReactNode }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    setVisible(false);
    const id = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(id);
  }, [roomKey]);
  return (
    <div
      className="h-full motion-reduce:!translate-x-0 motion-reduce:!opacity-100 motion-reduce:transition-none"
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
  date,
  service,
  serviceOptions,
  staffByTableId,
  statusByTableId,
  permessi,
}: {
  rooms: RoomWithTables[];
  date: string;
  service: string;
  serviceOptions: string[];
  staffByTableId: Record<string, TableStaffMap>;
  statusByTableId?: Record<string, TableOperationalStatus>;
  /** Chi guarda: decide cosa si può toccare dal profilo del tavolo. */
  permessi: PermessiTavolo;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();

  const salvaRef = useRef<(() => Promise<EsitoSalvataggio>) | null>(null);

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
    // Cambiare sala smonta l'editor, e con lui tutto quello che non è ancora
    // arrivato al server. Meglio una domanda in più che una piantina persa.
    if (dirty) {
      setPendingRoomId(nextRoomId);
      setUnsavedOpen(true);
      return;
    }
    applySwitch(nextRoomId);
  }

  async function handleSaveAndContinue() {
    // Il salvataggio vive nell'editor, insieme allo stato che deve salvare:
    // qui arriva solo il permesso di chiamarlo. Se fallisce si resta dove si
    // è — cambiare sala butterebbe via proprio quello che non è passato.
    const esito = await salvaRef.current?.();
    if (esito === "errore") return;
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
      setRenameError(await readApiError(res, "Impossibile rinominare la sala. Riprova."));
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
      setNewRoomError(await readApiError(res, "Impossibile creare la sala. Riprova."));
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

  const vociMenuSala = (
    <>
      <DropdownMenuSeparator />
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
    </>
  );

  return (
    /*
      `flex-1` e non `h-full`: la pagina vive dentro un `main` che ha una sua
      imbottitura, e un figlio alto il 100% della sua altezza sfora esattamente
      di quell'imbottitura — poco, ma abbastanza da tagliare il bordo basso
      della piantina e far comparire una barra di scorrimento su una schermata
      che non deve scorrere.
    */
    <div className="flex min-h-0 flex-1 flex-col animate-fade-in">
      <div className="min-h-0 flex-1">
        <RoomTransition roomKey={activeRoom.id}>
          <EditorSala
            key={activeRoom.id}
            sala={activeRoom}
            tavoli={activeRoom.tables}
            indiceSala={activeIndex}
            totaleSale={rooms.length}
            onCambiaSala={goTo}
            vociMenuSala={vociMenuSala}
            date={date}
            service={service}
            serviceOptions={serviceOptions}
            staffByTableId={staffByTableId}
            statusByTableId={statusByTableId}
            permessi={permessi}
            onSporcoChange={setDirty}
            salvaRef={salvaRef}
          />
        </RoomTransition>
      </div>

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
          <form onSubmit={handleRename} method="post" className="space-y-4">
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
          <form onSubmit={handleCreateRoom} method="post" className="space-y-4">
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
