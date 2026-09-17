import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, apiErrorResponse, requireVenueApi } from "@/lib/api-auth";
import { auditActor, recordAudit } from "@/server/audit";
import {
  LicenzaError,
  attivaCentralino,
  spegniCentralino,
  statoCentralino,
} from "@/server/licenza-centralino";

/**
 * La chiave del centralino, inserita dal locale.
 *
 * `manage_venue`: accendere una funzione a pagamento è una decisione del
 * titolare, non di chi prende le prenotazioni.
 *
 * L'operazione finisce nel registro delle attività. Non è burocrazia: fra sei
 * mesi, davanti a «il telefono non funziona più», la domanda prima di tutte è
 * quando e da chi è stata toccata questa impostazione.
 */
const Corpo = z.object({
  /* Lungo: una chiave contiene il locale, la scadenza e la firma. Il tetto
     serve solo a non farsi mandare un file al posto di una riga. */
  chiave: z.string().min(20).max(4000),
});

export async function GET() {
  const ctx = await requireVenueApi();
  if (!ctx.ok) return ctx.response;
  return NextResponse.json(await statoCentralino(ctx.venueId));
}

export async function POST(req: Request) {
  const ctx = await requireVenueApi("manage_venue");
  if (!ctx.ok) return ctx.response;

  try {
    const { chiave } = Corpo.parse(await req.json());
    const stato = await attivaCentralino(ctx.venueId, chiave);

    await recordAudit(auditActor(ctx, req), "venue.centralino_attivato", "venue", ctx.venueId, {
      funzioni: stato.funzioni,
      scadeIl: stato.scadeIl?.toISOString() ?? null,
      chiave: stato.chiaveLeggibile,
    });

    return NextResponse.json(stato);
  } catch (err) {
    /* Il messaggio della licenza arriva intero a chi ha incollato: «questa
       chiave è di un altro locale», «è scaduta il 3 marzo». Un 400 generico
       gli farebbe aprire una segnalazione per una cosa che risolve in un
       minuto — ed è il contrario del token dell'API, dove il motivo non si
       dice perché dall'altra parte c'è un programma che prova a entrare. */
    if (err instanceof LicenzaError) {
      return apiError(400, `licenza_${err.motivo}`, err.message);
    }
    return apiErrorResponse(err);
  }
}

export async function DELETE(req: Request) {
  const ctx = await requireVenueApi("manage_venue");
  if (!ctx.ok) return ctx.response;

  try {
    const prima = await statoCentralino(ctx.venueId);
    await spegniCentralino(ctx.venueId);

    await recordAudit(auditActor(ctx, req), "venue.centralino_spento", "venue", ctx.venueId, {
      chiave: prima.chiaveLeggibile,
    });

    return NextResponse.json(await statoCentralino(ctx.venueId));
  } catch (err) {
    return apiErrorResponse(err);
  }
}
