"use client";

import { useState } from "react";
import { readApiError } from "@/lib/api-client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { DoorOpen, LayoutGrid, Pencil, Plus, Trash2, X, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  GruppoImpostazioni,
  RigaImpostazione,
  RigaLibera,
} from "@/components/settings/righe-impostazioni";

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
      setError(await readApiError(res, "Impossibile aggiornare l'organizzazione del servizio."));
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
      setError(await readApiError(res, "Impossibile aggiungere la sala."));
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
      setError(await readApiError(res, "Impossibile rinominare la sala."));
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
    <GruppoImpostazioni
      titolo="Organizzazione del servizio"
      descrizione="Come si divide il lavoro dello staff durante il servizio."
    >
      {/*
        Le due modalità erano due riquadri alti mezza schermata, uno accanto
        all'altro. Sono una scelta fra due, cioè la stessa cosa che altrove nel
        prodotto è un interruttore: qui restano due bottoni perché i nomi non
        si spiegano da soli, ma occupano la colonna di destra come qualunque
        altro controllo, e la differenza fra i due è scritta una volta a
        sinistra invece di due volte dentro di loro.
      */}
      <RigaImpostazione
        nome="Come si divide il lavoro"
        descrizione="Per sale, lo staff è assegnato ad ambienti come Sala principale, Dehor, Terrazza. Per tavoli, a uno o più tavoli precisi."
      >
        <div
          role="radiogroup"
          aria-label="Organizzazione del servizio"
          className="flex rounded-full border border-border p-1"
        >
          {([
            { valore: "ROOMS", nome: "Per sale", icona: DoorOpen },
            { valore: "TABLES", nome: "Per tavoli", icona: LayoutGrid },
          ] as const).map((scelta) => {
            const Icona = scelta.icona;
            const attiva = mode === scelta.valore;
            return (
              <button
                key={scelta.valore}
                type="button"
                role="radio"
                aria-checked={attiva}
                onClick={() => changeMode(scelta.valore)}
                disabled={switching}
                className={cn(
                  "flex min-h-[36px] items-center gap-2 rounded-full px-3 text-sm transition-colors disabled:opacity-60",
                  attiva
                    ? "bg-cream font-medium text-clay-ink"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Icona className="h-4 w-4 shrink-0" aria-hidden="true" />
                {scelta.nome}
              </button>
            );
          })}
        </div>
      </RigaImpostazione>

      {notice && (
        <RigaLibera>
          <p className="rounded-md border border-accent/30 bg-accent/10 p-3 text-sm text-card-foreground">
            {notice}
          </p>
        </RigaLibera>
      )}
      {error && (
        <RigaLibera>
          <p className="text-sm text-destructive-soft">{error}</p>
        </RigaLibera>
      )}

      {mode === "ROOMS" ? (
        <>
          {rooms.length === 0 && (
            <RigaImpostazione
              nome="Nessuna sala configurata"
              descrizione="Finché non ce n'è almeno una, lo staff non si può assegnare a niente."
            />
          )}

          {rooms.map((room) =>
            editingId === room.id ? (
              <RigaImpostazione
                key={room.id}
                nome="Nome della sala"
                htmlFor={`sala-${room.id}`}
              >
                <Input
                  id={`sala-${room.id}`}
                  autoFocus
                  value={editingName}
                  onChange={(e) => setEditingName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") saveRename(room.id);
                    if (e.key === "Escape") setEditingId(null);
                  }}
                  className="w-full sm:w-56"
                />
                <Button type="button" size="icon" variant="ghost" aria-label="Salva il nome" onClick={() => saveRename(room.id)}>
                  <Check className="h-4 w-4" />
                </Button>
                <Button type="button" size="icon" variant="ghost" aria-label="Annulla" onClick={() => setEditingId(null)}>
                  <X className="h-4 w-4" />
                </Button>
              </RigaImpostazione>
            ) : (
              <RigaImpostazione key={room.id} nome={room.name}>
                {confirmDeleteId === room.id ? (
                  <>
                    <span className="text-sm text-muted-foreground">Eliminare?</span>
                    <Button type="button" size="sm" variant="destructive" onClick={() => confirmDelete(room.id)}>
                      Elimina
                    </Button>
                    <Button type="button" size="sm" variant="outline" onClick={() => setConfirmDeleteId(null)}>
                      Annulla
                    </Button>
                  </>
                ) : (
                  <>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      aria-label={`Rinomina ${room.name}`}
                      onClick={() => {
                        setEditingId(room.id);
                        setEditingName(room.name);
                      }}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      aria-label={`Elimina ${room.name}`}
                      onClick={() => setConfirmDeleteId(room.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </>
                )}
              </RigaImpostazione>
            ),
          )}

          <RigaImpostazione nome="Aggiungi una sala" htmlFor="nuova-sala">
            <form onSubmit={addRoom} method="post" className="flex w-full items-center gap-2 md:w-auto">
              <Input
                id="nuova-sala"
                value={newRoomName}
                onChange={(e) => setNewRoomName(e.target.value)}
                placeholder="Es. Sala privata"
                className="w-full sm:w-56"
              />
              <Button type="submit" variant="outline" size="sm" disabled={adding || !newRoomName.trim()}>
                <Plus className="h-4 w-4" /> Aggiungi
              </Button>
            </form>
          </RigaImpostazione>
        </>
      ) : (
        <RigaImpostazione
          nome="Tavoli configurati"
          descrizione="I tavoli si disegnano nella mappa della sala, non qui: lì si vede dove stanno."
        >
          <span className="text-sm tabular-nums text-card-foreground/80">{tablesCount}</span>
          <Button asChild variant="outline" size="sm">
            <Link href="/floor">Apri la mappa sala</Link>
          </Button>
        </RigaImpostazione>
      )}
    </GruppoImpostazioni>
  );
}
