"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { Booking, Guest, RoomLayoutMode, Table } from "@prisma/client";
import { DayPicker } from "@/components/bookings/day-picker";
import { NewBookingButton } from "@/components/bookings/new-booking-button";
import { BookingsTable } from "@/components/bookings/bookings-table";
import { ALTEZZA, BarraPrenotazioni, FiltroStato, SelettoreVista } from "@/components/bookings/barra-prenotazioni";
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
    // Niente scroll di pagina: la barra dei comandi e i filtri restano fissi in
    // cima, e la vista scelta — elenco, mappa o settimana — prende l'altezza che
    // avanza. Qui si lavora, quindi l'intestazione è compatta.
    <div className="schermo animate-fade-in gap-3">
      {/*
        Il titolo della pagina non è qui e non ci torna: la barra di navigazione
        scrive già «Prenotazioni» con l'indicatore attivo. E non c'è più nemmeno
        la riga di conteggi che stava al suo posto — «16 prenotazioni · 69
        coperti · 2 assenze attese» era la prima cosa che si leggeva su una
        pagina dove la prima cosa da sapere è che giorno è.
      */}
      <BarraPrenotazioni
        giorno={<DayPicker value={dayString} />}
        servizio={
          /* Sempre visibile, in ogni vista: restava legato alla Mappa, e la
             barra si spostava sotto gli occhi cambiando vista. */
          <BookingServiceSelect
            service={service}
            serviceOptions={serviceOptions}
            className={cn(
              ALTEZZA,
              "w-auto shrink-0 gap-1.5 rounded-full border-border/70 bg-card/70 px-2.5 text-[0.9375rem] font-medium shadow-none transition-colors hover:border-border-strong/70 hover:bg-veil-6 min-[1280px]:px-3 min-[1440px]:text-base min-[1500px]:gap-2 min-[1500px]:px-4",
            )}
          />
        }
        filtro={<FiltroStato attivo={statusFilter} url={getStatusFilterUrl} inSospeso={pendingCount} />}
        vista={<SelettoreVista vista={view} onVista={changeView} />}
        azione={<NewBookingButton tables={tables} className={cn(ALTEZZA, "px-3.5 text-[0.9375rem] font-semibold sm:px-4 min-[1440px]:text-base min-[1500px]:px-6")} />}
      />

      {/*
        La vista prende l'altezza che avanza. L'elenco delle prenotazioni non
        ha una lunghezza massima — un sabato sera sono quaranta righe — quindi
        scorre lui, con l'intestazione della tabella attaccata in alto.
      */}
      {view === "settimana" ? (
        <div className="fill-scroll">
          {/* Aprire un giorno dalla settimana significa andare a vedere **chi
              c'è**: la data da sola lasciava la settimana a schermo, cioè lo
              stesso disegno con una scheda evidenziata diversa. */}
          <WeekBoard settimana={settimana} onApriGiorno={() => changeView("elenco")} />
        </div>
      ) : view === "elenco" ? (
        <BookingsTable
          rows={rows}
          fill
          /* Il selettore di stato chiama un'API che vuole `manage_bookings`:
             a chi non ce l'ha la pillola resta di sola lettura, invece di
             rispondere «non puoi» dopo il clic. */
          canManage={canManageBookings}
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
