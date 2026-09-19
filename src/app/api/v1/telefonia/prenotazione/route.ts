import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, apiErrorResponse, requireApiToken } from "@/lib/api-auth";
import { LicenzaError, richiediFunzioneCentralino } from "@/server/licenza-centralino";
import { registraPrenotazioneTelefonica } from "@/server/prenotazione-telefonica";

/**
 * `POST /api/v1/telefonia/prenotazione`
 *
 * Il risponditore del centralino ha raccolto una prenotazione a tasti, e da
 * qui entra in Tavolo. Compare in Prenotazioni **da confermare**: l'ha presa
 * una macchina, e chi decide è il locale.
 *
 * Chiede l'ambito `telefonia:write` e la funzione `prenotazioni` — che è una
 * cosa che si compra separatamente dal riconoscimento del chiamante, e un
 * locale che ha comprato solo «chi sta chiamando» non deve trovarsi
 * prenotazioni create da un risponditore che non ha.
 */

export const dynamic = "force-dynamic";

const Corpo = z.object({
  /** L'identificativo della prenotazione **nel centralino**: è l'idempotenza. */
  id: z.string().min(1).max(120),
  /** La chiamata da cui nasce, per collegarle nello storico. */
  chiamata: z.string().max(120).nullish(),
  phone: z.string().max(40).nullish(),
  persone: z.coerce.number().int().min(1).max(50),
  /** Giorno e ora richiesti, in ISO con il fuso. */
  quando: z.string().datetime({ offset: true }),
  nota: z.string().max(500).nullish(),
  /**
   * Il nome su cui mettere il tavolo.
   *
   * Facoltativo, e resta facoltativo: il risponditore a tasti non può
   * chiederlo, e pretenderlo qui spegnerebbe le prenotazioni di chi non ha la
   * voce. Quando c'è, il tavolo nasce intestato a una persona invece che a «Da
   * richiamare».
   */
  nome: z.string().trim().max(120).nullish(),
});

export async function POST(req: Request) {
  const ctx = await requireApiToken(req, "telefonia:write");
  if (!ctx.ok) return ctx.response;

  try {
    await richiediFunzioneCentralino(ctx.venueId, "prenotazioni");

    const corpo = Corpo.parse(await req.json());
    const quando = new Date(corpo.quando);
    if (Number.isNaN(quando.getTime())) {
      return apiError(400, "quando_non_valido", "La data richiesta non è una data.");
    }

    const esito = await registraPrenotazioneTelefonica(ctx.venueId, {
      idCentralino: corpo.id,
      idChiamata: corpo.chiamata ?? null,
      phone: corpo.phone ?? null,
      persone: corpo.persone,
      quando,
      nota: corpo.nota ?? null,
      nome: corpo.nome ?? null,
    });

    /* Gli avvertimenti tornano al centralino, e servono: il risponditore può
       dire «le confermiamo noi richiamando» invece di «prenotato», che sarebbe
       una promessa che il locale non ha fatto. Non sono un errore — la
       prenotazione c'è — quindi la risposta è 201, non 4xx. */
    return NextResponse.json(esito, { status: esito.giaEsistente ? 200 : 201 });
  } catch (err) {
    if (err instanceof LicenzaError) {
      return apiError(
        403,
        "prenotazioni_non_attive",
        "Le prenotazioni al telefono non sono attive su questo locale.",
      );
    }
    return apiErrorResponse(err);
  }
}
