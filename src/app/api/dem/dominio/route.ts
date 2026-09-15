import { NextResponse } from "next/server";
import { z } from "zod";
import { apiErrorResponse, requireVenueApi } from "@/lib/api-auth";
import { configuraDominio, statoInvio } from "@/server/dem/dominio";
import { auditActor, recordAudit } from "@/server/audit";
import { db } from "@/lib/db";

const Corpo = z.object({
  dominio: z.string().min(3).max(253),
  fromName: z.string().max(120).optional(),
  replyTo: z.string().email().max(320).optional().or(z.literal("")),
});

export async function GET() {
  const ctx = await requireVenueApi();
  if (!ctx.ok) return ctx.response;
  return NextResponse.json(await statoInvio(ctx.venueId));
}

/**
 * Registra il dominio di invio del locale.
 *
 * `manage_venue`: configurare da quale dominio esce la posta di un ristorante
 * non è un gesto di marketing, è una decisione sull'identità del locale.
 */
export async function POST(req: Request) {
  const ctx = await requireVenueApi("manage_venue");
  if (!ctx.ok) return ctx.response;

  try {
    const corpo = Corpo.parse(await req.json());
    const { dominio, record } = await configuraDominio(ctx.venueId, corpo.dominio, {
      ...(corpo.fromName !== undefined && { fromName: corpo.fromName }),
      ...(corpo.replyTo !== undefined && { replyTo: corpo.replyTo || undefined }),
    });

    await recordAudit(auditActor(ctx, req), "dem.domain_change", "dem_domain", dominio.id, {
      dominio: dominio.sendingDomain,
    });

    return NextResponse.json({ dominio: dominio.sendingDomain, record });
  } catch (err) {
    return apiErrorResponse(err);
  }
}

const Modifica = z.object({
  fromName: z.string().max(120).nullable().optional(),
  replyTo: z.string().email().max(320).nullable().optional().or(z.literal("")),
});

/** Il nome del mittente e l'indirizzo a cui arrivano le risposte. */
export async function PATCH(req: Request) {
  const ctx = await requireVenueApi("manage_venue");
  if (!ctx.ok) return ctx.response;

  try {
    const corpo = Modifica.parse(await req.json());
    const esistente = await db.demDomain.findUnique({ where: { venueId: ctx.venueId } });
    if (!esistente) throw new Error("not_found");

    await db.demDomain.update({
      where: { venueId: ctx.venueId },
      data: {
        ...(corpo.fromName !== undefined && { fromName: corpo.fromName || null }),
        ...(corpo.replyTo !== undefined && { replyTo: corpo.replyTo || null }),
      },
    });

    return NextResponse.json(await statoInvio(ctx.venueId));
  } catch (err) {
    return apiErrorResponse(err);
  }
}
