import { db } from "@/lib/db";
import type { Prisma } from "@prisma/client";
import type { TipoEntita } from "./tipi";
import type { RisultatoSincronizzazione } from "./adapters/tipi";

/**
 * **Il tavolo B1 di Foodtech è il tavolo 89372 di Lightspeed.**
 *
 * `ExternalEntityMapping` è la tabella che risponde, per ogni installazione,
 * a «che cosa è da loro questa cosa nostra». Ci passano tavoli, prodotti,
 * categorie, aliquote, metodi di pagamento, e domani clienti, ordini,
 * prenotazioni: il tipo è una colonna, non una tabella per tipo.
 *
 * ## L'abbinamento automatico, e il suo limite
 *
 * Una sincronizzazione scrive tutto ciò che il fornitore ha, e **prova** ad
 * abbinare da sola solo quando la risposta è certa: un tavolo che si chiama
 * esattamente come uno dei nostri, e uno solo. «12» con «12» sì; «12» con
 * «Tavolo 12» sì (il prefisso non è un'informazione); «12» con «12A» no.
 * Tutto ciò che non è certo resta da abbinare a mano, nella scheda Mappature.
 *
 * Un abbinamento sbagliato manda la comanda del tavolo 12 sul conto del 21:
 * meglio dieci abbinamenti da fare a mano che uno fatto male in silenzio.
 *
 * E un abbinamento **deciso da una persona** (`manual: true`) non lo tocca
 * più nessuna sincronizzazione.
 */

/** «Tavolo 12», « tavolo  12 », «TAV. 12» → «12». */
export function normalizzaEtichetta(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/^\s*(tavolo|tav\.?|table|tbl\.?)\s*/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Abbina ogni esterno a un interno **solo** se l'etichetta normalizzata
 * corrisponde a un solo elemento da entrambe le parti. Funzione pura.
 */
export function abbinamentiCerti(
  esterni: { externalId: string; etichetta: string }[],
  interni: { id: string; etichetta: string }[],
): Map<string, string> {
  const perEtichettaInterna = new Map<string, string[]>();
  for (const i of interni) {
    const k = normalizzaEtichetta(i.etichetta);
    if (!k) continue;
    perEtichettaInterna.set(k, [...(perEtichettaInterna.get(k) ?? []), i.id]);
  }
  const contaEsterni = new Map<string, number>();
  for (const e of esterni) {
    const k = normalizzaEtichetta(e.etichetta);
    contaEsterni.set(k, (contaEsterni.get(k) ?? 0) + 1);
  }

  const out = new Map<string, string>();
  for (const e of esterni) {
    const k = normalizzaEtichetta(e.etichetta);
    const candidati = perEtichettaInterna.get(k);
    if (candidati?.length === 1 && contaEsterni.get(k) === 1) out.set(e.externalId, candidati[0]!);
  }
  return out;
}

/** Gli elementi di Foodtech abbinabili per tipo: chi non è qui si abbina solo a mano. */
async function interniDi(venueId: string, tipo: TipoEntita): Promise<{ id: string; etichetta: string }[] | null> {
  if (tipo === "TABLE") {
    const tavoli = await db.table.findMany({ where: { venueId, active: true }, select: { id: true, label: true } });
    return tavoli.map((t) => ({ id: t.id, etichetta: t.label }));
  }
  if (tipo === "PRODUCT") {
    const piatti = await db.menuItem.findMany({ where: { venueId }, select: { id: true, name: true } });
    return piatti.map((p) => ({ id: p.id, etichetta: p.name }));
  }
  if (tipo === "CATEGORY") {
    const cat = await db.menuCategory.findMany({ where: { venueId, active: true }, select: { id: true, name: true } });
    return cat.map((c) => ({ id: c.id, etichetta: c.name }));
  }
  return null;
}

export type EsitoApplicazione = { scritte: number; abbinate: number; nonAbbinate: number };

/**
 * Scrive nelle mappature ciò che una sincronizzazione ha trovato.
 *
 * Idempotente: la chiave è `(installazione, tipo, externalId)`, e una
 * seconda sincronizzazione aggiorna etichetta e `lastSeenAt` invece di
 * creare doppioni.
 */
export async function applicaRisultato(
  installazione: { id: string; venueId: string },
  risultato: RisultatoSincronizzazione,
): Promise<EsitoApplicazione> {
  const adesso = new Date();
  const perTipo = new Map<TipoEntita, RisultatoSincronizzazione["entita"]>();
  for (const e of risultato.entita) perTipo.set(e.tipo, [...(perTipo.get(e.tipo) ?? []), e]);

  let scritte = 0;
  let abbinate = 0;

  for (const [tipo, entita] of perTipo) {
    const esistenti = await db.externalEntityMapping.findMany({
      where: { installationId: installazione.id, venueId: installazione.venueId, entityType: tipo },
      select: { externalId: true, internalId: true, manual: true },
    });
    const giaUsati = new Set(esistenti.map((m) => m.internalId).filter(Boolean) as string[]);
    const esistentePer = new Map(esistenti.map((m) => [m.externalId, m]));

    const interni = await interniDi(installazione.venueId, tipo);
    const certi = interni
      ? abbinamentiCerti(
          entita.filter((e) => !esistentePer.get(e.externalId)?.internalId),
          interni.filter((i) => !giaUsati.has(i.id)),
        )
      : new Map<string, string>();

    for (const e of entita) {
      const prima = esistentePer.get(e.externalId);
      const nuovoInterno = !prima?.internalId ? certi.get(e.externalId) ?? null : undefined;
      await db.externalEntityMapping.upsert({
        where: {
          installationId_entityType_externalId: {
            installationId: installazione.id,
            entityType: tipo,
            externalId: e.externalId,
          },
        },
        create: {
          venueId: installazione.venueId,
          installationId: installazione.id,
          entityType: tipo,
          externalId: e.externalId,
          externalLabel: e.etichetta.slice(0, 200),
          internalId: nuovoInterno ?? null,
          metadata: (e.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
          lastSeenAt: adesso,
        },
        update: {
          externalLabel: e.etichetta.slice(0, 200),
          metadata: (e.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
          lastSeenAt: adesso,
          ...(nuovoInterno ? { internalId: nuovoInterno } : {}),
        },
      });
      scritte++;
      if (nuovoInterno) abbinate++;
    }
  }

  const nonAbbinate = await db.externalEntityMapping.count({
    where: { installationId: installazione.id, venueId: installazione.venueId, internalId: null },
  });
  return { scritte, abbinate, nonAbbinate };
}

/**
 * Abbinare a mano (o togliere un abbinamento). Controlla che l'elemento di
 * Foodtech appartenga allo stesso locale: senza, un identificativo di un
 * altro ristorante passato dal browser finirebbe nelle nostre mappature.
 */
export async function abbinaAMano(
  installazione: { id: string; venueId: string },
  mappingId: string,
  internalId: string | null,
): Promise<void> {
  const m = await db.externalEntityMapping.findFirst({
    where: { id: mappingId, installationId: installazione.id, venueId: installazione.venueId },
  });
  if (!m) throw Object.assign(new Error("not_found"), { code: "not_found" });

  if (internalId) {
    const interni = await interniDi(installazione.venueId, m.entityType as TipoEntita);
    if (!interni?.some((i) => i.id === internalId)) {
      throw Object.assign(new Error("Questo elemento non esiste in questo locale."), { code: "not_found" });
    }
    const occupato = await db.externalEntityMapping.findFirst({
      where: { installationId: installazione.id, entityType: m.entityType, internalId, NOT: { id: m.id } },
      select: { externalLabel: true },
    });
    if (occupato) {
      throw Object.assign(
        new Error(`È già abbinato a «${occupato.externalLabel ?? "un altro elemento"}».`),
        { code: "conflict" },
      );
    }
  }

  await db.externalEntityMapping.update({
    where: { id: m.id },
    data: { internalId, manual: true },
  });
}

export async function elencoMappature(installazione: { id: string; venueId: string }, tipo?: TipoEntita) {
  return db.externalEntityMapping.findMany({
    where: { installationId: installazione.id, venueId: installazione.venueId, ...(tipo ? { entityType: tipo } : {}) },
    orderBy: [{ entityType: "asc" }, { externalLabel: "asc" }],
    take: 500,
  });
}

/** Il nome dell'elemento Foodtech abbinato, per la scheda Mappature. */
export async function etichetteInterne(venueId: string, tipo: TipoEntita) {
  return (await interniDi(venueId, tipo)) ?? [];
}

/** L'identificativo esterno di una cosa nostra, per chi deve mandarla al fornitore. */
export async function idEsterno(
  installazione: { id: string; venueId: string },
  tipo: TipoEntita,
  internalId: string,
): Promise<string | null> {
  const m = await db.externalEntityMapping.findFirst({
    where: { installationId: installazione.id, venueId: installazione.venueId, entityType: tipo, internalId },
    select: { externalId: true },
  });
  return m?.externalId ?? null;
}
