import { db } from "@/lib/db";
import type { ComandaDaInviare, EsitoInvio, Fornitore } from "@/server/comande/fornitore";
import { adattatoreDi } from "./adapters";
import type { OrdineDaInviare, RigaOrdine } from "./dominio";
import { ErroreIntegrazione, normalizzaErrore } from "./errori";
import { idEsterno } from "./mappature";
import { inviaOrdine } from "./ordini";

/**
 * **Il contratto già pronto fra le comande di Foodtech e una cassa collegata.**
 *
 * ```
 * Cameriere → Tavolo B2 → «Invia comanda»
 *   → inviaComanda() → fornitorePerLocale()        ← oggi: sempre la cucina Foodtech
 *                        ↘ fornitoreIntegrazione()  ← questo file, NON ancora collegato
 *                             → inviaOrdine() → adapter.pos.createOrder() → cassa
 * ```
 *
 * Implementa l'interfaccia `Fornitore` di `server/comande/fornitore.ts`, la
 * stessa della cucina interna: il giorno in cui si collega, cambia solo cosa
 * risponde `fornitorePerLocale`, e nessuna schermata della sala.
 *
 * **Non è collegato**, di proposito: un adattatore mai provato con una cassa
 * vera non deve ricevere le comande di una sala. Si prova da solo
 * (`tests/integrazioni-cassa-in-cloud-piattaforma.test.ts`).
 *
 * ## La traduzione
 *
 * - **riferimento** = `ft-<comandaId>`: la stessa comanda inviata due volte ha
 *   lo stesso riferimento, e non diventa due ordini;
 * - **tavolo**: dall'etichetta del tavolo Foodtech alla sua mappatura;
 * - **righe**: ogni piatto dalla sua mappatura prodotto, tramite
 *   `codiceProdottoPerOrdine` dell'adattatore. Il fuori carta non ha un
 *   prodotto presso la cassa, e una comanda che lo contiene non parte;
 * - **aggiunte**: se la cassa le accetta (Tilby) e il tavolo ha già un conto
 *   aperto mandato da Foodtech, la comanda nuova si accoda a quel conto
 *   (`ordineApertoDelTavolo`); altrimenti diventa un ordine nuovo (Cassa in
 *   Cloud, che non ha un endpoint di aggiornamento);
 * - **modifiche e allergeni** diventano la nota della riga: la
 *   documentazione di Cassa in Cloud prevede modificatori per identificativo
 *   (`rowModifierValues`), ma Foodtech non li mappa ancora.
 *
 * ## Quando la cassa non risponde
 *
 * La comanda è già salvata in Foodtech. `inviaOrdine` la mette in
 * `PENDING_SYNC` e la coda riprova: al cameriere si risponde «ok» con
 * `presaInCarico: false`, perché la sala non si ferma per un'API esterna.
 */

/** Il riferimento degli ordini di prova della console di certificazione: riconoscibile anche sulla cassa. */
export const PREFISSO_ORDINE_DI_PROVA = "ft-test-";

export function riferimentoComanda(comandaId: string): string {
  return `ft-${comandaId}`;
}

export async function ordineDaComanda(
  installazione: { id: string; venueId: string; integrationSlug: string },
  c: ComandaDaInviare,
): Promise<OrdineDaInviare> {
  const adattatore = adattatoreDi(installazione.integrationSlug);

  let tavoloExternalId: string | null = null;
  if (c.tavolo) {
    const t = await db.table.findFirst({ where: { venueId: installazione.venueId, label: c.tavolo }, select: { id: true } });
    tavoloExternalId = t ? await idEsterno(installazione, "TABLE", t.id) : null;
  }

  const righe: RigaOrdine[] = [];
  for (const r of c.righe) {
    if (!r.menuItemId) throw new ErroreIntegrazione("NOT_SUPPORTED", `«${r.nome}» è fuori carta: la cassa non lo conosce`);
    const mappa = await db.externalEntityMapping.findFirst({
      where: { installationId: installazione.id, venueId: installazione.venueId, entityType: "PRODUCT", internalId: r.menuItemId },
      select: { externalId: true, metadata: true },
    });
    if (!mappa) throw new ErroreIntegrazione("INVALID_CONFIGURATION", `«${r.nome}» non è abbinato a un prodotto della cassa`);
    const codice = adattatore?.codiceProdottoPerOrdine
      ? adattatore.codiceProdottoPerOrdine({ externalId: mappa.externalId, metadata: mappa.metadata as Record<string, unknown> | null })
      : mappa.externalId;
    const nota = [
      ...r.modifiche.map((m) => m.label),
      ...(r.allergeni.length ? [`Allergie: ${r.allergeni.join(", ")}`] : []),
      ...(r.notaAllergia ? [r.notaAllergia] : []),
      ...(r.note ? [r.note] : []),
    ].join(" · ");
    righe.push({
      codiceProdotto: codice,
      nome: r.nome,
      quantita: r.quantita,
      prezzoUnitarioCents: null,
      note: nota || null,
      datiProdotto: (mappa.metadata as Record<string, unknown> | null) ?? null,
    });
  }

  return {
    riferimento: riferimentoComanda(c.comandaId),
    tavolo: c.tavolo,
    tavoloExternalId,
    coperti: c.coperti,
    cliente: null,
    righe,
    nota: c.nota,
  };
}

/**
 * L'ordine aperto a cui una nuova comanda dello stesso tavolo si aggiunge,
 * quando la cassa accetta aggiunte (`pos.updateOrder`: Tilby sì, Cassa in
 * Cloud no). È l'ultimo ordine **nuovo** (non un'aggiunta) mandato da Foodtech
 * per quel tavolo, non fallito, e che la cassa non ha chiuso né annullato
 * (lo stato arriva dai webhook sulla stessa mappatura).
 */
export async function ordineApertoDelTavolo(
  installazione: { id: string; venueId: string },
  tavoloExternalId: string | null | undefined,
): Promise<string | null> {
  if (!tavoloExternalId) return null;
  const righe = await db.externalEntityMapping.findMany({
    where: { installationId: installazione.id, venueId: installazione.venueId, entityType: "ORDER" },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: { externalId: true, metadata: true },
  });
  for (const r of righe) {
    const m = (r.metadata ?? {}) as {
      invio?: { stato?: string };
      ordine?: { tavoloExternalId?: string | null };
      aggiuntaA?: string;
      stato?: string;
    };
    // Gli ordini di prova della console di certificazione non sono mai il conto di un tavolo vero.
    if (r.externalId.startsWith(PREFISSO_ORDINE_DI_PROVA)) continue;
    if (m.aggiuntaA || m.ordine?.tavoloExternalId !== tavoloExternalId) continue;
    if (m.invio?.stato === "FAILED" || m.stato === "CLOSED" || m.stato === "CANCELLED") return null;
    return r.externalId;
  }
  return null;
}

export function fornitoreIntegrazione(installazione: {
  id: string;
  venueId: string;
  integrationSlug: string;
  nome: string;
}): Fornitore {
  return {
    /* Il tipo dell'enum `FornitoreComanda` ha oggi un solo valore; il
       giorno del collegamento se ne aggiunge uno per la cassa. */
    kind: "INTERNO",
    etichetta: installazione.nome,
    async invia(c): Promise<EsitoInvio> {
      try {
        const ordine = await ordineDaComanda(installazione, c);
        const adattatore = adattatoreDi(installazione.integrationSlug);
        const aggiuntaA =
          adattatore && "pos" in adattatore && (adattatore as { pos: { updateOrder?: unknown } }).pos.updateOrder
            ? await ordineApertoDelTavolo(installazione, ordine.tavoloExternalId)
            : null;
        const esito = await inviaOrdine(
          installazione,
          c.comandaId,
          ordine,
          aggiuntaA && aggiuntaA !== ordine.riferimento ? { aggiuntaA } : {},
        );
        if (esito.stato === "SYNCED") return { ok: true, riferimento: esito.idEsterno, presaInCarico: false };
        if (esito.stato === "PENDING_SYNC") return { ok: true, riferimento: null, presaInCarico: false };
        return { ok: false, errore: esito.codiceErrore, riprovabile: false };
      } catch (err) {
        const e = normalizzaErrore(err);
        return { ok: false, errore: e.codice, riprovabile: e.riprovabile };
      }
    },
  };
}
