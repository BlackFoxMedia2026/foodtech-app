import { NextResponse } from "next/server";
import { z } from "zod";
import { apiErrorResponse, requireVenueApi } from "@/lib/api-auth";
import { auditActor, recordAudit } from "@/server/audit";
import {
  eliminaFasciaServizio,
  listFasceServizio,
  salvaFasciaServizio,
} from "@/server/turni-servizio";
import { descrizioneGiorni, minutiAOrario } from "@/lib/turni";

/**
 * I turni di servizio del locale: gli orari in cui si accettano clienti.
 *
 * Una fascia sta su più righe `Shift` — una per giorno — e qui si tratta come
 * una cosa sola: chi salva manda gli `ids` da cui è partito e come deve essere
 * alla fine. Vedi `server/turni-servizio.ts` per il perché.
 */

/** Quello che va nel registro: gli orari in minuti non li leggerebbe nessuno. */
function perIlRegistro(fascia: {
  nome: string;
  inizioMinuti: number;
  fineMinuti: number;
  coperti: number;
  minutiSlot: number;
  giorni: number[];
}) {
  return {
    nome: fascia.nome,
    orario: `${minutiAOrario(fascia.inizioMinuti)}–${minutiAOrario(fascia.fineMinuti)}`,
    coperti: fascia.coperti,
    unOrarioOgni: `${fascia.minutiSlot} minuti`,
    giorni: descrizioneGiorni(fascia.giorni),
  };
}

export async function GET() {
  const ctx = await requireVenueApi();
  if (!ctx.ok) return ctx.response;
  return NextResponse.json(await listFasceServizio(ctx.venueId));
}

export async function POST(req: Request) {
  const ctx = await requireVenueApi("manage_venue");
  if (!ctx.ok) return ctx.response;
  try {
    const body = (await req.json()) as Record<string, unknown>;
    // Una fascia nuova non porta righe con sé, qualunque cosa dica il client.
    const fascia = await salvaFasciaServizio(ctx.venueId, { ...body, ids: [] });
    await recordAudit(
      auditActor(ctx, req),
      "service_shift.create",
      "shift",
      fascia.ids[0] ?? null,
      perIlRegistro(fascia),
    );
    return NextResponse.json(fascia, { status: 201 });
  } catch (err) {
    return apiErrorResponse(err);
  }
}

export async function PATCH(req: Request) {
  const ctx = await requireVenueApi("manage_venue");
  if (!ctx.ok) return ctx.response;
  try {
    const fascia = await salvaFasciaServizio(ctx.venueId, await req.json());
    await recordAudit(
      auditActor(ctx, req),
      "service_shift.update",
      "shift",
      fascia.ids[0] ?? null,
      perIlRegistro(fascia),
    );
    return NextResponse.json(fascia);
  } catch (err) {
    return apiErrorResponse(err);
  }
}

const Eliminazione = z.object({ ids: z.array(z.string().min(1)).min(1) });

export async function DELETE(req: Request) {
  const ctx = await requireVenueApi("manage_venue");
  if (!ctx.ok) return ctx.response;
  try {
    const { ids } = Eliminazione.parse(await req.json());
    const esito = await eliminaFasciaServizio(ctx.venueId, ids);
    await recordAudit(auditActor(ctx, req), "service_shift.delete", "shift", ids[0], esito);
    return NextResponse.json({ ok: true, ...esito });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
