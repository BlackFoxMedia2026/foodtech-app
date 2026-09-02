/* eslint-disable no-console */
/**
 * One-shot data migration: copies existing table-mode WaiterAssignment rows
 * into the new StaffAssignment model as TABLE_RESPONSIBLE. WaiterAssignment
 * itself is left untouched (deprecated, not dropped) for rollback safety.
 *
 * Idempotent: upserts on StaffAssignment's [tableId, date, service,
 * assignmentType] unique key, so re-running this script is always safe.
 *
 * ROOMS-mode rows are intentionally NOT migrated here — no UI consumes
 * room-scoped assignments yet; they'll be mapped when Phase 2 (Sala/Servizio
 * panels) is actually designed, with real requirements instead of a guess.
 *
 * Run manually: tsx prisma/scripts/migrate-staff-assignments.ts
 * (not part of the seed/build pipeline — this is a one-off, not a fixture)
 */
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

async function main() {
  const rows = await db.waiterAssignment.findMany({
    where: { assignmentMode: "TABLES" },
  });

  console.log(`→ ${rows.length} assegnazioni in modalità TABLES da esaminare…`);

  let migrated = 0;
  let skippedMissingTable = 0;

  for (const row of rows) {
    for (const tableId of row.tableIds) {
      const table = await db.table.findFirst({
        where: { id: tableId, venueId: row.venueId },
        select: { roomId: true },
      });
      if (!table) {
        skippedMissingTable += 1;
        continue;
      }

      await db.staffAssignment.upsert({
        where: {
          StaffAssignment_table_slot: {
            tableId,
            date: row.date,
            service: row.service,
            assignmentType: "TABLE_RESPONSIBLE",
          },
        },
        create: {
          venueId: row.venueId,
          waiterId: row.waiterId,
          date: row.date,
          service: row.service,
          scope: "TABLE",
          tableId,
          roomId: table.roomId,
          assignmentType: "TABLE_RESPONSIBLE",
        },
        update: {
          waiterId: row.waiterId,
          roomId: table.roomId,
        },
      });
      migrated += 1;
    }
  }

  console.log(`✓ ${migrated} StaffAssignment create/aggiornate.`);
  if (skippedMissingTable > 0) {
    console.log(`  (${skippedMissingTable} riferimenti a tavoli non più esistenti, saltati.)`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
