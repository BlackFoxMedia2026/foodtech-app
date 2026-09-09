/* eslint-disable no-console */
import { PrismaClient } from "@prisma/client";
import { contatoriDaPrenotazioni } from "../src/lib/visite";

/**
 * Riallinea i contatori di tutti gli ospiti alle prenotazioni vere.
 *
 * `totalVisits`, `noShowCount` e `lastVisitAt` esistevano da sempre e nessuna
 * parte del codice li scriveva: sui database già in vita contengono valori
 * messi dal seed. Da settembre 2026 vengono aggiornati a ogni cambio di stato
 * che conta, ma le righe vecchie restano sbagliate finché non succede qualcosa
 * a quel cliente — e nel frattempo i segmenti delle campagne filtrano su
 * numeri finti.
 *
 * Questo script li ricalcola una volta per tutte.
 *
 *   npx tsx scripts/refresh-guest-stats.ts            # mostra cosa cambierebbe
 *   npx tsx scripts/refresh-guest-stats.ts --applica  # scrive
 *
 * Di proposito non scrive niente senza `--applica`: è una modifica di massa
 * su dati veri, e va vista prima di essere fatta.
 */

const db = new PrismaClient();
const applica = process.argv.includes("--applica");

async function main() {
  const ospiti = await db.guest.findMany({
    select: { id: true, firstName: true, lastName: true, totalVisits: true, noShowCount: true, lastVisitAt: true },
  });

  let daCambiare = 0;

  for (const g of ospiti) {
    const prenotazioni = await db.booking.findMany({
      where: { guestId: g.id, deletedAt: null },
      select: { startsAt: true, status: true },
    });

    const { visite, assenze, ultimaVisita: ultima } = contatoriDaPrenotazioni(prenotazioni);

    const cambia =
      g.totalVisits !== visite ||
      g.noShowCount !== assenze ||
      (g.lastVisitAt?.getTime() ?? null) !== (ultima?.getTime() ?? null);

    if (!cambia) continue;
    daCambiare++;

    const nome = `${g.firstName} ${g.lastName ?? ""}`.trim();
    console.log(
      `  ${nome.padEnd(24)} visite ${String(g.totalVisits).padStart(3)} → ${String(visite).padStart(3)}` +
        `   assenze ${g.noShowCount} → ${assenze}` +
        `   ultima ${g.lastVisitAt?.toISOString().slice(0, 10) ?? "—"} → ${ultima?.toISOString().slice(0, 10) ?? "—"}`,
    );

    if (applica) {
      await db.guest.update({
        where: { id: g.id },
        data: { totalVisits: visite, noShowCount: assenze, lastVisitAt: ultima },
      });
    }
  }

  console.log(`\n${ospiti.length} ospiti esaminati, ${daCambiare} da correggere.`);
  if (!applica && daCambiare > 0) {
    console.log("Niente è stato scritto. Per applicare: npx tsx scripts/refresh-guest-stats.ts --applica");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
