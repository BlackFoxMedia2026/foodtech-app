/* eslint-disable no-console */
import { PrismaClient } from "@prisma/client";
import { generaPayToken, urlPagamento } from "../src/lib/pay-token";

/**
 * Prepara un tavolo con il QR acceso e un conto aperto sopra, per guardare la
 * pagina pubblica con dati veri.
 *
 * Non riseeda niente e non tocca dati esistenti: prende il primo locale che
 * trova, un suo tavolo, e ci appoggia una prenotazione seduta con un conto.
 *
 * Con `--pulisci` fa il contrario: toglie quello che ha messo — il conto
 * finto, la prenotazione e i pagamenti demo — e lascia il database com'era.
 * I dati inventati che restano in un database di sviluppo finiscono negli
 * incassi e nelle statistiche, e a quel punto non si distinguono più da
 * quelli veri.
 */
const db = new PrismaClient();

async function pulisci() {
  const ordini = await db.order.findMany({
    where: { reference: { startsWith: "demoqr-" } },
    select: { id: true, bookingId: true },
  });
  const orderIds = ordini.map((o) => o.id);
  const bookingIds = ordini.map((o) => o.bookingId).filter((b): b is string => !!b);

  await db.paymentAllocation.deleteMany({ where: { orderId: { in: orderIds } } });
  await db.payment.deleteMany({ where: { orderId: { in: orderIds } } });
  await db.orderItem.deleteMany({ where: { orderId: { in: orderIds } } });
  await db.order.deleteMany({ where: { id: { in: orderIds } } });
  await db.booking.deleteMany({ where: { id: { in: bookingIds } } });

  console.log(`rimossi ${orderIds.length} conti demo e quello che ci stava attaccato.`);
  console.log("Il QR dei tavoli resta acceso: per spegnerlo, dalla Sala.");
}

async function main() {
  if (process.argv.includes("--pulisci")) return pulisci();

  const venue = await db.venue.findFirstOrThrow({ orderBy: { createdAt: "asc" } });
  const tavolo = await db.table.findFirstOrThrow({ where: { venueId: venue.id }, orderBy: { label: "asc" } });

  const token = tavolo.payQrToken ?? generaPayToken();
  await db.table.update({
    where: { id: tavolo.id },
    data: { payQrToken: token, payQrEnabled: true, payQrRotatedAt: new Date() },
  });
  await db.venue.update({
    where: { id: venue.id },
    data: { qrPaymentsEnabled: true, stripeAccountId: "acct_demo", stripeChargesEnabled: true },
  });

  const booking = await db.booking.create({
    data: {
      venueId: venue.id,
      tableId: tavolo.id,
      partySize: 4,
      startsAt: new Date(),
      seatedAt: new Date(),
      status: "SEATED",
      source: "PHONE",
    },
  });

  const order = await db.order.create({
    data: {
      venueId: venue.id,
      bookingId: booking.id,
      kind: "TABLE",
      status: "RECEIVED",
      reference: `demoqr-${Date.now()}`,
      scheduledAt: new Date(),
      currency: venue.currency,
      OrderItem: {
        create: [
          { name: "Tartare di manzo", priceCents: 1600, quantity: 2 },
          { name: "Ribeye", priceCents: 3800, quantity: 1 },
          { name: "Calice Barolo", priceCents: 1200, quantity: 3 },
          { name: "Tiramisù", priceCents: 800, quantity: 2 },
        ],
      },
    },
    include: { OrderItem: true },
  });

  const totale = order.OrderItem.reduce((s, r) => s + r.priceCents * r.quantity, 0);
  await db.order.update({ where: { id: order.id }, data: { totalCents: totale } });

  // Un commensale ha già pagato: così la pagina mostra anche «già pagato».
  await db.payment.create({
    data: {
      venueId: venue.id,
      orderId: order.id,
      tableId: tavolo.id,
      kind: "TABLE_QR",
      status: "SUCCEEDED",
      amountCents: 3500,
      tipCents: 300,
      currency: venue.currency,
      paidAt: new Date(),
      paymentMethod: "apple_pay",
    },
  });

  console.log("locale :", venue.name);
  console.log("tavolo :", tavolo.label);
  console.log("totale :", (totale / 100).toFixed(2), "€");
  console.log("URL    :", urlPagamento(token, "http://localhost:3000"));
}

main().finally(() => db.$disconnect());
