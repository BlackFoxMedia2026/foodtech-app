import { NextResponse } from "next/server";
import { z } from "zod";
import { auditActor } from "@/server/audit";
import { apiErrorResponse, requireVenueApi } from "@/lib/api-auth";
import { accendiQr, rigeneraQr } from "@/server/qr-tavolo";

/**
 * Accendere, spegnere e rigenerare il QR di un tavolo.
 *
 * Serve `manage_venue`, come per ogni altra modifica alla sala: decidere se un
 * tavolo incassa denaro non è una cosa da lasciare a chi può solo prendere
 * prenotazioni.
 */

const Patch = z.object({ attivo: z.boolean() });

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const ctx = await requireVenueApi("manage_venue");
  if (!ctx.ok) return ctx.response;
  try {
    const { attivo } = Patch.parse(await req.json());
    return NextResponse.json(
      await accendiQr(ctx.venueId, params.id, attivo, { actor: auditActor(ctx, req) }),
    );
  } catch (err) {
    return apiErrorResponse(err);
  }
}

/**
 * Rigenera il segreto. Da questo momento **ogni cartoncino già stampato per
 * questo tavolo smette di funzionare**: è una POST e non una PATCH perché non
 * è una modifica, è una revoca.
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const ctx = await requireVenueApi("manage_venue");
  if (!ctx.ok) return ctx.response;
  try {
    return NextResponse.json(await rigeneraQr(ctx.venueId, params.id, { actor: auditActor(ctx, req) }));
  } catch (err) {
    return apiErrorResponse(err);
  }
}
