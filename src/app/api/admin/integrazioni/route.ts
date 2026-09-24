import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, apiErrorResponse } from "@/lib/api-auth";
import { superAdminCorrente } from "@/lib/super-admin";
import { db } from "@/lib/db";
import { logEvento } from "@/lib/observability";
import { impostaAccessoBeta, impostaFase, panoramicaCertificazione } from "@/server/integrations/certificazione/accesso";
import { FASI_RILASCIO } from "@/server/integrations/certificazione/livelli";
import { approvaRichiesta, archiviaRichiesta } from "@/server/integrations/richieste";

/**
 * Certificazione e rilascio delle integrazioni, per tutta la piattaforma.
 *
 * Come le altre rotte `/api/admin`, non passa da `requireVenueApi`: qui si
 * decide per locali di cui non si è membri (il cliente che fa da beta). Chi
 * non è Super Admin riceve 404.
 */

export const dynamic = "force-dynamic";

export async function GET() {
  const admin = await superAdminCorrente();
  if (!admin.ok) return apiError(404, "not_found", "Questo indirizzo non esiste.");
  try {
    return NextResponse.json({ fornitori: await panoramicaCertificazione() });
  } catch (err) {
    return apiErrorResponse(err);
  }
}

const Corpo = z.discriminatedUnion("azione", [
  z.object({ azione: z.literal("fase"), slug: z.string().max(60), fase: z.enum(FASI_RILASCIO), note: z.string().max(500).nullable().optional() }),
  z.object({
    azione: z.literal("beta"),
    slug: z.string().max(60),
    /** L'id o lo slug del locale. */
    locale: z.string().min(1).max(200),
    abilitato: z.boolean(),
    operazioniFiscali: z.boolean().optional(),
    note: z.string().max(500).nullable().optional(),
  }),
  /* Le richieste dei ristoranti («Richiedi attivazione», «Avvisami»). */
  z.object({ azione: z.literal("approva_richiesta"), id: z.string().min(1).max(40) }),
  z.object({ azione: z.literal("archivia_richiesta"), id: z.string().min(1).max(40) }),
]);

export async function POST(req: Request) {
  const admin = await superAdminCorrente();
  if (!admin.ok) return apiError(404, "not_found", "Questo indirizzo non esiste.");
  try {
    const corpo = Corpo.parse(await req.json());
    if (corpo.azione === "approva_richiesta" || corpo.azione === "archivia_richiesta") {
      const r = await db.integrationAccessRequest.findUnique({ where: { id: corpo.id }, include: { venue: { select: { orgId: true } } } });
      if (!r) return apiError(404, "not_found", "Richiesta non trovata.");
      const utente = await db.user.findFirst({ where: { email: { equals: admin.email, mode: "insensitive" } }, select: { id: true } });
      const audit = utente ? { userId: utente.id, email: admin.email, orgId: r.venue.orgId, venueId: r.venueId } : undefined;
      if (corpo.azione === "approva_richiesta") await approvaRichiesta(corpo.id, admin.email, audit);
      else await archiviaRichiesta(corpo.id, admin.email, audit);
      logEvento("integrazione.richiesta_chiusa", { id: corpo.id, esito: corpo.azione, da: admin.email });
      return NextResponse.json({ ok: true });
    }
    if (corpo.azione === "fase") {
      const r = await impostaFase({ slug: corpo.slug, fase: corpo.fase, note: corpo.note, email: admin.email });
      logEvento("integrazione.rilascio_cambiato", { slug: corpo.slug, fase: corpo.fase, da: admin.email });
      return NextResponse.json(r);
    }
    const venue = await db.venue.findFirst({
      where: { OR: [{ id: corpo.locale }, { slug: corpo.locale }] },
      select: { id: true, orgId: true },
    });
    if (!venue) return apiError(404, "not_found", "Locale non trovato.");
    const utente = await db.user.findFirst({ where: { email: { equals: admin.email, mode: "insensitive" } }, select: { id: true } });
    const r = await impostaAccessoBeta({
      venueId: venue.id,
      slug: corpo.slug,
      abilitato: corpo.abilitato,
      operazioniFiscali: corpo.operazioniFiscali,
      note: corpo.note,
      email: admin.email,
      audit: utente ? { userId: utente.id, email: admin.email, orgId: venue.orgId, venueId: venue.id } : undefined,
    });
    return NextResponse.json(r);
  } catch (err) {
    return apiErrorResponse(err);
  }
}
