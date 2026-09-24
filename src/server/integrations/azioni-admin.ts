import { db } from "@/lib/db";
import { recordAudit, type AuditActor } from "@/server/audit";
import {
  attiva,
  chiediSincronizzazione,
  disattiva,
  installa,
  opzioniConfigurazione,
  provaConnessione,
  riattiva,
  salvaCapacita,
  salvaConfigurazione,
  trovaInstallazione,
  voceObbligatoria,
  type Attore,
} from "./installazioni";
import { capacitaDaGruppi } from "./cliente";
import { delegaAttiva } from "./assistenza";

/**
 * **Che cosa può fare un amministratore Foodtech sulle integrazioni di un
 * ristorante**, e con quale autorizzazione.
 *
 * | azione                                   | serve                          |
 * | ---------------------------------------- | ------------------------------ |
 * | guardare, verificare la connessione      | essere Super Admin             |
 * | abilitare la beta, preparare un collegamento di consegna, chiudere la richiesta | essere Super Admin |
 * | installare, leggere le opzioni, scegliere la sede, cosa sincronizzare, attivare, sincronizzare, mettere in pausa, riattivare | Super Admin **e** delega attiva del cliente |
 * | inserire o leggere credenziali           | mai: le scrive solo il cliente |
 * | disconnettere (cancellare le credenziali) | mai: è un gesto del cliente    |
 *
 * La verifica è ammessa senza delega perché non cambia niente presso il
 * fornitore né nella configurazione: è una lettura con le credenziali già
 * salvate, come quella che fa la sincronizzazione ogni sei ore, ed è
 * l'unico modo di rispondere a «funziona?». Ogni azione finisce nel registro
 * di audit con l'email dell'amministratore.
 *
 * Tutte le azioni passano dalle stesse funzioni di servizio del cliente
 * (`installazioni.ts`): stesse transizioni, stessa cifratura, stessi
 * controlli di beta e sospensione. Nessuna scorciatoia amministrativa.
 */

export const AZIONI_CON_DELEGA = new Set([
  "installa",
  "opzioni",
  "configura",
  "gruppi",
  "attiva",
  "sincronizza",
  "riattiva",
  "disattiva",
] as const);

export type AzioneAdmin =
  | { azione: "prova"; slug: string }
  | { azione: "installa"; slug: string }
  | { azione: "opzioni"; slug: string }
  | { azione: "configura"; slug: string; configurazione: Record<string, string>; etichette?: Record<string, string> }
  | { azione: "gruppi"; slug: string; gruppi: string[] }
  | { azione: "attiva"; slug: string }
  | { azione: "sincronizza"; slug: string }
  | { azione: "riattiva"; slug: string }
  | { azione: "disattiva"; slug: string };

function errore(code: string, message: string, httpStatus: number) {
  return Object.assign(new Error(message), { code, httpStatus });
}

/**
 * L'attore di un'azione amministrativa: il locale del cliente, l'utente
 * Foodtech dell'amministratore. Serve un utente vero, non solo un'email in
 * `SUPER_ADMIN_EMAILS`: il registro di audit e `installedById` puntano a
 * una persona.
 */
export async function attoreAdmin(venueId: string, email: string): Promise<Attore & { audit: AuditActor }> {
  const [venue, utente] = await Promise.all([
    db.venue.findUnique({ where: { id: venueId }, select: { id: true, orgId: true } }),
    db.user.findFirst({ where: { email: { equals: email, mode: "insensitive" } }, select: { id: true } }),
  ]);
  if (!venue) throw errore("not_found", "Locale non trovato.", 404);
  if (!utente) throw errore("forbidden", "Per agire su un locale serve un utente Foodtech con questa email.", 403);
  return {
    venueId: venue.id,
    orgId: venue.orgId,
    userId: utente.id,
    audit: { userId: utente.id, email, orgId: venue.orgId, venueId: venue.id },
  };
}

export async function eseguiAzioneAdmin(a: Attore & { audit: AuditActor }, corpo: AzioneAdmin, origine: string) {
  voceObbligatoria(corpo.slug);
  const conDelega = AZIONI_CON_DELEGA.has(corpo.azione as never);
  if (conDelega && !(await delegaAttiva(a.venueId, corpo.slug))) {
    throw errore(
      "delegation_required",
      "Il cliente non ha autorizzato Foodtech a configurare questa integrazione. Può farlo dalla pagina dell'integrazione, «Chiedi aiuto a Foodtech».",
      403,
    );
  }
  await recordAudit(a.audit, "integration.admin_action", "integration", corpo.slug, {
    azione: corpo.azione,
    venueId: a.venueId,
    delega: conDelega,
  });

  switch (corpo.azione) {
    case "prova":
      // L'esito intero: all'assistenza servono gli avvisi dell'adattatore e il riferimento di correlazione.
      return provaConnessione(a, corpo.slug, origine);
    case "installa":
      await installa(a, corpo.slug);
      return { ok: true };
    case "opzioni":
      return { opzioni: await opzioniConfigurazione(a, corpo.slug, origine) };
    case "configura":
      await salvaConfigurazione(a, corpo.slug, { configurazione: corpo.configurazione, etichette: corpo.etichette });
      return { ok: true };
    case "gruppi": {
      const voce = voceObbligatoria(corpo.slug);
      const attuali = (await trovaInstallazione(a.venueId, corpo.slug))?.enabledCapabilities ?? [];
      const capacita = capacitaDaGruppi(voce.capacita, corpo.gruppi, attuali);
      if (capacita.length === 0) throw errore("validation_failed", "Scegli almeno una cosa da sincronizzare.", 422);
      await salvaCapacita(a, corpo.slug, capacita, origine);
      return { ok: true };
    }
    case "attiva":
      await attiva(a, corpo.slug, origine);
      return { ok: true };
    case "sincronizza":
      return { ok: true, giaInCoda: (await chiediSincronizzazione(a, corpo.slug)).duplicate };
    case "riattiva":
      await riattiva(a, corpo.slug, origine);
      return { ok: true };
    case "disattiva":
      await disattiva(a, corpo.slug);
      return { ok: true };
    default:
      // Disconnettere, inserire o leggere credenziali: mai dall'assistenza.
      throw errore("validation_failed", "Azione non ammessa per l'assistenza Foodtech.", 422);
  }
}
