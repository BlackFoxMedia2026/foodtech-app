import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, apiErrorResponse } from "@/lib/api-auth";
import { superAdminCorrente } from "@/lib/super-admin";
import { riattivaInvii, sospendiInvii } from "@/server/dem/abbonamento";
import { db } from "@/lib/db";
import { avvisa, avvisoInviiSospesi } from "@/server/dem/avvisi";
import { logEvento } from "@/lib/observability";

const Corpo = z.object({ azione: z.enum(["sospendi", "riattiva"]) });

/**
 * Ferma o riattiva gli invii di un locale.
 *
 * L'autorizzazione non passa da `requireVenueApi`: quella verifica che tu
 * appartenga al locale di cui stai parlando, ed è esattamente quello che qui
 * **non** vale — un amministratore di piattaforma agisce su locali che non
 * sono suoi. Quindi il controllo è l'altro, e l'unico: sei nell'elenco?
 *
 * Chi non lo è riceve «non esiste» e non «non puoi»: l'esistenza di questo
 * indirizzo non è un'informazione da regalare.
 */
export async function POST(req: Request, { params }: { params: { venueId: string } }) {
  const admin = await superAdminCorrente();
  if (!admin.ok) return apiError(404, "not_found", "Questo indirizzo non esiste.");

  try {
    const { azione } = Corpo.parse(await req.json());
    const venue = await db.venue.findUnique({ where: { id: params.venueId }, select: { id: true, orgId: true } });
    if (!venue) return apiError(404, "not_found", "Locale non trovato.");

    if (azione === "sospendi") {
      const motivo = "Invii sospesi da Foodtech a tutela della reputazione del dominio.";
      await sospendiInvii(params.venueId, motivo);
      // Il cliente lo deve sapere da noi, e prima di accorgersene da solo
      // vedendo che una campagna non parte.
      await avvisa(params.venueId, avvisoInviiSospesi(
        "Abbiamo temporaneamente sospeso l'invio per proteggere la reputazione del tuo dominio. " +
          "Le campagne, i contatti e le statistiche restano dove sono: ti ricontattiamo noi.",
      ));
    } else {
      await riattivaInvii(params.venueId);
    }

    /*
      Il registro delle azioni vuole un'organizzazione e un attore che
      appartiene a un locale — è fatto per le azioni **dentro** un ristorante.
      Un amministratore di piattaforma non ha nessuna delle due cose, quindi
      qui l'azione si registra nei log con chi l'ha fatta e su chi: è
      cercabile, ed è la stessa informazione.
    */
    logEvento(azione === "sospendi" ? "dem.piattaforma.invii_sospesi" : "dem.piattaforma.invii_riattivati", {
      venueId: params.venueId,
      da: admin.email,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
