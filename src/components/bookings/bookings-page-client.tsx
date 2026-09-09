"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { Booking, Guest, RoomLayoutMode, Table } from "@prisma/client";
import { CalendarRange, List, Map as MapIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DayPicker } from "@/components/bookings/day-picker";
import { NewBookingButton } from "@/components/bookings/new-booking-button";
import { BookingsTable } from "@/components/bookings/bookings-table";
import { BookingServiceSelect } from "@/components/bookings/floor/booking-service-select";
import { BookingsFloorView } from "@/components/bookings/floor/bookings-floor-view";
import { WeekBoard } from "@/components/bookings/week-board";
import type { Settimana } from "@/server/booking-week";
import { cn } from "@/lib/utils";

/*
  `Omit<Guest, "totalSpend">`: la spesa dell'ospite è un `Decimal` di Prisma, e
  un `Decimal` non attraversa il confine fra server e componente client — Next
  lo segnalava a ogni caricamento dell'elenco prenotazioni («Only plain objects
  can be passed to Client Components»). Nessuna riga di questa tabella la
  legge: l'unico posto dove la spesa si mostra è il CRM, e là si conta dai
  conti chiusi (`server/spesa-ospiti.ts`).
*/
export type Row = Booking & { guest: Omit<Guest, "totalSpend"> | null; table: Table | null };
type StatusFilter = "all" | "pending" | "confirmed";
type RoomWithTables = {
  id: string;
  name: string;
  width: number;
  height: number;
  floorPlanUrl: string | null;
  activeLayoutMode: RoomLayoutMode | null;
  roomLayoutElements: unknown;
  tables: Table[];
};

const VIEW_STORAGE_KEY = "tavolo.bookings.view";

export function BookingsPageClient({
  dayString,
  statusFilter,
  filteredRows,
  totalCovers,
  pendingCount,
  totaleDelGiorno,
  tables,
  service,
  serviceOptions,
  rooms,
  shiftWindow,
  canManageBookings,
  settimana,
}: {
  dayString: string;
  statusFilter: StatusFilter;
  filteredRows: Row[];
  totalCovers: number;
  pendingCount: number;
  /** Quante prenotazioni ha la giornata, **prima** del filtro. */
  totaleDelGiorno: number;
  tables: { id: string; label: string; seats: number }[];
  service: string;
  serviceOptions: string[];
  rooms: RoomWithTables[];
  shiftWindow: { start: Date; end: Date } | null;
  canManageBookings: boolean;
  settimana: Settimana;
}) {
  // Default stays "Elenco" (brief section 3 — backward compatible); only
  // remembered for the session, no new DB preference (brief section 36).
  const [view, setView] = useState<"elenco" | "mappa" | "settimana">("elenco");

  // The ONE shared dataset both views render from (brief sections 23/24) —
  // Elenco renders it directly, Mappa derives its unassigned/assigned split
  // from it. Resynced from the server prop below whenever a real navigation
  // (date/service/status) or a plain status change made in Elenco produces
  // fresh data — a mutation made from Mappa instead patches this state
  // directly (optimistic) via handleBookingUpdated, no round trip needed to
  // see it reflected back in Elenco.
  const [rows, setRows] = useState(filteredRows);
  useEffect(() => setRows(filteredRows), [filteredRows]);

  function handleBookingUpdated(updated: Row) {
    setRows((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
  }

  // A plain function can't cross the server->client boundary as a prop —
  // this is trivial URL-building, so it's just redefined here instead of
  // passed down from page.tsx.
  function getStatusFilterUrl(status: StatusFilter) {
    const params = new URLSearchParams();
    params.set("day", dayString);
    if (status !== "all") params.set("status", status);
    return `?${params.toString()}`;
  }

  useEffect(() => {
    const stored = sessionStorage.getItem(VIEW_STORAGE_KEY);
    if (stored === "mappa" || stored === "elenco" || stored === "settimana") setView(stored);
  }, []);

  function changeView(next: "elenco" | "mappa" | "settimana") {
    setView(next);
    sessionStorage.setItem(VIEW_STORAGE_KEY, next);
  }

  return (
    // Niente scroll di pagina: testata, giorno e filtri restano fissi, e la
    // vista scelta — elenco, mappa o settimana — prende l'altezza che avanza.
    // Qui si lavora, quindi l'intestazione è compatta (direzione C).
    <div className="schermo animate-fade-in gap-3">
      <header className="fissa flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-baseline gap-2">
            <h1 className="text-lg font-semibold leading-none">Prenotazioni</h1>
            <p className="t-etichetta">Sala</p>
          </div>
          <p className="text-sm text-muted-foreground">
            {/*
              Il conteggio dice **su cosa** è: con un filtro acceso «0
              prenotazioni · 0 coperti» era vero del filtro e falso della
              giornata, che ne aveva tredici. Un numero senza la sua base è la
              cosa che questo prodotto non fa da nessuna parte.
            */}
            {statusFilter === "all"
              ? `${filteredRows.length} prenotazioni`
              : `${filteredRows.length} ${statusFilter === "pending" ? "in sospeso" : "confermate"} su ${totaleDelGiorno}`}{" "}
            · {totalCovers} coperti
            {/*
              Un colore della tavolozza **che si legge**: misurato sulla
              scheda, l'oro del tema fa 5,11 : 1 e l'accento 3,32 : 1 — sotto
              la soglia per un testo piccolo, e perfino sotto il grigio delle
              note (4,45). Il giallo di prima (`amber-600`, fuori tavolozza)
              faceva 3,83.
            */}
            {pendingCount > 0 && (
              <span className="ml-2 font-semibold text-gilt">({pendingCount} da approvare)</span>
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <DayPicker value={dayString} />
          {/* Always visible regardless of view (brief section 3) — it stayed
              conditional on the Mappa view before, which made the header
              visibly shift when switching views. */}
          <BookingServiceSelect service={service} serviceOptions={serviceOptions} />
          <NewBookingButton tables={tables} />
        </div>
      </header>

      <div className="fissa flex flex-wrap items-center justify-between gap-3">
        {/*
          Un solo modo di dire «questa è scelta».

          Su questa schermata ce n'erano tre: crema per «Tutte» e
          «Confermate», arancione (`bg-amber-600`) per «In sospeso», e un
          quarto colore per la vista scelta qui a destra. Tre modi di dire la
          stessa cosa nello stesso posto si leggono come tre cose diverse — e
          l'arancione su un filtro sembrava un allarme, non una selezione.

          Il numero delle sospese resta in evidenza: è un'informazione, e
          l'informazione non è la selezione.
        */}
        <div className="flex gap-2">
          <Button variant={statusFilter === "all" ? "default" : "outline"} asChild>
            <Link href={getStatusFilterUrl("all")}>Tutte</Link>
          </Button>
          <Button variant={statusFilter === "confirmed" ? "default" : "outline"} asChild>
            <Link href={getStatusFilterUrl("confirmed")}>Confermate</Link>
          </Button>
          <Button variant={statusFilter === "pending" ? "default" : "outline"} asChild>
            <Link href={getStatusFilterUrl("pending")}>
              In sospeso
              {pendingCount > 0 && (
                <span
                  className={cn(
                    "ml-2 rounded-full px-1.5 text-xs font-semibold tabular-nums",
                    // Sulla tinta dell'accento il testo accento non si legge
                    // (2,85 : 1): sopra una tinta va il crema, che fa 8,52.
                    statusFilter === "pending" ? "bg-forest/15 text-clay-ink" : "bg-accent/20 text-foreground",
                  )}
                >
                  {pendingCount}
                </span>
              )}
            </Link>
          </Button>
        </div>

        <div className="flex items-center gap-1 riquadro bg-card p-1">
          <button
            type="button"
            onClick={() => changeView("elenco")}
            className={cn(
              "tocco-comodo flex items-center gap-1.5 rounded px-2.5 py-1.5 text-sm font-medium transition-colors",
              view === "elenco" ? "bg-cream text-clay-ink" : "text-muted-foreground hover:bg-secondary",
            )}
          >
            <List className="h-4 w-4" /> Elenco
          </button>
          <button
            type="button"
            onClick={() => changeView("mappa")}
            className={cn(
              "tocco-comodo flex items-center gap-1.5 rounded px-2.5 py-1.5 text-sm font-medium transition-colors",
              view === "mappa" ? "bg-cream text-clay-ink" : "text-muted-foreground hover:bg-secondary",
            )}
          >
            <MapIcon className="h-4 w-4" /> Mappa
          </button>
          <button
            type="button"
            onClick={() => changeView("settimana")}
            className={cn(
              "tocco-comodo flex items-center gap-1.5 rounded px-2.5 py-1.5 text-sm font-medium transition-colors",
              view === "settimana" ? "bg-cream text-clay-ink" : "text-muted-foreground hover:bg-secondary",
            )}
          >
            <CalendarRange className="h-4 w-4" /> Settimana
          </button>
        </div>
      </div>

      {/*
        La vista prende l'altezza che avanza. L'elenco delle prenotazioni non
        ha una lunghezza massima — un sabato sera sono quaranta righe — quindi
        scorre lui, con l'intestazione della tabella attaccata in alto.
      */}
      {view === "settimana" ? (
        <div className="fill-scroll">
          <WeekBoard settimana={settimana} />
        </div>
      ) : view === "elenco" ? (
        <BookingsTable
          rows={rows}
          fill
          vuoto={
            /*
              «Nessuna prenotazione per questa data» era falso quando la
              giornata ne aveva tredici e il filtro ne mostrava zero: il vuoto
              dava la colpa alla data invece che al filtro, e chi legge cambia
              giorno per cercare una cosa che è lì.
            */
            statusFilter !== "all" && totaleDelGiorno > 0 ? (
              <>
                Nessuna prenotazione {statusFilter === "pending" ? "in sospeso" : "confermata"} per questa
                data — la giornata ne ha {totaleDelGiorno}.{" "}
                <Link href={getStatusFilterUrl("all")} className="underline underline-offset-4">
                  Vedi tutte
                </Link>
                .
              </>
            ) : undefined
          }
        />
      ) : (
        <BookingsFloorView
          rooms={rooms}
          rows={rows}
          shiftWindow={shiftWindow}
          canManage={canManageBookings}
          onBookingUpdated={handleBookingUpdated}
        />
      )}
    </div>
  );
}
