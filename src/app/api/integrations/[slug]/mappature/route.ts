import { NextResponse } from "next/server";
import { z } from "zod";
import { apiErrorResponse, requireVenueApi } from "@/lib/api-auth";
import { auditActor, recordAudit } from "@/server/audit";
import { trovaInstallazione } from "@/server/integrations/installazioni";
import { abbinaAMano, elencoMappature, etichetteInterne } from "@/server/integrations/mappature";
import { TIPI_ENTITA, type TipoEntita } from "@/server/integrations/tipi";

/**
 * Le mappature di un'integrazione: cosa è da loro ogni cosa nostra.
 * Leggerle e cambiarle è `integration:configure`.
 */

export const dynamic = "force-dynamic";

async function installazioneDelLocale(venueId: string, slug: string) {
  const i = await trovaInstallazione(venueId, slug);
  return i && i.status !== "NOT_INSTALLED" ? i : null;
}

export async function GET(req: Request, { params }: { params: { slug: string } }) {
  const ctx = await requireVenueApi("integration:configure");
  if (!ctx.ok) return ctx.response;
  const i = await installazioneDelLocale(ctx.venueId, params.slug);
  if (!i) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const tipoRichiesto = new URL(req.url).searchParams.get("tipo");
  const tipo = (TIPI_ENTITA as readonly string[]).includes(tipoRichiesto ?? "") ? (tipoRichiesto as TipoEntita) : undefined;

  const [righe, interni] = await Promise.all([
    elencoMappature(i, tipo),
    tipo ? etichetteInterne(ctx.venueId, tipo) : Promise.resolve([]),
  ]);
  const nomi = new Map(interni.map((x) => [x.id, x.etichetta]));

  return NextResponse.json({
    righe: righe.map((m) => ({
      id: m.id,
      tipo: m.entityType,
      esterno: m.externalLabel ?? m.externalId,
      externalId: m.externalId,
      internalId: m.internalId,
      interno: m.internalId ? nomi.get(m.internalId) ?? null : null,
      manuale: m.manual,
      vistoIl: m.lastSeenAt.toISOString(),
    })),
    interni,
  });
}

const Abbina = z.object({ mappingId: z.string().min(1), internalId: z.string().min(1).nullable() });

export async function PATCH(req: Request, { params }: { params: { slug: string } }) {
  const ctx = await requireVenueApi("integration:configure");
  if (!ctx.ok) return ctx.response;
  try {
    const corpo = Abbina.parse(await req.json());
    const i = await installazioneDelLocale(ctx.venueId, params.slug);
    if (!i) return NextResponse.json({ error: "not_found" }, { status: 404 });
    await abbinaAMano(i, corpo.mappingId, corpo.internalId);
    await recordAudit(auditActor(ctx, req), "integration.mapping_update", "integration", i.id, corpo);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
