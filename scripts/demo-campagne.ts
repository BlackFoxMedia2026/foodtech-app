/**
 * Completa le campagne della vetrina senza rifare tutto il seed:
 * `DATABASE_URL=…/tavolo_demo_dev npx tsx scripts/demo-campagne.ts`.
 * Vedi `prisma/demo-campagne.ts`.
 */
import { PrismaClient } from "@prisma/client";
import { vietaDatiDemo } from "../src/lib/ambiente-dati";
import { campagneDemoComplete } from "../prisma/demo-campagne";

const guardia = vietaDatiDemo(process.env.DATABASE_URL ?? "", process.env.SEED_DEMO_PRODUZIONE === "1", "Questo comando scrive campagne dimostrative");
if (guardia) throw new Error(guardia);

const db = new PrismaClient();

async function main() {
  const locali = await db.venue.findMany({ where: { slug: { in: ["aurora-bistrot", "riva-beach"] } }, select: { id: true, name: true } });
  for (const v of locali) {
    console.log(v.name);
    await campagneDemoComplete(db, v.id);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
