import { db } from "@/lib/db";
import { recordAudit, type AuditActor } from "@/server/audit";
import { voceDi } from "../registry";
import type { VoceCatalogo } from "../registry";
import { ErroreCertificazione, statoProvider } from "./evidenze";
import { ETICHETTA_RILASCIO, FASI_RILASCIO, faseAmmessa, richiedeAccessoBeta, type FaseRilascio } from "./livelli";

/**
 * **Chi può installare un'integrazione non ancora aperta a tutti.**
 *
 * Due informazioni separate, entrambe decise da Foodtech:
 *
 * - la **fase di rilascio** del fornitore (INTERNAL, PRIVATE_BETA,
 *   PUBLIC_BETA, GENERAL_AVAILABILITY), una riga di `IntegrationRollout`.
 *   Senza riga vale il predefinito: GENERAL_AVAILABILITY per le voci già
 *   disponibili, INTERNAL per le anteprime;
 * - l'**accesso beta** di un singolo locale (`IntegrationBetaAccess`).
 *
 * Nelle prime due fasi installa solo chi ha l'accesso beta. Lo stato di
 * implementazione (IN_DEVELOPMENT / IMPLEMENTED del catalogo) resta un'altra
 * cosa ancora: dice se il codice c'è, non a chi è concesso.
 */

export function fasePredefinita(voce: Pick<VoceCatalogo, "disponibilita">): FaseRilascio {
  return voce.disponibilita === "AVAILABLE" ? "GENERAL_AVAILABILITY" : "INTERNAL";
}

export async function faseDi(slug: string): Promise<FaseRilascio> {
  const voce = voceDi(slug);
  const riga = await db.integrationRollout.findUnique({ where: { integrationSlug: slug }, select: { stage: true } });
  const fase = riga?.stage as FaseRilascio | undefined;
  return fase && FASI_RILASCIO.includes(fase) ? fase : voce ? fasePredefinita(voce) : "INTERNAL";
}

export async function accessoBeta(venueId: string, slug: string) {
  return db.integrationBetaAccess.findUnique({ where: { venueId_integrationSlug: { venueId, integrationSlug: slug } } });
}

/**
 * Il motivo per cui **questo locale** non può installare la voce per via del
 * rilascio, o `null`. I motivi tecnici (adattatore, variabili, cifratura)
 * restano in `motivoNonInstallabile`.
 */
export async function motivoRilascio(voce: VoceCatalogo, venueId: string): Promise<{ codice: string; messaggio: string } | null> {
  if (voce.nativa) return null;
  const fase = await faseDi(voce.slug);
  if (!richiedeAccessoBeta(fase)) return null;
  const a = await accessoBeta(venueId, voce.slug);
  if (a?.enabled) return null;
  return {
    codice: "beta_required",
    messaggio: "Disponibilità su richiesta: Foodtech abilita questa integrazione locale per locale, durante le prove con le prime casse.",
  };
}

/** Lo stesso controllo per tutto il catalogo, con due letture sole (la pagina «Integrazioni»). */
export async function motiviRilascioPerLocale(venueId: string, voci: readonly VoceCatalogo[]): Promise<Map<string, string>> {
  const [fasi, accessi] = await Promise.all([
    db.integrationRollout.findMany({ select: { integrationSlug: true, stage: true } }),
    db.integrationBetaAccess.findMany({ where: { venueId, enabled: true }, select: { integrationSlug: true } }),
  ]);
  const fasePer = new Map(fasi.map((f) => [f.integrationSlug, f.stage as FaseRilascio]));
  const conAccesso = new Set(accessi.map((a) => a.integrationSlug));
  const out = new Map<string, string>();
  for (const v of voci) {
    if (v.nativa) continue;
    const scritta = fasePer.get(v.slug);
    const fase = scritta && FASI_RILASCIO.includes(scritta) ? scritta : fasePredefinita(v);
    if (richiedeAccessoBeta(fase) && !conAccesso.has(v.slug)) {
      out.set(v.slug, "Disponibilità su richiesta: Foodtech abilita questa integrazione locale per locale, durante le prove con le prime casse.");
    }
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/*  Solo Super Admin                                                          */
/* -------------------------------------------------------------------------- */

export async function impostaAccessoBeta(input: {
  venueId: string;
  slug: string;
  abilitato: boolean;
  operazioniFiscali?: boolean;
  note?: string | null;
  email: string;
  audit?: AuditActor;
}) {
  if (!voceDi(input.slug)) throw new ErroreCertificazione("not_found", "Integrazione sconosciuta.", 404);
  const venue = await db.venue.findUnique({ where: { id: input.venueId }, select: { id: true } });
  if (!venue) throw new ErroreCertificazione("not_found", "Locale non trovato.", 404);
  const riga = await db.integrationBetaAccess.upsert({
    where: { venueId_integrationSlug: { venueId: input.venueId, integrationSlug: input.slug } },
    create: {
      venueId: input.venueId,
      integrationSlug: input.slug,
      enabled: input.abilitato,
      fiscalTestsAuthorized: input.abilitato && !!input.operazioniFiscali,
      enabledByEmail: input.email,
      updatedByEmail: input.email,
      note: input.note ?? null,
    },
    update: {
      enabled: input.abilitato,
      // Revocare l'accesso revoca anche le operazioni fiscali.
      fiscalTestsAuthorized: input.abilitato && !!input.operazioniFiscali,
      updatedByEmail: input.email,
      ...(input.abilitato ? { enabledByEmail: input.email, enabledAt: new Date() } : {}),
      ...(input.note !== undefined ? { note: input.note } : {}),
    },
  });
  // La richiesta del locale («Richiedi attivazione»), se c'era, è esaudita.
  if (riga.enabled) {
    await db.integrationAccessRequest.updateMany({
      where: { venueId: input.venueId, integrationSlug: input.slug, status: "PENDING", kind: "ACCESS" },
      data: { status: "APPROVED", resolvedAt: new Date(), resolvedByEmail: input.email },
    });
  }
  await recordAudit(input.audit, "integration.beta_access", "integration", input.slug, {
    venueId: input.venueId,
    abilitato: riga.enabled,
    operazioniFiscali: riga.fiscalTestsAuthorized,
    da: input.email,
  });
  return riga;
}

export async function impostaFase(input: { slug: string; fase: FaseRilascio; email: string; note?: string | null; audit?: AuditActor }) {
  if (!voceDi(input.slug)) throw new ErroreCertificazione("not_found", "Integrazione sconosciuta.", 404);
  if (!FASI_RILASCIO.includes(input.fase)) throw new ErroreCertificazione("fase_sconosciuta", "Fase di rilascio sconosciuta.", 400);
  const { stato } = await statoProvider(input.slug);
  const ammessa = faseAmmessa(input.fase, stato);
  if (!ammessa.ok) throw new ErroreCertificazione("certificazione_insufficiente", ammessa.motivo);
  const prima = await faseDi(input.slug);
  const riga = await db.integrationRollout.upsert({
    where: { integrationSlug: input.slug },
    create: { integrationSlug: input.slug, stage: input.fase, updatedByEmail: input.email, note: input.note ?? null },
    update: { stage: input.fase, updatedByEmail: input.email, note: input.note ?? null },
  });
  await recordAudit(input.audit, "integration.rollout", "integration", input.slug, {
    da: ETICHETTA_RILASCIO[prima],
    a: ETICHETTA_RILASCIO[input.fase],
    operatore: input.email,
  });
  return riga;
}

/* -------------------------------------------------------------------------- */
/*  Panoramica del pannello di piattaforma                                    */
/* -------------------------------------------------------------------------- */

/** Ogni fornitore con un adattatore: implementazione e certificazione **separate**, rilascio, accessi beta. */
export async function panoramicaCertificazione() {
  const { slugConAdattatore } = await import("../adapters");
  const slugs = slugConAdattatore();
  const accessi = await db.integrationBetaAccess.findMany({
    where: { integrationSlug: { in: slugs } },
    orderBy: { enabledAt: "desc" },
    include: { venue: { select: { name: true, slug: true } } },
  });
  return Promise.all(
    slugs.map(async (slug) => {
      const voce = voceDi(slug);
      const [fase, stato] = await Promise.all([faseDi(slug), statoProvider(slug)]);
      return {
        slug,
        nome: voce?.nome ?? slug,
        implementazione: voce?.implementazione ?? null,
        certificazione: stato.stato,
        inviaComanda: stato.inviaComanda,
        fase,
        matrice: stato.righe.map((r) => ({ capacita: r.capacita.chiave, etichetta: r.capacita.etichetta, celle: r.celle })),
        accessiBeta: accessi
          .filter((a) => a.integrationSlug === slug)
          .map((a) => ({
            venueId: a.venueId,
            locale: a.venue.name,
            slugLocale: a.venue.slug,
            abilitato: a.enabled,
            operazioniFiscali: a.fiscalTestsAuthorized,
            da: a.enabledByEmail,
            il: a.enabledAt,
            aggiornatoDa: a.updatedByEmail,
          })),
      };
    }),
  );
}
