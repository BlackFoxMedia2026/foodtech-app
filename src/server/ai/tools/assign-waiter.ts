import { db } from "@/lib/db";
import { listWaiters } from "@/server/waiters";
import { listServiceOptions } from "@/server/waiter-assignments";
import type { Tool } from "../types";

function findWaiterByName<T extends { firstName: string; lastName: string }>(waiters: T[], rawName: string) {
  const needle = rawName.trim().toLowerCase();
  if (!needle) return undefined;
  return waiters.find(
    (w) => `${w.firstName} ${w.lastName}`.toLowerCase().includes(needle) || w.firstName.toLowerCase() === needle,
  );
}

/** Best-effort parse of "dal 4 al 9", "4, 5 e 6" or "T4, T5" into matching tables. */
function parseTableRange<T extends { id: string; label: string }>(text: string, tables: T[]) {
  const rangeMatch = text.match(/dal?\s*(\d+)\s*al\s*(\d+)/);
  let numbers: number[] = [];
  if (rangeMatch) {
    const start = parseInt(rangeMatch[1], 10);
    const end = parseInt(rangeMatch[2], 10);
    for (let n = Math.min(start, end); n <= Math.max(start, end); n++) numbers.push(n);
  } else {
    numbers = Array.from(text.matchAll(/\d+/g)).map((m) => parseInt(m[0], 10));
  }

  if (numbers.length > 0) {
    // A plain \bN\b regex against the label never matches "T1"/"B12": digits
    // are word characters too, so there's no \b boundary between the
    // leading letter and the number. Compare the label's own numeric
    // suffix instead.
    const numberSet = new Set(numbers);
    return tables.filter((t) => {
      const labelNumber = t.label.match(/\d+/);
      return labelNumber ? numberSet.has(parseInt(labelNumber[0], 10)) : false;
    });
  }

  const labelMatches = text.toUpperCase().match(/\b[A-Z]+\d+\b/g);
  if (labelMatches) {
    return tables.filter((t) => labelMatches.includes(t.label.toUpperCase()));
  }
  return [];
}

export const assignWaiterTool: Tool = {
  // Same permission bar as the existing floor-editor UI for this exact
  // action (src/app/api/waiter-assignments/table/route.ts): plain venue
  // membership, no extra ability gate invented on top of what the human UI
  // already allows.
  ability: null,
  async run(ctx, params) {
    const [waiters, tables, serviceOptions] = await Promise.all([
      listWaiters(ctx.venueId),
      db.table.findMany({ where: { venueId: ctx.venueId, active: true } }),
      listServiceOptions(ctx.venueId),
    ]);

    const waiter = findWaiterByName(waiters, params.waiterName ?? "");
    if (!waiter) {
      return { text: `Non ho trovato un cameriere chiamato "${params.waiterName}".` };
    }

    const matchedTables = parseTableRange(params.tableRange ?? "", tables);
    if (matchedTables.length === 0) {
      return { text: "Non ho capito quali tavoli assegnare — prova a indicarli per numero, es. \"dal 4 al 9\"." };
    }

    const date = ctx.page?.date ?? new Date().toISOString().slice(0, 10);
    const service = ctx.page?.service ?? serviceOptions[0] ?? "Servizio";
    const tableLabels = matchedTables.map((t) => t.label).join(", ");

    return {
      text: `Sto per assegnare ${waiter.firstName} ${waiter.lastName} ai tavoli ${tableLabels} per il servizio ${service} del ${date}.`,
      structured: {
        type: "action_confirmation",
        actionId: "assign_waiter",
        summary: `Assegnare ${waiter.firstName} ${waiter.lastName} a ${tableLabels} (${service}, ${date})`,
        params: { waiterId: waiter.id, tableIds: matchedTables.map((t) => t.id), date, service },
      },
    };
  },
};
