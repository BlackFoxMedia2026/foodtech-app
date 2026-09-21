import { NextResponse } from "next/server";
import { apiError, apiErrorResponse, requireVenueApi } from "@/lib/api-auth";
import { auditActor, recordAudit } from "@/server/audit";
import {
  elencaApiToken,
  emettiApiToken,
  revocaApiToken,
} from "@/server/api-token";
import {
  LicenzaError,
  richiediFunzioneCentralino,
} from "@/server/licenza-centralino";

/**
 * La chiave con cui il centralino parla con Tavolo.
 *
 * È il pezzo che mancava per chiudere il giro. Tutto il resto era pronto —
 * Tavolo sa dire chi sta chiamando, ricevere una chiamata, ricevere una
 * prenotazione — ma la chiave con cui il centralino si presenta si emetteva
 * solo da riga di comando. Cioè il collegamento esisteva e non era
 * consegnabile: una funzione raggiungibile solo da un terminale, per un
 * prodotto che si vende a dei ristoranti.
 *
 * ## Perché sta qui e non nel pannello di chi vende
 *
 * Perché è **Tavolo** a decidere chi può leggere i suoi dati. Se la chiave la
 * fabbricasse miocentralino, un pannello esterno potrebbe dare accesso alla
 * rubrica di un locale senza che quel locale ne sappia niente. Il verso è
 * questo: la licenza la firma chi vende, la chiave d'accesso la rilascia chi
 * possiede i dati.
 *
 * ## Si vede una volta
 *
 * Nel database resta solo l'impronta. Se si perde, se ne fa un'altra e la
 * precedente si revoca — che è anche l'unico modo di togliere l'accesso a un
 * centralino che non deve più averlo.
 */

export const dynamic = "force-dynamic";

/** Il nome con cui si riconosce la chiave emessa da questa schermata. */
const NOME = "Collegamento col centralino";

export async function GET() {
  const ctx = await requireVenueApi("manage_phone");
  if (!ctx.ok) return ctx.response;

  try {
    await richiediFunzioneCentralino(ctx.venueId, "riconoscimento");
    const tutte = await elencaApiToken(ctx.venueId);
    const attive = tutte.filter((t) => !t.revocatoIl);
    return NextResponse.json({
      /* Mai il valore: quello si è visto una volta, quando è stato emesso.
         Solo il prefisso, che basta a rispondere a «è quella che hai tu?». */
      chiavi: attive.map((t) => ({
        id: t.id,
        prefisso: t.prefisso,
        ambiti: t.ambiti,
        creataIl: t.creatoIl,
        ultimoUso: t.ultimoUso,
      })),
    });
  } catch (err) {
    if (err instanceof LicenzaError) {
      return apiError(
        403,
        "centralino_non_attivo",
        "Il telefono non è attivo su questo locale.",
      );
    }
    return apiErrorResponse(err);
  }
}

export async function POST(req: Request) {
  const ctx = await requireVenueApi("manage_phone");
  if (!ctx.ok) return ctx.response;

  try {
    await richiediFunzioneCentralino(ctx.venueId, "riconoscimento");

    /* Entrambi gli ambiti: il centralino deve **leggere** chi chiama e
       **scrivere** le chiamate e le prenotazioni. Darne uno solo produrrebbe
       un collegamento che riconosce e non annuncia, o viceversa — e in
       entrambi i casi il difetto si scopre al primo squillo. */
    const emesso = await emettiApiToken(ctx.venueId, {
      nome: NOME,
      ambiti: ["telefonia:read", "telefonia:write"],
      creatoDa: ctx.userId,
    });

    await recordAudit(
      auditActor(ctx, req),
      "venue.centralino_chiave_emessa",
      "venue",
      ctx.venueId,
      {
        prefisso: emesso.prefisso,
      },
    );

    return NextResponse.json(
      {
        id: emesso.id,
        prefisso: emesso.prefisso,
        /* Il valore, **una volta sola**. Nel database resta l'impronta. */
        chiave: emesso.token,
      },
      { status: 201, headers: { "Cache-Control": "no-store, private" } },
    );
  } catch (err) {
    if (err instanceof LicenzaError) {
      return apiError(
        403,
        "centralino_non_attivo",
        "Il telefono non è attivo su questo locale.",
      );
    }
    return apiErrorResponse(err);
  }
}

export async function DELETE(req: Request) {
  const ctx = await requireVenueApi("manage_phone");
  if (!ctx.ok) return ctx.response;

  try {
    const { id } = (await req.json()) as { id?: string };
    if (!id)
      return apiError(400, "id_mancante", "Serve la chiave da revocare.");

    await revocaApiToken(ctx.venueId, id);
    await recordAudit(
      auditActor(ctx, req),
      "venue.centralino_chiave_revocata",
      "venue",
      ctx.venueId,
      {
        chiave: id,
      },
    );
    return NextResponse.json({ ok: true });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
