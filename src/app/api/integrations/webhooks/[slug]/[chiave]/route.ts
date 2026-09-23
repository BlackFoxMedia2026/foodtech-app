import { NextResponse } from "next/server";
import { logErrore } from "@/lib/observability";
import { riceviWebhook } from "@/server/integrations/webhooks";

/**
 * Gli eventi dei fornitori: `/api/integrations/webhooks/<fornitore>/<chiave>`.
 *
 * Un indirizzo per fornitore **e per installazione**: la chiave identifica
 * il locale senza che il fornitore debba dircelo nel corpo, e un indirizzo
 * trapelato vale per un solo locale, e smette di valere alla
 * disinstallazione.
 *
 * Questa rotta non ha logica: legge il corpo **grezzo** (le firme coprono i
 * byte esatti) e lo passa alla pipeline (`server/integrations/webhooks.ts`),
 * che autentica, deduplica, traduce e lavora.
 */

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: { slug: string; chiave: string } }) {
  try {
    const esito = await riceviWebhook({
      slug: params.slug,
      chiave: params.chiave,
      corpo: await req.text(),
      intestazioni: req.headers,
    });
    return NextResponse.json(esito.corpo, { status: esito.status });
  } catch (err) {
    /* L'unico 500: non siamo riusciti nemmeno a salvare l'evento. Qui il
       ritentativo del fornitore serve davvero. */
    logErrore("integrazione.webhook_non_salvato", err, { slug: params.slug });
    return NextResponse.json({ error: "non_salvato" }, { status: 500 });
  }
}
