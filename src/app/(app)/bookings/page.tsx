import { db } from "@/lib/db";
import { startOfDay } from "@/lib/utils";
import { assenzeAttese } from "@/server/assenze-attese";
import { can, getActiveVenue } from "@/lib/tenant";
import { listBookingsForDay } from "@/server/bookings";
import { getSettimana } from "@/server/booking-week";
import { getShiftWindowForDate, getCurrentServiceName } from "@/server/booking-floor";
import { listRooms } from "@/server/rooms";
import { listServiceOptions } from "@/server/waiter-assignments";
import { BookingsPageClient } from "@/components/bookings/bookings-page-client";

/** La riga ospite senza la colonna `Decimal` che il client non può ricevere. */
function senzaSpesa<T extends { totalSpend: unknown }>({ totalSpend, ...resto }: T): Omit<T, "totalSpend"> {
  return resto;
}

export const dynamic = "force-dynamic";

type StatusFilter = "all" | "pending" | "confirmed";

export default async function BookingsPage({
  searchParams,
}: {
  searchParams: { day?: string; status?: string; service?: string };
}) {
  const ctx = await getActiveVenue();
  const day = searchParams.day ? new Date(searchParams.day) : new Date();
  const dayString = day.toISOString().slice(0, 10);
  const statusFilter = (searchParams.status as StatusFilter) ?? "all";
  const canManageBookings = can(ctx.role, "manage_bookings");

  const [rows, tables, allTables, rooms, serviceOptions, settimana] = await Promise.all([
    listBookingsForDay(ctx.venueId, day),
    db.table.findMany({
      where: { venueId: ctx.venueId, active: true },
      select: { id: true, label: true, seats: true },
      orderBy: { label: "asc" },
    }),
    db.table.findMany({ where: { venueId: ctx.venueId }, orderBy: { label: "asc" } }),
    listRooms(ctx.venueId),
    listServiceOptions(ctx.venueId),
    // Due letture sommate, non l'elenco di sette giorni: la vista settimana
    // mostra sette totali, e sette totali non hanno bisogno di essere paginati.
    getSettimana(ctx.venueId, dayString),
  ]);

  // Default to whichever service is happening right now (by wall-clock
  // time), not just the first one alphabetically/by start time — otherwise
  // opening the page outside lunch hours defaulted to "Pranzo" and silently
  // hid real dinner bookings behind a misleading "tutte assegnate" empty
  // state. An explicit ?service= from the user always wins.
  const service = searchParams.service ?? (await getCurrentServiceName(ctx.venueId, day)) ?? serviceOptions[0] ?? "";
  // Single lightweight lookup, not a second bookings query — the Mappa view
  // derives its unassigned/assigned split from the SAME `rows` fetched
  // above, just further narrowed to this window client-side (brief section
  // 24: one source of truth, no parallel dataset).
  const shiftWindow = service ? await getShiftWindowForDate(ctx.venueId, day, service) : null;

  let filteredRows = rows;
  if (statusFilter === "pending") {
    filteredRows = rows.filter((r) => r.status === "PENDING");
  } else if (statusFilter === "confirmed") {
    filteredRows = rows.filter((r) => r.status === "CONFIRMED");
  }

  const totalCovers = filteredRows.filter((r) => r.status !== "CANCELLED").reduce((s, b) => s + b.partySize, 0);
  const pendingCount = rows.filter((r) => r.status === "PENDING").length;
  // Il totale **della giornata**, non del filtro: serve a dire la verità
  // quando il filtro non trova niente ma la giornata è piena, e a contare le
  // assenze attese su tutta la giornata invece che sul sottoinsieme mostrato.
  const totaleDelGiorno = rows.filter((r) => r.status !== "CANCELLED").length;

  /*
    Le assenze attese, dove prima stavano in Panoramica.

    Solo da oggi in avanti: su una giornata già passata le assenze non si
    prevedono, si contano — e le righe qui sotto dicono già chi non è
    arrivato. Una previsione su ieri sarebbe un numero che nessuno può usare.
  */
  const oggi = new Date();
  const giornoPassato = startOfDay(day).getTime() < startOfDay(oggi).getTime();
  const assenzeDelGiorno = giornoPassato
    ? 0
    : await assenzeAttese({ venueId: ctx.venueId, prenotazioni: totaleDelGiorno, oggi });

  const roomsWithTables = rooms.map((r) => ({
    id: r.id,
    name: r.name,
    width: r.width,
    height: r.height,
    floorPlanUrl: r.floorPlanUrl,
    activeLayoutMode: r.activeLayoutMode,
    roomLayoutElements: r.roomLayout?.elements ?? [],
    tables: allTables.filter((t) => t.roomId === r.id),
  }));

  return (
    // Si toglie la spesa dell'ospite prima di passare le righe al client: è un
    // `Decimal` di Prisma che nessuno legge qui, e che Next segnalava a ogni
    // caricamento. Vedi la nota in `bookings-page-client.tsx`.
    <BookingsPageClient
      dayString={dayString}
      statusFilter={statusFilter}
      filteredRows={filteredRows.map(({ guest, ...resto }) => ({
        ...resto,
        guest: guest ? senzaSpesa(guest) : null,
      }))}
      totalCovers={totalCovers}
      pendingCount={pendingCount}
      totaleDelGiorno={totaleDelGiorno}
      assenzeAttese={assenzeDelGiorno}
      tables={tables}
      service={service}
      serviceOptions={serviceOptions}
      rooms={roomsWithTables}
      shiftWindow={shiftWindow}
      canManageBookings={canManageBookings}
      settimana={settimana}
    />
  );
}
