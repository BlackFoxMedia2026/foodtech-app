import { db } from "@/lib/db";
import { costruisciScadenze } from "@/lib/scadenze-dipendente";
import { scadenzaDaSegnalare, testoAvvisoScadenza, type StatoScadenza } from "@/lib/scheda-dipendente";

/**
 * Gli avvisi di scadenza per l'elenco Staff: **una** riga per persona, solo
 * per chi ha qualcosa di scaduto o vicino a scadere.
 *
 * Sostituisce `listAttentionNeededContracts`, che guardava solo i contratti:
 * adesso la card di una persona può dire «HACCP scaduto» o «Visita medica
 * tra 15 giorni», che sono le cose per cui un ristorante prende una multa.
 * Il calcolo è lo stesso della Panoramica della scheda
 * (`costruisciScadenze`), così le due pagine non si contraddicono.
 */
export type AvvisoScadenza = { stato: Extract<StatoScadenza, "scaduto" | "in_scadenza">; testo: string };

export async function avvisiScadenzePerPersona(venueId: string, oggi: Date = new Date()): Promise<Map<string, AvvisoScadenza>> {
  const [contratti, visite, corsi, documenti] = await Promise.all([
    db.staffContract.findMany({ where: { venueId }, select: { waiterId: true, startDate: true, endDate: true, contractType: true } }),
    db.staffMedicalCheck.findMany({ where: { venueId }, select: { waiterId: true, examinedAt: true, expiresAt: true } }),
    db.staffTraining.findMany({ where: { venueId }, select: { waiterId: true, kind: true, name: true, completedAt: true, expiresAt: true } }),
    db.staffDocument.findMany({
      where: { venueId, expiresAt: { not: null } },
      select: { id: true, waiterId: true, name: true, expiresAt: true, training: { select: { id: true } }, medicalCheck: { select: { id: true } } },
    }),
  ]);

  const persone = new Set<string>();
  for (const r of [...contratti, ...visite, ...corsi, ...documenti]) persone.add(r.waiterId);

  const out = new Map<string, AvvisoScadenza>();
  for (const waiterId of persone) {
    const scadenze = costruisciScadenze(
      {
        contratti: contratti.filter((c) => c.waiterId === waiterId),
        visite: visite.filter((v) => v.waiterId === waiterId),
        corsi: corsi.filter((c) => c.waiterId === waiterId),
        documenti: documenti
          .filter((d) => d.waiterId === waiterId)
          .map((d) => ({ id: d.id, name: d.name, expiresAt: d.expiresAt, trainingId: d.training?.id, medicalCheckId: d.medicalCheck?.id })),
      },
      oggi,
    );
    const urgente = scadenzaDaSegnalare(scadenze);
    if (urgente && (urgente.stato === "scaduto" || urgente.stato === "in_scadenza")) {
      out.set(waiterId, { stato: urgente.stato, testo: testoAvvisoScadenza(urgente) });
    }
  }
  return out;
}
