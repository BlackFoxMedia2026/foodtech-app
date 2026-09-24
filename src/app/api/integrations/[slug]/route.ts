import { NextResponse } from "next/server";
import { cookies, headers } from "next/headers";
import { z } from "zod";
import { apiError, apiErrorResponse, requireVenueApi } from "@/lib/api-auth";
import { can, type Ability } from "@/lib/abilities";
import { auditActor } from "@/server/audit";
import {
  aggiornaSegretoWebhook,
  attiva,
  chiediSincronizzazione,
  connettiConCampi,
  disattiva,
  disinstalla,
  iniziaOAuth,
  installa,
  opzioniConfigurazione,
  provaConnessione,
  riattiva,
  salvaCapacita,
  salvaConfigurazione,
  trovaInstallazione,
  voceObbligatoria,
  type Attore,
} from "@/server/integrations/installazioni";
import { origineDellaPiattaforma } from "@/server/integrations/sync";
import { dettaglioCliente } from "@/server/integrations/vista-cliente";
import { capacitaDaGruppi, provaPerIlCliente } from "@/server/integrations/cliente";
import { richiediAttivazione } from "@/server/integrations/richieste";
import { chiediAssistenza, revocaDelega } from "@/server/integrations/assistenza";
import { importaIniziale } from "@/server/integrations/importazione";
import { COOKIE_NONCE, DURATA_STATE_MS } from "@/server/integrations/oauth-state";

/**
 * Una integrazione del locale attivo: leggere, installare, configurare,
 * provare, attivare, spegnere, disinstallare.
 *
 * ## Un permesso per azione
 *
 * Le azioni sono tante e i poteri diversi (vedi `lib/abilities.ts`): chi può
 * configurare non per forza può disinstallare. Il corpo si legge **prima**
 * di chiedere il permesso solo per sapere quale permesso chiedere — nessuna
 * azione parte prima di `requireVenueApi`.
 *
 * Le rotte non contengono regole: chiamano `server/integrations/installazioni.ts`.
 * `venueId` viene sempre dal contesto, mai dal corpo.
 *
 * ## Solo la vista del cliente
 *
 * Questa è la rotta dell'esperienza cliente: legge `dettaglioCliente`, e la
 * prova risponde senza avvisi tecnici né riferimenti di correlazione. La
 * vista interna (adattatore, registro, certificazione) sta sotto
 * /admin/integrazioni e `/api/integrations/<slug>/certificazione`, solo
 * Super Admin.
 */


export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: { slug: string } }) {
  const ctx = await requireVenueApi("integration:view");
  if (!ctx.ok) return ctx.response;
  const d = await dettaglioCliente(
    ctx.venueId,
    params.slug,
    can(ctx.role, "integration:configure") ? { aggiornamentiDa: { origine: origineDellaPiattaforma(headers()) } } : {},
  );
  if (!d) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json(d);
}

const Azione = z.discriminatedUnion("azione", [
  z.object({ azione: z.literal("installa") }),
  z.object({ azione: z.literal("autorizza") }),
  z.object({ azione: z.literal("connetti"), campi: z.record(z.string().max(2000)) }),
  z.object({ azione: z.literal("opzioni") }),
  z.object({
    azione: z.literal("configura"),
    configurazione: z.record(z.string().max(200)),
    etichette: z.record(z.string().max(200)).optional(),
  }),
  z.object({ azione: z.literal("capacita"), capacita: z.array(z.string().max(40)).max(30) }),
  z.object({ azione: z.literal("prova") }),
  z.object({ azione: z.literal("attiva") }),
  z.object({ azione: z.literal("disattiva") }),
  z.object({ azione: z.literal("riattiva") }),
  z.object({ azione: z.literal("sincronizza") }),
  z.object({ azione: z.literal("segreto_webhook"), segreto: z.string().max(500) }),
  /* «Richiedi attivazione» / «Avvisami»: una richiesta interna a Foodtech. */
  z.object({ azione: z.literal("richiedi") }),
  /* Gli interruttori del cliente («Tavoli», «Menu e prodotti»…), tradotti in capacità dal server. */
  z.object({ azione: z.literal("gruppi"), gruppi: z.array(z.string().max(40)).max(20) }),
  /* L'importazione iniziale: copiare in Foodtech sala e menu della cassa. */
  z.object({ azione: z.literal("importa"), tavoli: z.boolean(), menu: z.boolean() }),
  /* «Chiedi aiuto a Foodtech», con o senza la delega a configurare (`assistenza.ts`). */
  z.object({ azione: z.literal("assistenza"), nota: z.string().max(1000).nullable().optional(), delega: z.boolean() }),
  z.object({ azione: z.literal("revoca_delega") }),
]);

const PERMESSO: Record<z.infer<typeof Azione>["azione"], Ability> = {
  installa: "integration:install",
  autorizza: "integration:install",
  connetti: "integration:install",
  opzioni: "integration:configure",
  configura: "integration:configure",
  capacita: "integration:configure",
  prova: "integration:configure",
  attiva: "integration:configure",
  riattiva: "integration:configure",
  sincronizza: "integration:configure",
  disattiva: "integration:disconnect",
  segreto_webhook: "integration:configure",
  richiedi: "integration:install",
  gruppi: "integration:configure",
  importa: "integration:configure",
  // Autorizzare Foodtech a configurare è un potere di chi può collegare.
  assistenza: "integration:install",
  revoca_delega: "integration:install",
};

export async function POST(req: Request, { params }: { params: { slug: string } }) {
  let corpo: z.infer<typeof Azione>;
  try {
    corpo = Azione.parse(await req.json());
  } catch (err) {
    return apiErrorResponse(err);
  }

  const ctx = await requireVenueApi(PERMESSO[corpo.azione]);
  if (!ctx.ok) return ctx.response;

  const attore: Attore = {
    venueId: ctx.venueId,
    orgId: ctx.orgId,
    userId: ctx.userId,
    audit: auditActor(ctx, req),
  };
  const origine = origineDellaPiattaforma(headers());
  const slug = params.slug;

  try {
    switch (corpo.azione) {
      case "installa":
        await installa(attore, slug);
        return NextResponse.json({ ok: true });

      case "autorizza": {
        const { url, nonce } = await iniziaOAuth(attore, slug, origine);
        /* Il nonce resta nel browser che ha chiesto l'accesso: al ritorno
           lo `state` deve trovarlo qui. `httpOnly`: nessuno script lo legge. */
        cookies().set(COOKIE_NONCE, nonce, {
          httpOnly: true,
          secure: origine.startsWith("https"),
          sameSite: "lax",
          path: "/api/integrations/oauth",
          maxAge: Math.floor(DURATA_STATE_MS / 1000),
        });
        return NextResponse.json({ url });
      }

      case "connetti":
        await connettiConCampi(attore, slug, corpo.campi);
        return NextResponse.json({ ok: true });

      case "opzioni":
        return NextResponse.json({ opzioni: await opzioniConfigurazione(attore, slug, origine) });

      case "configura":
        await salvaConfigurazione(attore, slug, {
          configurazione: corpo.configurazione,
          etichette: corpo.etichette,
        });
        return NextResponse.json({ ok: true });

      case "capacita":
        await salvaCapacita(attore, slug, corpo.capacita, origine);
        return NextResponse.json({ ok: true });

      case "prova":
        return NextResponse.json(provaPerIlCliente(await provaConnessione(attore, slug, origine)));

      case "attiva":
        await attiva(attore, slug, origine);
        return NextResponse.json({ ok: true });

      case "disattiva":
        await disattiva(attore, slug);
        return NextResponse.json({ ok: true });

      case "riattiva":
        await riattiva(attore, slug, origine);
        return NextResponse.json({ ok: true });

      case "segreto_webhook":
        await aggiornaSegretoWebhook(attore, slug, corpo.segreto);
        return NextResponse.json({ ok: true });

      case "richiedi":
        return NextResponse.json(await richiediAttivazione(attore, slug));

      case "gruppi": {
        const voce = voceObbligatoria(slug);
        const attuali = (await trovaInstallazione(ctx.venueId, slug))?.enabledCapabilities ?? [];
        const capacita = capacitaDaGruppi(voce.capacita, corpo.gruppi, attuali);
        if (capacita.length === 0) return apiError(422, "validation_failed", "Scegli almeno una cosa da sincronizzare.");
        await salvaCapacita(attore, slug, capacita, origine);
        return NextResponse.json({ ok: true });
      }

      case "importa":
        return NextResponse.json(await importaIniziale(attore, slug, { tavoli: corpo.tavoli, menu: corpo.menu }));

      case "assistenza": {
        const r = await chiediAssistenza(attore, slug, { nota: corpo.nota, delega: corpo.delega });
        return NextResponse.json({ ok: true, delegaFinoAl: r.delegatedUntil?.toISOString() ?? null });
      }

      case "revoca_delega":
        return NextResponse.json(await revocaDelega(attore, slug));

      case "sincronizza": {
        const esito = await chiediSincronizzazione(attore, slug);
        return NextResponse.json({ ok: true, giaInCoda: esito.duplicate });
      }
    }
  } catch (err) {
    return apiErrorResponse(err);
  }
}

/** Disinstallare: `integration:disconnect`. */
export async function DELETE(req: Request, { params }: { params: { slug: string } }) {
  const ctx = await requireVenueApi("integration:disconnect");
  if (!ctx.ok) return ctx.response;
  try {
    await disinstalla(
      { venueId: ctx.venueId, orgId: ctx.orgId, userId: ctx.userId, audit: auditActor(ctx, req) },
      params.slug,
      origineDellaPiattaforma(headers()),
    );
    return NextResponse.json({ ok: true });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
