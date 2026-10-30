import { listBookingsForDay } from "@/server/bookings";
import { formatTime } from "@/lib/utils";
import type { Tool } from "../types";

export const getTodayReservationsTool: Tool = {
  ability: null,
  async run(ctx) {
    // Giorno e orari nel fuso del locale: il processo, su Vercel, è in UTC.
    const day = ctx.page?.date ?? new Date();
    const bookings = await listBookingsForDay(ctx.venueId, day, ctx.venueTimezone);

    if (bookings.length === 0) {
      return { text: "Non risultano prenotazioni per oggi." };
    }

    const covers = bookings.reduce((s, b) => s + b.partySize, 0);
    return {
      text: `Ci sono ${bookings.length} prenotazioni oggi, per un totale di ${covers} coperti.`,
      structured: {
        type: "list",
        title: "Prenotazioni di oggi",
        items: bookings.slice(0, 20).map((b) => ({
          title: b.guest ? `${b.guest.firstName} ${b.guest.lastName ?? ""}`.trim() : "Ospite",
          subtitle: `${formatTime(b.startsAt, "it-IT", ctx.venueTimezone)} · ${b.partySize} persone${b.table ? ` · ${b.table.label}` : ""}`,
        })),
      },
    };
  },
};
