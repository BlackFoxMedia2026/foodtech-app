"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { DoorOpen, LayoutGrid, Pencil, Plus, Trash2, X, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type Mode = "ROOMS" | "TABLES";

type RoomRow = { id: string; name: string };

export function ServiceOrganizationSettings({
  initialMode,
  initialRooms,
  tablesCount,
}: {
  initialMode: Mode;
  initialRooms: RoomRow[];
  tablesCount: number;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>(initialMode);
  const [rooms, setRooms] = useState<RoomRow[]>(initialRooms);
  const [switching, setSwitching] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [newRoomName, setNewRoomName] = useState("");
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function changeMode(next: Mode) {
    if (next === mode) return;
    setSwitching(true);
    setError(null);
    const res = await fetch("/api/venue/service-mode", {
      method: "PATCH",
      body: JSON.stringify({ mode: next }),
      headers: { "content-type": "application/json" },
    });
    setSwitching(false);
    if (!res.ok) {
      setError("Impossibile aggiornare l'organizzazione del servizio.");
      return;
    }
    setMode(next);
    setNotice("La modifica verrà applicata alle nuove assegnazioni. Le assegnazioni precedenti resteranno invariate.");
    router.refresh();
    window.setTimeout(() => setNotice(null), 6000);
  }

  async function addRoom(e: React.FormEvent) {
    e.preventDefault();
    const name = newRoomName.trim();
    if (!name) return;
    setAdding(true);
    setError(null);
    const res = await fetch("/api/rooms", {
      method: "POST",
      body: JSON.stringify({ name }),
      headers: { "content-type": "application/json" },
    });
    setAdding(false);
    if (!res.ok) {
      setError("Impossibile aggiungere la sala.");
      return;
    }
    const created = await res.json();
    setRooms((prev) => [...prev, { id: created.id, name: created.name }]);
    setNewRoomName("");
    router.refresh();
  }

  async function saveRename(id: string) {
    const name = editingName.trim();
    if (!name) return;
    setError(null);
    const res = await fetch(`/api/rooms/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ name }),
      headers: { "content-type": "application/json" },
    });
    if (!res.ok) {
      setError("Impossibile rinominare la sala.");
      return;
    }
    setRooms((prev) => prev.map((r) => (r.id === id ? { ...r, name } : r)));
    setEditingId(null);
    router.refresh();
  }

  async function confirmDelete(id: string) {
    setError(null);
    const res = await fetch(`/api/rooms/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setError(body?.message ?? "Impossibile eliminare la sala.");
      setConfirmDeleteId(null);
      return;
    }
    setRooms((prev) => prev.filter((r) => r.id !== id));
    setConfirmDeleteId(null);
    router.refresh();
  }

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-display text-lg font-medium leading-tight">Organizzazione del servizio</h3>
        <p className="text-sm text-card-foreground/65">Scegli come suddividere il lavoro dello staff durante il servizio.</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => changeMode("ROOMS")}
          disabled={switching}
          className={cn(
            "flex items-start gap-3 rounded-lg border p-4 text-left transition-colors disabled:opacity-60",
            mode === "ROOMS" ? "border-accent-strong bg-accent-strong/10" : "border-border hover:bg-secondary",
          )}
        >
          <DoorOpen className={cn("mt-0.5 h-5 w-5 shrink-0", mode === "ROOMS" ? "text-accent-strong" : "text-muted-foreground")} />
          <div>
            <p className="text-sm font-medium">Per sale</p>
            <p className="text-xs text-muted-foreground">Assegna lo staff a sale come Sala principale, Dehor, Terrazza.</p>
          </div>
        </button>
        <button
          type="button"
          onClick={() => changeMode("TABLES")}
          disabled={switching}
          className={cn(
            "flex items-start gap-3 rounded-lg border p-4 text-left transition-colors disabled:opacity-60",
            mode === "TABLES" ? "border-accent-strong bg-accent-strong/10" : "border-border hover:bg-secondary",
          )}
        >
          <LayoutGrid className={cn("mt-0.5 h-5 w-5 shrink-0", mode === "TABLES" ? "text-accent-strong" : "text-muted-foreground")} />
          <div>
            <p className="text-sm font-medium">Per tavoli</p>
            <p className="text-xs text-muted-foreground">Assegna lo staff a uno o più tavoli specifici.</p>
          </div>
        </button>
      </div>

      {notice && (
        <p className="rounded-md border border-accent/30 bg-accent/10 p-3 text-xs text-card-foreground">{notice}</p>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}

      {mode === "ROOMS" ? (
        <div className="space-y-2 border-t border-border pt-4">
          {rooms.length === 0 && <p className="text-sm text-muted-foreground">Nessuna sala configurata ancora.</p>}
          {rooms.map((room) => (
            <div key={room.id} className="flex items-center justify-between gap-2 rounded-md border border-border p-3 text-sm">
              {editingId === room.id ? (
                <div className="flex flex-1 items-center gap-2">
                  <Input
                    autoFocus
                    value={editingName}
                    onChange={(e) => setEditingName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") saveRename(room.id);
                      if (e.key === "Escape") setEditingId(null);
                    }}
                  />
                  <Button type="button" size="icon" variant="ghost" onClick={() => saveRename(room.id)}>
                    <Check className="h-4 w-4" />
                  </Button>
                  <Button type="button" size="icon" variant="ghost" onClick={() => setEditingId(null)}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <>
                  <p className="font-medium">{room.name}</p>
                  {confirmDeleteId === room.id ? (
                    <div className="flex items-center gap-2 text-xs">
                      <span className="text-muted-foreground">Eliminare?</span>
                      <Button type="button" size="sm" variant="destructive" onClick={() => confirmDelete(room.id)}>
                        Elimina
                      </Button>
                      <Button type="button" size="sm" variant="outline" onClick={() => setConfirmDeleteId(null)}>
                        Annulla
                      </Button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1">
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        onClick={() => {
                          setEditingId(room.id);
                          setEditingName(room.name);
                        }}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button type="button" size="icon" variant="ghost" onClick={() => setConfirmDeleteId(room.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </>
              )}
            </div>
          ))}

          <form onSubmit={addRoom} className="flex items-center gap-2 pt-1">
            <Input
              value={newRoomName}
              onChange={(e) => setNewRoomName(e.target.value)}
              placeholder="Es. Sala privata"
            />
            <Button type="submit" variant="outline" disabled={adding || !newRoomName.trim()}>
              <Plus className="h-4 w-4" /> Aggiungi sala
            </Button>
          </form>
        </div>
      ) : (
        <div className="space-y-2 border-t border-border pt-4 text-sm">
          <p className="text-muted-foreground">
            {tablesCount > 0
              ? `${tablesCount} tavoli configurati in Sala.`
              : "Nessun tavolo configurato ancora."}
          </p>
          <Link href="/floor" className="text-accent-strong underline-offset-4 hover:underline">
            Gestisci i tavoli nella mappa sala →
          </Link>
        </div>
      )}
    </div>
  );
}
