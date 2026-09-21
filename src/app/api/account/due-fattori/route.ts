import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, apiErrorResponse, requireUtenteApi } from "@/lib/api-auth";
import { auditAttoreDelProprioAccesso } from "@/server/audit";
import {
  DueFattoriError,
  confermaDueFattori,
  iniziaDueFattori,
  spegniDueFattori,
  statoDueFattori,
} from "@/server/due-fattori";

/**
 * I due fattori del **proprio** accesso.
 *
 * Nessuna capacità richiesta, e **nessun locale**: questa è la sicurezza del
 * proprio accesso. Un cameriere deve poterla accendere senza chiedere niente a
 * nessuno, e l'amministratore di piattaforma — che non appartiene a nessun
 * locale — deve poterla accendere **su di sé**: con la guardia dei locali si
 * sentiva rispondere «il tuo account non è collegato a nessun locale», cioè la
 * difesa mancava proprio a chi vede tutti i ristoranti.
 *
 * `userId` viene **dalla sessione** e non dalla richiesta: se arrivasse nel
 * corpo, chiunque potrebbe accendere o spegnere i due fattori di un collega.
 */

export const dynamic = "force-dynamic";

const Codice = z.object({ codice: z.string().min(1).max(40) });

export async function GET() {
  const ctx = await requireUtenteApi();
  if (!ctx.ok) return ctx.response;
  try {
    return NextResponse.json(await statoDueFattori(ctx.userId));
  } catch (err) {
    return apiErrorResponse(err);
  }
}

/** Primo passo: prepara il segreto e restituisce il QR. Non accende niente. */
export async function POST(req: Request) {
  const ctx = await requireUtenteApi();
  if (!ctx.ok) return ctx.response;
  try {
    return NextResponse.json(await iniziaDueFattori(ctx.userId, await auditAttoreDelProprioAccesso(ctx, req)));
  } catch (err) {
    return risposta(err);
  }
}

/** Secondo passo: col codice giusto si accende, e tornano i codici di recupero. */
export async function PUT(req: Request) {
  const ctx = await requireUtenteApi();
  if (!ctx.ok) return ctx.response;
  try {
    const { codice } = Codice.parse(await req.json());
    return NextResponse.json(await confermaDueFattori(ctx.userId, codice, await auditAttoreDelProprioAccesso(ctx, req)));
  } catch (err) {
    return risposta(err);
  }
}

/** Spegne, **chiedendo un codice**: una sessione rubata non basta. */
export async function DELETE(req: Request) {
  const ctx = await requireUtenteApi();
  if (!ctx.ok) return ctx.response;
  try {
    const { codice } = Codice.parse(await req.json().catch(() => ({})));
    await spegniDueFattori(ctx.userId, codice, await auditAttoreDelProprioAccesso(ctx, req));
    return NextResponse.json({ attivo: false });
  } catch (err) {
    return risposta(err);
  }
}

function risposta(err: unknown) {
  if (err instanceof DueFattoriError) {
    const messaggi: Record<DueFattoriError["code"], string> = {
      gia_attivo: "I due fattori sono già accesi su questo accesso.",
      non_attivo: "I due fattori non sono accesi.",
      non_iniziato: "Prima serve inquadrare il codice QR: ricomincia da capo.",
      codice_non_valido:
        "Il codice non è valido o è già stato usato. Aspetta che l'app ne mostri uno nuovo.",
    };
    return apiError(409, err.code, messaggi[err.code]);
  }
  return apiErrorResponse(err);
}
