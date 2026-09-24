import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { logEvento } from "@/lib/observability";
import { recordAudit, type AuditActor } from "@/server/audit";
import { trovaInstallazione } from "./installazioni";
import { NEL_WIZARD } from "./cliente";
import type { StatoInstallazione } from "./tipi";

/**
 * **«Abbiamo trovato la configurazione del tuo sistema di cassa.»**
 *
 * La sincronizzazione non tocca mai i dati di Foodtech: scrive mappature, e
 * abbina da sola solo il certo (`mappature.ts`). Ma un ristorante che collega
 * la cassa **prima** di aver disegnato la sala o scritto il menu su Foodtech
 * non ha niente da abbinare: per lui la cosa utile è copiare in Foodtech ciò
 * che la cassa ha già. Lo fa questo file, e solo su richiesta esplicita.
 *
 * Le regole:
 * - si importa una parte solo se in Foodtech è **vuota** (nessun tavolo
 *   attivo; nessun piatto): dove c'è già qualcosa si abbina, non si duplica;
 * - ogni cosa creata resta abbinata al suo originale, come un abbinamento
 *   deciso a mano (`manual: true`): nessuna sincronizzazione lo cambia;
 * - tutto in una transazione: o la sala intera, o niente.
 */

export type AnteprimaImportazione = { tavoli: number; prodotti: number; categorie: number };

function meta(m: Prisma.JsonValue | null): Record<string, unknown> {
  return m && typeof m === "object" && !Array.isArray(m) ? (m as Record<string, unknown>) : {};
}

async function vuoti(venueId: string) {
  const [tavoli, piatti] = await Promise.all([
    db.table.count({ where: { venueId, active: true } }),
    db.menuItem.count({ where: { venueId } }),
  ]);
  return { sala: tavoli === 0, menu: piatti === 0 };
}

/** Che cosa si potrebbe importare adesso, o `null` se niente. */
export async function anteprimaImportazione(i: { id: string; venueId: string }): Promise<AnteprimaImportazione | null> {
  const v = await vuoti(i.venueId);
  if (!v.sala && !v.menu) return null;
  const conti = await db.externalEntityMapping.groupBy({
    by: ["entityType"],
    where: { installationId: i.id, venueId: i.venueId, internalId: null, entityType: { in: ["TABLE", "PRODUCT", "CATEGORY"] } },
    _count: { _all: true },
  });
  const n = (t: string) => conti.find((c) => c.entityType === t)?._count._all ?? 0;
  const out = { tavoli: v.sala ? n("TABLE") : 0, prodotti: v.menu ? n("PRODUCT") : 0, categorie: v.menu ? n("CATEGORY") : 0 };
  return out.tavoli || out.prodotti ? out : null;
}

function errore(code: string, message: string, httpStatus: number) {
  return Object.assign(new Error(message), { code, httpStatus });
}

const MASSIMO = 1000;
const PER_RIGA = 6;

/** «12», «12», «12» → «12», «12 (2)», «12 (3)»: l'etichetta è unica nel locale. */
function unica(etichetta: string, usate: Set<string>): string {
  const base = etichetta.trim().slice(0, 60) || "Tavolo";
  let e = base;
  for (let n = 2; usate.has(e.toLowerCase()); n++) e = `${base} (${n})`;
  usate.add(e.toLowerCase());
  return e;
}

export async function importaIniziale(
  a: { venueId: string; audit?: AuditActor },
  slug: string,
  scelta: { tavoli: boolean; menu: boolean },
): Promise<{ tavoli: number; prodotti: number; categorie: number }> {
  const i = await trovaInstallazione(a.venueId, slug);
  if (!i || i.status === "NOT_INSTALLED" || NEL_WIZARD.has(i.status as StatoInstallazione)) {
    throw errore("invalid_transition", "Prima completa il collegamento.", 409);
  }
  const v = await vuoti(a.venueId);
  if (scelta.tavoli && !v.sala) throw errore("conflict", "In Foodtech ci sono già dei tavoli: collegali invece di importarli.", 409);
  if (scelta.menu && !v.menu) throw errore("conflict", "In Foodtech c'è già un menu: collega i prodotti invece di importarli.", 409);

  const mappe = await db.externalEntityMapping.findMany({
    where: { installationId: i.id, venueId: a.venueId, entityType: { in: ["FLOOR", "TABLE", "CATEGORY", "PRODUCT"] } },
    take: MASSIMO * 3,
  });
  const di = (t: string) => mappe.filter((m) => m.entityType === t);

  const esito = await db.$transaction(
    async (tx) => {
      let tavoli = 0;
      let categorie = 0;
      let prodotti = 0;
      const abbina = (id: string, internalId: string) =>
        tx.externalEntityMapping.update({ where: { id }, data: { internalId, manual: true } });

      if (scelta.tavoli) {
        const sale = new Map(di("FLOOR").map((f) => [f.externalId, f.externalLabel ?? "Sala"]));
        const stanze = await tx.room.findMany({ where: { venueId: a.venueId }, orderBy: { ordering: "asc" } });
        const perNome = new Map(stanze.map((r) => [r.name.toLowerCase(), r.id]));
        let ordine = stanze.length;
        const stanzaPer = async (nome: string) => {
          const k = nome.toLowerCase();
          const c = perNome.get(k);
          if (c) return c;
          const r = await tx.room.create({ data: { venueId: a.venueId, name: nome.slice(0, 80), ordering: ordine++ } });
          perNome.set(k, r.id);
          return r.id;
        };
        const usate = new Set((await tx.table.findMany({ where: { venueId: a.venueId }, select: { label: true } })).map((t) => t.label.toLowerCase()));
        const posto = new Map<string, number>();
        const daFare = di("TABLE").filter((m) => !m.internalId && meta(m.metadata).attivo !== false).slice(0, MASSIMO);
        for (const m of daFare) {
          const md = meta(m.metadata);
          const nomeSala = typeof md.sala === "string" && sale.get(md.sala) ? sale.get(md.sala)! : typeof md.salaNome === "string" ? md.salaNome : stanze[0]?.name ?? "Sala";
          const roomId = await stanzaPer(nomeSala);
          const n = posto.get(roomId) ?? 0;
          posto.set(roomId, n + 1);
          const posti = Number(md.posti);
          const t = await tx.table.create({
            data: {
              venueId: a.venueId,
              roomId,
              label: unica(m.externalLabel ?? m.externalId, usate),
              seats: Number.isFinite(posti) && posti >= 1 ? Math.min(Math.round(posti), 20) : 2,
              posX: 60 + (n % PER_RIGA) * 150,
              posY: 60 + Math.floor(n / PER_RIGA) * 130,
            },
          });
          await abbina(m.id, t.id);
          tavoli++;
        }
      }

      if (scelta.menu) {
        const esistenti = await tx.menuCategory.findMany({ where: { venueId: a.venueId }, select: { id: true, name: true } });
        const perNome = new Map(esistenti.map((c) => [c.name.toLowerCase(), c.id]));
        let ordine = esistenti.length;
        const categoria = async (nome: string) => {
          const k = nome.toLowerCase();
          const c = perNome.get(k);
          if (c) return c;
          const r = await tx.menuCategory.create({ data: { venueId: a.venueId, name: nome.slice(0, 80), ordering: ordine++ } });
          perNome.set(k, r.id);
          categorie++;
          return r.id;
        };
        const perEsterno = new Map<string, string>();
        for (const m of di("CATEGORY")) {
          const id = m.internalId ?? (await categoria(m.externalLabel ?? "Categoria"));
          if (!m.internalId) await abbina(m.id, id);
          perEsterno.set(m.externalId, id);
        }
        const daFare = di("PRODUCT").filter((m) => !m.internalId).slice(0, MASSIMO);
        let n = 0;
        for (const m of daFare) {
          const md = meta(m.metadata);
          const rif = typeof md.categoria === "string" ? md.categoria : typeof md.famiglia === "string" ? md.famiglia : null;
          const categoryId = (rif && perEsterno.get(rif)) || (await categoria("Altri prodotti"));
          const prezzo = Number(md.prezzoCents);
          const piatto = await tx.menuItem.create({
            data: {
              venueId: a.venueId,
              categoryId,
              name: (m.externalLabel ?? "Prodotto").slice(0, 120),
              priceCents: Number.isFinite(prezzo) && prezzo >= 0 ? Math.round(prezzo) : 0,
              available: md.disponibile !== false && md.inVendita !== false && md.abilitatoRisto !== false,
              ordering: n++,
            },
          });
          await abbina(m.id, piatto.id);
          prodotti++;
        }
      }
      return { tavoli, prodotti, categorie };
    },
    { timeout: 60_000 },
  );

  await recordAudit(a.audit, "integration.initial_import", "integration", i.id, { slug, ...esito });
  logEvento("integrazione.importazione_iniziale", { slug, venue: a.venueId, ...esito });
  return esito;
}
