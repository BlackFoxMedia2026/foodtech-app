import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { z } from "zod";
import { apiError, apiErrorResponse, requireVenueApi } from "@/lib/api-auth";
import { superAdminCorrente } from "@/lib/super-admin";
import { auditActor } from "@/server/audit";
import { origineDellaPiattaforma } from "@/server/integrations/sync";
import { impostaAccessoBeta, impostaFase } from "@/server/integrations/certificazione/accesso";
import { revocaSospensione, sospendi } from "@/server/integrations/installazioni";
import {
  anteprimaOrdine,
  anteprimaSecondaComanda,
  confermaManuale,
  creaOrdineDiProva,
  leggi,
  leggiConto,
  pagamentoDiProva,
  prodottiDiProva,
  provaConnessioneReale,
  RISORSE_LETTURA,
  secondaComanda,
  statoConsole,
  tavoloDiProva,
  traccia,
  type Chiamante,
  type Lettura,
} from "@/server/integrations/certificazione/console";
import { FASI_RILASCIO, LIVELLI } from "@/server/integrations/certificazione/livelli";

/**
 * La console di certificazione di un'integrazione, sul locale attivo.
 *
 * **Solo Super Admin.** A tutti gli altri — ristoratori compresi, anche con
 * tutti i permessi del locale — questo indirizzo risponde 404: l'esistenza
 * della console non è un'informazione da dare.
 *
 * Due controlli, entrambi obbligatori: la sessione appartiene al locale
 * attivo (`requireVenueApi`), e l'email è nell'elenco dei Super Admin.
 */

export const dynamic = "force-dynamic";

async function chiamante(req: Request) {
  const admin = await superAdminCorrente();
  if (!admin.ok) return { ok: false as const, risposta: apiError(404, "not_found", "Questo indirizzo non esiste.") };
  const ctx = await requireVenueApi("integration:view");
  if (!ctx.ok) return { ok: false as const, risposta: ctx.response };
  const audit = auditActor(ctx, req);
  const c: Chiamante = { venueId: ctx.venueId, email: admin.email, audit, origine: origineDellaPiattaforma(headers()) };
  return { ok: true as const, c, attore: { venueId: ctx.venueId, orgId: ctx.orgId, userId: ctx.userId, audit } };
}

export async function GET(req: Request, { params }: { params: { slug: string } }) {
  const x = await chiamante(req);
  if (!x.ok) return x.risposta;
  try {
    return NextResponse.json(await statoConsole(x.c, params.slug));
  } catch (err) {
    return apiErrorResponse(err);
  }
}

const Righe = z.array(z.object({ externalId: z.string().min(1).max(200), quantita: z.number().int().min(1).max(20) })).min(1).max(10);
const Scelta = z.object({ tavoloExternalId: z.string().max(200).nullable(), righe: Righe });
const Conferma = z.object({ frase: z.string().max(100), impronta: z.string().max(64) });

const Azione = z.discriminatedUnion("azione", [
  z.object({ azione: z.literal("prova") }),
  z.object({ azione: z.literal("leggi"), risorsa: z.enum(RISORSE_LETTURA as [Lettura, ...Lettura[]]) }),
  z.object({ azione: z.literal("tavolo"), externalId: z.string().min(1).max(200) }),
  z.object({ azione: z.literal("prodotti") }),
  z.object({ azione: z.literal("anteprima"), scelta: Scelta }),
  z.object({ azione: z.literal("ordine"), scelta: Scelta, conferma: Conferma }),
  z.object({ azione: z.literal("anteprima_seconda"), parentRunId: z.string().max(40), righe: Righe }),
  z.object({ azione: z.literal("seconda"), parentRunId: z.string().max(40), righe: Righe, conferma: Conferma }),
  z.object({ azione: z.literal("traccia"), runId: z.string().max(40) }),
  z.object({ azione: z.literal("conto"), parentRunId: z.string().max(40) }),
  z.object({
    azione: z.literal("pagamento"),
    parentRunId: z.string().max(40),
    importoCents: z.number().int(),
    tenderExternalId: z.string().min(1).max(200),
    frase: z.string().max(100),
  }),
  z.object({
    azione: z.literal("conferma"),
    runId: z.string().max(40),
    capacita: z.string().max(40),
    livello: z.enum(LIVELLI),
    risposta: z.enum(["SI", "NO"]),
    note: z.string().max(2000).nullable().optional(),
    riferimentoProva: z.string().max(500).nullable().optional(),
  }),
  z.object({ azione: z.literal("beta"), abilitato: z.boolean(), operazioniFiscali: z.boolean().optional(), note: z.string().max(500).nullable().optional() }),
  z.object({ azione: z.literal("fase"), fase: z.enum(FASI_RILASCIO), note: z.string().max(500).nullable().optional() }),
  /* Il freno d'emergenza: spegne e segna, non cancella niente. Non è la revoca dell'accesso beta. */
  z.object({ azione: z.literal("sospendi"), motivo: z.string().max(500).nullable().optional() }),
  z.object({ azione: z.literal("revoca_sospensione") }),
]);

export async function POST(req: Request, { params }: { params: { slug: string } }) {
  const x = await chiamante(req);
  if (!x.ok) return x.risposta;
  const { c, attore } = x;
  const slug = params.slug;
  try {
    const corpo = Azione.parse(await req.json());
    switch (corpo.azione) {
      case "prova":
        return NextResponse.json(await provaConnessioneReale(c, slug));
      case "leggi":
        return NextResponse.json(await leggi(c, slug, corpo.risorsa));
      case "tavolo":
        return NextResponse.json(await tavoloDiProva(c, slug, corpo.externalId));
      case "prodotti":
        return NextResponse.json({ prodotti: await prodottiDiProva(c, slug) });
      case "anteprima":
        return NextResponse.json(await anteprimaOrdine(c, slug, corpo.scelta));
      case "ordine":
        return NextResponse.json(await creaOrdineDiProva(c, slug, corpo.scelta, corpo.conferma));
      case "anteprima_seconda":
        return NextResponse.json(await anteprimaSecondaComanda(c, slug, corpo.parentRunId, { righe: corpo.righe }));
      case "seconda":
        return NextResponse.json(await secondaComanda(c, slug, corpo.parentRunId, { righe: corpo.righe }, corpo.conferma));
      case "traccia":
        return NextResponse.json(await traccia(c, slug, corpo.runId));
      case "conto":
        return NextResponse.json(await leggiConto(c, slug, corpo.parentRunId));
      case "pagamento":
        return NextResponse.json(
          await pagamentoDiProva(c, slug, corpo.parentRunId, { importoCents: corpo.importoCents, tenderExternalId: corpo.tenderExternalId }, { frase: corpo.frase }),
        );
      case "conferma":
        return NextResponse.json(await confermaManuale(c, slug, corpo));
      case "beta":
        return NextResponse.json(
          await impostaAccessoBeta({ venueId: c.venueId, slug, abilitato: corpo.abilitato, operazioniFiscali: corpo.operazioniFiscali, note: corpo.note, email: c.email, audit: c.audit }),
        );
      case "fase":
        return NextResponse.json(await impostaFase({ slug, fase: corpo.fase, note: corpo.note, email: c.email, audit: c.audit }));
      case "sospendi":
        await sospendi(attore, slug, { email: c.email, motivo: corpo.motivo ?? null });
        return NextResponse.json({ ok: true });
      case "revoca_sospensione":
        await revocaSospensione(attore, slug, { email: c.email });
        return NextResponse.json({ ok: true });
    }
  } catch (err) {
    return apiErrorResponse(err);
  }
}
