import { NextResponse } from "next/server";
import { auditActor, recordAudit } from "@/server/audit";
import { requireVenueApi } from "@/lib/api-auth";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";

const Body = z.object({
  /** Assente: il nome lo sceglie il server (vedi `prossimaEtichettaLibera`). */
  label: z.string().min(1).optional(),
  seats: z.coerce.number().int().min(1).max(40),
  shape: z.enum(["ROUND", "SQUARE", "RECT", "BOOTH", "LOUNGE", "OVAL", "CUSTOM"]).default("ROUND"),
  roomId: z.string().optional().nullable(),
  posX: z.coerce.number().int().default(40),
  posY: z.coerce.number().int().default(40),
  // Nullo: usa la misura standard della forma (vedi TABLE_SIZE/dimensioneDisegnata).
  width: z.coerce.number().int().min(20).max(1200).nullable().optional(),
  height: z.coerce.number().int().min(20).max(1200).nullable().optional(),
  /** Dove stanno le sedie: su tutti i lati o solo sui due lunghi. */
  chairSides: z.enum(["ALL", "LONG"]).optional(),
});

/**
 * Il primo «T<n>» libero **nel locale**, non nella sala.
 *
 * Il nome di un tavolo è unico per locale (`venueId` + `label`), ma l'editor
 * della piantina vede solo i tavoli della sala aperta: in una sala nuova
 * proponeva «T1», che esisteva già nella sala accanto, e la creazione
 * falliva. Chi conosce tutti i tavoli è il server, quindi il numero lo dà lui.
 * Si prende il più alto più uno, non il primo buco: un T3 cancellato ieri non
 * deve riapparire domani dall'altra parte del locale.
 */
async function prossimaEtichettaLibera(venueId: string) {
  const tavoli = await db.table.findMany({ where: { venueId }, select: { label: true } });
  let massimo = 0;
  for (const { label } of tavoli) {
    const m = /^T(\d+)$/.exec(label);
    if (m) massimo = Math.max(massimo, Number(m[1]));
  }
  return `T${massimo + 1}`;
}

function eNomeDoppio(err: unknown) {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
}

export async function GET() {
  const ctx = await requireVenueApi();
  if (!ctx.ok) return ctx.response;
  const tables = await db.table.findMany({
    where: { venueId: ctx.venueId },
    orderBy: { label: "asc" },
  });
  return NextResponse.json(tables);
}

export async function POST(req: Request) {
  const ctx = await requireVenueApi("manage_venue");
  if (!ctx.ok) return ctx.response;
  try {
    const { label, ...data } = Body.parse(await req.json());
    let created;
    if (label) {
      created = await db.table.create({ data: { ...data, label, venueId: ctx.venueId } });
    } else {
      // Due tavoli messi giù in rapida successione possono chiedere lo stesso
      // numero: chi arriva secondo riprova col successivo.
      for (let tentativo = 0; ; tentativo++) {
        try {
          const automatica = await prossimaEtichettaLibera(ctx.venueId);
          created = await db.table.create({ data: { ...data, label: automatica, venueId: ctx.venueId } });
          break;
        } catch (err) {
          if (!eNomeDoppio(err) || tentativo >= 4) throw err;
        }
      }
    }
    await recordAudit(auditActor(ctx, req), "table.create", "table", created.id, {
      tavolo: created.label,
      posti: created.seats,
    });
    return NextResponse.json(created, { status: 201 });
  } catch (err) {
    if (eNomeDoppio(err)) {
      return NextResponse.json(
        { error: "Esiste già un tavolo con questo nome.", code: "DUPLICATE_LABEL" },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: err instanceof Error ? err.message : "invalid" }, { status: 400 });
  }
}
