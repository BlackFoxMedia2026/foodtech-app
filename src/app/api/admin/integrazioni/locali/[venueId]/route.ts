import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { z } from "zod";
import { apiError, apiErrorResponse } from "@/lib/api-auth";
import { superAdminCorrente } from "@/lib/super-admin";
import { logEvento } from "@/lib/observability";
import { origineDellaPiattaforma } from "@/server/integrations/sync";
import { schedaLocaleAdmin } from "@/server/integrations/vista-assistenza";
import { attoreAdmin, eseguiAzioneAdmin } from "@/server/integrations/azioni-admin";
import { chiudiAssistenza, creaConsegna, revocaConsegna } from "@/server/integrations/assistenza";
import { impostaAccessoBeta } from "@/server/integrations/certificazione/accesso";

/**
 * **L'assistenza Foodtech sulle integrazioni di un ristorante.** Solo Super
 * Admin: a tutti gli altri «non esiste».
 *
 * Il locale viene dall'indirizzo, non dal corpo e non dal locale attivo
 * dell'amministratore: è il ristorante che si sta aiutando. Le regole su
 * che cosa si può fare senza delega del cliente stanno in
 * `server/integrations/azioni-admin.ts`.
 */

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: { venueId: string } }) {
  const admin = await superAdminCorrente();
  if (!admin.ok) return apiError(404, "not_found", "Questo indirizzo non esiste.");
  const scheda = await schedaLocaleAdmin(params.venueId);
  if (!scheda) return apiError(404, "not_found", "Locale non trovato.");
  return NextResponse.json(scheda);
}

const Slug = z.string().min(1).max(60);

const Corpo = z.discriminatedUnion("azione", [
  z.object({ azione: z.literal("prova"), slug: Slug }),
  z.object({ azione: z.literal("installa"), slug: Slug }),
  z.object({ azione: z.literal("opzioni"), slug: Slug }),
  z.object({
    azione: z.literal("configura"),
    slug: Slug,
    configurazione: z.record(z.string().max(200)),
    etichette: z.record(z.string().max(200)).optional(),
  }),
  z.object({ azione: z.literal("gruppi"), slug: Slug, gruppi: z.array(z.string().max(40)).max(20) }),
  z.object({ azione: z.literal("attiva"), slug: Slug }),
  z.object({ azione: z.literal("sincronizza"), slug: Slug }),
  z.object({ azione: z.literal("riattiva"), slug: Slug }),
  z.object({ azione: z.literal("disattiva"), slug: Slug }),
  z.object({ azione: z.literal("beta"), slug: Slug, abilitato: z.boolean() }),
  z.object({ azione: z.literal("consegna"), slug: Slug }),
  z.object({ azione: z.literal("revoca_consegna"), slug: Slug, id: z.string().min(1).max(40) }),
  z.object({ azione: z.literal("chiudi_assistenza"), slug: Slug }),
]);

export async function POST(req: Request, { params }: { params: { venueId: string } }) {
  const admin = await superAdminCorrente();
  if (!admin.ok) return apiError(404, "not_found", "Questo indirizzo non esiste.");
  try {
    const corpo = Corpo.parse(await req.json());
    const attore = await attoreAdmin(params.venueId, admin.email);
    const origine = origineDellaPiattaforma(headers());
    logEvento("integrazione.azione_admin", { azione: corpo.azione, slug: corpo.slug, venue: attore.venueId, da: admin.email });

    switch (corpo.azione) {
      case "beta":
        await impostaAccessoBeta({ venueId: attore.venueId, slug: corpo.slug, abilitato: corpo.abilitato, email: admin.email, audit: attore.audit });
        return NextResponse.json({ ok: true });
      case "consegna":
        // Il codice in chiaro esce qui una volta sola, verso l'amministratore che lo manderà al cliente.
        return NextResponse.json(await creaConsegna({ venueId: attore.venueId, slug: corpo.slug, email: admin.email, origine, audit: attore.audit }));
      case "revoca_consegna":
        await revocaConsegna({ id: corpo.id, venueId: attore.venueId, email: admin.email, audit: attore.audit });
        return NextResponse.json({ ok: true });
      case "chiudi_assistenza":
        await chiudiAssistenza({ venueId: attore.venueId, slug: corpo.slug, email: admin.email, audit: attore.audit });
        return NextResponse.json({ ok: true });
      default:
        return NextResponse.json(await eseguiAzioneAdmin(attore, corpo, origine));
    }
  } catch (err) {
    return apiErrorResponse(err);
  }
}
