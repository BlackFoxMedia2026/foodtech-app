import { db } from "@/lib/db";
import { listTableAssignmentsForService, listServiceOptions } from "@/server/waiter-assignments";
import type { Tool } from "../types";

export const getAvailableTablesTool: Tool = {
  ability: null,
  async run(ctx) {
    const tables = await db.table.findMany({ where: { venueId: ctx.venueId, active: true }, orderBy: { label: "asc" } });

    const now = new Date();
    const activeBookings = await db.booking.findMany({
      where: { venueId: ctx.venueId, status: { in: ["CONFIRMED", "ARRIVED", "SEATED"] }, startsAt: { lte: now } },
      select: { tableId: true, startsAt: true, durationMin: true },
    });
    const busyTableIds = new Set(
      activeBookings
        .filter((b) => new Date(b.startsAt.getTime() + b.durationMin * 60_000) >= now)
        .map((b) => b.tableId)
        .filter((id): id is string => Boolean(id)),
    );
    const free = tables.filter((t) => !busyTableIds.has(t.id));

    if (free.length === 0) {
      return { text: "Al momento non risultano tavoli liberi." };
    }
    return {
      text: `${free.length} tavoli risultano liberi in questo momento.`,
      structured: {
        type: "list",
        title: "Tavoli liberi",
        items: free.map((t) => ({ title: t.label, subtitle: `${t.seats} posti` })),
      },
    };
  },
};

export const getUnassignedTablesTool: Tool = {
  ability: null,
  async run(ctx) {
    const date = ctx.page?.date ? new Date(ctx.page.date) : new Date();
    const service = ctx.page?.service ?? (await listServiceOptions(ctx.venueId))[0];

    const [tables, assignments] = await Promise.all([
      db.table.findMany({ where: { venueId: ctx.venueId, active: true }, orderBy: { label: "asc" } }),
      listTableAssignmentsForService(ctx.venueId, date, service),
    ]);
    const assignedIds = new Set(assignments.flatMap((a) => a.tableIds));
    const unassigned = tables.filter((t) => !assignedIds.has(t.id));

    if (unassigned.length === 0) {
      return { text: `Tutti i tavoli hanno un cameriere assegnato per il servizio ${service}.` };
    }
    return {
      text: `${unassigned.length} tavoli non hanno un cameriere assegnato per il servizio ${service}.`,
      structured: {
        type: "list",
        title: "Tavoli non assegnati",
        items: unassigned.map((t) => ({ title: t.label, subtitle: `${t.seats} posti` })),
      },
    };
  },
};
