"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { DndContext, DragOverlay, PointerSensor, pointerWithin, useSensor, useSensors, type DragEndEvent, type DragStartEvent, type DropAnimationFunction, type Modifier } from "@dnd-kit/core";
import { getEventCoordinates } from "@dnd-kit/utilities";
import type { BookingStatus, RoomLayoutMode, Table } from "@prisma/client";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn, formatTime } from "@/lib/utils";
import { bookingsOverlap } from "@/lib/booking-time";
import { BookingsFloorCanvas } from "./bookings-floor-canvas";
import { UnassignedPanel } from "./unassigned-panel";
import { GrigliaTavoli } from "./griglia-tavoli";
import { AssignTableDialog } from "./assign-table-dialog";
import { AssignBookingDialog } from "./assign-booking-dialog";
import { BookingDetailDialog } from "./booking-detail-dialog";
import type { FloorBooking } from "./booking-table-node";
import type { Row } from "../bookings-page-client";

type RoomWithTables = {
  id: string;
  name: string;
  width: number;
  height: number;
  floorPlanUrl: string | null;
  activeLayoutMode: RoomLayoutMode | null;
  roomLayoutElements: unknown;
  tables: Table[];
  /** false: in Sala nessun tavolo è sulla piantina; `tables` sono tutti
   * quelli della sala e la Mappa li mostra in griglia. */
  suPiantina?: boolean;
};

/** Bookings in these statuses still need a seat; CANCELLED/NO_SHOW don't
 * occupy a table and don't need one assigned — mirrors the server's
 * ACTIVE_STATUSES in booking-floor.ts so a cancelled booking never shows a
 * table as falsely occupied. */
/** La copia trascinata col centro sotto il puntatore. Si afferra dalla
 * maniglia, che sta sul bordo destro della scheda: senza questo la copia
 * viaggiava tutta a sinistra del dito, e non si capiva su che tavolo cadeva.
 * È il `snapCenterToCursor` di @dnd-kit/modifiers, che qui non è installato. */
const centroSulPuntatore: Modifier = ({ activatorEvent, draggingNodeRect, transform }) => {
  if (!draggingNodeRect || !activatorEvent) return transform;
  const punto = getEventCoordinates(activatorEvent);
  if (!punto) return transform;
  return {
    ...transform,
    x: transform.x + punto.x - draggingNodeRect.left - draggingNodeRect.width / 2,
    y: transform.y + punto.y - draggingNodeRect.top - draggingNodeRect.height / 2,
  };
};

const NEEDS_TABLE_STATUSES = new Set<BookingStatus>(["CONFIRMED", "PENDING", "ARRIVED", "SEATED", "COMPLETED"]);

export function BookingsFloorView({
  rooms,
  rows,
  shiftWindow,
  canManage,
  onBookingUpdated,
  incorporata = false,
}: {
  rooms: RoomWithTables[];
  rows: Row[];
  shiftWindow: { start: Date; end: Date } | null;
  canManage: boolean;
  onBookingUpdated: (updated: Row) => void;
  /** Dentro la pagina Sala: la sala la sceglie già la testata di quella
   * pagina, quindi qui niente selettore, e la mappa riempie lo spazio che le
   * lasciano invece di calcolarsi un'altezza sua. */
  incorporata?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();

  const [activeRoomId, setActiveRoomId] = useState(() => {
    const fromUrl = search.get("room");
    return rooms.find((r) => r.id === fromUrl)?.id ?? rooms[0]?.id ?? "";
  });
  // Collapsed by default on phones only (brief section 40: never show a
  // microscopic floor plan squeezed next to a full-size panel) — collapsing
  // the panel gives the canvas the full stack height on first paint; a tap
  // still expands it. Desktop/tablet keep the previous always-expanded default.
  const [panelCollapsed, setPanelCollapsed] = useState(() => typeof window !== "undefined" && window.innerWidth < 640);
  const [selectedTableId, setSelectedTableId] = useState<string | null>(null);
  const [assignPickerBookingId, setAssignPickerBookingId] = useState<string | null>(null);
  const [assignBookingForTableId, setAssignBookingForTableId] = useState<string | null>(null);
  const [draggingBooking, setDraggingBooking] = useState<{ id: string; partySize: number; startsAt: Date; durationMin: number } | null>(null);
  const [dropConfirm, setDropConfirm] = useState<{ bookingId: string; tableId: string; tableLabel: string; tableSeats: number } | null>(null);
  const [motivoDrop, setMotivoDrop] = useState("");
  const [banner, setBanner] = useState<string | null>(null);

  /** Il tavolo su cui è appena caduta una prenotazione: l'animazione di
   * rilascio lo legge per posare lì la copia, invece di riportarla al
   * pannello come fa dnd-kit da solo. */
  const dovePosare = useRef<{
    rect: { left: number; top: number; width: number; height: number };
    /** Mette la prenotazione sul tavolo nello stato della pagina. Si chiama
     * a copia posata, non prima: dnd-kit anima il rilascio solo finché la
     * scheda d'origine esiste, e toglierla subito dal pannello faceva
     * sparire la copia di colpo. */
    posa: () => void;
  } | null>(null);
  /** La prenotazione disegnata nella copia: resta finché la copia non ha
   * finito di posarsi, anche se il trascinamento è già chiuso. */
  const [inVolo, setInVolo] = useState<Row | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const activeIndex = Math.max(0, rooms.findIndex((r) => r.id === activeRoomId));
  const activeRoom = rooms[activeIndex] ?? rooms[0];

  function goToRoom(delta: number) {
    if (rooms.length <= 1) return;
    const nextIndex = ((activeIndex + delta) % rooms.length + rooms.length) % rooms.length;
    const nextId = rooms[nextIndex].id;
    setActiveRoomId(nextId);
    const sp = new URLSearchParams(search);
    sp.set("room", nextId);
    router.replace(`${pathname}?${sp.toString()}`, { scroll: false });
  }

  // The ONE derivation point from the shared `rows` (brief sections 23/24) —
  // no separate fetch, no separate state; Elenco renders `rows` directly,
  // this is just a different filter/shape over the identical array.
  const inWindow = useMemo(() => {
    const needsTable = rows.filter((r) => NEEDS_TABLE_STATUSES.has(r.status));
    if (!shiftWindow) return needsTable;
    return needsTable.filter((r) => r.startsAt >= shiftWindow.start && r.startsAt <= shiftWindow.end);
  }, [rows, shiftWindow]);

  /* I tavoli che la Mappa mostra, in tutte le sale: quelli disegnati in Sala,
     o tutti quelli della sala quando la sala va in griglia (vedi
     bookings/page.tsx). */
  const sullaPiantina = useMemo(() => new Set(rooms.flatMap((r) => r.tables.map((t) => t.id))), [rooms]);
  /** Ha bisogno di un tavolo che si veda: senza tavolo, o su un tavolo che in
   * Sala è fuori piantina — su questa mappa non comparirebbe da nessuna parte. */
  const senzaPosto = useCallback(
    (r: Row) => !r.tableId || !sullaPiantina.has(r.tableId),
    [sullaPiantina],
  );

  const unassigned = useMemo(
    () => inWindow.filter(senzaPosto).sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime()),
    [inWindow, senzaPosto],
  );
  const assigned = useMemo(() => inWindow.filter((r) => !senzaPosto(r)), [inWindow, senzaPosto]);
  /** Per le prenotazioni che un tavolo ce l'hanno, ma fuori piantina: il nome
   * di quel tavolo, così la scheda dice perché è finita qui. */
  const tavoloFuoriPiantina = useMemo(() => {
    const m: Record<string, string> = {};
    for (const r of unassigned) if (r.tableId && r.table) m[r.id] = r.table.label;
    return m;
  }, [unassigned]);

  // Distinguishes "genuinely nothing to assign" from "the service filter is
  // hiding real unassigned bookings" — without this the empty state claimed
  // "tutte le prenotazioni hanno un tavolo" even when the real cause was
  // simply that the selected service didn't match those bookings' time.
  const unassignedOutsideWindowCount = useMemo(() => {
    if (!shiftWindow || unassigned.length > 0) return 0;
    return rows.filter((r) => NEEDS_TABLE_STATUSES.has(r.status) && senzaPosto(r)).length;
  }, [rows, shiftWindow, unassigned.length, senzaPosto]);

  const bookingsByTableId = useMemo(() => {
    const map: Record<string, FloorBooking[]> = {};
    for (const b of assigned) {
      if (!b.tableId) continue;
      (map[b.tableId] ??= []).push(b);
    }
    for (const list of Object.values(map)) list.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
    return map;
  }, [assigned]);

  const allTablesByRoom = useMemo(
    () => rooms.map((r) => ({ roomId: r.id, roomName: r.name, tables: r.tables })),
    [rooms],
  );

  // Tables already booked for the exact slot of the reservation being
  // dragged — excluded from the "compatible" highlight even if big enough
  // (brief sections 16/17: don't invite a drop that's doomed to conflict).
  const occupiedTableIdsForDrag = useMemo(() => {
    if (!draggingBooking) return new Set<string>();
    const ids = new Set<string>();
    for (const b of assigned) {
      if (!b.tableId) continue;
      if (bookingsOverlap(draggingBooking.startsAt, draggingBooking.durationMin, b.startsAt, b.durationMin)) ids.add(b.tableId);
    }
    return ids;
  }, [draggingBooking, assigned]);

  const selectedTable = activeRoom?.tables.find((t) => t.id === selectedTableId) ?? null;
  const selectedBooking = selectedTable ? bookingsByTableId[selectedTable.id]?.[0] ?? null : null;
  const assignPickerBooking = unassigned.find((b) => b.id === assignPickerBookingId) ?? assigned.find((b) => b.id === assignPickerBookingId) ?? null;
  const assignBookingForTable = activeRoom?.tables.find((t) => t.id === assignBookingForTableId) ?? null;

  function selezionaTavolo(tableId: string) {
    if (!tableId) {
      setSelectedTableId(null);
      return;
    }
    if (bookingsByTableId[tableId]?.length) {
      setSelectedTableId(tableId);
      return;
    }
    // Flusso inverso TAVOLO -> PRENOTAZIONE (brief section 26) —
    // read-only viewers can still see the table, just can't act.
    if (canManage) setAssignBookingForTableId(tableId);
  }

  function showBanner(message: string) {
    setBanner(message);
    setTimeout(() => setBanner((cur) => (cur === message ? null : cur)), 4000);
  }

  async function callAssign(
    bookingId: string,
    tableId: string,
    force: boolean,
    forceReason?: string,
  ): Promise<{ ok: boolean; message?: string }> {
    const res = await fetch(`/api/bookings/${bookingId}/assign-table`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tableId, force, ...(forceReason ? { forceReason } : {}) }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      if (body?.error === "capacity_mismatch" && !force) {
        return { ok: false, message: "capacity_mismatch" };
      }
      return { ok: false, message: body?.message ?? "Impossibile assegnare il tavolo." };
    }
    const raw = await res.json();
    // JSON has no Date type — startsAt comes back as a string, which would
    // silently break formatTime()/overlap checks on every subsequent render
    // once this booking sits back in the shared `rows` state.
    const updated: Row = { ...raw, startsAt: new Date(raw.startsAt) };
    onBookingUpdated(updated);
    return { ok: true };
  }

  async function handleAssignFromDialog(tableId: string, opts: { force?: boolean; forceReason?: string }) {
    if (!assignPickerBooking) return { ok: false };
    return callAssign(assignPickerBooking.id, tableId, !!opts.force, opts.forceReason);
  }

  async function handleAssignBookingFromDialog(
    bookingId: string,
    opts: { force?: boolean; forceReason?: string },
  ) {
    if (!assignBookingForTable) return { ok: false };
    return callAssign(bookingId, assignBookingForTable.id, !!opts.force, opts.forceReason);
  }

  async function handleRemoveTable() {
    if (!selectedBooking) return { ok: false };
    const res = await fetch(`/api/bookings/${selectedBooking.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tableId: null }),
    });
    if (!res.ok) return { ok: false, message: "Impossibile rimuovere il tavolo. Riprova." };
    onBookingUpdated({ ...selectedBooking, tableId: null, table: null });
    setSelectedTableId(null);
    return { ok: true };
  }

  function onDragStart(event: DragStartEvent) {
    const data = event.active.data.current as { type: string; bookingId: string; partySize: number } | undefined;
    if (data?.type !== "booking") return;
    const booking = unassigned.find((b) => b.id === data.bookingId);
    if (!booking) return;
    setDraggingBooking({ id: booking.id, partySize: booking.partySize, startsAt: booking.startsAt, durationMin: booking.durationMin });
    setInVolo(booking);
  }

  async function onDragEnd(event: DragEndEvent) {
    const dragged = draggingBooking;
    setDraggingBooking(null);
    dovePosare.current = null;
    if (!dragged || !event.over) return;
    const tableData = event.over.data.current as { type: string; tableId: string; seats: number } | undefined;
    if (tableData?.type !== "table") return;

    if (tableData.seats < dragged.partySize) {
      const table = activeRoom?.tables.find((t) => t.id === tableData.tableId);
      setDropConfirm({ bookingId: dragged.id, tableId: tableData.tableId, tableLabel: table?.label ?? "", tableSeats: tableData.seats });
      return;
    }

    /* La copia scende sul tavolo e, posata, il tavolo mostra la prenotazione
       senza aspettare il server. Se il server dice di no, la prenotazione
       torna nel pannello e un avviso spiega perché. */
    const prima = unassigned.find((b) => b.id === dragged.id);
    const tavolo = rooms.flatMap((r) => r.tables).find((t) => t.id === tableData.tableId) ?? null;
    let posata = false;
    const posa = () => {
      if (posata) return;
      posata = true;
      if (prima) onBookingUpdated({ ...prima, tableId: tableData.tableId, table: tavolo });
    };
    dovePosare.current = { rect: event.over.rect, posa };
    // Riserva: se l'animazione non parte (scheda già smontata, scheda
    // nascosta) la prenotazione arriva comunque sul tavolo.
    setTimeout(posa, 450);
    const result = await callAssign(dragged.id, tableData.tableId, false);
    if (!result.ok) {
      posata = true;
      if (prima) onBookingUpdated(prima);
      showBanner(result.message ?? "Impossibile assegnare il tavolo.");
    }
  }

  /** Il rilascio: sul tavolo la copia ci scende sopra e si posa; altrove
   * (fuori da un tavolo, o su uno troppo piccolo che chiede conferma) torna
   * alla sua scheda nel pannello. */
  const posaSulTavolo: DropAnimationFunction = ({ dragOverlay, transform }) => {
    const posa = dovePosare.current;
    dovePosare.current = null;
    const meta = posa?.rect;
    const el = dragOverlay.node;
    const da = `translate3d(${transform.x}px, ${transform.y}px, 0)`;
    if (!meta) {
      return el
        .animate([{ transform: da }, { transform: "translate3d(0, 0, 0)" }], { duration: 240, easing: "cubic-bezier(0.2, 0.9, 0.25, 1)", fill: "forwards" })
        .finished.then(() => undefined);
    }
    const ora = el.getBoundingClientRect();
    const dx = meta.left + meta.width / 2 - (ora.left + ora.width / 2);
    const dy = meta.top + meta.height / 2 - (ora.top + ora.height / 2);
    const a = `translate3d(${transform.x + dx}px, ${transform.y + dy}px, 0)`;
    return el
      .animate(
        [
          { transform: `${da} scale(1)`, opacity: 1 },
          { transform: `${a} scale(0.92)`, opacity: 1, offset: 0.7 },
          { transform: `${a} scale(0.82)`, opacity: 0 },
        ],
        { duration: 320, easing: "cubic-bezier(0.2, 0.9, 0.25, 1)", fill: "forwards" },
      )
      .finished.then(() => posa?.posa());
  };

  if (!activeRoom) {
    return <div className="rounded-md border border-dashed p-12 text-center text-sm text-muted-foreground">Nessuna sala configurata.</div>;
  }

  const draggingBookingObj = inVolo;
  /* Quanti tavoli di questa sala accoglierebbero la prenotazione trascinata:
     se nessuno, la copia lo dice subito, invece di lasciare una griglia tutta
     spenta senza spiegazione. */
  const compatibiliPerDrag = draggingBooking
    ? activeRoom.tables.filter((t) => t.active && t.seats >= draggingBooking.partySize && !occupiedTableIdsForDrag.has(t.id)).length
    : 0;

  return (
    <DndContext
      sensors={sensors}
      // The draggable card is much bigger than a table's drop zone, so the
      // default rectIntersection (whole-card-rect vs. table-rect) often
      // finds zero overlap even when the cursor is squarely over the table.
      // pointerWithin checks the cursor position instead, matching what a
      // user actually expects "dropping onto a table" to mean.
      collisionDetection={pointerWithin}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragCancel={() => setDraggingBooking(null)}
    >
      <div className={incorporata ? "flex h-full min-h-[480px] flex-col gap-2" : "fill flex min-h-[420px] flex-col gap-2 md:h-[calc(100vh-260px)] md:min-h-[480px] md:flex-none"}>
        {banner && <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">{banner}</p>}

        {/* Su telefono le frecce della sala sono bersagli da 44 (`icon` è 40). */}
        <div className={incorporata ? "hidden" : "flex items-center gap-1 max-md:[&_button]:h-11 max-md:[&_button]:w-11"}>
          <Button type="button" size="icon" variant="ghost" onClick={() => goToRoom(-1)} disabled={rooms.length <= 1} aria-label="Sala precedente">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <p className="text-sm font-medium text-card-foreground">{activeRoom.name}</p>
          <Button type="button" size="icon" variant="ghost" onClick={() => goToRoom(1)} disabled={rooms.length <= 1} aria-label="Sala successiva">
            <ChevronRight className="h-4 w-4" />
          </Button>
          {rooms.length > 1 && (
            <span className="text-xs text-muted-foreground">
              {activeIndex + 1} / {rooms.length}
            </span>
          )}
        </div>

        {/* La mappa prende tutto lo spazio, il pannello ha una larghezza sua:
            a percentuale, su uno schermo da portatile restava una colonna da
            180px dove ogni scheda andava a capo parola per parola. */}
        <div className="flex min-h-0 flex-1 flex-col gap-3 sm:flex-row">
          <div className="surface min-h-[320px] min-w-0 flex-1 overflow-hidden rounded-xl sm:min-h-0">
            {activeRoom.suPiantina === false ? (
              <GrigliaTavoli
                key={activeRoom.id}
                tables={activeRoom.tables}
                bookingsByTableId={bookingsByTableId}
                roomId={activeRoom.id}
                selectedTableId={selectedTableId}
                onSelectTable={selezionaTavolo}
                draggingPartySize={draggingBooking?.partySize ?? null}
                occupiedTableIds={occupiedTableIdsForDrag}
              />
            ) : (
            <BookingsFloorCanvas
              key={activeRoom.id}
              tables={activeRoom.tables}
              bookingsByTableId={bookingsByTableId}
              floorPlanUrl={activeRoom.floorPlanUrl}
              activeLayoutMode={activeRoom.activeLayoutMode}
              roomLayoutElements={activeRoom.roomLayoutElements}
              width={activeRoom.width}
              height={activeRoom.height}
              roomId={activeRoom.id}
              selectedTableId={selectedTableId}
              onSelectTable={selezionaTavolo}
              draggingPartySize={draggingBooking?.partySize ?? null}
              occupiedTableIds={occupiedTableIdsForDrag}
            />
            )}
          </div>
          {/* Chiuso, sul telefono il pannello è alto quanto la sua testata: col
              28% fisso restava un blocco verde vuoto sotto la mappa. */}
          <div
            className={cn(
              "min-h-0 basis-[28%] overflow-hidden rounded-[22px] sm:w-[300px] sm:flex-none sm:basis-auto lg:w-[320px]",
              panelCollapsed && "max-sm:basis-auto",
            )}
          >
            <UnassignedPanel
              bookings={unassigned}
              collapsed={panelCollapsed}
              onToggleCollapsed={() => setPanelCollapsed((v) => !v)}
              onAssignClick={setAssignPickerBookingId}
              draggingBookingId={draggingBooking?.id ?? null}
              canManage={canManage}
              hiddenByServiceCount={unassignedOutsideWindowCount}
              tavoloFuoriPiantina={tavoloFuoriPiantina}
            />
          </div>
        </div>
      </div>

      {/* In un portale su <body>: il guscio in vetro ha `backdrop-filter`, che
          fa da riferimento per `position: fixed`, e la copia trascinata finiva
          spostata di quanto il guscio è distante dall'angolo della pagina. */}
      {typeof document !== "undefined" &&
        createPortal(
          <DragOverlay
            modifiers={[centroSulPuntatore]}
            dropAnimation={posaSulTavolo}
            zIndex={80}
          >
            {draggingBookingObj && (
              <div className="w-64 -rotate-2 cursor-grabbing rounded-2xl border border-white/70 bg-card p-3 shadow-[0_24px_48px_-16px_rgba(16,32,26,0.55)]">
                <div className="flex items-center gap-2">
                  <span className="shrink-0 rounded-full bg-accent/15 px-2 py-0.5 text-xs font-semibold tabular-nums text-accent-strong">
                    {formatTime(draggingBookingObj.startsAt)}
                  </span>
                  <p className="min-w-0 flex-1 truncate text-sm font-semibold text-card-foreground">
                    {draggingBookingObj.guest
                      ? `${draggingBookingObj.guest.firstName} ${draggingBookingObj.guest.lastName ?? ""}`.trim()
                      : "Walk-in"}
                  </p>
                </div>
                <p className="mt-1.5 text-xs text-muted-foreground">
                  {draggingBookingObj.partySize} {draggingBookingObj.partySize === 1 ? "persona" : "persone"}
                  {/* Durante l'atterraggio il trascinamento è già chiuso: il conto dei tavoli
                      adatti non avrebbe più senso, resta solo il numero di persone. */}
                  {draggingBooking &&
                    (compatibiliPerDrag === 0 ? " · nessun tavolo libero abbastanza grande" : compatibiliPerDrag === 1 ? " · 1 tavolo adatto" : ` · ${compatibiliPerDrag} tavoli adatti`)}
                </p>
              </div>
            )}
          </DragOverlay>,
          document.body,
        )}

      <AssignTableDialog
        open={!!assignPickerBooking}
        onOpenChange={(next) => !next && setAssignPickerBookingId(null)}
        booking={assignPickerBooking}
        tablesByRoom={allTablesByRoom}
        assignedBookings={assigned}
        onAssign={handleAssignFromDialog}
      />

      <AssignBookingDialog
        open={!!assignBookingForTable}
        onOpenChange={(next) => !next && setAssignBookingForTableId(null)}
        table={assignBookingForTable}
        unassignedBookings={unassigned}
        onAssign={handleAssignBookingFromDialog}
      />

      <BookingDetailDialog
        open={!!selectedBooking}
        onOpenChange={(next) => !next && setSelectedTableId(null)}
        booking={selectedBooking}
        tableLabel={selectedTable?.label ?? ""}
        canManage={canManage}
        onChangeTable={() => {
          if (selectedBooking) setAssignPickerBookingId(selectedBooking.id);
          setSelectedTableId(null);
        }}
        onRemoveTable={handleRemoveTable}
      />

      <Dialog open={!!dropConfirm} onOpenChange={(next) => !next && setDropConfirm(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Pochi posti disponibili</DialogTitle>
          </DialogHeader>
          {dropConfirm && (
            <>
              <p className="text-sm text-card-foreground">
                Il tavolo {dropConfirm.tableLabel} ha {dropConfirm.tableSeats} posti, ma la prenotazione è per{" "}
                {unassigned.find((b) => b.id === dropConfirm.bookingId)?.partySize} persone.
              </p>
              {/* Il motivo resta nel registro con nome e ora: forzare senza
                  spiegazione era l'unica scorciatoia rimasta senza attrito. */}
              <div className="space-y-1.5">
                <Label htmlFor="drop-motivo">Perché lo assegni comunque</Label>
                <Input
                  id="drop-motivo"
                  value={motivoDrop}
                  onChange={(e) => setMotivoDrop(e.target.value)}
                  placeholder="Es. aggiungiamo una sedia"
                  autoFocus
                />
              </div>
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setDropConfirm(null);
                    setMotivoDrop("");
                  }}
                >
                  Annulla
                </Button>
                <Button
                  type="button"
                  variant="accent"
                  size="sm"
                  disabled={!motivoDrop.trim()}
                  onClick={async () => {
                    const result = await callAssign(
                      dropConfirm.bookingId,
                      dropConfirm.tableId,
                      true,
                      motivoDrop.trim(),
                    );
                    if (!result.ok) showBanner(result.message ?? "Impossibile assegnare il tavolo.");
                    setDropConfirm(null);
                    setMotivoDrop("");
                  }}
                >
                  Assegna comunque
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </DndContext>
  );
}
