"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeftRight,
  Ban,
  Check,
  CircleDot,
  Clock,
  Link2,
  Receipt,
  RefreshCw,
  Sparkles,
  Timer,
  UtensilsCrossed,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { readApiError } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { TABLE_LIVE_HINTS, TABLE_LIVE_LABELS, type TableLiveStatus } from "@/lib/table-status";
import { LIVE_STATUS_ORDER, type FloorLive, type TableLiveInfo } from "@/server/floor-live";
import { ServiceSwitch } from "@/components/service/service-switch";
import { TablePickerDialog } from "@/components/service/table-picker-dialog";

const REFRESH_MS = 30_000;

export type RoomTable = {
  id: string;
  label: string;
  seats: number;
  posX: number;
  posY: number;
  shape: string;
  roomId: string | null;
};

export type RoomOption = { id: string; name: string };

/**
 * Colore **e** icona per ogni stato.
 *
 * Il colore da solo non basta: circa un uomo su dodici ha una forma di
 * daltonismo, e una sala si guarda di sfuggita, di lato, con le luci basse.
 * L'icona rende lo stato leggibile anche quando il colore non arriva — ed è
 * anche il motivo per cui ogni tavolo ha un `title` e un'etichetta per lo
 * screen reader.
 */
const STILE: Record<TableLiveStatus, { icona: typeof CircleDot; classe: string; testo: string }> = {
  LIBERO: { icona: CircleDot, classe: "border-border bg-secondary/40 text-muted-foreground", testo: "text-muted-foreground" },
  PRENOTATO: { icona: Clock, classe: "border-border-strong bg-secondary text-foreground", testo: "text-foreground" },
  IN_ARRIVO: { icona: Sparkles, classe: "border-sage bg-sage/25 text-foreground", testo: "text-foreground" },
  OCCUPATO: { icona: UtensilsCrossed, classe: "border-surface-brown bg-surface-brown text-cream", testo: "text-cream" },
  CONTO: { icona: Receipt, classe: "border-accent bg-accent/80 text-cream", testo: "text-cream" },
  PULIZIA: { icona: Timer, classe: "border-dashed border-border-strong bg-secondary/60 text-muted-foreground", testo: "text-muted-foreground" },
  BLOCCATO: { icona: Ban, classe: "border-dashed border-border bg-muted/40 text-tertiary-foreground", testo: "text-tertiary-foreground" },
};

/**
 * La sala durante il servizio.
 *
 * Non è la pianta con cui si configura il locale — quella sta in Sala e serve
 * a disegnare, spostare, assegnare il personale. Questa serve a **guardare**:
 * chi c'è su ogni tavolo, da quando, quanto manca, e cosa fare adesso.
 *
 * Su telefono non c'è nessuna miniatura: la mappa rimpicciolita a 390 px non
 * si legge e non si tocca. Al suo posto c'è l'elenco dei tavoli raggruppati
 * per stato, che è la stessa informazione in una forma che ci sta.
 */
export function RoomLiveView({
  initial,
  tables,
  rooms,
  canManage,
}: {
  initial: FloorLive;
  tables: RoomTable[];
  rooms: RoomOption[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [live, setLive] = useState(initial);
  const [roomId, setRoomId] = useState<string | null>(rooms[0]?.id ?? null);
  const [aggiornando, setAggiornando] = useState(false);
  // Nullo fino al primo aggiornamento: vedi la nota in service-view.tsx.
  const [ultimo, setUltimo] = useState<Date | null>(null);
  const [selezionato, setSelezionato] = useState<string | null>(null);
  const inFlight = useRef(false);

  const aggiorna = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setAggiornando(true);
    try {
      const res = await fetch("/api/floor-live", { cache: "no-store" });
      if (res.ok) {
        setLive(await res.json());
        setUltimo(new Date());
      }
    } catch {
      // Resta l'ultima fotografia buona, con la sua ora.
    } finally {
      inFlight.current = false;
      setAggiornando(false);
    }
  }, []);

  useEffect(() => {
    const id = setInterval(aggiorna, REFRESH_MS);
    return () => clearInterval(id);
  }, [aggiorna]);

  useEffect(() => {
    function onVisible() {
      if (document.visibilityState === "visible") aggiorna();
    }
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [aggiorna]);

  const dopoAzione = useCallback(() => {
    setSelezionato(null);
    aggiorna();
    router.refresh();
  }, [aggiorna, router]);

  const tavoliSala = useMemo(
    () => (roomId ? tables.filter((t) => t.roomId === roomId) : tables),
    [tables, roomId],
  );

  /** La mappa si adatta al contenitore: le posizioni sono in pixel del
   * disegno originale, e vanno riportate nello spazio disponibile. */
  const bounds = useMemo(() => {
    if (tavoliSala.length === 0) return { w: 1000, h: 600 };
    const maxX = Math.max(...tavoliSala.map((t) => t.posX)) + 140;
    const maxY = Math.max(...tavoliSala.map((t) => t.posY)) + 140;
    return { w: Math.max(600, maxX), h: Math.max(400, maxY) };
  }, [tavoliSala]);

  const perStato = useMemo(() => {
    const gruppi = new Map<TableLiveStatus, RoomTable[]>();
    for (const t of tavoliSala) {
      const stato = live.byTableId[t.id]?.status ?? "LIBERO";
      const lista = gruppi.get(stato);
      if (lista) lista.push(t);
      else gruppi.set(stato, [t]);
    }
    return gruppi;
  }, [tavoliSala, live]);

  const tavoloSelezionato = tavoliSala.find((t) => t.id === selezionato) ?? null;

  return (
    <div className="space-y-4 animate-fade-in">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-widest text-muted-foreground">Servizio</p>
          <h1 className="text-display text-3xl">Sala</h1>
        </div>
        <div className="flex items-center gap-3">
          <ServiceSwitch />
          {ultimo && (
            <span className="hidden text-xs text-tertiary-foreground sm:inline">
              {ultimo.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
            </span>
          )}
          <button
            type="button"
            onClick={aggiorna}
            aria-label="Aggiorna adesso"
            className="flex h-11 w-11 items-center justify-center rounded-full border border-border text-muted-foreground hover:text-foreground"
          >
            <RefreshCw className={cn("h-4 w-4", aggiornando && "animate-spin")} aria-hidden="true" />
          </button>
        </div>
      </header>

      {rooms.length > 1 && (
        <div className="flex flex-wrap gap-1">
          {rooms.map((r) => (
            <button
              key={r.id}
              type="button"
              aria-pressed={roomId === r.id}
              onClick={() => setRoomId(r.id)}
              className={cn(
                "min-h-[40px] rounded-full px-3 text-sm transition-colors",
                roomId === r.id ? "bg-cream text-clay-ink" : "bg-current/10 text-muted-foreground",
              )}
            >
              {r.name}
            </button>
          ))}
        </div>
      )}

      {/* La legenda è anche il conteggio: due informazioni nello stesso posto. */}
      <div className="flex flex-wrap gap-2">
        {LIVE_STATUS_ORDER.filter((s) => (perStato.get(s)?.length ?? 0) > 0).map((stato) => {
          const stile = STILE[stato];
          const Icona = stile.icona;
          return (
            <span
              key={stato}
              title={TABLE_LIVE_HINTS[stato]}
              className={cn("flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs", stile.classe)}
            >
              <Icona className="h-3.5 w-3.5" aria-hidden="true" />
              {TABLE_LIVE_LABELS[stato]}
              <span className="font-semibold">{perStato.get(stato)?.length ?? 0}</span>
            </span>
          );
        })}
      </div>

      {tavoliSala.length === 0 ? (
        <EmptyState icon={UtensilsCrossed} title="Nessun tavolo in questa sala">
          Aggiungi i tavoli dalla sezione Sala: da lì disegni la pianta, qui la guardi mentre lavora.
        </EmptyState>
      ) : (
        <>
          {/* MAPPA — da tablet in su */}
          <div className="hidden lg:block">
            <div className="surface relative overflow-hidden rounded-md border border-border">
              <div
                className="relative mx-auto"
                style={{
                  width: "100%",
                  aspectRatio: `${bounds.w} / ${bounds.h}`,
                  maxHeight: "62vh",
                }}
              >
                <div
                  className="absolute inset-0"
                  style={{
                    // Le posizioni sono in pixel del disegno: si riportano
                    // in percentuale, così la mappa si adatta a qualunque
                    // schermo senza matematica sul ridimensionamento.
                    containerType: "size",
                  }}
                >
                  {tavoliSala.map((t) => {
                    const info = live.byTableId[t.id];
                    return (
                      <TavoloMappa
                        key={t.id}
                        table={t}
                        info={info}
                        bounds={bounds}
                        timezone={live.timezone}
                        selezionato={selezionato === t.id}
                        onSelect={() => setSelezionato(selezionato === t.id ? null : t.id)}
                      />
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* ELENCO — su telefono, e sotto la mappa come dettaglio */}
          <div className="space-y-4 lg:hidden">
            {LIVE_STATUS_ORDER.filter((s) => (perStato.get(s)?.length ?? 0) > 0).map((stato) => (
              <section key={stato} className="space-y-2">
                <h2 className="flex items-center gap-2 text-xs font-medium uppercase tracking-widest text-muted-foreground">
                  {TABLE_LIVE_LABELS[stato]}
                  <span className="rounded-full bg-current/10 px-2 py-0.5 text-[11px]">
                    {perStato.get(stato)?.length}
                  </span>
                </h2>
                {perStato.get(stato)!.map((t) => (
                  <TavoloRiga
                    key={t.id}
                    table={t}
                    info={live.byTableId[t.id]}
                    timezone={live.timezone}
                    canManage={canManage}
                    onChanged={dopoAzione}
                  />
                ))}
              </section>
            ))}
          </div>
        </>
      )}

      {/* Il dettaglio del tavolo scelto sulla mappa */}
      {tavoloSelezionato && (
        <div className="hidden lg:block">
          <TavoloRiga
            table={tavoloSelezionato}
            info={live.byTableId[tavoloSelezionato.id]}
            timezone={live.timezone}
            canManage={canManage}
            onChanged={dopoAzione}
            evidenziato
          />
        </div>
      )}
    </div>
  );
}

/** Un tavolo sulla mappa. */
function TavoloMappa({
  table,
  info,
  bounds,
  timezone,
  selezionato,
  onSelect,
}: {
  table: RoomTable;
  info: TableLiveInfo | undefined;
  bounds: { w: number; h: number };
  timezone: string;
  selezionato: boolean;
  onSelect: () => void;
}) {
  const stato = info?.status ?? "LIBERO";
  const stile = STILE[stato];
  const Icona = stile.icona;
  const corrente = info?.current;

  const ora = corrente
    ? new Intl.DateTimeFormat("it-IT", { timeZone: timezone, hour: "2-digit", minute: "2-digit" }).format(
        new Date(corrente.startsAt),
      )
    : null;

  const oltre = corrente?.minutesToFree != null && corrente.minutesToFree < 0;

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selezionato}
      title={`${table.label} · ${TABLE_LIVE_LABELS[stato]} — ${TABLE_LIVE_HINTS[stato]}`}
      aria-label={`Tavolo ${table.label}, ${table.seats} posti, ${TABLE_LIVE_LABELS[stato]}${
        corrente ? `, ${corrente.guestName}, ${corrente.partySize} persone` : ""
      }`}
      className={cn(
        // Le posizioni sono percentuali dei limiti del disegno: nessuna
        // sovrapposizione di etichette, perché il testo sta *dentro* il
        // riquadro e non in una pillola appesa sotto — era il difetto della
        // pianta precedente, dove le pillole dei tavoli vicini si
        // accavallavano.
        "absolute flex flex-col items-start justify-center overflow-hidden rounded-md border px-2 py-1.5 text-left transition-transform",
        stile.classe,
        selezionato && "ring-2 ring-cream",
      )}
      style={{
        left: `${(table.posX / bounds.w) * 100}%`,
        top: `${(table.posY / bounds.h) * 100}%`,
        width: `${(118 / bounds.w) * 100}%`,
        minHeight: `${(58 / bounds.h) * 100}%`,
      }}
    >
      <span className="flex w-full items-center gap-1">
        <Icona className="h-3 w-3 shrink-0" aria-hidden="true" />
        <span className="truncate text-xs font-semibold">{table.label}</span>
        <span className="ml-auto shrink-0 text-[10px] opacity-70">{table.seats}p</span>
      </span>

      {corrente ? (
        <>
          <span className="w-full truncate text-[11px] leading-tight">{corrente.guestName}</span>
          <span className="flex w-full items-center gap-1 text-[10px] leading-tight opacity-80">
            {ora} · {corrente.partySize}p
            {oltre && <span className="font-semibold">+{Math.abs(corrente.minutesToFree!)}′</span>}
            {corrente.combinedWith.length > 0 && <Link2 className="h-2.5 w-2.5" aria-hidden="true" />}
            {corrente.allergies && <AlertTriangle className="h-2.5 w-2.5" aria-hidden="true" />}
          </span>
        </>
      ) : (
        <span className="text-[10px] leading-tight opacity-70">{TABLE_LIVE_LABELS[stato]}</span>
      )}
    </button>
  );
}

/** Un tavolo in elenco, con le azioni. */
function TavoloRiga({
  table,
  info,
  timezone,
  canManage,
  onChanged,
  evidenziato = false,
}: {
  table: RoomTable;
  info: TableLiveInfo | undefined;
  timezone: string;
  canManage: boolean;
  onChanged: () => void;
  evidenziato?: boolean;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [moveOpen, setMoveOpen] = useState(false);

  const stato = info?.status ?? "LIBERO";
  const stile = STILE[stato];
  const Icona = stile.icona;
  const corrente = info?.current;

  const fmt = (iso: string) =>
    new Intl.DateTimeFormat("it-IT", { timeZone: timezone, hour: "2-digit", minute: "2-digit" }).format(
      new Date(iso),
    );

  async function cambiaStato(nome: string, status: string) {
    if (!corrente) return;
    setBusy(nome);
    setError(null);
    const res = await fetch(`/api/bookings/${corrente.bookingId}/status`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status }),
    });
    setBusy(null);
    if (!res.ok) {
      setError(await readApiError(res, "Non siamo riusciti ad aggiornare. Riprova."));
      return;
    }
    onChanged();
  }

  return (
    <article
      className={cn(
        "surface rounded-md border p-3",
        evidenziato ? "border-cream" : "border-border",
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={cn("flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs", stile.classe)}
            >
              <Icona className="h-3 w-3" aria-hidden="true" />
              {TABLE_LIVE_LABELS[stato]}
            </span>
            <span className="text-display text-lg">{table.label}</span>
            <span className="text-xs text-muted-foreground">{table.seats} posti</span>
          </div>

          {corrente ? (
            <p className="mt-1 text-sm text-muted-foreground">
              <span className="font-medium text-foreground">{corrente.guestName}</span>
              {corrente.isVip && (
                <span className="ml-1.5 rounded-full bg-accent/20 px-2 py-0.5 text-[11px]">VIP</span>
              )}
              {" · "}
              {fmt(corrente.startsAt)} · {corrente.partySize}{" "}
              {corrente.partySize === 1 ? "persona" : "persone"}
              {corrente.minutesToFree != null && (
                <>
                  {" · "}
                  <span className={cn(corrente.minutesToFree < 0 && "text-accent")}>
                    {corrente.minutesToFree >= 0
                      ? `libero fra ~${corrente.minutesToFree} min`
                      : `oltre di ${Math.abs(corrente.minutesToFree)} min`}
                  </span>
                </>
              )}
              {corrente.minutesToArrival != null && corrente.status !== "SEATED" && (
                <>
                  {" · "}
                  {corrente.minutesToArrival >= 0
                    ? `fra ${corrente.minutesToArrival} min`
                    : `in ritardo di ${Math.abs(corrente.minutesToArrival)} min`}
                </>
              )}
            </p>
          ) : (
            <p className="mt-1 text-sm text-muted-foreground">
              {info?.next
                ? `Prossimo: ${info.next.guestName} alle ${fmt(info.next.startsAt)} · ${info.next.partySize}p`
                : TABLE_LIVE_HINTS[stato]}
            </p>
          )}

          {corrente?.allergies && (
            <p className="mt-1 flex items-center gap-1 text-xs text-accent">
              <AlertTriangle className="h-3 w-3" aria-hidden="true" />
              {corrente.allergies}
            </p>
          )}
          {corrente && corrente.combinedWith.length > 0 && (
            <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
              <Link2 className="h-3 w-3" aria-hidden="true" />
              unito ad altri {corrente.combinedWith.length}{" "}
              {corrente.combinedWith.length === 1 ? "tavolo" : "tavoli"}
            </p>
          )}
        </div>

        {canManage && corrente && (
          <div className="flex flex-wrap items-center gap-1.5">
            {(corrente.status === "CONFIRMED" || corrente.status === "PENDING") && (
              <Button size="sm" variant="accent" disabled={busy !== null} onClick={() => cambiaStato("arr", "ARRIVED")}>
                <Check className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                {busy === "arr" ? "…" : "Arrivato"}
              </Button>
            )}
            {corrente.status === "ARRIVED" && (
              <Button size="sm" variant="accent" disabled={busy !== null} onClick={() => cambiaStato("sit", "SEATED")}>
                <UtensilsCrossed className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                {busy === "sit" ? "…" : "Accomoda"}
              </Button>
            )}
            {corrente.status === "SEATED" && (
              <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => cambiaStato("done", "COMPLETED")}>
                <Timer className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                {busy === "done" ? "…" : "Libera tavolo"}
              </Button>
            )}
            <button
              type="button"
              onClick={() => setMoveOpen(true)}
              aria-label={`Sposta la prenotazione del tavolo ${table.label}`}
              title="Sposta su un altro tavolo"
              className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground hover:bg-current/10"
            >
              <ArrowLeftRight className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>
        )}
      </div>

      {error && <p className="mt-2 text-sm text-destructive">{error}</p>}

      {moveOpen && corrente && (
        <TablePickerDialog
          open
          onOpenChange={setMoveOpen}
          bookingId={corrente.bookingId}
          partySize={corrente.partySize}
          startsAt={corrente.startsAt}
          titolo={`Sposta ${corrente.guestName}`}
          seatAfter={false}
          onDone={onChanged}
        />
      )}
    </article>
  );
}
